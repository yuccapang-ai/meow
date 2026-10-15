/* 猫咪房间：原生触摸滚动、桌面拖动、分区定位与猫咪漫步。
 * Chrome 61 / ES2017。区域边界按长场景中的四根墙柱标注，后续可用于解锁遮罩。 */
(function (root) {
  'use strict';
  var viewport = document.getElementById('room-viewport');
  var world = document.getElementById('room-world');
  var background = document.getElementById('room-background');
  var loading = document.getElementById('room-loading');
  var loadingText = document.getElementById('room-loading-text');
  var retry = document.getElementById('btn-room-retry');
  var counter = document.getElementById('room-counter');
  var buttons = document.querySelectorAll('[data-room-zone]');
  var edges = [0, 0.233, 0.406, 0.594, 0.766, 1];
  var ROOM_WIDTH_SCALE = 0.5;
  var active = false, current = 0, position = 0, worldWidth = 0;
  var frame = 0, motion = 0, dragging = null;
  var storage = null;
  try { storage = root.localStorage; } catch (error) {}
  var travel = root.TurtleCatTravel.create({ storage: storage, collection: root.TurtleCatCollection.get() });
  var catnip = document.getElementById('room-catnip');
  function renderCatnip() { if (catnip) catnip.textContent = travel.catnip(); }
  travel.tick();
  renderCatnip();
  var residents = root.TurtleRoomResidents.create({
    world: world, viewport: viewport, background: background,
    footer: document.querySelector('.room__footer'),
    status: document.getElementById('room-cat-status'),
    findButton: document.getElementById('btn-room-find-cat'), moveTo: moveTo, travel: travel
  });
  var arrange = root.TurtleRoomArrange.create({ world: world, viewport: viewport, residents: residents, travel: travel });
  function refreshLife() { travel.tick(); renderCatnip(); residents.refresh(); if (life) life.render(); arrange.refresh(); }
  var life = root.TurtleRoomLife.create({ travel: travel, residents: residents, refresh: refreshLife, beforeOpen: arrange.close });
  root.setInterval(refreshLife, 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshLife(); });

  function maxScroll() { return Math.max(0, worldWidth - viewport.clientWidth); }
  function clamp(value) { return Math.max(0, Math.min(maxScroll(), value)); }
  function stopMotion() { if (motion) cancelAnimationFrame(motion); motion = 0; }
  function renderPosition() {
    if (!active || !worldWidth) return;
    var center = (viewport.scrollLeft + viewport.clientWidth / 2) / worldWidth;
    current = 0;
    while (current < buttons.length - 1 && center >= edges[current + 1]) current++;
    position = maxScroll() ? viewport.scrollLeft / maxScroll() : 0;
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('is-active', i === current);
      buttons[i].setAttribute('aria-pressed', i === current ? 'true' : 'false');
    }
    counter.textContent = '0' + (current + 1) + ' / 05';
    counter.setAttribute('aria-label', '第 ' + (current + 1) + ' 区，共 5 区');
  }
  function layout() {
    if (!active) return;
    stopMotion();
    var ratio = background.naturalWidth && background.naturalHeight ? background.naturalWidth / background.naturalHeight : 2103 / 748;
    // 高度铺满视口，只将房间横向长度减半；猫咪保持原尺寸。
    var worldHeight = viewport.clientHeight;
    worldWidth = Math.max(viewport.clientWidth, worldHeight * ratio * ROOM_WIDTH_SCALE);
    world.style.width = worldWidth + 'px';
    world.style.height = worldHeight + 'px';
    world.style.top = '0px';
    viewport.scrollLeft = position * maxScroll();
    renderPosition();
    residents.layout(worldWidth, worldHeight, 1, 0);
  }

  function moveTo(target) {
    stopMotion();
    target = clamp(target);
    var from = viewport.scrollLeft, start = 0;
    if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      viewport.scrollLeft = target;
      renderPosition();
      return;
    }
    function tick(now) {
      if (!active) return;
      if (!start) start = now;
      var progress = Math.min(1, (now - start) / 300);
      viewport.scrollLeft = from + (target - from) * (1 - Math.pow(1 - progress, 3));
      renderPosition();
      if (progress < 1) motion = requestAnimationFrame(tick); else motion = 0;
    }
    motion = requestAnimationFrame(tick);
  }
  function goToZone(index) {
    index = Math.max(0, Math.min(buttons.length - 1, index));
    moveTo((edges[index] + edges[index + 1]) / 2 * worldWidth - viewport.clientWidth / 2);
  }
  function loadImage() {
    loading.hidden = false;
    loadingText.textContent = '正在打开房间…';
    retry.hidden = true;
    background.src = background.getAttribute('data-src');
  }
  background.addEventListener('load', function () { loading.hidden = true; layout(); residents.start(); });
  background.addEventListener('error', function () {
    loading.hidden = false;
    loadingText.textContent = '房间暂时没打开，再试一次吧';
    retry.hidden = false;
  });
  retry.addEventListener('click', loadImage);
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function () {
      if (root.TurtleSound) root.TurtleSound.play('tap');
      goToZone(Number(this.getAttribute('data-room-zone')));
    });
  }
  viewport.addEventListener('scroll', function () {
    if (!active || frame) return;
    frame = requestAnimationFrame(function () { frame = 0; renderPosition(); });
  });
  // 触摸交给浏览器惯性滚动；只为鼠标实现按住拖动。
  viewport.addEventListener('pointerdown', function (event) {
    stopMotion();
    if (residents.contains(event.target)) return;
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    dragging = { id: event.pointerId, x: event.clientX, left: viewport.scrollLeft };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('is-dragging');
    event.preventDefault();
    viewport.focus();
  });
  viewport.addEventListener('pointermove', function (event) {
    if (!dragging || dragging.id !== event.pointerId) return;
    viewport.scrollLeft = clamp(dragging.left + dragging.x - event.clientX);
  });
  function endDrag() {
    if (dragging && viewport.hasPointerCapture(dragging.id)) viewport.releasePointerCapture(dragging.id);
    dragging = null;
    viewport.classList.remove('is-dragging');
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('lostpointercapture', endDrag);
  viewport.addEventListener('touchstart', stopMotion, { passive: true });
  viewport.addEventListener('wheel', function (event) {
    if (event.ctrlKey) return;
    stopMotion();
    var delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (event.deltaMode === 1) delta *= 16;
    if (event.deltaMode === 2) delta *= viewport.clientWidth;
    viewport.scrollLeft = clamp(viewport.scrollLeft + delta);
    event.preventDefault();
  }, { passive: false });
  viewport.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') goToZone(current - 1);
    else if (event.key === 'ArrowRight') goToZone(current + 1);
    else if (event.key === 'Home') moveTo(0);
    else if (event.key === 'End') moveTo(maxScroll());
    else return;
    event.preventDefault();
  });
  root.addEventListener('resize', layout);
  root.TurtleRoom = {
    focus: residents.focus,
    perform: residents.perform,
    isAway: travel.isAway,
    enter: function () {
      active = true;
      travel.tick();
      renderCatnip();
      residents.enter();
      layout();
      if (!background.getAttribute('src')) loadImage();
      else if (background.complete && background.naturalWidth) loading.hidden = true;
      residents.start();
      life.render();
      arrange.refresh();
    },
    leave: function () {
      if (active) renderPosition();
      active = false;
      arrange.close();
      life.close();
      residents.leave();
      stopMotion();
      endDrag();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }
  };
})(window);
