/* 猫猫对对碰 · 每日排行（客户端）
 * 服务端：BigLei3 项目的 Cloudflare Worker（BigLei3/services/leaderboard），接口见 docs/leaderboard.md。
 * 身份：优先通过容器 JSBridge 取小红书用户名 / 用户 id；拿不到时退回本地匿名 id + 可改昵称。
 * 网络失败一律静默降级：不阻塞游戏流程，界面只显示“暂时无法连接”。
 * ES2017 / Chrome 61：不用可选链、空值合并、对象展开。 */
(function (root) {
  'use strict';

  /* 功能总开关（代码级，不暴露给玩家）：默认关闭。
   * 关闭时：主页不显示「今日排行」、结算不上传也不显示名次、不探测容器用户信息接口。
   * 打开方式任选：把 ENABLED_DEFAULT 改为 true；或开发时 URL 带 ?rank=1（?rank=0 关回，选择会记住，与 ?auto= 同一套路）。
   * 关闭原因：小工具容器文档（minitool-zip-builder skill）称容器不联网、且无用户信息 JSBridge，真机验证前不上线。 */
  var ENABLED_DEFAULT = false;
  var ENABLED_KEY = 'ttddp.dev.rank';
  var ENABLED = (function () {
    try {
      var m = /[?&]rank=([01])/.exec(location.search);
      if (m) localStorage.setItem(ENABLED_KEY, m[1]);
      var v = localStorage.getItem(ENABLED_KEY);
      return v === null ? ENABLED_DEFAULT : v === '1';
    } catch (e) { return ENABLED_DEFAULT; }
  })();

  var API_DEFAULT = 'https://biglei-leaderboard.biglei3.workers.dev';
  var API_KEY = 'ttddp.lb.api'; // 调试开关：localStorage 里填别的地址（如本地 wrangler dev）即可切换，删掉恢复线上
  var API_BASE = (function () { try { return localStorage.getItem(API_KEY) || API_DEFAULT; } catch (e) { return API_DEFAULT; } })();
  var GAME_ID = 'ttddp';
  var TOP_LIMIT = 50;
  var TIMEOUT_MS = 6000;
  var BRIDGE_TIMEOUT_MS = 1500;
  var NICK_MAX = 24;
  var UID_KEY = 'ttddp.lb.uid';
  var NICK_KEY = 'ttddp.lb.nick';
  var PROFILE_KEY = 'ttddp.lb.profile';
  /* 容器可能提供的“取当前用户”接口名（按顺序探测，只调用真实存在的函数）。
   * 官方 jsbridge-api.md 暂未收录用户信息接口；拿到正式接口名后把它放到数组最前面即可。 */
  var USER_API_CANDIDATES = ['getUserInfo', 'getUserProfile', 'getLoginUserInfo', 'getCurrentUser'];

  var identity = null;        // { id, name, avatar, source: 'xhs' | 'local', api? }
  var identityPromise = null;
  var online = true;          // 最近一次请求是否成功

  /* ---------- 本地存储 ---------- */
  function read(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function parse(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  function randomId() {
    var s = '';
    for (var i = 0; i < 16; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16);
  }
  /* 服务端 user_id 只收 [A-Za-z0-9_-:.@]，其余字符替换掉 */
  function safeId(v) {
    return String(v).replace(/[^A-Za-z0-9_\-:.@]/g, '_').slice(0, 60);
  }
  function cleanName(v) {
    var t = String(v || '').replace(/\s+/g, ' ').trim();
    return t.length > NICK_MAX ? t.slice(0, NICK_MAX).trim() : t;
  }

  /* ---------- 身份：小红书用户信息（JSBridge）→ 缓存 → 本地匿名 ---------- */
  function pick(obj, keys) {
    if (!obj || typeof obj !== 'object') return null;
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  }
  function normalizeProfile(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var src = raw.data || raw.userInfo || raw.user_info || raw.user || raw.result || raw;
    var name = pick(src, ['nickname', 'nickName', 'nick_name', 'name', 'userName', 'user_name', 'displayName', 'display_name']);
    var id = pick(src, ['userId', 'user_id', 'uid', 'openId', 'open_id', 'openid', 'redId', 'red_id', 'id']);
    var avatar = pick(src, ['avatar', 'avatarUrl', 'avatar_url', 'image', 'images', 'headImage', 'head_image']);
    if (name === null && id === null) return null;
    return {
      id: id === null ? '' : String(id),
      name: name === null ? '' : cleanName(name),
      avatar: typeof avatar === 'string' ? avatar : ''
    };
  }
  /* 调一个 JSBridge 方法：不存在 / 抛错 / 超时 都 resolve(null) */
  function callBridge(api) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } }
      var timer = setTimeout(function () { finish(null); }, BRIDGE_TIMEOUT_MS);
      try {
        var mt = root.xhs && root.xhs.miniTool;
        if (!mt || typeof mt[api] !== 'function') { finish(null); return; }
        var p = mt[api]({});
        if (!p || typeof p.then !== 'function') { finish(null); return; }
        p.then(function (r) { finish(r); }, function () { finish(null); });
      } catch (e) { finish(null); }
    });
  }
  async function fetchProfile() {
    for (var i = 0; i < USER_API_CANDIDATES.length; i++) {
      var p = normalizeProfile(await callBridge(USER_API_CANDIDATES[i]));
      if (p && (p.name || p.id)) { p.api = USER_API_CANDIDATES[i]; return p; }
    }
    return null;
  }
  function localIdentity() {
    var uid = read(UID_KEY);
    if (!uid) { uid = randomId(); store(UID_KEY, uid); }
    var nick = cleanName(read(NICK_KEY));
    return { id: 'anon-' + uid, name: nick || ('猫友' + uid.slice(-4)), avatar: '', source: 'local', custom: !!nick };
  }
  function getIdentity(force) {
    if (identity && !force) return Promise.resolve(identity);
    if (identityPromise && !force) return identityPromise;
    identityPromise = fetchProfile().then(function (p) {
      if (p) {
        var id = 'xhs-' + (p.id ? safeId(p.id) : hash(p.name));
        identity = { id: id, name: p.name || ('小红薯' + id.slice(-4)), avatar: p.avatar, source: 'xhs', api: p.api };
        store(PROFILE_KEY, JSON.stringify(identity));
      } else {
        // 容器这次没给用户信息：沿用上次拿到的小红书身份，否则本地匿名
        var cached = parse(read(PROFILE_KEY));
        identity = (cached && cached.source === 'xhs' && cached.id) ? cached : localIdentity();
      }
      return identity;
    }, function () {
      identity = localIdentity();
      return identity;
    });
    return identityPromise;
  }
  /* 只有本地匿名身份才允许改昵称（小红书身份直接用用户名） */
  function setNickname(name) {
    var n = cleanName(name);
    store(NICK_KEY, n);
    if (identity && identity.source === 'local') identity = localIdentity();
    return identity;
  }

  /* ---------- HTTP ---------- */
  function request(method, path, body) {
    if (typeof root.fetch !== 'function') return Promise.reject(new Error('no_fetch'));
    return new Promise(function (resolve, reject) {
      var done = false;
      function finish(err, data) { if (!done) { done = true; clearTimeout(timer); if (err) reject(err); else resolve(data); } }
      var timer = setTimeout(function () { finish(new Error('timeout')); }, TIMEOUT_MS);
      var opts = { method: method, mode: 'cors', cache: 'no-store', headers: {} };
      // 用 text/plain 发 JSON：属于简单请求，省掉一次 OPTIONS 预检；服务端按 JSON 解析正文
      if (body) { opts.headers['content-type'] = 'text/plain;charset=UTF-8'; opts.body = JSON.stringify(body); }
      root.fetch(API_BASE + path, opts).then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
      }).then(function (r) {
        if (!r.ok) finish(new Error((r.data && r.data.error) || ('http_' + r.status)));
        else finish(null, r.data);
      }, function (e) { finish(e || new Error('network')); });
    }).then(function (d) { online = true; return d; }, function (e) { online = false; throw e; });
  }

  /* 上传本局得分 → { day, accepted, improved, best, rank, runs, total, resets_in } */
  function submit(score) {
    if (!ENABLED) return Promise.reject(new Error('disabled'));
    score = Math.floor(Number(score) || 0);
    if (score <= 0) return Promise.reject(new Error('bad_score'));
    return getIdentity().then(function (me) {
      var body = { game_id: GAME_ID, user_id: me.id, name: me.name, score: score };
      if (me.avatar && /^https:\/\//i.test(me.avatar)) body.avatar = me.avatar;
      return request('POST', '/v1/daily/submit', body);
    });
  }
  /* 今日榜 → { day, now, resets_in, total, entries, me } */
  function top() {
    if (!ENABLED) return Promise.reject(new Error('disabled'));
    return getIdentity().then(function (me) {
      return request('GET', '/v1/daily/' + GAME_ID + '/top?limit=' + TOP_LIMIT + '&user_id=' + encodeURIComponent(me.id));
    });
  }

  /* ---------- 文案 ---------- */
  function fmtCountdown(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h > 0) return h + ' 小时 ' + m + ' 分';
    return Math.max(1, m) + ' 分钟';
  }
  function rankLine(r) {
    if (!r || !r.rank) return '';
    var s = '今日第 ' + r.rank + ' 名 · 共 ' + r.total + ' 人';
    if (r.improved === false && r.best) s += '（今日最高 ' + r.best + ' 只）';
    return s;
  }

  /* ---------- 排行面板 UI（DOM id 见 index.html #rank） ---------- */
  var ui = (function () {
    var seq = 0;
    function el(id) { return document.getElementById(id); }
    function text(id, s) { var e = el(id); if (e) e.textContent = s; }

    function renderNick(me) {
      var wrap = el('rank-nick-wrap');
      if (!wrap) return;
      var isLocal = !me || me.source === 'local';
      wrap.hidden = !isLocal;
      if (isLocal) {
        var input = el('rank-nick');
        if (input && document.activeElement !== input) input.value = me && me.custom ? me.name : '';
        if (input) input.placeholder = me ? ('未设置，显示为 ' + me.name) : '昵称';
      }
    }

    function renderList(data, me) {
      var list = el('rank-list');
      if (!list) return;
      list.innerHTML = '';
      var entries = data.entries || [];
      for (var i = 0; i < entries.length; i++) {
        var row = entries[i];
        var li = document.createElement('li');
        li.className = 'rank-row rank-row--' + row.rank + (me && row.user_id === me.id ? ' is-me' : '');
        var no = document.createElement('span');
        no.className = 'rank-row__no';
        no.textContent = row.rank;
        var name = document.createElement('span');
        name.className = 'rank-row__name';
        name.textContent = row.name;
        var score = document.createElement('span');
        score.className = 'rank-row__score';
        score.textContent = row.score;
        var unit = document.createElement('small');
        unit.textContent = '只';
        score.appendChild(unit);
        li.appendChild(no);
        li.appendChild(name);
        li.appendChild(score);
        list.appendChild(li);
      }
      list.hidden = entries.length === 0;
    }

    function render(data, me) {
      var mine = data.me;
      text('rank-status', data.total
        ? ('今日 ' + data.total + ' 人参与 · ' + fmtCountdown(data.resets_in) + '后刷新')
        : ('今天还没有人上榜 · ' + fmtCountdown(data.resets_in) + '后刷新'));
      renderList(data, me);
      var meEl = el('rank-me');
      if (meEl) {
        if (mine) {
          meEl.textContent = me.name + ' · 今日第 ' + mine.rank + ' 名 · 最高 ' + mine.score + ' 只 · ' + mine.runs + ' 局';
        } else {
          meEl.textContent = me.name + ' · 今天还没有成绩，去玩一局吧';
        }
        meEl.hidden = false;
      }
      renderNick(me);
    }

    /* 打开 / 刷新面板：先显示加载中，再拉数据 */
    function open() {
      var my = ++seq;
      text('rank-status', '加载中…');
      var list = el('rank-list'); if (list) { list.innerHTML = ''; list.hidden = true; }
      var meEl = el('rank-me'); if (meEl) meEl.hidden = true;
      return getIdentity().then(function (me) {
        renderNick(me);
        return top().then(function (data) {
          if (my !== seq) return data;
          render(data, me);
          return data;
        }, function () {
          if (my !== seq) return null;
          text('rank-status', '暂时无法连接排行榜，稍后再试');
          return null;
        });
      });
    }

    function saveNick() {
      var input = el('rank-nick');
      if (!input) return Promise.resolve(identity);
      setNickname(input.value);
      return open();
    }

    return { open: open, saveNick: saveNick };
  })();

  root.TurtleBoard = {
    enabled: ENABLED,
    API_BASE: API_BASE,
    GAME_ID: GAME_ID,
    getIdentity: getIdentity,
    setNickname: setNickname,
    submit: submit,
    top: top,
    rankLine: rankLine,
    fmtCountdown: fmtCountdown,
    isOnline: function () { return online; },
    ui: ui
  };
})(window);
