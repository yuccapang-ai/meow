/* 猫猫对对碰 · 音效层
 * 素材：Kenney Interface Sounds（CC0）+ 撕纸录音（freesound #556939）。源文件在 app/audio/，但小工具容器的 zip
 * 不允许音频文件类型，<audio> 也不接受 data: / blob: 源，所以打包时由 tools/build-audio.js 把它们以 base64 写进
 * app/js/audio-data.js（window.TurtleAudioData.files，键 = 文件名去掉扩展名），本文件用 Web Audio 的
 * decodeAudioData 直接解码内存字节播放——不经过任何资源加载，不受 CSP media-src 约束，也不用 fetch / XHR。
 * 音表 SFX 按「事件名 → 文件列表」配置，换素材只改这张表；同一事件多个文件轮播，可选随机音高（rate）与节流间隔（throttle，默认 40 ms）。
 * BGM 同样解码成 AudioBuffer 后 loop 播放（循环点无缝），结算弹层期间压低（duck），切后台 suspend。
 * 首次用户手势 resume AudioContext；音效 / 音乐两个开关分别存 localStorage。没有 AudioContext 或没有数据文件时整体静默。
 * ES2017 / Chrome 61。挂到 window.TurtleSound。 */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'ttddp.sound.v1';       // 音效开关
  var BGM_KEY = 'ttddp.bgm.v1';             // 音乐开关
  /* BGM：数据键、常态音量、结算时压低到的音量、渐变时长 */
  var BGM = { file: 'bgm', vol: 0.4, duckVol: 0.12, fadeMs: 350 };
  var THROTTLE_MS = 40;
  var MASTER = 0.8;          // 总线留一点余量，结算时多音叠加不炸
  var DECODE_BATCH = 6;      // 预热时每拍解码几个 SFX，避免首屏一次性阻塞

  /* 音表：见 docs/audio.md 的映射说明。文件名可带扩展名（如 tear.wav），查数据时会去掉 */
  var SFX = {
    tap:      { files: ['back_002'], vol: 0.7 },
    open:     { files: ['maximize_008'], vol: 0.55 },
    close:    { files: ['minimize_008'], vol: 0.55 },
    select:   { files: ['confirmation_001'], vol: 0.8 },
    // 转场（wipe.js onPhase）
    fall:     { files: ['minimize_009'], vol: 0.55 },
    zip:      { files: ['scroll_002'], vol: 0.3 },
    land:     { files: ['bong_001'], vol: 0.9 },
    cover:    { files: ['maximize_009'], vol: 0.55 },
    reveal:   { files: ['minimize_006'], vol: 0.4 },
    // 发牌演出
    dealDrop: { files: ['drop_004'], vol: 0.7 },
    fan:      { files: ['click_002', 'click_003', 'click_005'], vol: 0.5, throttle: 20 },
    tear:     { files: ['tear.wav'], vol: 0.7, rate: [0.94, 1.06], throttle: 60 },
    catLand:  { files: ['drop_002', 'drop_003'], vol: 0.35, rate: [0.94, 1.06] },
    // 判定与结算
    hitPair:  { files: ['question_002'], vol: 0.8 },
    hitLine:  { files: ['question_001'], vol: 0.9 },
    hitSlam:  { files: ['confirmation_004'], vol: 1 },
    lucky:    { files: ['glass_001'], vol: 0.6 },
    pop:      { files: ['pluck_002'], vol: 0.6, rate: [0.92, 1.08] },
    coin:     { files: ['glass_003', 'glass_001'], vol: 0.6 },
    thump:    { files: ['bong_001'], vol: 0.8 },
    clear:    { files: ['confirmation_002'], vol: 0.75 },
    // 零消除 / 摇晃
    womp:     { files: ['error_006'], vol: 0.7 },
    rattle:   { files: ['back_002', 'back_004', 'back_003'], vol: 0.55, rate: [0.9, 1.1], throttle: 30 },
    // Run 结束（按运势档位 0..3）
    result0:  { files: ['error_005'], vol: 0.8 },
    result1:  { files: ['confirmation_001'], vol: 0.9 },
    result2:  { files: ['confirmation_002'], vol: 0.85 },
    result3:  { files: ['confirmation_004'], vol: 1 },
    shimmer:  { files: ['glass_001'], vol: 0.6, rate: [1.15, 1.15] },
    stamp:    { files: ['bong_001'], vol: 1, rate: [0.8, 0.8] },
    record:   { files: ['select_004'], vol: 0.8 }
  };

  var DATA = (root.TurtleAudioData && root.TurtleAudioData.files) || null;
  var AC = root.AudioContext || root.webkitAudioContext;
  var mode = (AC && DATA && typeof root.atob === 'function') ? 'webaudio' : 'none';   // webaudio | none
  var ctx = null, master = null, bgmGain = null;
  var buffers = {};      // key → AudioBuffer
  var waiters = {};      // key → [callback]，正在解码时的等待者
  var lastPlay = {};     // name → 上次播放时间
  var cursor = {};       // name → 轮播下标
  var unlocked = false;
  var enabled = true;
  var loadStarted = false;

  var bgmEnabled = true, bgmSrc = null, bgmWant = false, bgmDucked = false;
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) enabled = saved !== '0';
    var savedBgm = localStorage.getItem(BGM_KEY);
    if (savedBgm !== null) bgmEnabled = savedBgm !== '0';
  } catch (e) { /* 存储不可用时默认开 */ }

  function keyOf(file) { return file.replace(/\.[a-z0-9]+$/i, ''); }

  function fileList() {
    var seen = {}, out = [];
    for (var k in SFX) {
      var fs = SFX[k].files;
      for (var i = 0; i < fs.length; i++) {
        var key = keyOf(fs[i]);
        if (!seen[key]) { seen[key] = 1; out.push(key); }
      }
    }
    return out;
  }

  /* ---------- AudioContext ---------- */
  function ensureCtx() {
    if (ctx || mode !== 'webaudio') return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = MASTER;
      master.connect(ctx.destination);
      bgmGain = ctx.createGain();
      bgmGain.gain.value = BGM.vol;
      bgmGain.connect(master);
    } catch (e) { mode = 'none'; ctx = null; }
  }

  function resumeCtx() {
    if (!ctx || ctx.state !== 'suspended' || !ctx.resume) return;
    try { var p = ctx.resume(); if (p && p.catch) p.catch(function () { /* 未激活时忽略 */ }); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 解码：base64 → ArrayBuffer → AudioBuffer ---------- */
  function b64ToArrayBuffer(b64) {
    var bin = root.atob(b64), n = bin.length, bytes = new Uint8Array(n);
    for (var i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function decode(key, done) {
    if (buffers[key]) { if (done) done(buffers[key]); return; }
    if (waiters[key]) { if (done) waiters[key].push(done); return; }
    var b64 = DATA && DATA[key];
    if (!b64 || !ctx) { if (done) done(null); return; }
    waiters[key] = done ? [done] : [];
    function finish(buf) {
      var list = waiters[key] || [];
      delete waiters[key];
      if (buf) buffers[key] = buf;
      for (var i = 0; i < list.length; i++) list[i](buf || null);
    }
    var ab;
    try { ab = b64ToArrayBuffer(b64); } catch (e) { finish(null); return; }
    try {
      ctx.decodeAudioData(ab, function (buf) { finish(buf); }, function () { finish(null); });
    } catch (e) { finish(null); }
  }

  /* 预热：SFX 分批解码（都很小），BGM 放到最后一拍，避免首屏卡顿 */
  function preload() {
    if (loadStarted || mode !== 'webaudio') return;
    loadStarted = true;
    ensureCtx();
    if (mode !== 'webaudio') return;
    var files = fileList(), i = 0;
    function step() {
      var end = Math.min(files.length, i + DECODE_BATCH);
      for (; i < end; i++) decode(files[i]);
      if (i < files.length) setTimeout(step, 0);
      else setTimeout(function () { decode(BGM.file); }, 0);
    }
    step();
  }

  /* ---------- 解锁 ----------
   * 监听常驻、每次手势都跑一遍：Chrome 在触屏上不把 pointerdown 算作用户激活（只有 touchend / pointerup / click 算），
   * 若只在第一次手势里 resume 一次，触屏上会被自动播放策略拒绝后再无重试，BGM 永远不响。 */
  function onGesture() {
    unlocked = true;
    preload();
    resumeCtx();
    if (bgmEnabled && !document.hidden && !bgmSrc) bgmStart();
  }
  ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'click', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, onGesture, true);
  });
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) { if (ctx.suspend) { try { ctx.suspend(); } catch (e) { /* 忽略 */ } } }
    else if (unlocked) resumeCtx();
  });

  /* ---------- BGM ---------- */
  function bgmStart() {
    if (!bgmEnabled || mode !== 'webaudio') return false;
    ensureCtx();
    if (!ctx) return false;
    bgmWant = true;
    if (bgmSrc) return true;
    decode(BGM.file, function (buf) {
      if (!buf || !bgmWant || bgmSrc || !bgmEnabled) return;
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(bgmGain);
      bgmGain.gain.value = bgmDucked ? BGM.duckVol : BGM.vol;
      try { src.start(0); } catch (e) { return; }
      bgmSrc = src;
      if (unlocked) resumeCtx();
    });
    return true;
  }
  function bgmStop() {
    bgmWant = false;
    if (!bgmSrc) return;
    try { bgmSrc.stop(); } catch (e) { /* 已停止 */ }
    try { bgmSrc.disconnect(); } catch (e) { /* 忽略 */ }
    bgmSrc = null;
  }
  /* 结算弹层等场合压低 / 恢复（增益线性渐变） */
  function bgmDuck(on) {
    bgmDucked = !!on;
    if (!ctx || !bgmGain) return;
    var target = bgmDucked ? BGM.duckVol : BGM.vol, t = ctx.currentTime;
    try {
      bgmGain.gain.cancelScheduledValues(t);
      bgmGain.gain.setValueAtTime(bgmGain.gain.value, t);
      bgmGain.gain.linearRampToValueAtTime(target, t + BGM.fadeMs / 1000);
    } catch (e) { bgmGain.gain.value = target; }
  }
  function setBgmEnabled(on) {
    bgmEnabled = !!on;
    try { localStorage.setItem(BGM_KEY, bgmEnabled ? '1' : '0'); } catch (e) { /* 忽略 */ }
    if (bgmEnabled) bgmStart(); else bgmStop();
    return bgmEnabled;
  }

  /* ---------- 播放 ---------- */
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function play(name) {
    if (!enabled || mode !== 'webaudio' || !ctx) return false;
    var def = SFX[name];
    if (!def) return false;
    var now = Date.now();
    var gap = def.throttle == null ? THROTTLE_MS : def.throttle;
    if (lastPlay[name] && now - lastPlay[name] < gap) return false;
    lastPlay[name] = now;

    var idx = cursor[name] = ((cursor[name] || 0) + 1) % def.files.length;
    var key = keyOf(def.files[idx]);
    var buf = buffers[key];
    if (!buf) { decode(key); return false; }           // 还没解出来：这次跳过，顺手补解
    if (ctx.state !== 'running') { if (unlocked) resumeCtx(); return false; }
    var rate = def.rate ? rnd(def.rate[0], def.rate[1]) : 1;
    var vol = def.vol == null ? 1 : def.vol;
    try {
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      var g = ctx.createGain();
      g.gain.value = vol;
      src.connect(g); g.connect(master);
      src.start(0);
    } catch (e) { return false; }
    return true;
  }

  /* 连发：count 次，间隔 interval 毫秒（用于扇形甩票、摇晃棋盘这类节奏音） */
  function burst(name, count, interval) {
    for (var i = 0; i < count; i++) {
      if (i === 0) play(name);
      else setTimeout(play.bind(null, name), i * interval);
    }
  }

  function setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch (e) { /* 忽略 */ }
    return enabled;
  }

  // 尽早开始解码（不需要手势；AudioContext 未激活时 decodeAudioData 照常工作），首个音效才不会迟到
  preload();
  // 提前把 BGM 源挂上：AudioContext 处于 suspended 时它会等着，首次手势 resume 的瞬间就响起
  setTimeout(function () { if (bgmEnabled && !document.hidden) bgmStart(); }, 0);

  root.TurtleSound = {
    play: play,
    burst: burst,
    enabled: function () { return enabled; },
    setEnabled: setEnabled,
    toggle: function () { return setEnabled(!enabled); },
    mode: function () { return mode; },
    SFX: SFX,
    bgm: {
      start: bgmStart,
      stop: bgmStop,
      duck: bgmDuck,
      enabled: function () { return bgmEnabled; },
      setEnabled: setBgmEnabled,
      toggle: function () { return setBgmEnabled(!bgmEnabled); },
      playing: function () { return !!(bgmSrc && ctx && ctx.state === 'running'); }
    }
  };
})(typeof window !== 'undefined' ? window : this);
