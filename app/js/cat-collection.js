/* 按套系和款式分别累计；只在真实对局结算时入账，回放不入账。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TurtleCatCollection = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var KEY = 'ttddp.catCollection.v1';
  var BODY_UNLOCK_AT = 30, HOME_SLOT_STEP = 100;
  var series = [{ id: 'cats', name: '摸鱼猫' }, { id: 'tortie', name: '灰玳瑁猫' }];
  var starter = { id: 'cool', name: '墨镜猫', skin: 'cats', special: '装酷',
    portrait: './skins/pengci/5.webp', atlas: './assets/room/cat/cool-cat-actions-v1.webp', atlasColumns: 4, atlasRows: 6,
    initial: true, starter: true, bodyAt: 0, homeAt: 0, specialAt: 50 };
  var names = ['甜甜圈猫', '码农猫', '音乐猫', '咖啡猫', '摄影猫', '厨师猫', '健身猫', '画家猫', '派对猫'];
  var ids = ['donut', 'coder', 'music', 'coffee', 'photo', 'chef', 'fitness', 'painter', 'party'];
  var specials = ['吃甜甜圈', '敲键盘', '听歌打拍子', '喝咖啡', '拍照片', '煎鸡蛋', '举哑铃', '画爪印', '吹派对喇叭'];
  var catalog = names.map(function (name, i) {
    return { id: ids[i], name: name, index: i, skin: 'cats', special: specials[i],
      portrait: './skins/cats/' + (i + 1) + '.webp',
      atlas: './assets/room/cats/' + ids[i] + '-actions-v1.webp',
      initial: false, bodyAt: BODY_UNLOCK_AT, homeAt: i * HOME_SLOT_STEP, specialAt: 50 };
  });
  var tortieIds = ['strawberry', 'sailor', 'wizard', 'garden', 'baker', 'detective', 'postman', 'cozy', 'explorer'];
  var tortieNames = ['草莓猫', '水手猫', '星星猫', '园丁猫', '面包猫', '侦探猫', '邮差猫', '抱抱猫', '探险猫'];
  var tortieSpecials = ['吃草莓', '挥爪打招呼', '挥动星星棒', '浇小花', '揉小面团', '举放大镜', '送出小信封', '抱小鱼玩偶', '展开小地图'];
  catalog = catalog.concat(tortieIds.map(function (id, index) {
    return { id: 'tortie-' + id, name: tortieNames[index], index: index, skin: 'tortie', special: tortieSpecials[index],
      portrait: './skins/tortie/' + (index + 1) + '.webp',
      atlas: './assets/room/tortie/' + id + '-actions-v2.webp',
      initial: index === 0, bodyAt: index === 0 ? 0 : BODY_UNLOCK_AT, homeAt: index * HOME_SLOT_STEP, specialAt: 50 };
  }));
  function integer(n) { return typeof n === 'number' && isFinite(n) ? Math.max(0, Math.min(1000000000, Math.floor(n))) : 0; }
  function emptyCounts() { return [0, 0, 0, 0, 0, 0, 0, 0, 0]; }
  function create(storage) {
    var data = { version: 1, counts: Object.create(null), lastRun: null };
    try {
      var saved = JSON.parse(storage.getItem(KEY));
      if (saved && saved.version === 1 && saved.counts && typeof saved.counts === 'object') {
        Object.keys(saved.counts).forEach(function (skin) {
          if (!/^[a-z][a-z0-9-]*$/.test(skin) || !Array.isArray(saved.counts[skin])) return;
          data.counts[skin] = emptyCounts().map(function (_, i) { return integer(saved.counts[skin][i]); });
        });
        data.lastRun = typeof saved.lastRun === 'string' ? saved.lastRun : null;
      }
    } catch (e) { /* 新存档或存储不可用时仍可在当前会话游玩。 */ }
    function totalCount(skin) {
      return (data.counts[skin] || emptyCounts()).reduce(function (total, count) { return total + count; }, 0);
    }
    function progress(id) {
      var cat = id === starter.id ? starter : catalog.filter(function (c) { return c.id === id; })[0];
      if (!cat) return null;
      if (cat.starter) return { cat: cat, count: 0, total: 0, body: true, home: true, special: false };
      var count = (data.counts[cat.skin] || emptyCounts())[cat.index], total = totalCount(cat.skin);
      var body = count >= cat.bodyAt;
      return { cat: cat, count: count, total: total, body: body, home: body && total >= cat.homeAt, special: count >= cat.specialAt };
    }
    function list(skin) { return catalog.filter(function (cat) { return !skin || cat.skin === skin; }).map(function (cat) { return progress(cat.id); }); }
    function roomList(skin) {
      var entries = list(skin);
      if (!skin || skin === starter.skin) entries.unshift(progress(starter.id));
      return entries;
    }
    function recordRun(skin, counts, runId, replay) {
      if (replay || !runId || runId === data.lastRun || !/^[a-z][a-z0-9-]*$/.test(skin) || !Array.isArray(counts)) return [];
      var before = list(), row = data.counts[skin] || emptyCounts();
      data.counts[skin] = row.map(function (value, i) { return integer(value + integer(counts[i])); });
      data.lastRun = String(runId);
      try { storage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 保留会话内进度。 */ }
      var milestones = [];
      list().forEach(function (p, i) {
        if (p.body && !before[i].body) milestones.push({ id: p.cat.id, name: p.cat.name, kind: 'body', label: '解锁本体' });
        if (p.home && !before[i].home) milestones.push({ id: p.cat.id, name: p.cat.name, kind: 'home', label: '入住啦' });
        if (p.special && !before[i].special) milestones.push({ id: p.cat.id, name: p.cat.name, kind: 'special', label: '学会了' + p.cat.special });
      });
      return milestones;
    }
    return { list: list, roomList: roomList, progress: progress, recordRun: recordRun };
  }
  var session;
  function get() {
    if (!session) {
      var storage = null;
      try { storage = window.localStorage; } catch (e) { /* 可在无持久存储环境运行。 */ }
      session = create(storage);
    }
    return session;
  }
  return { create: create, get: get, catalog: catalog, starter: starter, series: series, storageKey: KEY };
});
