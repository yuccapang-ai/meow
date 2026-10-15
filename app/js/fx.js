/* 猫猫对对碰 · 消除特效层（Canvas 2D 粒子）
 * 一张覆盖棋盘的 canvas，所有款式的消除特效都画在这一层；DOM 不增加节点。
 * 每个款式一个预设（PRESETS），皮肤表里用 fx 字段指向预设名。
 * 挂到 window.TurtleFX。ES2017 / Chrome 61：不用 OffscreenCanvas / Worker。 */
(function (root) {
  'use strict';

  var MAX_LIVE = 170;           // 活粒子上限，超出的直接不生成
  var TAU = Math.PI * 2;
  var canvas = null, ctx = null;
  var dpr = 1, W = 0, H = 0;    // CSS 像素尺寸
  var parts = [], pool = [];
  var running = false, lastT = 0;
  var quality = 1;              // 低端机降级：连续掉帧后粒子数减半（本次会话内保持）
  var slowFrames = 0;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ---------- 画布 ---------- */
  function init(hostEl) {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'fx-canvas';
    hostEl.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ensureSize() {
    if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
  }

  /* ---------- 粒子 ---------- */
  function spawn(p) {
    if (parts.length >= MAX_LIVE) return null;
    var o = pool.pop() || {};
    o.x = p.x; o.y = p.y;
    o.vx = p.vx || 0; o.vy = p.vy || 0;
    o.g = p.g || 0; o.drag = p.drag || 1;
    o.age = -(p.delay || 0); o.life = p.life || 0.8;
    o.size = p.size || 6; o.size2 = p.size2 == null ? o.size : p.size2;
    o.w = p.w || 0; o.h = p.h || 0;
    o.rot = p.rot || 0; o.vr = p.vr || 0;
    o.color = p.color || '#fff'; o.color2 = p.color2 || null;
    o.shape = p.shape || 'circle'; o.text = p.text || '';
    o.alpha = p.alpha == null ? 1 : p.alpha;
    o.sway = p.sway || 0; o.freq = p.freq || 0; o.phase = Math.random() * TAU;
    o.lw = p.lw || 0; o.lw2 = p.lw2 == null ? o.lw : p.lw2;
    o.fade = p.fade == null ? 0.4 : p.fade; // 生命最后这一段比例内淡出
    parts.push(o);
    if (!running) { running = true; lastT = 0; requestAnimationFrame(step); }
    return o;
  }

  function step(now) {
    // 物理步长限制在 50ms 内防止穿越；寿命按真实时间走（上限 250ms），页面卡顿时粒子也能及时消散
    var real = lastT ? (now - lastT) / 1000 : 0.016;
    var wall = real * rate; // 全局倍速：0 = 暂停（粒子悬停不动）
    var dt = Math.min(0.05, wall);
    var ageDt = Math.min(0.25, wall);
    lastT = now;
    if (real > 0.024) { if (++slowFrames >= 10) quality = 0.5; } else slowFrames = 0;
    ctx.clearRect(0, 0, W, H);
    var k;
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.age += ageDt;
      if (p.age < 0) continue;
      if (p.age >= p.life) { parts.splice(i, 1); pool.push(p); continue; }
      p.vy += p.g * dt;
      if (p.drag !== 1) { k = Math.pow(p.drag, dt * 60); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      draw(p);
    }
    if (parts.length) requestAnimationFrame(step);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }

  function draw(p) {
    var t = p.age / p.life;
    var a = p.alpha * (t > 1 - p.fade ? (1 - t) / p.fade : 1);
    var s = p.size + (p.size2 - p.size) * t;
    var x = p.x + (p.sway ? Math.sin(p.age * p.freq + p.phase) * p.sway : 0);
    ctx.save();
    ctx.globalAlpha = a < 0 ? 0 : (a > 1 ? 1 : a);
    ctx.translate(x, p.y);
    if (p.rot) ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    switch (p.shape) {
      case 'circle':
        ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill(); break;
      case 'rect':
      case 'flash':
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); break;
      case 'text':
        ctx.font = '900 ' + s + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.text, 0, 0); break;
      case 'ring':
        ctx.strokeStyle = p.color; ctx.lineWidth = p.lw + (p.lw2 - p.lw) * t;
        ctx.beginPath(); ctx.arc(0, 0, s < 0.1 ? 0.1 : s, 0, TAU); ctx.stroke(); break;
      case 'photo': // 白边小相片
        ctx.fillStyle = '#fff'; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2 + p.w * 0.1, -p.h / 2 + p.h * 0.1, p.w * 0.8, p.h * 0.62); break;
      case 'egg': // 荷包蛋碎块
        ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill();
        ctx.fillStyle = p.color2 || '#f5b400'; ctx.beginPath(); ctx.arc(s * 0.1, 0, s * 0.5, 0, TAU); ctx.fill(); break;
      case 'bean': // 咖啡豆
        ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.65, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = p.color2 || '#3d2314'; ctx.lineWidth = s * 0.18 < 1 ? 1 : s * 0.18;
        ctx.beginPath(); ctx.moveTo(-s * 0.6, 0); ctx.quadraticCurveTo(0, s * 0.45, s * 0.6, 0); ctx.stroke(); break;
      case 'splat': // 颜料 / 糖霜溅点
        ctx.beginPath();
        ctx.moveTo(s, 0); ctx.arc(0, 0, s, 0, TAU);
        ctx.moveTo(s * 1.25, -s * 0.4); ctx.arc(s * 0.8, -s * 0.4, s * 0.45, 0, TAU);
        ctx.moveTo(-s * 0.35, s * 0.5); ctx.arc(-s * 0.7, s * 0.5, s * 0.35, 0, TAU);
        ctx.fill(); break;
      case 'drop': // 汗珠
        ctx.beginPath(); ctx.moveTo(0, -s * 1.5);
        ctx.quadraticCurveTo(s, 0, 0, s); ctx.quadraticCurveTo(-s, 0, 0, -s * 1.5); ctx.fill(); break;
      case 'tri': // 胡萝卜块：细长楔形
        ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.lineTo(s * 0.55, s * 0.7); ctx.lineTo(-s * 0.55, s * 0.7); ctx.closePath(); ctx.fill(); break;
      case 'heart': // 爱心
        ctx.beginPath(); ctx.moveTo(0, s * 0.9);
        ctx.bezierCurveTo(-s * 1.4, -s * 0.1, -s * 0.7, -s * 1.15, 0, -s * 0.35);
        ctx.bezierCurveTo(s * 0.7, -s * 1.15, s * 1.4, -s * 0.1, 0, s * 0.9); ctx.fill(); break;
      case 'shades': { // 墨镜：两片方镜 + 鼻梁 + 镜腿（w 总宽，h 镜片高）
        var lw0 = p.w * 0.4;
        ctx.fillRect(-p.w / 2, -p.h / 2, lw0, p.h); ctx.fillRect(p.w / 2 - lw0, -p.h / 2, lw0, p.h);
        ctx.fillRect(-p.w * 0.1, -p.h * 0.35, p.w * 0.2, p.h * 0.22);
        ctx.fillRect(-p.w * 0.62, -p.h * 0.35, p.w * 0.12, p.h * 0.14); ctx.fillRect(p.w * 0.5, -p.h * 0.35, p.w * 0.12, p.h * 0.14);
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(-p.w * 0.44, -p.h * 0.36, lw0 * 0.35, p.h * 0.16); break;
      }
      case 'popcorn': // 爆米花：三个叠在一起的小圆
        ctx.beginPath(); ctx.arc(0, -s * 0.35, s * 0.6, 0, TAU); ctx.arc(-s * 0.5, s * 0.3, s * 0.55, 0, TAU); ctx.arc(s * 0.5, s * 0.3, s * 0.55, 0, TAU); ctx.fill();
        ctx.fillStyle = p.color2 || '#ffd43b'; ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.1, s * 0.3, 0, TAU); ctx.fill(); break;
      case 'phone': // 手机：深色机身 + 亮屏
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.fillStyle = p.color2 || '#c3fae8'; ctx.fillRect(-p.w * 0.4, -p.h * 0.4, p.w * 0.8, p.h * 0.72); break;
      case 'bag': { // 购物袋：袋身 + 提手
        ctx.fillRect(-p.w / 2, -p.h * 0.3, p.w, p.h * 0.8);
        ctx.strokeStyle = p.color2 || '#2e2d28'; ctx.lineWidth = p.w * 0.12 < 1 ? 1 : p.w * 0.12;
        ctx.beginPath(); ctx.arc(0, -p.h * 0.3, p.w * 0.3, Math.PI, 0); ctx.stroke(); break;
      }
      case 'car': { // 小车：车身 + 车顶 + 两个轮子
        ctx.fillRect(-p.w / 2, -p.h * 0.1, p.w, p.h * 0.55);
        ctx.fillRect(-p.w * 0.3, -p.h * 0.5, p.w * 0.55, p.h * 0.45);
        ctx.fillStyle = p.color2 || '#2e2d28';
        ctx.beginPath(); ctx.arc(-p.w * 0.28, p.h * 0.45, p.h * 0.2, 0, TAU); ctx.arc(p.w * 0.28, p.h * 0.45, p.h * 0.2, 0, TAU); ctx.fill(); break;
      }
      case 'thumb': // 点赞大拇指：手掌 + 斜着竖起的拇指
        ctx.fillRect(-s * 0.55, -s * 0.15, s * 1.1, s * 0.95);
        ctx.save(); ctx.translate(-s * 0.35, -s * 0.15); ctx.rotate(-0.55); ctx.fillRect(-s * 0.2, -s * 0.95, s * 0.4, s * 1.0); ctx.restore(); break;
      case 'ripple': // 水坑涟漪：扁椭圆描边
        ctx.strokeStyle = p.color; ctx.lineWidth = p.lw + (p.lw2 - p.lw) * t;
        ctx.beginPath(); ctx.ellipse(0, 0, s < 0.1 ? 0.1 : s, (s < 0.1 ? 0.1 : s) * 0.38, 0, 0, TAU); ctx.stroke(); break;
    }
    ctx.restore();
  }

  /* 从格子中心附近向随机方向发射一个粒子 */
  function radial(c, o) {
    var ang = o.ang != null ? o.ang : rnd(0, TAU);
    var sp = o.speed || 0;
    spawn({
      x: c.cx + rnd(-c.r * 0.3, c.r * 0.3), y: c.cy + rnd(-c.r * 0.3, c.r * 0.3),
      vx: Math.cos(ang) * sp + (o.vx || 0), vy: Math.sin(ang) * sp + (o.vy || 0),
      g: o.g, drag: o.drag, life: o.life, delay: o.delay,
      size: o.size, size2: o.size2, w: o.w, h: o.h,
      rot: o.rot != null ? o.rot : rnd(0, TAU), vr: o.vr != null ? o.vr : rnd(-10, 10),
      color: o.color, color2: o.color2, shape: o.shape, text: o.text, alpha: o.alpha,
      sway: o.sway, freq: o.freq, lw: o.lw, lw2: o.lw2, fade: o.fade
    });
  }

  function count(n, c) { return Math.round(n * c.k * quality); }

  /* ---------- 各款式预设。c = { cx, cy, r: 半格边长, k: 强度, v: 速度倍率, color } ---------- */
  var PRESETS = {
    /* 默认：本色圆点 + 冲击环（矢量乌龟套系用） */
    pop: function (c) {
      var i, n = count(10, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'circle', color: c.color, size: c.r * rnd(0.06, 0.12), speed: rnd(150, 260) * c.v, g: 600, life: rnd(0.5, 0.8) });
      spawn({ x: c.cx, y: c.cy, shape: 'ring', color: c.color, size: c.r * 0.3, size2: c.r * 1.3, lw: 6, lw2: 1, life: 0.35, fade: 0.6 });
    },
    /* 甜甜圈猫：彩色糖针迸开 + 粉色糖霜溅点 */
    donut: function (c) {
      var cols = ['#f783ac', '#ffd43b', '#69db7c', '#4dabf7', '#ff6b6b', '#ffffff'];
      var i, n = count(14, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'rect', color: pick(cols), w: c.r * 0.07, h: c.r * 0.24, speed: rnd(180, 330) * c.v, vy: -80, g: 650, drag: 0.985, life: rnd(0.6, 1.0) });
      n = count(6, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'splat', color: '#f8a5c2', size: c.r * rnd(0.08, 0.14), speed: rnd(90, 170) * c.v, g: 400, vr: rnd(-3, 3), life: rnd(0.45, 0.7) });
    },
    /* 码农猫：绿色代码字符往下掉 + 一帧绿闪 */
    code: function (c) {
      var glyphs = ['0', '1', '<', '>', '/', '{', '}', ';', '=', '#'];
      var i, n = count(16, c);
      spawn({ x: c.cx, y: c.cy, shape: 'flash', color: '#2ecc71', w: c.r * 1.9, h: c.r * 1.9, alpha: 0.35, life: 0.18, fade: 1 });
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.9, c.r * 0.9), y: c.cy + rnd(-c.r * 0.9, c.r * 0.2),
        vx: rnd(-25, 25), vy: rnd(120, 280) * c.v, g: 300,
        shape: 'text', text: pick(glyphs), color: Math.random() < 0.5 ? '#2ecc71' : '#1e8e4a',
        size: c.r * rnd(0.22, 0.34), life: rnd(0.6, 0.95), delay: rnd(0, 0.15), fade: 0.5
      });
    },
    /* 音乐猫：音符左右摆着往上飘 */
    music: function (c) {
      var notes = ['♪', '♫', '♩', '♬'], cols = ['#4dabf7', '#748ffc', '#f783ac', '#2e2d28'];
      var i, n = count(8, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.6, c.r * 0.6), y: c.cy + rnd(-c.r * 0.3, c.r * 0.3),
        vx: rnd(-40, 40), vy: -rnd(150, 260) * c.v, g: -80,
        shape: 'text', text: pick(notes), color: pick(cols), size: c.r * rnd(0.34, 0.5),
        rot: rnd(-0.3, 0.3), vr: rnd(-1.5, 1.5), sway: 12, freq: rnd(5, 8), life: rnd(0.8, 1.1), delay: rnd(0, 0.2), fade: 0.5
      });
    },
    /* 咖啡猫：白色蒸汽卷往上散 + 咖啡豆落下 */
    coffee: function (c) {
      var i, n = count(7, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.4, c.r * 0.4), y: c.cy - c.r * rnd(0.1, 0.5),
        vy: -rnd(50, 110), shape: 'circle', color: '#ffffff', alpha: 0.6,
        size: c.r * 0.12, size2: c.r * 0.34, sway: 9, freq: rnd(2.5, 4), life: rnd(0.9, 1.3), delay: rnd(0, 0.25), fade: 0.7
      });
      n = count(6, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'bean', color: '#6b3e1e', color2: '#3d2314', size: c.r * rnd(0.09, 0.13), speed: rnd(130, 220) * c.v, vy: -120, g: 750, vr: rnd(-8, 8), life: rnd(0.6, 0.9) });
    },
    /* 摄影猫：整格白闪 + 快门光圈收缩 + 一张小相片飞出 + 星光 */
    photo: function (c) {
      spawn({ x: c.cx, y: c.cy, shape: 'flash', color: '#ffffff', w: c.r * 2.1, h: c.r * 2.1, alpha: 0.95, life: 0.22, fade: 0.8 });
      spawn({ x: c.cx, y: c.cy, shape: 'ring', color: '#2e2d28', size: c.r * 1.15, size2: c.r * 0.05, lw: 5, lw2: 14, life: 0.32, fade: 0.3, alpha: 0.85 });
      spawn({ x: c.cx, y: c.cy, vx: rnd(90, 160), vy: -rnd(280, 360) * c.v, g: 750, shape: 'photo', color: '#a8c5d6', w: c.r * 0.62, h: c.r * 0.72, rot: -0.2, vr: rnd(2, 4), life: 0.95, fade: 0.3 });
      var i, n = count(6, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'text', text: '✦', color: pick(['#ffd43b', '#ffffff']), size: c.r * rnd(0.18, 0.3), speed: rnd(120, 220), g: 150, vr: rnd(-2, 2), life: rnd(0.4, 0.7), delay: 0.05 });
    },
    /* 厨师猫：荷包蛋碎块 + 白气 */
    chef: function (c) {
      var i, n = count(8, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'egg', color: '#fffaf0', color2: '#f5b400', size: c.r * rnd(0.09, 0.15), speed: rnd(160, 280) * c.v, vy: -140, g: 850, vr: rnd(-12, 12), life: rnd(0.6, 0.9) });
      n = count(5, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.5, c.r * 0.5), y: c.cy - c.r * 0.2, vy: -rnd(90, 150),
        shape: 'circle', color: '#ffffff', alpha: 0.7, size: c.r * 0.14, size2: c.r * 0.36, sway: 6, freq: 3, life: rnd(0.6, 0.9), fade: 0.7
      });
    },
    /* 健身猫：地面冲击波双环 + 汗珠飞散 */
    gym: function (c) {
      spawn({ x: c.cx, y: c.cy + c.r * 0.5, shape: 'ring', color: '#e8590c', size: c.r * 0.3, size2: c.r * 1.5, lw: 9, lw2: 1, life: 0.4, fade: 0.6 });
      spawn({ x: c.cx, y: c.cy + c.r * 0.5, shape: 'ring', color: '#2e2d28', size: c.r * 0.2, size2: c.r * 1.1, lw: 4, lw2: 1, life: 0.3, fade: 0.6, delay: 0.05, alpha: 0.6 });
      var i, n = count(10, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.5, c.r * 0.5), y: c.cy - c.r * 0.4,
        vx: rnd(-220, 220) * c.v, vy: -rnd(120, 320) * c.v, g: 950,
        shape: 'drop', color: '#4dabf7', size: c.r * rnd(0.06, 0.1), life: rnd(0.5, 0.8)
      });
    },
    /* 画家猫：调色盘颜料溅点 + 一道沿弧线依次点出的笔触 */
    painter: function (c) {
      var cols = ['#ff6b6b', '#ffd43b', '#4dabf7', '#69db7c', '#da77f2', '#ffa94d'];
      var i, n = count(12, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'splat', color: pick(cols), size: c.r * rnd(0.07, 0.16), speed: rnd(110, 300) * c.v, g: 500, vr: rnd(-4, 4), life: rnd(0.5, 0.8) });
      var col = pick(cols), steps = 12;
      for (i = 0; i < steps; i++) {
        var a = -2.4 + (i / (steps - 1)) * 1.6; // 约 -137° → -46°
        spawn({
          x: c.cx + Math.cos(a) * c.r * 0.85, y: c.cy + Math.sin(a) * c.r * 0.85,
          shape: 'circle', color: col, size: c.r * (0.06 + 0.05 * Math.sin(i / steps * Math.PI)),
          delay: i * 0.022, life: 0.5, fade: 0.6
        });
      }
    },
    /* 撕开卡包：纸屑从撕口向上飞出（以元素宽度 rw 定尺寸，撕口很扁） */
    scraps: function (c) {
      var cols = ['#f4e7cc', '#e3d4ae', '#b6431f', '#2e2d28'];
      var i, n = count(14, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.rw * 0.9, c.rw * 0.9), y: c.cy,
        vx: rnd(-140, 140) * c.v, vy: -rnd(120, 300) * c.v, g: 750, drag: 0.985,
        shape: 'rect', color: pick(cols), w: c.rw * rnd(0.08, 0.16), h: c.rw * rnd(0.05, 0.1),
        rot: rnd(0, TAU), vr: rnd(-12, 12), life: rnd(0.6, 0.9)
      });
    },
    /* 落地尘土：几粒纸色小圆从格子底部向两侧散开 */
    dust: function (c) {
      var i, n = count(6, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.4, c.r * 0.4), y: c.cy + c.r * 0.7,
        vx: rnd(-90, 90), vy: -rnd(20, 70), g: 250,
        shape: 'circle', color: '#c9b892', alpha: 0.7, size: c.r * 0.07, size2: c.r * 0.16, life: rnd(0.3, 0.45), fade: 0.6
      });
    },
    /* ===== 套系 2「碰瓷猫」 ===== */
    /* 啃萝卜猫：橙色萝卜块楔形迸开 + 几片绿叶 */
    carrot: function (c) {
      var i, n = count(10, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'tri', color: pick(['#f76707', '#ff922b', '#fd7e14']), size: c.r * rnd(0.09, 0.15), speed: rnd(150, 280) * c.v, vy: -100, g: 720, vr: rnd(-10, 10), life: rnd(0.55, 0.85) });
      n = count(4, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'rect', color: pick(['#51cf66', '#2f9e44']), w: c.r * 0.06, h: c.r * 0.22, speed: rnd(100, 200) * c.v, vy: -140, g: 480, drag: 0.98, vr: rnd(-6, 6), life: rnd(0.6, 0.9) });
    },
    /* 躺平猫：Zzz 摇着往上飘 + 落地草叶 + 一圈软软的地面尘环 */
    flat: function (c) {
      var i, n = count(3, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + c.r * rnd(0.1, 0.5), y: c.cy - c.r * 0.3, vx: rnd(15, 45), vy: -rnd(70, 120), g: -30,
        shape: 'text', text: i % 2 ? 'Z' : 'z', color: '#2e2d28', size: c.r * (0.22 + i * 0.09), sway: 6, freq: rnd(2.5, 4),
        life: rnd(0.9, 1.2), delay: i * 0.13, fade: 0.5
      });
      n = count(6, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.7, c.r * 0.7), y: c.cy + c.r * 0.6, vx: rnd(-60, 60), vy: -rnd(80, 170) * c.v, g: 520,
        shape: 'rect', color: pick(['#82c91e', '#a9e34b']), w: c.r * 0.05, h: c.r * 0.18, rot: rnd(0, TAU), vr: rnd(-8, 8), life: rnd(0.5, 0.75)
      });
      spawn({ x: c.cx, y: c.cy + c.r * 0.6, shape: 'ripple', color: '#82c91e', size: c.r * 0.2, size2: c.r * 1.2, lw: 5, lw2: 1, life: 0.4, fade: 0.6, alpha: 0.7 });
    },
    /* 偷看猫：问号叹号从头顶弹出 + 灰色小点 */
    peek: function (c) {
      var i, n = count(5, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.5, c.r * 0.5), y: c.cy - c.r * 0.6, vx: rnd(-40, 40), vy: -rnd(110, 190) * c.v, g: 120,
        shape: 'text', text: Math.random() < 0.6 ? '?' : '!', color: pick(['#868e96', '#2e2d28', '#5c7cfa']), size: c.r * rnd(0.3, 0.46),
        rot: rnd(-0.3, 0.3), vr: rnd(-2, 2), life: rnd(0.6, 0.9), delay: rnd(0, 0.15), fade: 0.5
      });
      n = count(6, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'circle', color: '#adb5bd', size: c.r * rnd(0.05, 0.09), speed: rnd(100, 200) * c.v, g: 500, life: rnd(0.4, 0.65) });
    },
    /* 纸箱猫：牛皮纸碎 + 橘子贴纸 + 胶带条 + 落地尘土 */
    box: function (c) {
      var i, n = count(10, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'rect', color: pick(['#d9a066', '#c78a4e', '#b07a45']), w: c.r * rnd(0.12, 0.18), h: c.r * rnd(0.08, 0.12), speed: rnd(160, 300) * c.v, vy: -120, g: 750, drag: 0.985, vr: rnd(-10, 10), life: rnd(0.6, 0.9) });
      n = count(3, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'circle', color: '#ff922b', size: c.r * rnd(0.07, 0.1), speed: rnd(120, 220) * c.v, vy: -100, g: 700, life: rnd(0.5, 0.75) });
      n = count(3, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'rect', color: '#e9d8a6', w: c.r * 0.05, h: c.r * 0.3, speed: rnd(100, 200) * c.v, vy: -140, g: 500, drag: 0.98, vr: rnd(-4, 4), life: rnd(0.6, 0.9) });
      PRESETS.dust(c);
    },
    /* 墨镜猫：一帧白闪 + 墨镜飞出 + 金色星光 + 暗色冲击环 */
    cool: function (c) {
      spawn({ x: c.cx, y: c.cy, shape: 'flash', color: '#ffffff', w: c.r * 2.1, h: c.r * 2.1, alpha: 0.5, life: 0.16, fade: 0.9 });
      spawn({ x: c.cx, y: c.cy - c.r * 0.25, vx: rnd(-70, 70), vy: -rnd(230, 320) * c.v, g: 820, shape: 'shades', color: '#2e2d28', w: c.r * 0.95, h: c.r * 0.3, rot: 0, vr: rnd(-4, 4), life: 0.95, fade: 0.3 });
      spawn({ x: c.cx, y: c.cy, shape: 'ring', color: '#343a40', size: c.r * 0.3, size2: c.r * 1.25, lw: 5, lw2: 1, life: 0.32, fade: 0.6, alpha: 0.6 });
      var i, n = count(6, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'text', text: '✦', color: pick(['#ffd43b', '#ffffff', '#ffe066']), size: c.r * rnd(0.18, 0.32), speed: rnd(110, 220) * c.v, g: 120, vr: rnd(-2, 2), life: rnd(0.4, 0.7), delay: 0.05 });
    },
    /* 奶茶猫：珍珠弹落 + 奶白溅点 + 往上冒的小气泡 */
    boba: function (c) {
      var i, n = count(9, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'circle', color: pick(['#3d2314', '#4a2c1a']), size: c.r * rnd(0.08, 0.12), speed: rnd(140, 260) * c.v, vy: -160, g: 900, life: rnd(0.6, 0.9) });
      n = count(5, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'splat', color: '#eadbc8', size: c.r * rnd(0.07, 0.13), speed: rnd(90, 170) * c.v, g: 450, vr: rnd(-3, 3), life: rnd(0.45, 0.7) });
      n = count(4, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.4, c.r * 0.4), y: c.cy, vy: -rnd(60, 120), shape: 'ring', color: '#9c6644', alpha: 0.55,
        size: c.r * 0.05, size2: c.r * 0.15, lw: 2, lw2: 1, sway: 5, freq: rnd(3, 5), life: rnd(0.6, 0.9), delay: rnd(0, 0.2), fade: 0.5
      });
    },
    /* 推车猫：向右滚走——左侧速度线 + 黄色音符 + 飘落的价签 */
    cart: function (c) {
      var i, n = count(3, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx - c.r * 0.6, y: c.cy + c.r * rnd(-0.45, 0.45), vx: -rnd(200, 360) * c.v,
        shape: 'rect', color: '#868e96', alpha: 0.55, w: c.r * rnd(0.3, 0.5), h: c.r * 0.04, life: 0.3, delay: rnd(0, 0.1), fade: 0.8
      });
      n = count(6, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.5, c.r * 0.5), y: c.cy - c.r * 0.3, vx: rnd(50, 140), vy: -rnd(120, 220) * c.v, g: -50,
        shape: 'text', text: pick(['♪', '♫']), color: pick(['#f59f00', '#ffd43b', '#2e2d28']), size: c.r * rnd(0.3, 0.45),
        rot: rnd(-0.3, 0.3), vr: rnd(-1.5, 1.5), sway: 8, freq: rnd(5, 7), life: rnd(0.8, 1.1), delay: rnd(0, 0.2), fade: 0.5
      });
      n = count(6, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'rect', color: pick(['#fff4e6', '#ffe8cc', '#f59f00']), w: c.r * 0.14, h: c.r * 0.09, speed: rnd(120, 240) * c.v, vy: -120, g: 600, drag: 0.985, vr: rnd(-8, 8), life: rnd(0.7, 1.0) });
    },
    /* 比心猫：一颗大心脉冲放大 + 小心心摇着上飘 + 粉色小点 */
    heart: function (c) {
      spawn({ x: c.cx, y: c.cy, shape: 'heart', color: '#e64980', size: c.r * 0.3, size2: c.r * 0.95, alpha: 0.5, life: 0.38, fade: 0.7 });
      var i, n = count(7, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.5, c.r * 0.5), y: c.cy, vx: rnd(-40, 40), vy: -rnd(140, 240) * c.v, g: -60,
        shape: 'heart', color: pick(['#e64980', '#f783ac', '#ff8787']), size: c.r * rnd(0.1, 0.2),
        rot: rnd(-0.3, 0.3), vr: rnd(-1.5, 1.5), sway: 10, freq: rnd(5, 7), life: rnd(0.8, 1.1), delay: rnd(0, 0.2), fade: 0.5
      });
      n = count(6, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'circle', color: '#faa2c1', size: c.r * rnd(0.05, 0.09), speed: rnd(120, 220) * c.v, g: 500, life: rnd(0.5, 0.7) });
    },
    /* 雨衣猫：雨滴从格子上方落下 + 底部水坑涟漪 + 水花 */
    rain: function (c) {
      var i, n = count(12, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.9, c.r * 0.9), y: c.cy - c.r * 1.1 + rnd(0, c.r * 0.4), vy: rnd(300, 450) * c.v, g: 600,
        shape: 'drop', color: pick(['#4dabf7', '#74c0fc']), size: c.r * rnd(0.05, 0.08), rot: 0, life: rnd(0.35, 0.55), delay: rnd(0, 0.25), fade: 0.3
      });
      n = count(3, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.5, c.r * 0.5), y: c.cy + c.r * 0.75, shape: 'ripple', color: '#1971c2', alpha: 0.7,
        size: c.r * 0.05, size2: c.r * 0.55, lw: 3, lw2: 1, life: 0.5, delay: rnd(0.1, 0.4), fade: 0.6
      });
      n = count(5, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.5, c.r * 0.5), y: c.cy + c.r * 0.7, vx: rnd(-120, 120), vy: -rnd(100, 200) * c.v, g: 900,
        shape: 'circle', color: '#74c0fc', size: c.r * 0.05, life: rnd(0.35, 0.5), delay: rnd(0.05, 0.3)
      });
    },
    /* ===== 套系 3「周末猫」 ===== */
    /* 汉堡猫：芝麻 + 生菜 + 番茄 + 芝士碎迸开，可乐气泡往上冒 */
    burger: function (c) {
      var i, n = count(6, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'circle', color: '#f8e9c2', size: c.r * rnd(0.04, 0.06), speed: rnd(150, 260) * c.v, vy: -120, g: 700, life: rnd(0.5, 0.75) });
      n = count(4, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'rect', color: pick(['#69db7c', '#51cf66']), w: c.r * 0.22, h: c.r * 0.08, speed: rnd(120, 220) * c.v, vy: -100, g: 550, drag: 0.98, vr: rnd(-6, 6), life: rnd(0.6, 0.85) });
      n = count(3, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'circle', color: '#e03131', size: c.r * rnd(0.08, 0.11), speed: rnd(130, 230) * c.v, vy: -120, g: 750, life: rnd(0.55, 0.8) });
      n = count(4, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'rect', color: '#ffd43b', w: c.r * 0.16, h: c.r * 0.16, speed: rnd(130, 240) * c.v, vy: -120, g: 700, vr: rnd(-8, 8), life: rnd(0.55, 0.8) });
      n = count(4, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + c.r * rnd(0.2, 0.6), y: c.cy + c.r * 0.2, vy: -rnd(70, 130), shape: 'ring', color: '#e03131', alpha: 0.5,
        size: c.r * 0.04, size2: c.r * 0.13, lw: 2, lw2: 1, sway: 4, freq: rnd(3, 5), life: rnd(0.6, 0.9), delay: rnd(0, 0.2), fade: 0.5
      });
    },
    /* 毯子猫：粉色毛绒团慢慢散开 + 一圈圈暖意波纹 */
    blanket: function (c) {
      var i, n = count(9, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'circle', color: pick(['#f783ac', '#ffc9de', '#faa2c1']), alpha: 0.6, size: c.r * rnd(0.07, 0.11), size2: c.r * rnd(0.14, 0.22), speed: rnd(120, 220) * c.v, vy: -60, g: 80, drag: 0.975, life: rnd(0.6, 0.9), fade: 0.7 });
      for (i = 0; i < 2; i++) spawn({ x: c.cx, y: c.cy, shape: 'ring', color: '#f783ac', size: c.r * 0.3, size2: c.r * (1.1 + i * 0.25), lw: 4, lw2: 1, life: 0.5, delay: i * 0.12, fade: 0.6, alpha: 0.6 });
    },
    /* 观影猫：红青双色错位闪 + 爆米花迸开 + 红白条纹桶碎片 */
    movie: function (c) {
      spawn({ x: c.cx - c.r * 0.12, y: c.cy, shape: 'flash', color: '#ff3b3b', w: c.r * 2.1, h: c.r * 2.1, alpha: 0.32, life: 0.2, fade: 0.9 });
      spawn({ x: c.cx + c.r * 0.12, y: c.cy, shape: 'flash', color: '#22d3ee', w: c.r * 2.1, h: c.r * 2.1, alpha: 0.32, life: 0.2, fade: 0.9 });
      var i, n = count(10, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'popcorn', color: pick(['#fff9db', '#fff3bf', '#ffffff']), color2: '#ffd43b', size: c.r * rnd(0.06, 0.1), speed: rnd(150, 290) * c.v, vy: -150, g: 800, vr: rnd(-6, 6), life: rnd(0.6, 0.9) });
      n = count(4, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'rect', color: pick(['#e03131', '#ffffff']), w: c.r * 0.07, h: c.r * 0.26, speed: rnd(110, 210) * c.v, vy: -100, g: 600, drag: 0.985, vr: rnd(-6, 6), life: rnd(0.6, 0.9) });
    },
    /* 自拍猫：点赞主题——大拇指弹出、+1 飘字、小红心像直播点赞一样往上冒，外加一记白闪 */
    selfie: function (c) {
      spawn({ x: c.cx, y: c.cy, shape: 'flash', color: '#ffffff', w: c.r * 2.1, h: c.r * 2.1, alpha: 0.6, life: 0.16, fade: 0.9 });
      var i, n = count(4, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'thumb', color: pick(['#7048e8', '#9775fa', '#ffd43b']), size: c.r * rnd(0.12, 0.18), speed: rnd(120, 220) * c.v, vy: -170, g: 650, rot: rnd(-0.3, 0.3), vr: rnd(-3, 3), life: rnd(0.7, 0.95) });
      n = count(3, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.4, c.r * 0.4), y: c.cy - c.r * 0.2, vx: rnd(-30, 30), vy: -rnd(130, 200) * c.v, g: -40,
        shape: 'text', text: '+1', color: pick(['#7048e8', '#e64980']), size: c.r * rnd(0.26, 0.36), sway: 5, freq: 4, life: rnd(0.7, 1.0), delay: i * 0.1, fade: 0.5
      });
      n = count(7, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.6, c.r * 0.6), y: c.cy + rnd(-c.r * 0.2, c.r * 0.4), vx: rnd(-30, 30), vy: -rnd(120, 230) * c.v, g: -50,
        shape: 'heart', color: pick(['#ff6b6b', '#f06595', '#ff8787']), size: c.r * rnd(0.07, 0.13),
        rot: rnd(-0.3, 0.3), vr: rnd(-1.5, 1.5), sway: 9, freq: rnd(5, 7), life: rnd(0.8, 1.1), delay: rnd(0, 0.25), fade: 0.5
      });
    },
    /* 泡澡猫：泡泡往上冒 + 水花溅起 + 一两个音符 */
    bath: function (c) {
      var i, n = count(8, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.7, c.r * 0.7), y: c.cy + rnd(-c.r * 0.2, c.r * 0.5), vy: -rnd(70, 150), shape: 'ring', color: pick(['#22b8cf', '#66d9e8', '#ffffff']), alpha: 0.8,
        size: c.r * rnd(0.05, 0.1), size2: c.r * rnd(0.14, 0.24), lw: 2, lw2: 1, sway: 6, freq: rnd(3, 5), life: rnd(0.7, 1.0), delay: rnd(0, 0.25), fade: 0.5
      });
      n = count(7, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.5, c.r * 0.5), y: c.cy + c.r * 0.3, vx: rnd(-160, 160) * c.v, vy: -rnd(180, 320) * c.v, g: 950,
        shape: 'drop', color: '#66d9e8', size: c.r * rnd(0.05, 0.08), life: rnd(0.45, 0.7)
      });
      n = count(2, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + c.r * rnd(0.2, 0.6), y: c.cy - c.r * 0.6, vx: rnd(10, 40), vy: -rnd(100, 160), g: -40,
        shape: 'text', text: pick(['♪', '♫']), color: '#2e2d28', size: c.r * rnd(0.3, 0.4), sway: 8, freq: 5, life: rnd(0.8, 1.0), delay: i * 0.15, fade: 0.5
      });
    },
    /* 购物猫：彩色购物袋 + 价签 + ¥ 符号飞出 */
    shop: function (c) {
      var i, n = count(4, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'bag', color: pick(['#f06595', '#fab005', '#4dabf7', '#69db7c']), color2: '#2e2d28', w: c.r * 0.26, h: c.r * 0.32, speed: rnd(130, 240) * c.v, vy: -170, g: 800, rot: rnd(-0.4, 0.4), vr: rnd(-4, 4), life: rnd(0.7, 0.95) });
      n = count(6, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'rect', color: pick(['#fff4e6', '#ffe8cc']), w: c.r * 0.14, h: c.r * 0.09, speed: rnd(120, 240) * c.v, vy: -120, g: 600, drag: 0.985, vr: rnd(-8, 8), life: rnd(0.7, 1.0) });
      n = count(4, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'text', text: '¥', color: pick(['#fab005', '#e8590c']), size: c.r * rnd(0.26, 0.38), speed: rnd(100, 200) * c.v, vy: -140, g: 500, vr: rnd(-2, 2), life: rnd(0.6, 0.9), delay: rnd(0, 0.1) });
    },
    /* 续杯猫：珍珠弹落 + 粉白吸管 + 奶白溅点 */
    refill: function (c) {
      var i, n = count(9, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'circle', color: pick(['#3d2314', '#4a2c1a']), size: c.r * rnd(0.08, 0.12), speed: rnd(140, 260) * c.v, vy: -160, g: 900, life: rnd(0.6, 0.9) });
      n = count(3, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'rect', color: pick(['#f783ac', '#ffffff']), w: c.r * 0.07, h: c.r * 0.5, speed: rnd(100, 200) * c.v, vy: -160, g: 700, drag: 0.985, vr: rnd(-5, 5), life: rnd(0.65, 0.9) });
      n = count(5, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'splat', color: '#eadbc8', size: c.r * rnd(0.07, 0.13), speed: rnd(90, 170) * c.v, g: 450, vr: rnd(-3, 3), life: rnd(0.45, 0.7) });
    },
    /* 读书猫：书页飘落 + 蓝色字母散开 */
    book: function (c) {
      var i, n = count(7, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + rnd(-c.r * 0.5, c.r * 0.5), y: c.cy + rnd(-c.r * 0.4, c.r * 0.2), vx: rnd(-90, 90) * c.v, vy: -rnd(120, 240) * c.v, g: 380, drag: 0.975,
        shape: 'rect', color: pick(['#fffaf0', '#fff4e0', '#ffffff']), w: c.r * rnd(0.2, 0.3), h: c.r * rnd(0.26, 0.38), rot: rnd(-0.5, 0.5), vr: rnd(-5, 5), sway: 10, freq: rnd(4, 6), life: rnd(0.8, 1.1)
      });
      var glyphs = ['a', 'b', 'e', 'n', 'o', 'r', 's', '?', '!'];
      n = count(8, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'text', text: pick(glyphs), color: pick(['#1971c2', '#1c7ed6', '#2e2d28']), size: c.r * rnd(0.2, 0.3), speed: rnd(110, 210) * c.v, vy: -100, g: 350, vr: rnd(-3, 3), life: rnd(0.6, 0.9), delay: rnd(0, 0.15) });
    },
    /* 开车猫：小红车向左冲出 + 身后（右侧）尾气团与速度线 + 车灯黄闪 */
    drive: function (c) {
      spawn({ x: c.cx - c.r * 0.5, y: c.cy + c.r * 0.1, shape: 'flash', color: '#ffe066', w: c.r * 0.7, h: c.r * 0.5, alpha: 0.6, life: 0.18, fade: 0.9 });
      spawn({ x: c.cx, y: c.cy + c.r * 0.2, vx: -rnd(380, 520) * c.v, vy: -rnd(20, 60), g: 250, shape: 'car', color: '#f03e3e', color2: '#2e2d28', w: c.r * 0.7, h: c.r * 0.4, rot: 0.08, life: 0.7, fade: 0.4 });
      var i, n = count(6, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + c.r * rnd(0.2, 0.6), y: c.cy + c.r * rnd(0.2, 0.5), vx: rnd(40, 110), vy: -rnd(20, 60), shape: 'circle', color: '#dee2e6', alpha: 0.75,
        size: c.r * 0.08, size2: c.r * 0.3, life: rnd(0.6, 0.9), delay: rnd(0, 0.15), fade: 0.7
      });
      n = count(3, c);
      for (i = 0; i < n; i++) spawn({
        x: c.cx + c.r * 0.7, y: c.cy + c.r * rnd(-0.3, 0.4), vx: rnd(200, 360) * c.v,
        shape: 'rect', color: '#868e96', alpha: 0.55, w: c.r * rnd(0.3, 0.5), h: c.r * 0.04, life: 0.3, delay: rnd(0, 0.1), fade: 0.8
      });
    },
    /* 派对猫：彩纸屑 + 飘带 */
    party: function (c) {
      var cols = ['#ff6b6b', '#ffd43b', '#4dabf7', '#69db7c', '#da77f2', '#ffa94d', '#f783ac'];
      var i, n = count(22, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'rect', color: pick(cols), w: c.r * 0.15, h: c.r * 0.09, speed: rnd(200, 380) * c.v, vy: -140, g: 700, drag: 0.985, vr: rnd(-14, 14), life: rnd(0.9, 1.2) });
      n = count(5, c);
      for (i = 0; i < n; i++) radial(c, { shape: 'rect', color: pick(cols), w: c.r * 0.05, h: c.r * 0.5, speed: rnd(120, 240) * c.v, vy: -200, g: 500, drag: 0.98, vr: rnd(-3, 3), sway: 10, freq: 7, life: rnd(0.9, 1.3) });
    }
  };

  /* ---------- 对外 ---------- */
  function centerOf(el) {
    var a = el.getBoundingClientRect(), b = canvas.getBoundingClientRect();
    return { cx: a.left - b.left + a.width / 2, cy: a.top - b.top + a.height / 2, r: Math.min(a.width, a.height) / 2, rw: a.width / 2 };
  }

  /* 在某个格子上播放款式特效。fxId 预设名；k 强度（对子 1，连线约 2.2，大满贯约 1.5）；color 供默认预设使用 */
  function burst(fxId, el, k, color) {
    if (!canvas) return;
    ensureSize();
    var c = centerOf(el);
    c.k = k || 1;
    c.v = 1 + (c.k - 1) * 0.25;
    c.color = color || '#e8590c';
    (PRESETS[fxId] || PRESETS.pop)(c);
  }

  /* 全盘庆祝（清空 / 大满贯）：从棋盘中心撒彩纸 */
  function celebrate(el, k) {
    if (!canvas) return;
    ensureSize();
    var c = centerOf(el);
    c.r = Math.min(c.r, 80);
    c.k = k || 2;
    c.v = 1.4;
    c.color = '#e8590c';
    PRESETS.party(c);
    PRESETS.pop(c);
  }

  /* 把画布挂到另一个宿主（如结算弹层）；再挂回棋盘即可恢复 */
  function attach(hostEl) {
    if (!canvas) { init(hostEl); return; }
    if (canvas.parentNode !== hostEl) { hostEl.appendChild(canvas); resize(); }
  }

  /* 在画布坐标 (cx, cy) 处播放预设，r 为等效半格边长；供结算页环境特效随机撒点 */
  function burstAt(fxId, cx, cy, r, k, color) {
    if (!canvas) return;
    ensureSize();
    var c = { cx: cx, cy: cy, r: r || 40, rw: r || 40, k: k || 1, v: 1, color: color || '#e8590c' };
    (PRESETS[fxId] || PRESETS.pop)(c);
  }

  /* 画布相对坐标系里的宿主尺寸 */
  function size() { if (!canvas) return { w: 0, h: 0 }; ensureSize(); return { w: W, h: H }; }

  /* 全局倍速倍率：由 app.js 的 Speed 模块设置 */
  var rate = 1;
  function setRate(r) { rate = r; }

  root.TurtleFX = { init: init, attach: attach, burst: burst, burstAt: burstAt, size: size, celebrate: celebrate, setRate: setRate, PRESETS: PRESETS };
})(window);
