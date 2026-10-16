(() => {
  'use strict';
  const canvas = document.getElementById('cat');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const hint = document.getElementById('hint');
  const desktop = window.donutDesktop;
  let player;
  let atlas;
  let cat;
  let loadToken = 0;
  let running = false;
  const size = 200;
  let position = 80;
  let direction = 1;
  let remaining = 6;
  let sleeping = false;
  let previousTime = 0;
  let pointer = { x: -1, y: -1 };
  let press = null;
  let lastHit = null;
  let hintTimer;

  function say(message, duration = 2200) {
    clearTimeout(hintTimer);
    hint.textContent = message;
    hint.classList.remove('is-hidden');
    hintTimer = setTimeout(() => hint.classList.add('is-hidden'), duration);
  }

  function play(action) {
    if (!player) return;
    if (!['idle', 'walk', 'sleep', 'special', 'wake'].includes(action)) return;
    sleeping = action === 'sleep';
    player.play(action === 'special' && cat.profile === 'classic' ? 'groom' : action);
    remaining = action === 'walk' ? 4 + Math.random() * 3 : 4 + Math.random() * 4;
    canvas.dataset.action = action;
  }

  function hitTest(point) {
    const inside = point.x >= 0 && point.y >= 0 && point.x < canvas.width && point.y < canvas.height;
    return inside && context.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data[3] > 24;
  }

  function updateHit() {
    const hit = !!press || hitTest(pointer);
    if (hit !== lastHit) { lastHit = hit; desktop.hit(hit); }
  }

  function draw() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(position + (direction < 0 ? size : 0), 40);
    context.scale(direction, 1);
    const frame = player.frame();
    context.drawImage(atlas, frame % cat.columns * cat.cell, Math.floor(frame / cat.columns) * cat.cell, cat.cell, cat.cell, 0, 0, size, size);
    context.restore();
    canvas.dataset.frame = String(frame);
    updateHit();
  }

  function tick(now) {
    const elapsed = previousTime ? Math.min((now - previousTime) / 1000, 0.1) : 0;
    previousTime = now;
    if (!press) {
      remaining -= elapsed;
      let distance = 0;
      if (player.action() === 'walk') {
        const next = Math.max(12, Math.min(148, position + direction * elapsed * 26));
        distance = Math.abs(next - position);
        position = next;
        if (position <= 12 || position >= 148) direction *= -1;
      }
      player.update(elapsed, distance / size);
      if (player.finished()) {
        if (sleeping) player.play('sleep');
        else if (player.action() !== 'idle') play('idle');
      }
      if (!sleeping && remaining <= 0 && ['walk', 'idle'].includes(player.action())) {
        play(player.action() === 'walk' ? 'idle' : 'walk');
      }
    }
    draw();
    requestAnimationFrame(tick);
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !hitTest({ x: event.offsetX, y: event.offsetY })) return;
    press = { x: event.screenX, y: event.screenY, moved: false };
    canvas.setPointerCapture(event.pointerId);
    desktop.startDrag();
  });
  canvas.addEventListener('pointermove', event => {
    if (press && Math.hypot(event.screenX - press.x, event.screenY - press.y) > 5) press.moved = true;
  });
  canvas.addEventListener('pointerup', event => {
    if (!press) return;
    const moved = press.moved || Math.hypot(event.screenX - press.x, event.screenY - press.y) > 5;
    press = null;
    desktop.endDrag();
    if (!moved) { play(sleeping ? 'wake' : 'special'); say('喵～陪你一起摸鱼！'); }
  });
  canvas.addEventListener('lostpointercapture', () => { press = null; desktop.endDrag(); });
  canvas.addEventListener('contextmenu', event => { event.preventDefault(); desktop.menu(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') desktop.returnHome();
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); play('special'); }
  });
  desktop.onPointer(point => { pointer = point; updateHit(); });
  desktop.onDragEnded(() => { press = null; lastHit = null; });
  desktop.onAction(action => { play(action); say(action === 'sleep' ? '呼噜噜…点击可以叫醒我' : action === 'walk' ? '起来活动一下～' : cat.special + '时间！'); });
  desktop.onCat(payload => {
    const token = payload.token;
    loadToken = token;
    const next = new Image();
    next.onload = () => {
      if (loadToken !== token) return;
      cat = payload.cat;
      atlas = next;
      player = window.TurtleCatActions.create({ profile: cat.profile, specialLabel: cat.special });
      previousTime = 0;
      press = null;
      canvas.dataset.ready = 'true';
      canvas.dataset.catId = cat.id;
      canvas.dataset.rows = String(cat.rows);
      canvas.setAttribute('aria-label', cat.name + '：点击互动，拖动移动，右键打开菜单');
      document.title = cat.name + ' · 桌宠';
      play('special');
      draw();
      say(cat.name + '来陪你啦 · 拖动搬家 · 右键菜单', 5000);
      if (!running) { running = true; requestAnimationFrame(tick); }
      desktop.catReady(token, true);
    };
    next.onerror = () => { if (loadToken === token) desktop.catReady(token, false); };
    next.src = payload.cat.atlas;
  });
})();
