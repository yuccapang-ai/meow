/* 猫猫对对碰 · 主程序（界面与流程）
 * 依赖：engine.js（window.TurtleEngine）、skins.js（window.TurtleSkin）、share.js（window.TurtleShare）
 * ES2017 / Chrome 61：不用可选链、空值合并、对象展开、Array.flat、Promise.finally。 */
(function () {
  'use strict';

  var E = window.TurtleEngine;
  var Skin = window.TurtleSkin;
  var S = window.TurtleShare;
  var Fortune = window.TurtleFortune;
  var Sound = window.TurtleSound;
  var Board = window.TurtleBoard;
  var Room = window.TurtleRoom;
  var Collection = window.TurtleCatCollection.get();
  var CollectionView = window.TurtleCollectionView;

  /* 数值配置（待调） */
  var CONFIG = { startPacks: 20, shakeLimit: 1 };
  var STORAGE_KEY = 'ttddp.best.v2'; // v1 记最长轮次；v2 改记最高得分（暂存区 + 盘上剩余）；cats = 累计获得的猫猫数（皮肤解锁进度）

  /* 开发开关：自动发牌（不暴露给玩家），默认开启
   * 第一次手动发牌后持续自动发牌 / 自动摇晃，直到本局结束。
   * 关闭方式任选：URL 带 ?auto=0（?auto=1 重新开启，选择会记住）；或控制台 TTDDP.setAutoDeal(false)。 */
  var DEV_KEY = 'ttddp.dev.autoDeal';
  var DEV = { autoDeal: true, autoDelay: 350 };
  (function initDev() {
    try {
      var m = /[?&]auto=([01])/.exec(location.search);
      if (m) localStorage.setItem(DEV_KEY, m[1]);
      DEV.autoDeal = localStorage.getItem(DEV_KEY) !== '0';
    } catch (e) { /* ignore */ }
  })();
  function setAutoDeal(on) {
    DEV.autoDeal = !!on;
    try { localStorage.setItem(DEV_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    if (!DEV.autoDeal && Speed.get() !== 1) Speed.set(1); // 手动模式没有倍速控件，回到常速
    if (state) renderHud(); else renderDealMode();
    return DEV.autoDeal;
  }

  function $(id) { return document.getElementById(id); }
  /* ---------- 全局倍速：0 = 暂停，1 / 2 / 4 ----------
   * 所有演出用的等待都走 Speed.wait：切倍速时把每个等待者已走过的「游戏时间」结算掉，再按新倍速重排；
   * CSS 动画通过 :root 的 --spd 变量缩短时长，暂停用 is-paused 冻结 animation-play-state；
   * 粒子特效（fx.js）与滚动新闻（News）各自按倍率缩放步长。 */
  var Speed = (function () {
    var rate = 1, waiters = [];
    function remove(w) { var i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); }
    function schedule(w) {
      if (w.timer) { clearTimeout(w.timer); w.timer = 0; }
      if (rate <= 0) return; // 暂停：不排定时器，等恢复时再排
      w.start = performance.now();
      w.rateAt = rate;
      w.timer = setTimeout(function () { remove(w); w.resolve(); }, w.remaining / rate);
    }
    function wait(ms) {
      return new Promise(function (resolve) {
        var w = { remaining: ms, resolve: resolve, timer: 0, start: 0, rateAt: 1 };
        waiters.push(w);
        schedule(w);
      });
    }
    function set(r) {
      var i, w;
      for (i = 0; i < waiters.length; i++) {
        w = waiters[i];
        if (w.timer) w.remaining = Math.max(0, w.remaining - (performance.now() - w.start) * w.rateAt);
      }
      rate = r;
      document.documentElement.style.setProperty('--spd', String(r || 1)); // 暂停时不改时长，只冻结播放
      document.documentElement.classList.toggle('is-paused', r === 0);
      if (FX.setRate) FX.setRate(r);
      News.setRate(r);
      for (i = 0; i < waiters.length; i++) schedule(waiters[i]);
      var btns = document.querySelectorAll('.speed__btn');
      for (i = 0; i < btns.length; i++) btns[i].classList.toggle('is-active', parseFloat(btns[i].getAttribute('data-speed')) === r);
    }
    return { wait: wait, set: set, get: function () { return rate; } };
  })();
  function wait(ms) { return Speed.wait(ms); }
  function after(ms, fn) { Speed.wait(ms).then(fn); }

  /* ---------- 视口高度（软键盘 / 容器高度变化兜底） ---------- */
  function setAppHeight() {
    document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
  }
  setAppHeight();
  window.addEventListener('resize', setAppHeight);

  /* ---------- 本地纪录 ---------- */
  function loadBest() {
    var def = { score: 0, earned: 0, runs: 0, cats: 0 };
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return def;
      var o = JSON.parse(raw);
      return { score: o.score | 0, earned: o.earned | 0, runs: o.runs | 0, cats: o.cats | 0 };
    } catch (e) { return def; }
  }
  function saveBest(b) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); } catch (e) { /* 存储不可用时忽略 */ }
  }
  var best = loadBest();
  function renderBest() {
    var map = { 'best-score': best.score, 'best-earned': best.earned, 'best-runs': best.runs, 'best-cats': best.cats };
    for (var id in map) { var el = $(id); if (el) el.textContent = map[id]; }
  }
  // 存档里的套系若还没解锁（比如清了进度），回到默认套系
  if (!Skin.isUnlocked(Skin.get(), best.score)) Skin.set('cats');

  /* ---------- 皮肤解锁进度 ----------
   * 解锁条件 = 单局历史最高分（结算的「只」数）。有待解锁套系时，结算前先弹进度条。 */
  /* 结算页「再来一局」下方的小进度条：全部解锁后隐藏 */
  function renderResultUnlock(bestScore) {
    var box = $('result-unlock'), next = Skin.nextLocked(bestScore);
    if (!next) { box.hidden = true; return; }
    box.hidden = false;
    $('result-unlock-fill').style.width = (Math.min(bestScore, next.unlock) / next.unlock * 100) + '%';
    $('result-unlock-text').textContent = '单局 ' + next.unlock + ' 只解锁「' + next.name + '」 · 历史最高 ' + bestScore;
  }
  /* 结算前的进度弹层：深色条 = 历史最高（破纪录时从旧纪录涨到新纪录），浅色条 = 本局得分；涨满门槛即解锁。
   * 点任意位置 / 「查看结算」/ 数秒后调用 done 进入结算 */
  var unlockTimer = 0, unlockDone = null;
  var UNLOCK_DELAY = 500, UNLOCK_DUR = 1200, UNLOCK_HOLD = 3500, UNLOCK_HOLD_WIN = 6000;
  function showUnlockProgress(prevBest, newBest, runScore, done) {
    var target = Skin.nextLocked(prevBest); // 以本局前的纪录找目标，本局可能正好把它解锁
    var need = target.unlock, unlocked = newBest >= need, record = newBest > prevBest;
    var box = $('unlock-sheet'), heroBox = $('unlock-hero'), bar = $('unlock-bar');
    var fill = $('unlock-fill'), ghost = $('unlock-ghost'), count = $('unlock-count'), num = $('unlock-num'), hint = $('unlock-hint');
    var fx0 = Skin.fx(0, target), acc = fx0.color;
    // 强调色取目标套系首款的主题色，标题带 / 光晕 / 进度条 / 提示都跟着走
    box.style.setProperty('--acc', acc);
    box.style.setProperty('--acc-soft', hexToRgba(acc, 0.16));
    box.style.setProperty('--acc-faint', hexToRgba(acc, 0.07));
    // 复位到「进度」态
    box.classList.remove('is-unlocked');
    box.removeAttribute('data-theme');
    bar.classList.remove('is-full');
    num.classList.remove('is-pop');
    $('unlock-ribbon').textContent = '皮肤解锁进度';
    $('unlock-tagline').textContent = 'NEXT SKIN SET';
    $('unlock-name').textContent = target.name;
    $('unlock-tag').textContent = '即将解锁';
    $('unlock-need').textContent = '/ ' + need + ' 只';
    $('btn-unlock-continue').textContent = '查看结算';
    // 目标套系剪影轮播：与首页同款
    heroBox.classList.add('is-silhouette');
    unlockSkin = target;
    UnlockHero.stop();
    UnlockHero.start();
    function paint(v, g) {
      var c = Math.min(v, need);
      fill.style.width = (c / need * 100) + '%';
      ghost.style.width = (Math.min(g, need) / need * 100) + '%';
      count.textContent = Math.round(c / need * 100) + '%';
      num.textContent = Math.round(c);
    }
    paint(prevBest, 0);
    hint.textContent = '本局 ' + runScore + ' 只' + (record ? ' · 新纪录！' : '');
    Sound.play('open');
    setOverlay('unlock', true);
    unlockDone = function () {
      if (!unlockDone) return;
      unlockDone = null;
      clearTimeout(unlockTimer);
      UnlockHero.stop();
      setOverlay('unlock', false);
      done();
    };
    var start = 0, lastTick = -1;
    function frame(ts) {
      if (!unlockDone) return; // 已被点掉
      if (!start) start = ts;
      var k = Math.min(1, (ts - start) / UNLOCK_DUR);
      k = 1 - Math.pow(1 - k, 3);
      var v = prevBest + (Math.min(newBest, need) - prevBest) * k;
      paint(v, runScore * k);
      var tick = Math.floor((record ? v / need : runScore * k / need) * 14);
      if (tick !== lastTick && k < 1) { lastTick = tick; Sound.play('fan'); }
      if (k < 1) { requestAnimationFrame(frame); return; }
      if (unlocked) celebrate(); else settle();
    }
    /* 没解锁：纪录有涨就让数字弹一下 */
    function settle() {
      if (record) { num.classList.add('is-pop'); Sound.play('lucky'); }
      else Sound.play('womp');
      hint.textContent = (record ? '新纪录！' : '') + '还差 ' + (need - newBest) + ' 只解锁「' + target.name + '」';
      unlockTimer = setTimeout(function () { if (unlockDone) unlockDone(); }, UNLOCK_HOLD);
    }
    /* 解锁：白闪 → 标题带 / 副标 / 标签换成解锁文案 → 底纹换成该套系首款的结算主题 → 彩色猫猫重新落下 → 落地时该款粒子 + 彩纸 */
    function celebrate() {
      box.classList.add('is-unlocked');
      box.setAttribute('data-theme', fx0.id);
      bar.classList.add('is-full');
      num.classList.add('is-pop');
      $('unlock-ribbon').textContent = '新套系解锁！';
      $('unlock-tagline').textContent = 'NEW SKIN SET UNLOCKED';
      $('unlock-tag').textContent = '已解锁';
      $('btn-unlock-continue').textContent = '太棒了，去看结算';
      hint.textContent = '解锁「' + target.name + '」！首页「皮肤」里换上';
      UnlockHero.stop();
      heroBox.classList.remove('is-silhouette');
      UnlockHero.start(); // 彩色猫猫从头落下
      Sound.play('record');
      setTimeout(function () { Sound.play('shimmer'); }, 250);
      FX.attach($('unlock'));
      FX.celebrate(box, 2);
      setTimeout(function () { // 落地瞬间：该款粒子在猫猫身上炸开，再补一轮彩纸
        if (!unlockDone) return;
        FX.burst(fx0.id, heroBox, 1.8, fx0.color);
        FX.celebrate(box, 1.3);
        Sound.play('catLand');
      }, 900 * 0.42);
      unlockTimer = setTimeout(function () { if (unlockDone) unlockDone(); }, UNLOCK_HOLD_WIN);
    }
    setTimeout(function () { requestAnimationFrame(frame); }, UNLOCK_DELAY);
  }
  $('unlock').addEventListener('click', function () { if (unlockDone) unlockDone(); });

  /* ---------- 屏幕与覆盖层 ---------- */
  function showScreen(name) {
    if (name !== 'room') Room.leave();
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.toggle('is-active', screens[i].id === 'screen-' + name);
    }
    if (name === 'room') Room.enter();
    if (name === 'room' || name === 'collection') CollectionView.render();
  }

  /* 猫猫 Q 弹轮播：某套系 9 个款式轮流落下 → 停留 → 掉出画面。
   * 皮肤解锁进度弹窗用目标套系的剪影。getSkin() 返回要展示的套系 */
  function makeHero(box, getSkin) {
    var cat = box.querySelector('.home__hero-cat-body');
    var timer = 0, idx = -1, running = false;
    var DROP = 900, HOLD = 1300, LEAVE = 500; // 与 CSS 里 hero-fall / hero-hop-out 时长一致
    function later(fn, ms) { timer = setTimeout(fn, ms); }
    function drop() {
      if (!running) return;
      idx = (idx + 1) % 9;
      Skin.paint(cat, idx, getSkin());
      box.classList.remove('is-leave');
      void cat.offsetWidth; // 重启动画
      box.classList.add('is-drop');
      later(leave, DROP + HOLD);
    }
    function leave() {
      if (!running) return;
      box.classList.remove('is-drop');
      void cat.offsetWidth;
      box.classList.add('is-leave');
      later(drop, LEAVE);
    }
    function start() {
      if (running) return;
      running = true;
      drop();
    }
    function stop() {
      running = false;
      clearTimeout(timer); timer = 0;
      box.classList.remove('is-drop', 'is-leave');
    }
    return { start: start, stop: stop };
  }
  var unlockSkin = null;
  var UnlockHero = makeHero($('unlock-hero'), function () { return unlockSkin; });
  function setOverlay(id, open) { $(id).classList.toggle('is-open', open); }
  /* 拉锁转场：图标落下裂开旧屏，盖满时执行 mid（切屏 / 重建 DOM）。图标色固定为海报橙红（--ember），与款式色无关。 */
  function wipeTo(mid, color, done) {
    return Wipe.run({ shape: Skin.get().wipe, color: color, mid: mid, done: done, onPhase: onWipePhase });
  }
  function onWipePhase(p) {
    if (p === 'fall') { Sound.play('fall'); Sound.play('zip'); }
    else if (p === 'land') Sound.play('land');
    else if (p === 'cover') Sound.play('cover');
    else if (p === 'reveal') Sound.play('reveal');
  }

  /* ---------- 棋盘 DOM ---------- */
  var boardEl = $('board');
  var boardWrap = boardEl.parentNode;
  var cells = [];
  var FX = window.TurtleFX;
  var Wipe = window.TurtleWipe;
  FX.init(boardWrap);

  function buildBoard() {
    boardEl.innerHTML = '';
    cells = [];
    for (var i = 0; i < 9; i++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      var inner = document.createElement('div');
      inner.className = 'cell__inner';
      Skin.mount(inner);
      cell.appendChild(inner);
      boardEl.appendChild(cell);
      cells.push({ el: cell, inner: inner, color: null });
    }
  }

  function paintCell(i, color) {
    var c = cells[i];
    c.color = color;
    var lucky = state && color !== null && color === state.lucky;
    c.el.className = 'cell' + (color === null ? '' : ' is-filled') + (lucky ? ' is-lucky' : '');
    if (color === null) c.el.removeAttribute('data-fx');
    else c.el.setAttribute('data-fx', Skin.fx(color).id);
    c.inner.className = 'cell__inner sprite';
    c.inner.style.transform = '';
    c.inner.style.transitionDelay = '';
    Skin.paint(c.inner, color);
  }

  function renderBoard(board) {
    for (var i = 0; i < 9; i++) paintCell(i, board[i]);
  }

  function floatText(target, text, kind, color) {
    var f = document.createElement('span');
    f.className = 'float' + (kind ? ' float--' + kind : '');
    f.textContent = text;
    if (color) f.style.color = color;
    target.appendChild(f);
    after(950, function () { if (f.parentNode) f.parentNode.removeChild(f); });
  }

  /* ---------- 滚动新闻（TV 字幕式连续播报） ----------
   * 轨道是一条持续向左滚动的 DOM 流：新播报 push 进来只会接在当前尾部，绝不打断正在滚动的内容；
   * 完全滚出左侧的元素被移除，并把它的宽度加回偏移量，画面不跳；
   * 尾部一旦进入视口且后面没内容了，就把最近几条循环补上，字幕永远不断流。 */
  var News = (function () {
    var viewport = $('ticker-viewport'), track = $('ticker-text');
    var x = 0, lastT = 0, speed = 64, rate = 1, running = false, raf = 0;
    var recent = [], cycle = 0, KEEP = 4;

    function makeNode(item, isCycle) {
      var frag = document.createDocumentFragment();
      if (track.childNodes.length) {
        var sep = document.createElement('span');
        sep.className = 'ticker__sep'; sep.textContent = '\u25C6';
        if (isCycle) sep.setAttribute('data-cycle', '1');
        frag.appendChild(sep);
      }
      var el = document.createElement('span');
      el.className = 'ticker__item' + (item.strong ? ' is-strong' : '');
      el.textContent = item.text;
      if (isCycle) el.setAttribute('data-cycle', '1');
      frag.appendChild(el);
      track.appendChild(frag);
    }

    /* 去掉尚未进入视口的循环补位内容，让新播报紧跟在可见尾部之后 */
    function dropUnseenCycles() {
      var vw = viewport.clientWidth;
      while (track.lastChild && track.lastChild.getAttribute('data-cycle') && x + track.lastChild.offsetLeft > vw) {
        track.removeChild(track.lastChild);
      }
    }

    function frame(t) {
      if (!running) return;
      var dt = Math.min(64, t - lastT); lastT = t;
      x -= speed * rate * dt / 1000;
      // 头部完全滚出 → 移除并补偿偏移
      while (track.firstChild) {
        var w = track.firstChild.offsetWidth;
        if (x + w < -2) { x += w; track.removeChild(track.firstChild); } else break;
      }
      // 尾部进入视口且后面没内容 → 循环补最近几条
      var vw = viewport.clientWidth;
      if (recent.length && x + track.offsetWidth < vw - 4) {
        makeNode(recent[cycle % recent.length], true);
        cycle++;
      }
      track.style.transform = 'translateX(' + x + 'px)';
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running) return;
      running = true; lastT = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    function push(text, strong) {
      var item = { text: text, strong: !!strong };
      recent.push(item);
      if (recent.length > KEEP) recent.shift();
      cycle = 0;
      dropUnseenCycles();
      if (!track.childNodes.length) x = viewport.clientWidth; // 空轨道：从右侧滚入
      makeNode(item, false);
      start();
    }
    function reset(text) {
      stop();
      track.innerHTML = '';
      recent = []; cycle = 0;
      x = viewport.clientWidth;
      track.style.transform = 'translateX(' + x + 'px)';
      if (text) push(text, false);
    }
    function setRate(r) { rate = r; }
    return { push: push, reset: reset, start: start, stop: stop, setRate: setRate };
  })();

  /* 生成一条播报：<款式名><模板>（+N 卡包） */
  function headline(kind, colorIdx, gain) {
    var body;
    if (kind === 'slam') body = '九位大咖同框合影，全场轰动';
    else body = Skin.itemName(colorIdx) + Skin.news(colorIdx)[kind];
    return body + '（+' + gain + ' 卡包）';
  }

  function showShake(show) {
    if (show && !$('shake').classList.contains('is-show')) Sound.play('womp');
    $('shake').classList.toggle('is-show', show);
  }

  /* ---------- 暂存区（被消除的棋子按款式计数，HUD 显示总数） ---------- */
  var stashItems = [];

  function buildStash() {
    var el = $('stash-items');
    el.innerHTML = '';
    stashItems = [];
    for (var c = 0; c < 9; c++) {
      var item = document.createElement('div');
      item.className = 'stash__item';
      item.setAttribute('aria-label', Skin.itemName(c));
      var sp = document.createElement('div');
      Skin.paint(sp, c);
      item.appendChild(sp);
      var n = document.createElement('span');
      n.className = 'stash__count';
      n.textContent = '0';
      item.appendChild(n);
      el.appendChild(item);
      stashItems.push({ el: item, count: n });
    }
  }

  /* counts: 长度 9 的每款数量；bumpColors: 刚入库的款式，弹一下 */
  function renderStash(counts, bumpColors) {
    var total = 0, c;
    for (c = 0; c < 9; c++) {
      total += counts[c];
      stashItems[c].count.textContent = counts[c];
      stashItems[c].el.classList.toggle('is-has', counts[c] > 0);
    }
    $('hud-stash').textContent = total;
    if (bumpColors) {
      for (c = 0; c < bumpColors.length; c++) {
        var it = stashItems[bumpColors[c]].el;
        it.classList.remove('is-bump');
        void it.offsetWidth;
        it.classList.add('is-bump');
      }
    }
  }

  /* ---------- HUD ---------- */
  var state = null;
  var busy = false;
  /* ---------- 回放记录 ----------
   * 每局开始时生成一个随机种子驱动引擎的随机源，一局的走向只由 { seed, lucky, cfg } 决定
   * （玩家唯一的决策「摇晃」是必选项，不摇等于弃局），所以记录这三样就能完整重播。
   * runRecord：当前这局的记录；lastRecord：最近一局「结算过」的记录，供结算页「重播本局」；
   * replay：正在回放的记录，null 表示正常对局。回放中没有发牌遮罩、不重新结算，结束后重新打开原来的结算页。 */
  var runRecord = null, lastRecord = null, replay = null;

  function bumpPacks(kind, color) {
    var w = $('hud-packs-wrap');
    w.style.setProperty('--fx', color || 'transparent');
    Sound.play(kind === 'is-drop' ? 'dealDrop' : 'coin');
    w.classList.remove('is-bump', 'is-drop');
    // 强制重启动画
    void w.offsetWidth;
    w.classList.add(kind);
  }

  function renderHud() {
    renderStash(state.stash);
    $('hud-packs').textContent = state.packs;
    $('hud-earned').textContent = state.earned;
    var empties = 0;
    for (var i = 0; i < 9; i++) if (state.board[i] === null) empties++;
    var cost = Math.min(empties, state.packs);
    var sub;
    if (state.ended) sub = '本局已结束';
    else if (replay) sub = '回放中';
    else if (DEV.autoDeal && state.round > 0) sub = '自动发牌中';
    else if (state.pendingShake) sub = '先摇一摇棋盘';
    else if (cost >= empties) sub = '用 ' + cost + ' 个卡包填满';
    else sub = '卡包不足，只能填 ' + cost + ' 格';
    $('deal-cost').textContent = sub;
    $('deal-start-cost').textContent = sub;
    renderDealMode();
  }

  /* 自动发牌模式：底栏不放发牌按钮；开局在棋盘上盖一层遮罩，只留一个发牌按钮，点过一次后整局不再出现。
   * 手动模式：保持底栏发牌按钮。 */
  function renderDealMode() {
    $('screen-game').classList.toggle('is-auto', DEV.autoDeal);
    $('screen-game').classList.toggle('is-replay', !!replay);
    var show = DEV.autoDeal && !replay && !!state && !state.ended && state.round === 0 && !state.pendingShake && !busy;
    $('deal-mask').classList.toggle('is-show', show);
  }

  /* ---------- 结算演出（发牌与摇晃共用） ----------
   * out: 引擎返回的 { board, result, needShake, ended }
   * 节奏：命中高亮 + 预备压扁(0.3s) → [幸运加成飘字] → 本体动作 + 粒子 + 记账(0.5s)。
   * 连线、对子都逐组串行播放。 */
  function thumpBoard() {
    Sound.play('thump');
    boardWrap.classList.remove('is-thump');
    void boardWrap.offsetWidth;
    boardWrap.classList.add('is-thump');
  }

  async function playSettlement(out) {
    var res = out.result;
    var R = state.cfg.reward;
    var shownPacks = state.packs - res.reward.total; // HUD 上逐步累加到 state.packs
    var shownEarned = state.earned - res.reward.total;
    var k;
    // 暂存区在界面上逐组累加：先退回本次消除的数量，随每组消除再加回去
    var shownStash = state.stash.slice();
    for (k = 0; k < res.removed.length; k++) shownStash[out.board[res.removed[k]]]--;

    /* 结算一组格子。opts: { hitClass, label, gain, kind, floatAt, intensity, word, color, thump } */
    async function settleGroup(indices, opts) {
      var q, fx0 = Skin.fx(cells[indices[0]].color);
      var word = opts.word != null ? opts.word : fx0.word;
      var color = opts.color || fx0.color;

      Sound.play(opts.newsKind === 'slam' ? 'hitSlam' : opts.newsKind === 'line' ? 'hitLine' : 'hitPair');
      for (q = 0; q < indices.length; q++) cells[indices[q]].el.classList.add('is-hit', opts.hitClass);
      News.push(headline(opts.newsKind || 'pair', cells[indices[0]].color, opts.gain), opts.newsKind !== 'pair');
      floatText(opts.floatAt, word + ' +' + opts.gain, opts.kind, color);
      await wait(300);
      // 本体动作 + 粒子 + 记账同时发生
      Sound.play('pop');
      for (q = 0; q < indices.length; q++) {
        var c = cells[indices[q]];
        var fx = Skin.fx(c.color);
        c.el.classList.add('is-removing');
        FX.burst(fx.id, c.el, opts.intensity || 1, fx.color);
      }
      if (opts.thump) thumpBoard();
      var gain = opts.gain;
      shownPacks += gain;
      shownEarned += gain;
      $('hud-packs').textContent = shownPacks;
      $('hud-earned').textContent = shownEarned;
      bumpPacks('is-bump', color);
      await wait(500);
      // 消掉的棋子进暂存区
      var stashed = [];
      for (q = 0; q < indices.length; q++) {
        stashed.push(cells[indices[q]].color);
        shownStash[cells[indices[q]].color]++;
        paintCell(indices[q], null);
      }
      renderStash(shownStash, stashed);
    }

    if (res.slam) {
      // 大满贯：九只各自的特效依次点燃，再一起消掉
      var all = [0, 1, 2, 3, 4, 5, 6, 7, 8];
      await settleGroup(all, {
        hitClass: 'is-hit--slam', newsKind: 'slam', gain: res.reward.slam, kind: 'purple',
        floatAt: boardEl, intensity: 1.5, word: '大满贯', color: null, thump: true
      });
    } else {
      for (k = 0; k < res.lines.length; k++) {
        var line = res.lines[k];
        // 共享格子已被前一条线消掉时，只高亮仍在盘上的格子
        var alive = [];
        for (var t = 0; t < 3; t++) if (cells[line[t]].color !== null) alive.push(line[t]);
        if (!alive.length) continue;
        await settleGroup(alive, {
          hitClass: 'is-hit--line', newsKind: 'line', gain: R.line, kind: 'gold',
          floatAt: cells[line[1]].el, intensity: 2.2, thump: true
        });
      }
      for (k = 0; k < res.pairs.length; k++) {
        var p = res.pairs[k];
        await settleGroup(p, {
          hitClass: 'is-hit--pair', newsKind: 'pair', gain: R.pair, kind: '',
          floatAt: cells[p[1]].el, intensity: 1
        });
      }
    }

    if (res.clear) {
      News.push('盘面清空，今日收摊大吉（+' + res.reward.clear + ' 卡包）', true);
      floatText(boardEl, '清空 +' + res.reward.clear, 'gold');
      FX.celebrate(boardEl, 2);
      Sound.play('clear');
      thumpBoard();
      await wait(500);
      shownPacks += res.reward.clear;
      $('hud-packs').textContent = shownPacks;
      $('hud-earned').textContent = state.earned;
      bumpPacks('is-bump', '#e8590c');
      await wait(400);
    }
  }

  /* 一次判定结束后的收尾：等待摇晃 / 结束 / 允许下一轮 */
  async function afterJudge(out) {
    renderHud();
    var runState = state; // 自动模式下延时后核对仍是同一局
    if (out.needShake) {
      showShake(true);
      busy = false;
      if (DEV.autoDeal || replay) {
        await wait(DEV.autoDelay + 300);
        if (state === runState && state.pendingShake && !busy) shakeBoard();
      }
      return;
    }
    busy = false;
    if (state.ended) {
      await wait(400);
      finishRun();
    } else {
      $('btn-deal').disabled = false;
      if (DEV.autoDeal || replay) {
        await wait(DEV.autoDelay);
        if (state === runState && !state.ended && !state.pendingShake && !busy) playRound();
      }
    }
  }

  /* ---------- 发牌 ---------- */
  async function playRound() {
    if (busy || !state || state.ended || state.pendingShake) return;
    busy = true;
    $('btn-deal').disabled = true;
    $('deal-mask').classList.remove('is-show');

    var out = E.deal(state);
    if (!out) { busy = false; finishRun(); return; }

    var res = out.result;
    var i, k;
    var runState = state, R = state.cfg.reward;

    // 先显示扣费后的数字；幸运款抽到时的 +1 与本轮消除返还都还没加，随演出逐步加回
    var shownPacks = state.packs - res.reward.total - out.luckyBonus;
    var shownEarned = state.earned - res.reward.total - out.luckyBonus;
    $('hud-packs').textContent = shownPacks;
    bumpPacks('is-drop');
    /* 抽到幸运款：在这只猫落格的瞬间飘 ★ +1 并即时入账（无论之后是否消除） */
    function luckyDrawn(idx) {
      if (state !== runState) return;
      Sound.play('lucky');
      floatText(cells[idx].el, '★ +' + R.lucky, 'lucky');
      shownPacks += R.lucky;
      shownEarned += R.lucky;
      $('hud-packs').textContent = shownPacks;
      $('hud-earned').textContent = shownEarned;
      bumpPacks('is-bump', '#e8590c');
    }
    var dealt = [];
    for (k = 0; k < out.filled.length; k++) dealt.push(out.board[out.filled[k]]);
    await playPackOpen(dealt);
    // 逐张快速撕开：每 TEAR_STEP 撕一张，撕开 TEAR_TO_FLY 后这张票的猫飞出、票身爆开
    var TEAR_STEP = 55, TEAR_TO_FLY = 220, FLY = 470;
    for (k = 0; k < out.filled.length; k++) {
      i = out.filled[k];
      after(k * TEAR_STEP, tearTicket.bind(null, k));
      flyIn(i, out.board[i], k * TEAR_STEP + TEAR_TO_FLY, tickets[k].body);
      after(k * TEAR_STEP + TEAR_TO_FLY, burstTicket.bind(null, k));
      if (out.lucky.indexOf(i) >= 0) after(k * TEAR_STEP + TEAR_TO_FLY + FLY, luckyDrawn.bind(null, i));
    }
    var lastFly = (out.filled.length - 1) * TEAR_STEP + TEAR_TO_FLY;
    after(lastFly + 300, clearTickets);
    await wait(lastFly + FLY + 260);

    if (res.removed.length === 0) {
      if (!out.needShake) await wait(700);
      await afterJudge(out);
      return;
    }
    await playSettlement(out);
    await afterJudge(out);
  }

  /* ---------- 开卡包演出：票券扇形落下 → 撕下票根 → 猫猫从各自票身飞到格子 ---------- */
  var packsEl = $('packs');
  var SVG_NS = 'http://www.w3.org/2000/svg';
  /* 票 62 宽 × 100 高，穿孔在 y=32；左右各一个半圆缺口。路径为开放路径，穿孔那条边不描，留给虚线 */
  var TK_STUB = 'M7.5,32 A6,6 0 0 0 1.5,26 L1.5,7.5 A6,6 0 0 1 7.5,1.5 L54.5,1.5 A6,6 0 0 1 60.5,7.5 L60.5,26 A6,6 0 0 0 54.5,32';
  var TK_BODY = 'M54.5,32 A6,6 0 0 0 60.5,38 L60.5,92.5 A6,6 0 0 1 54.5,98.5 L7.5,98.5 A6,6 0 0 1 1.5,92.5 L1.5,38 A6,6 0 0 0 7.5,32';
  var TK_SHADOW = 'rgba(46, 45, 40, 0.3)';

  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  /* 一块票（票根或票身）的 SVG：硬投影 + 填色 + 描边（穿孔那条边不描，留给虚线） */
  function ticketPart(viewBox, d, fill, extra) {
    var svg = svgEl('svg', { viewBox: viewBox });
    svg.appendChild(svgEl('path', { d: d + ' Z', fill: TK_SHADOW, transform: 'translate(3.5 4.5)' }));
    svg.appendChild(svgEl('path', { d: d + ' Z', fill: fill }));
    svg.appendChild(svgEl('path', { d: d, fill: 'none', stroke: '#2e2d28', 'stroke-width': '3', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    for (var i = 0; extra && i < extra.length; i++) svg.appendChild(extra[i]);
    return svg;
  }
  function buildTicket(color) {
    var tk = document.createElement('div');
    tk.className = 'tk';
    var stub = document.createElement('div');
    stub.className = 'tk__stub';
    stub.appendChild(ticketPart('0 0 62 32', TK_STUB, '#93ad7f', [
      svgEl('rect', { x: 12, y: 9, width: 38, height: 3, rx: 1.5, fill: '#f4e7cc' }),
      svgEl('rect', { x: 12, y: 15.5, width: 26, height: 3, rx: 1.5, fill: '#f4e7cc' }),
      svgEl('rect', { x: 12, y: 22, width: 38, height: 3, rx: 1.5, fill: '#f4e7cc' })
    ]));
    var body = document.createElement('div');
    body.className = 'tk__body';
    body.appendChild(ticketPart('0 32 62 68', TK_BODY, '#d8552c', [
      svgEl('line', { x1: 9.5, y1: 32, x2: 52.5, y2: 32, stroke: '#2e2d28', 'stroke-width': '2', 'stroke-dasharray': '3 3' })
    ]));
    var src = Skin.src(color);
    if (src) {
      var img = document.createElement('img');
      img.className = 'tk__icon';
      img.alt = '';
      img.src = src;
      body.appendChild(img);
    }
    tk.appendChild(stub);
    tk.appendChild(body);
    return { el: tk, body: body, stub: stub };
  }

  var tickets = [];

  /* 生成 N 张票并扇形排开（先缩在中心，再过渡到各自位置）。colors[k] 为第 k 张票里那只猫 */
  function fanTickets(colors) {
    Sound.burst('fan', Math.min(colors.length, 9), 30);
    var n = colors.length, bw = boardWrap.clientWidth;
    var w = bw * (n >= 6 ? 0.2 : (n >= 4 ? 0.24 : 0.28)), h = w * 100 / 62;
    var R = bw * 0.7;
    var step = n > 1 ? Math.min(12, 60 / (n - 1)) : 0; // 9 张时总展开约 60°，两端不出棋盘
    var mid = (n - 1) / 2, k;
    packsEl.innerHTML = '';
    tickets = [];
    for (k = 0; k < n; k++) {
      var t = buildTicket(colors[k]);
      var deg = (k - mid) * step;
      t.el.style.width = w + 'px';
      t.el.style.height = h + 'px';
      t.el.style.zIndex = String(n - Math.round(Math.abs(k - mid)));
      t.el.style.transition = 'none';
      t.el.style.opacity = '0';
      t.el.style.transform = 'translate(-50%, -50%) scale(0.4)';
      t.pose = 'translate(-50%, -50%) translateY(' + (R * 0.91) + 'px) rotate(' + deg + 'deg) translateY(' + (-R) + 'px)';
      packsEl.appendChild(t.el);
      tickets.push(t);
    }
    void packsEl.offsetWidth;
    for (k = 0; k < n; k++) {
      tickets[k].el.style.transition = '';
      tickets[k].el.style.transitionDelay = (k * 30) + 'ms';
      tickets[k].el.style.opacity = '1';
      tickets[k].el.style.transform = tickets[k].pose;
    }
    return n;
  }

  /* 扇形摆好并停一拍，等待逐张撕开 */
  async function playPackOpen(colors) {
    var n = fanTickets(colors);
    await wait(320 + n * 30 + 150);
  }

  /* 撕开第 k 张票的票根，撕口飞出纸屑 */
  function tearTicket(k) {
    var t = tickets[k];
    if (!t) return;
    t.el.style.transitionDelay = '';
    t.el.classList.add('is-tear');
    FX.burst('scraps', t.stub, 0.8);
    Sound.play('tear');
  }

  /* 第 k 张票的票身爆开（在它的猫飞出时调用） */
  function burstTicket(k) {
    var t = tickets[k];
    if (!t) return;
    t.el.classList.add('is-out');
    FX.burst('pop', t.body, 0.6, '#f4e7cc');
  }
  function clearTickets() { packsEl.innerHTML = ''; tickets = []; }

  /* delay 毫秒后，猫猫从票身位置飞到格子：先摆到起点，再过渡回原位；落地压一下并扬起尘土。
   * 上色也在 delay 时才做，格子随猫到达逐个亮起 */
  function flyIn(i, color, delay, fromEl) {
    var c = cells[i];
    after(delay, function () {
      paintCell(i, color);
      var from = fromEl.getBoundingClientRect(), to = c.inner.getBoundingClientRect();
      var dx = from.left + from.width / 2 - (to.left + to.width / 2);
      var dy = from.top + from.height / 2 - (to.top + to.height / 2);
      c.inner.style.transition = 'none';
      c.inner.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(0.3) rotate(-20deg)';
      void c.inner.offsetWidth;
      c.inner.style.transition = '';
      c.inner.classList.add('is-flying');
      c.inner.style.transform = '';
      after(470, function () {
        if (c.color !== color || !c.inner.classList.contains('is-flying')) return; // 期间被重画了
        c.inner.classList.remove('is-flying');
        c.el.classList.add('is-landed');
        FX.burst('dust', c.el, 1);
        Sound.play('catLand');
        after(300, function () { c.el.classList.remove('is-landed'); });
      });
    });
  }

  /* ---------- 摇晃棋盘 ---------- */
  async function shakeBoard() {
    if (busy || !state || state.ended || !state.pendingShake) return;
    busy = true;
    showShake(false);

    var out = E.shake(state);
    if (!out) { busy = false; return; }

    // 1. 整盘抖动
    boardWrap.classList.remove('is-shaking');
    void boardWrap.offsetWidth;
    boardWrap.classList.add('is-shaking');
    Sound.burst('rattle', 6, 70);
    await wait(560);
    boardWrap.classList.remove('is-shaking');

    // 2. 款式按新位置滑动（FLIP）
    var rects = [], k;
    for (k = 0; k < 9; k++) rects.push(cells[k].el.getBoundingClientRect());
    for (k = 0; k < out.moves.length; k++) {
      var m = out.moves[k];
      var dx = rects[m.to].left - rects[m.from].left;
      var dy = rects[m.to].top - rects[m.from].top;
      cells[m.from].inner.classList.add('is-moving');
      cells[m.from].inner.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(1)';
    }
    await wait(480);
    renderBoard(out.board);

    // 3. 重新判定
    var res = out.result;
    if (res.removed.length === 0) {
      if (!out.needShake) await wait(800);
      await afterJudge(out);
      return;
    }
    await wait(150);
    await playSettlement(out);
    await afterJudge(out);
  }

  /* ---------- 皮肤 ---------- */
  function paintMascots() {
    var ms = document.querySelectorAll('.home__mascot');
    for (var i = 0; i < ms.length; i++) Skin.paint(ms[i], parseInt(ms[i].getAttribute('data-item'), 10));
    $('btn-skins').textContent = '皮肤';
    $('room-play-label').textContent = Skin.get().name + ' · 玩对对碰，收集猫咪';
    $('lucky-title').textContent = '选一只幸运' + Skin.get().noun;
  }

  function buildSkinList() {
    var list = $('skin-list');
    list.innerHTML = '';
    var skins = Skin.list();
    var cur = Skin.get();
    for (var i = 0; i < skins.length; i++) {
      var s = skins[i];
      var locked = !Skin.isUnlocked(s, best.score);
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'skin-item' + (s === cur ? ' is-active' : '') + (locked ? ' is-locked' : '');
      item.setAttribute('data-skin', s.id);
      item.setAttribute('aria-pressed', String(s === cur));
      if (locked) item.setAttribute('aria-disabled', 'true');
      var previews = document.createElement('div');
      previews.className = 'skin-item__previews';
      for (var p = 0; p < 3; p++) {
        var sp = document.createElement('div');
        Skin.paint(sp, p * 3, s);
        previews.appendChild(sp);
      }
      var text = document.createElement('div');
      text.className = 'skin-item__text';
      var name = document.createElement('span');
      name.className = 'skin-item__name';
      name.textContent = s.name;
      if (locked) { // 名字后面跟一枚「未解锁」小标
        var lockTag = document.createElement('span');
        lockTag.className = 'skin-item__lock';
        lockTag.textContent = '未解锁';
        name.appendChild(lockTag);
      }
      var meta = document.createElement('span');
      meta.className = 'skin-item__meta';
      meta.textContent = locked
        ? '单局 ' + s.unlock + ' 只解锁 · 历史最高 ' + best.score
        : (!s.unlock ? '直接可选 · ' : '') + s.items[0].name + '、' + s.items[1].name + '、' + s.items[2].name + ' 等 9 款';
      text.appendChild(name);
      text.appendChild(meta);
      item.appendChild(previews);
      item.appendChild(text);
      if (locked) { // 整行宽的小进度条，换行排在下面
        var bar = document.createElement('div');
        bar.className = 'pbar pbar--mini skin-item__bar';
        var fill = document.createElement('div');
        fill.className = 'pbar__fill';
        fill.style.width = (Math.min(best.score, s.unlock) / s.unlock * 100) + '%';
        bar.appendChild(fill);
        item.appendChild(bar);
      } else {
        var check = document.createElement('span');
        check.className = 'skin-item__check';
        check.textContent = '✓';
        item.appendChild(check);
      }
      list.appendChild(item);
    }
  }

  $('skin-list').addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== this && !(t.getAttribute && t.getAttribute('data-skin'))) t = t.parentNode;
    if (!t || t === this) return;
    if (t.classList.contains('is-locked')) { // 未解锁：抖一下 + 提示音，不切换
      Sound.play('womp');
      t.classList.remove('is-shake');
      void t.offsetWidth;
      t.classList.add('is-shake');
      return;
    }
    if (Skin.set(t.getAttribute('data-skin'))) {
      Sound.play('tap');
      buildSkinList();
      Skin.preload();
    }
  });

  Skin.onChange(function () {
    paintMascots();
    luckyGridBuilt = false;
    if (state) {
      renderBoard(state.board);
      buildStash();
      renderStash(state.stash);
    }
  });

  /* ---------- 开局选幸运款 ---------- */
  var luckyGridBuilt = false;
  var luckySpinning = false;

  function buildLuckyGrid() {
    var grid = $('lucky-grid');
    if (luckyGridBuilt) return;
    grid.innerHTML = '';
    for (var c = 0; c < 9; c++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lucky-opt';
      btn.style.setProperty('--i', c);
      btn.setAttribute('aria-label', Skin.itemName(c));
      btn.setAttribute('data-color', c);
      var sp = document.createElement('div');
      Skin.paint(sp, c);
      btn.appendChild(sp);
      var nm = document.createElement('span');
      nm.className = 'lucky-opt__name';
      nm.textContent = Skin.itemName(c);
      btn.appendChild(nm);
      grid.appendChild(btn);
    }
    luckyGridBuilt = true;
  }

  $('lucky-grid').addEventListener('click', function (e) {
    if (luckySpinning) return;
    var t = e.target;
    while (t && t !== this && !(t.getAttribute && t.getAttribute('data-color') !== null)) t = t.parentNode;
    if (!t || t === this) return;
    if (Wipe.isActive()) return;
    var color = parseInt(t.getAttribute('data-color'), 10);
    commitLuckyPick(color);
  });

  function openLuckyPicker() {
    buildLuckyGrid();
    renderLuckySkinName();
    resetLuckyGrid();
    setOverlay('result', false);
    Sound.bgm.duck(false);
    Sound.play('open');
    setOverlay('lucky', true);
  }

  /* 套系名 + 左右箭头：不用打开「皮肤」弹层就能在选幸运款时切换套系，切完当场重建九宫格 */
  function renderLuckySkinName() { $('lucky-skin-name').textContent = Skin.get().name; }
  function switchLuckySkin(step) {
    if (luckySpinning || Wipe.isActive()) return;
    var skins = Skin.list(), cur = Skin.get(), idx = 0;
    for (var i = 0; i < skins.length; i++) if (skins[i] === cur) { idx = i; break; }
    var next = null, j = idx; // 跳过未解锁的套系
    for (var n = 0; n < skins.length; n++) {
      j = (j + step + skins.length) % skins.length;
      if (Skin.isUnlocked(skins[j], best.score)) { next = skins[j]; break; }
    }
    if (!next || !Skin.set(next.id)) return;
    Sound.play('tap');
    buildLuckyGrid();
    renderLuckySkinName();
    Skin.preload();
  }
  $('lucky-skin-prev').addEventListener('click', function () { switchLuckySkin(-1); });
  $('lucky-skin-next').addEventListener('click', function () { switchLuckySkin(1); });

  /* 随机演出：逐格高亮扫过棋盘，像转盘一样先快速转上两圈多再逐渐刹停，定格在选中的目标款式上再回调
   * 每格间隔按三次方缓动从 SPIN_FAST 拉长到 SPIN_SLOW：前段几乎等速飞快，只在临近停下时才明显变慢 */
  var SPIN_STEPS = 18, SPIN_FAST = 42, SPIN_SLOW = 520, SPIN_HOLD = 380;
  function spinLuckyPick(done) {
    var grid = $('lucky-grid');
    var opts = grid.querySelectorAll('.lucky-opt');
    var target = Math.floor(Math.random() * 9);
    var n = SPIN_STEPS;
    var delays = [];
    for (var s = 0; s < n - 1; s++) {
      var t = s / (n - 2);
      delays.push(Math.round(SPIN_FAST + (SPIN_SLOW - SPIN_FAST) * t * t * t));
    }
    var start = ((target - (n - 1)) % 9 + 9) % 9;
    var prev = -1;
    luckySpinning = true;
    grid.classList.add('is-spinning');
    function step(i) {
      if (prev >= 0) opts[prev].classList.remove('is-spinlit');
      var idx = (start + i) % 9;
      var last = i === n - 1;
      opts[idx].classList.add(last ? 'is-picked' : 'is-spinlit');
      Sound.play('fan');
      prev = idx;
      if (!last) { setTimeout(function () { step(i + 1); }, delays[i]); return; }
      setTimeout(function () { done(target); }, SPIN_HOLD); // 定格片刻后交给展示阶段，状态由 showcase / reset 收尾
    }
    step(0);
  }

  /* 选中展示（手动 / 随机共用）：其他格、说明与随机按钮淡出，选中格放大移到棋盘中央停留，让玩家看清选了谁再进转场
   * 位移量按选中格中心到棋盘中心的差写进 --dx / --dy，由 CSS 过渡完成 */
  var SHOWCASE_MS = 1100;
  function showcaseLuckyPick(idx, done) {
    var grid = $('lucky-grid');
    var el = grid.querySelectorAll('.lucky-opt')[idx];
    // 用布局偏移而不是 getBoundingClientRect：弹层入场动画（rise）带 transform，会让包围盒失真
    var dx = (grid.offsetLeft + grid.offsetWidth / 2) - (el.offsetLeft + el.offsetWidth / 2);
    var dy = (grid.offsetTop + grid.offsetHeight / 2) - (el.offsetTop + el.offsetHeight / 2);
    el.style.setProperty('--dx', dx.toFixed(1) + 'px');
    el.style.setProperty('--dy', dy.toFixed(1) + 'px');
    luckySpinning = true;
    grid.classList.remove('is-spinning');
    el.classList.remove('is-spinlit', 'is-picked');
    el.classList.add('is-chosen');
    $('lucky').classList.add('is-showcase');
    $('lucky-title').textContent = '幸运伙伴：' + Skin.itemName(idx);
    Sound.play('select');
    setTimeout(function () { done(idx); }, SHOWCASE_MS);
  }
  /* 复位选款弹层：清掉演出 / 展示残留的类与变量，供关闭后与再次打开前调用 */
  function resetLuckyGrid() {
    var grid = $('lucky-grid');
    grid.classList.remove('is-spinning');
    $('lucky').classList.remove('is-showcase');
    var opts = grid.querySelectorAll('.lucky-opt');
    for (var i = 0; i < opts.length; i++) {
      opts[i].classList.remove('is-spinlit', 'is-picked', 'is-chosen');
      opts[i].style.removeProperty('--dx');
      opts[i].style.removeProperty('--dy');
    }
    $('lucky-title').textContent = '选一只幸运伙伴';
    luckySpinning = false;
  }
  /* 确认选中：先展示，再关弹层进转场开局 */
  function commitLuckyPick(color) {
    showcaseLuckyPick(color, function () {
      setOverlay('lucky', false);
      resetLuckyGrid();
      wipeTo(function () { startRun(color); });
    });
  }

  /* ---------- Run 开始 / 结束 ---------- */
  /* rec：回放记录 { seed, lucky, cfg }；缺省为新开一局（随机种子） */
  function startRun(lucky, rec) {
    replay = rec || null;
    runRecord = rec || { seed: (Math.random() * 4294967296) >>> 0, lucky: lucky, cfg: CONFIG,
      id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), skin: Skin.get().id, settled: false };
    state = E.startRun(runRecord.cfg, E.seededRandom(runRecord.seed));
    E.setLucky(state, lucky);
    Fortune.prepare(state.cfg);
    stopAmbient();
    FX.attach(boardWrap);
    Skin.paint($('lucky-pill-sprite'), lucky);
    $('lucky-pill-note').textContent = Skin.itemName(lucky) + ' · 抽到时每只 +1';
    buildBoard();
    buildStash();
    renderBoard(state.board);
    if (Speed.get() === 0) Speed.set(1); // 上局暂停着就开新局：解除暂停，保留 2× / 4× 的选择
    if (!rec && !DEV.autoDeal && Speed.get() !== 1) Speed.set(1); // 手动模式没有倍速控件：回放里调过的倍速回到常速
    renderHud();
    showShake(false);
    News.reset(rec ? '回放中 · 重播上一局' : '');
    $('btn-deal').disabled = false;
    busy = false;
    showScreen('game');
  }

  var lastStats = null;

  function hexToRgba(hex, a) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return 'rgba(216,85,44,' + a + ')';
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
  }

  /* 各款式结算页的环境特效节奏：every 间隔 ms，k 强度，zone 撒点区域
   * top: 弹层上沿飘落 / 迸出；bottom: 弹层下沿往上飘（音符、蒸汽）；edges: 卡片四周随机；all: 全屏随机 */
  var AMBIENT = {
    donut:   { every: 520, k: 0.55, zone: 'top' },
    code:    { every: 460, k: 0.5,  zone: 'top' },
    music:   { every: 560, k: 0.6,  zone: 'bottom' },
    coffee:  { every: 640, k: 0.7,  zone: 'bottom' },
    photo:   { every: 1300, k: 0.5, zone: 'edges' },
    chef:    { every: 620, k: 0.55, zone: 'bottom' },
    gym:     { every: 700, k: 0.6,  zone: 'edges' },
    painter: { every: 560, k: 0.55, zone: 'all' },
    party:   { every: 420, k: 0.6,  zone: 'top' },
    // 套系 2「碰瓷猫」
    carrot:  { every: 600, k: 0.55, zone: 'bottom' },
    flat:    { every: 900, k: 0.5,  zone: 'top' },
    peek:    { every: 1100, k: 0.5, zone: 'edges' },
    box:     { every: 620, k: 0.55, zone: 'bottom' },
    cool:    { every: 1200, k: 0.5, zone: 'edges' },
    boba:    { every: 560, k: 0.6,  zone: 'bottom' },
    cart:    { every: 520, k: 0.55, zone: 'top' },
    heart:   { every: 480, k: 0.6,  zone: 'all' },
    rain:    { every: 380, k: 0.6,  zone: 'top' },
    // 套系 3「周末猫」
    burger:  { every: 560, k: 0.55, zone: 'bottom' },
    blanket: { every: 900, k: 0.5,  zone: 'all' },
    movie:   { every: 520, k: 0.6,  zone: 'top' },
    selfie:  { every: 1300, k: 0.5, zone: 'edges' },
    bath:    { every: 480, k: 0.55, zone: 'bottom' },
    shop:    { every: 600, k: 0.55, zone: 'top' },
    refill:  { every: 560, k: 0.6,  zone: 'bottom' },
    book:    { every: 700, k: 0.5,  zone: 'all' },
    drive:   { every: 640, k: 0.55, zone: 'edges' },
    pop:     { every: 800, k: 0.5,  zone: 'edges' }
  };
  var ambientTimer = 0;

  function stopAmbient() { if (ambientTimer) { clearInterval(ambientTimer); ambientTimer = 0; } }

  /* 结算特效：全部集中在运势标签上。粒子画布挂到结算弹层；
   * 先用 Top1 款式的预设在标签上炸开一次（档位越高越强，中吉以上追加彩纸），随后按该款式节奏在标签上持续小爆发。 */
  function playResultFx(tier, themeIdx) {
    var fxInfo = Skin.fx(themeIdx);
    var overlay = $('result'), stamp = $('fortune-stamp');
    FX.attach(overlay);
    stopAmbient();
    stamp.classList.remove('is-in');
    void stamp.offsetWidth;
    stamp.classList.add('is-in');
    setTimeout(function () { Sound.play('stamp'); }, 180);
    setTimeout(function () {
      if (!overlay.classList.contains('is-open')) return;
      FX.burst(fxInfo.id, stamp, 1.2 + tier * 0.45, fxInfo.color);
      if (tier >= 2) FX.celebrate(stamp, tier === 3 ? 2 : 1.2);
    }, 380);

    var amb = AMBIENT[fxInfo.id] || AMBIENT.pop;
    var every = Math.round(amb.every * 1.6 * (tier === 3 ? 0.7 : tier === 0 ? 1.5 : 1));
    ambientTimer = setInterval(function () {
      var cv = document.querySelector('.fx-canvas');
      if (!overlay.classList.contains('is-open') || !cv || cv.parentNode !== overlay) { stopAmbient(); return; }
      // 只在标签范围内随机取点，不往外扩
      var o = overlay.getBoundingClientRect(), r = stamp.getBoundingClientRect();
      var x = r.left - o.left + Math.random() * r.width;
      var y = r.top - o.top + Math.random() * r.height;
      FX.burstAt(fxInfo.id, x, y, 22, amb.k * 0.8, fxInfo.color);
    }, every);
  }

  function finishRun() {
    $('btn-deal').disabled = true;
    showShake(false);
    if (replay) { finishReplay(); return; }
    if (!runRecord || runRecord.settled) return;
    runRecord.settled = true;
    lastRecord = runRecord;
    // 占卜：本局翻开卡包数在蒙特卡洛分布里的百分位 → 4 档运势
    var fortune = Fortune.rate(state.cfg, state.spent);
    var reasonText = '今日运势 ' + fortune.name + ' · 翻开 ' + state.spent + ' 个卡包，超过 ' + fortune.pctText + ' 的' + Skin.get().noun;
    // 最终得分 = 暂存区 + 盘上剩余；不看轮次
    var t = E.tally(state, 3);
    var milestones = Collection.recordRun(runRecord.skin, t.counts, runRecord.id, false);
    CollectionView.milestones(milestones);
    $('result-collection-text').textContent = milestones.length
      ? '解锁 ' + milestones.length + ' 项新内容 · 去看看'
      : (Collection.list(runRecord.skin).length ? '本局收集 +' + t.total + ' · 查看进度' : '查看猫咪系列收集进度');
    // 结算主题由 Top1 款式决定（持有最多的那一款）；没有任何棋子时退回幸运款
    var themeIdx = (t.top && t.top.length) ? t.top[0].color : state.lucky;
    var fortuneLine = Skin.fortune(themeIdx)[fortune.tier];
    var newRecord = t.total > best.score || state.earned > best.earned;
    var prevBest = best.score; // 本局前的历史最高，用于解锁进度条起点
    best.runs++;
    best.cats += t.total;
    if (t.total > best.score) best.score = t.total;
    if (state.earned > best.earned) best.earned = state.earned;
    saveBest(best);
    renderBest();
    submitDailyRank(t.total);

    lastStats = {
      score: t.total, stashed: t.stashed, onBoard: t.onBoard, top: t.top,
      rounds: state.round, earned: state.earned, bestRound: state.bestRound,
      lines: state.counts.lines, pairs: state.counts.pairs,
      clears: state.counts.clear, slams: state.counts.slam, shakes: state.counts.shakes,
      lucky: state.lucky, luckyBonus: state.counts.lucky * state.cfg.reward.lucky,
      reasonText: reasonText, newRecord: newRecord,
      spent: state.spent, fortune: fortune.name, fortuneTier: fortune.tier, fortuneLine: fortuneLine, themeIdx: themeIdx
    };

    $('result-reason').textContent = '超越 ' + fortune.pctText + ' 的玩家'; // 界面只留一句，完整文案给战绩图
    // 结算界面围绕 Top1 款式定主题：强调色取其特效主色，背景 / 标签 / 标语 / 环境特效跟着款式走
    var themeFx = Skin.fx(themeIdx), theme = Skin.theme(themeIdx);
    var acc = themeFx.color;
    var bannerEl = document.querySelector('#result .banner');
    bannerEl.style.setProperty('--acc', acc);
    bannerEl.style.setProperty('--acc-soft', hexToRgba(acc, 0.16));
    bannerEl.style.setProperty('--acc-faint', hexToRgba(acc, 0.07));
    bannerEl.setAttribute('data-tier', fortune.tier);
    bannerEl.setAttribute('data-theme', themeFx.id);
    $('result-title').textContent = theme.ribbon;
    $('result-tagline').textContent = theme.tagline;
    var stamp = $('fortune-stamp');
    stamp.textContent = fortune.name;
    stamp.className = 'fortune__stamp fortune__stamp--' + fortune.tier;
    $('fortune-line').textContent = fortuneLine;
    var luckyEl = $('result-lucky');
    luckyEl.innerHTML = '';
    luckyEl.appendChild(document.createTextNode('幸运款'));
    var sp = document.createElement('div');
    Skin.paint(sp, state.lucky);
    luckyEl.appendChild(sp);
    luckyEl.appendChild(document.createTextNode(Skin.itemName(state.lucky) + ' 抽到 ' + state.counts.lucky + ' 只，加成 +' + lastStats.luckyBonus));
    $('result-score').textContent = t.total;
    $('result-breakdown').textContent = '暂存区 ' + t.stashed + ' 只 + 棋盘剩余 ' + t.onBoard + ' 只';
    renderTop3(t.top);
    $('result-rounds').textContent = lastStats.rounds;
    $('result-earned').textContent = lastStats.earned;
    $('result-lines').textContent = lastStats.lines;
    $('result-pairs').textContent = lastStats.pairs;
    $('result-clears').textContent = lastStats.clears;
    $('result-slams').textContent = lastStats.slams;
    $('result-new-record').classList.toggle('is-show', newRecord);
    $('btn-share').disabled = false;
    renderResultUnlock(best.score);
    Sound.bgm.duck(true);
    function showResult() {
      Sound.play('result' + fortune.tier);
      if (fortune.tier === 3) setTimeout(function () { Sound.play('shimmer'); }, 250);
      if (newRecord) setTimeout(function () { Sound.play('record'); }, 600);
      setOverlay('result', true);
      playResultFx(fortune.tier, themeIdx);
    }
    // 还有套系没解锁：先弹进度条，点任意位置 / 数秒后再进结算；全解锁则直接结算
    if (Skin.nextLocked(prevBest)) showUnlockProgress(prevBest, best.score, t.total, showResult);
    else showResult();
  }

  /* ---------- 回放 ----------
   * 结算页「重播本局」：用上一局的记录重开一局，转场落定后自动发牌 / 摇晃直到结束，倍速控件照常可用；
   * 回放结束不重新结算（纪录 / 排行 / 解锁进度都不再累计），直接重新打开原来的结算页。 */
  function startReplay() {
    if (Wipe.isActive() || busy || !lastRecord) return;
    var rec = lastRecord;
    Sound.play('tap');
    setOverlay('result', false);
    setOverlay('share-preview', false);
    Sound.bgm.duck(false);
    wipeTo(function () { startRun(rec.lucky, rec); }, null, function () {
      after(200, function () {
        if (state && replay === rec && !busy && !state.ended && state.round === 0) playRound();
      });
    });
  }
  function finishReplay() {
    var t = E.tally(state, 3);
    if (!lastStats || t.total !== lastStats.score) console.warn('[replay] 回放结果与原局不一致', t.total, lastStats && lastStats.score);
    News.push('回放结束', true);
    var tier = lastStats ? lastStats.fortuneTier : 0;
    var themeIdx = lastStats ? lastStats.themeIdx : state.lucky;
    Sound.bgm.duck(true);
    Sound.play('result' + tier);
    setOverlay('result', true);
    playResultFx(tier, themeIdx);
  }

  /* ---------- 每日排行 ---------- */
  var rankSeq = 0;
  /* 上传本局得分到每日榜；结算页得分下方显示今日名次。失败静默，不影响流程 */
  function submitDailyRank(score) {
    var my = ++rankSeq;
    var el = $('result-rank');
    if (!Board.enabled || score <= 0) { el.hidden = true; return; } // 功能关闭 / 0 分不计入排行
    el.hidden = false;
    el.className = 'banner__rank is-pending';
    el.textContent = '今日排名 · 上传中…';
    Board.submit(score).then(function (r) {
      if (my !== rankSeq) return;
      if (lastStats) { lastStats.rank = r.rank; lastStats.rankTotal = r.total; }
      el.className = 'banner__rank';
      el.textContent = Board.rankLine(r) + ' ›';
    }, function () {
      if (my !== rankSeq) return;
      el.className = 'banner__rank is-off';
      el.textContent = '今日排名 · 暂时无法连接';
    });
  }
  function openRank() {
    Sound.play('open');
    setOverlay('rank', true);
    Board.ui.open();
  }

  /* 结算 Top3：持有数量（暂存区 + 盘上剩余）最多的三款 */
  function renderTop3(top) {
    var box = $('result-top3');
    box.innerHTML = '';
    for (var i = 0; i < top.length; i++) {
      var card = document.createElement('div');
      card.className = 'top3 top3--' + (i + 1);
      var rank = document.createElement('span');
      rank.className = 'top3__rank';
      rank.textContent = 'TOP ' + (i + 1);
      var sp = document.createElement('div');
      Skin.paint(sp, top[i].color);
      var num = document.createElement('span');
      num.className = 'top3__count';
      num.textContent = top[i].count;
      var nm = document.createElement('span');
      nm.className = 'top3__name';
      nm.textContent = Skin.itemName(top[i].color);
      card.appendChild(rank);
      card.appendChild(sp);
      card.appendChild(num);
      card.appendChild(nm);
      box.appendChild(card);
    }
  }

  function goHome() {
    Sound.bgm.duck(false);
    News.stop();
    stopAmbient();
    FX.attach(boardWrap);
    setOverlay('result', false);
    setOverlay('share-preview', false);
    showShake(false);
    state = null;
    replay = null;
    $('screen-game').classList.remove('is-replay');
    busy = false;
    showScreen('room');
  }

  /* ---------- 分享 ---------- */
  async function shareResult() {
    if (!lastStats) return;
    var btn = $('btn-share');
    btn.disabled = true;
    var card = await S.buildCard(lastStats);
    var r = await S.saveToAlbum(card.dataUrl);
    $('share-img').src = r.dataUrl;
    $('share-hint').textContent = r.msg;
    setOverlay('share-preview', true);
    btn.disabled = false;
  }

  /* ---------- 事件绑定 ---------- */
  function collectCats() {
    if (Wipe.isActive()) return;
    paintMascots(); openLuckyPicker();
  }
  function openCollection(skin) {
    if (Wipe.isActive()) return;
    CollectionView.selectSeries(typeof skin === 'string' ? skin : Skin.get().id);
    Sound.play('open'); showScreen('collection'); $('collection-title').focus();
  }
  $('btn-start').addEventListener('click', collectCats);
  $('btn-collection-play').addEventListener('click', function () {
    if (Wipe.isActive()) return;
    Skin.set(CollectionView.selectedSeries()); collectCats();
  });
  $('btn-collection').addEventListener('click', openCollection);
  $('btn-collection-home').addEventListener('click', function () { Sound.play('close'); showScreen('room'); $('btn-collection').focus(); });
  $('screen-collection').addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { event.preventDefault(); $('btn-collection-home').click(); }
  });
  $('btn-lucky-close').addEventListener('click', function () {
    if (Wipe.isActive() || luckySpinning) return;
    Sound.play('close'); setOverlay('lucky', false); resetLuckyGrid(); goHome(); $('btn-start').focus();
  });
  $('btn-result-collection').addEventListener('click', function () {
    if (Wipe.isActive()) return;
    goHome(); openCollection(lastRecord && lastRecord.skin);
  });
  $('collection-list').addEventListener('click', function (event) {
    var button = event.target;
    while (button && button !== this && !button.getAttribute('data-action')) button = button.parentNode;
    if (!button || button === this || button.disabled || Wipe.isActive()) return;
    var id = button.getAttribute('data-cat'), action = button.getAttribute('data-action'), p = Collection.progress(id);
    if (!p || !p.home || (action === 'special' && !p.special)) return;
    Sound.play('tap'); showScreen('room'); Room.perform(id, action);
  });
  $('btn-again').addEventListener('click', openLuckyPicker);
  $('btn-lucky-random').addEventListener('click', function () {
    if (Wipe.isActive() || luckySpinning) return;
    spinLuckyPick(commitLuckyPick);
  });
  $('btn-home').addEventListener('click', function () {
    if (Wipe.isActive()) return;
    setOverlay('result', false);
    setOverlay('share-preview', false);
    wipeTo(goHome);
  });
  $('btn-home-ingame').addEventListener('click', function () {
    if (busy || Wipe.isActive()) return;
    if (state && !state.ended && state.round > 0 && !replay) { // 回放中途退出不用确认
      if (!confirm('退出当前这局？进度不会保存。')) return;
    }
    wipeTo(goHome);
  });
  $('btn-deal').addEventListener('click', function () { Sound.play('tap'); playRound(); });
  $('btn-deal-start').addEventListener('click', function () { Sound.play('tap'); playRound(); });
  $('speed').addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== this && !(t.getAttribute && t.getAttribute('data-speed') !== null)) t = t.parentNode;
    if (!t || t === this) return;
    Speed.set(parseFloat(t.getAttribute('data-speed')));
  });
  $('btn-shake').addEventListener('click', shakeBoard);
  $('btn-share').addEventListener('click', shareResult);
  $('btn-replay').addEventListener('click', startReplay);
  $('btn-share-close').addEventListener('click', function () { Sound.play('close'); setOverlay('share-preview', false); });
  $('btn-rank').addEventListener('click', openRank);
  $('result-rank').addEventListener('click', openRank);
  $('btn-rank-refresh').addEventListener('click', function () { Sound.play('tap'); Board.ui.open(); });
  $('btn-rank-close').addEventListener('click', function () { Sound.play('close'); setOverlay('rank', false); });
  $('btn-rank-nick').addEventListener('click', function () { Sound.play('tap'); Board.ui.saveNick(); });
  $('rank-nick').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); Board.ui.saveNick(); } });
  $('btn-rules').addEventListener('click', function () { Sound.play('open'); setOverlay('rules', true); });
  $('btn-rules-close').addEventListener('click', function () { Sound.play('close'); setOverlay('rules', false); });
  $('btn-skins').addEventListener('click', function () { Sound.play('open'); buildSkinList(); setOverlay('skins', true); });
  $('btn-skins-close').addEventListener('click', function () { Sound.play('close'); setOverlay('skins', false); });
  /* 音频开关：各界面的 .audio-btn[data-audio=bgm|sfx] 共用同一状态，点任意一个全部同步刷新 */
  var audioBtns = document.querySelectorAll('.audio-btn');
  function renderAudioBtns() {
    for (var i = 0; i < audioBtns.length; i++) {
      var b = audioBtns[i];
      var isBgm = b.getAttribute('data-audio') === 'bgm';
      var on = isBgm ? Sound.bgm.enabled() : Sound.enabled();
      b.classList.toggle('is-off', !on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', (isBgm ? '音乐：' : '音效：') + (on ? '开' : '关'));
    }
  }
  function onAudioBtn() {
    var isBgm = this.getAttribute('data-audio') === 'bgm';
    if (isBgm) { Sound.bgm.toggle(); Sound.play('tap'); }
    else if (Sound.toggle()) Sound.play('tap');
    renderAudioBtns();
  }
  for (var ab = 0; ab < audioBtns.length; ab++) audioBtns[ab].addEventListener('click', onAudioBtn);
  renderAudioBtns();

  /* ---------- 启动 ---------- */
  renderBest();
  buildBoard();
  paintMascots();
  Skin.preload();
  showScreen('room');
  // 每日排行：代码开关见 leaderboard.js 顶部 ENABLED_DEFAULT（默认关）。开着才露出入口并预取用户身份
  $('btn-rank').hidden = !Board.enabled;
  if (Board.enabled) Board.getIdentity(); // 预先取小红书用户身份（拿不到则本地匿名），首次上传不再等探测

  // 调试钩子（不影响运行）
  window.TTDDP = {
    getState: function () { return state; },
    config: CONFIG,
    dev: DEV,
    setAutoDeal: setAutoDeal,
    // 回放：上一局的记录 { seed, lucky, cfg }；replay() 等同结算页「重播本局」
    getRecord: function () { return lastRecord; },
    replay: startReplay,
    // 调试用：改累计猫猫数 / 历史最高（皮肤解锁看历史最高）
    setCats: function (n) { best.cats = Math.max(0, n | 0); saveBest(best); renderBest(); return best.cats; },
    setBest: function (n) { best.score = Math.max(0, n | 0); saveBest(best); renderBest(); return best.score; },
    // 调参用：直接预览解锁进度弹层（旧纪录、新纪录、本局得分）
    previewUnlock: function (prev, now, run) { showUnlockProgress(prev | 0, now | 0, run | 0, function () {}); },
    // 调试用：立刻按当前状态结束本局并弹结算页
    finish: function () { if (state && !busy) { if (!state.ended) state.ended = 'empty'; finishRun(); } },
    // 调参用：扇形摆出 n 张票并停住（不撕、不发牌）；TTDDP.previewPacks(0) 清掉
    previewPacks: function (n) {
      clearTickets();
      var colors = [];
      for (var i = 0; i < (n || 0); i++) colors.push(Math.floor(Math.random() * 9));
      if (colors.length) fanTickets(colors);
    }
  };
})();
