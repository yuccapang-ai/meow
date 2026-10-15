/* 房间住户：每只猫独立位置、步态、睡觉和专属动作；只创建已解锁住户。 */
(function (root) {
  'use strict';
  function create(options) {
    var world = options.world, viewport = options.viewport, footer = options.footer;
    var collection = root.TurtleCatCollection.get(), residents = [], active = false;
    var selected = 'donut', raf = 0, lastTime = 0, width = 0, height = 0, size = 0;
    var bounds = { left: 0, right: 1, back: 0.6, front: 0.8 };
    var reduced = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
    function find(id) { return residents.filter(function (r) { return r.cat.id === id; })[0]; }
    function updateStatus(r) {
      if (r.cat.id !== selected) return;
      options.status.textContent = r.cat.name + ' · ' + (r.failed ? '点击猫咪重试动作' : r.player.label());
    }
    function paint(r) {
      if (!r.placed) return;
      var depth = (r.y - bounds.back) / Math.max(0.01, bounds.front - bounds.back);
      r.el.style.transform = 'translate3d(' + (r.x * width - size / 2).toFixed(2) + 'px,' +
        (r.y * height - size * 232 / 256).toFixed(2) + 'px,0) scale(' + (0.88 + depth * 0.12).toFixed(3) + ')';
      r.el.style.zIndex = String(1 + Math.round(r.y * 100));
      if (r.ready && r.frame !== r.player.frame()) {
        r.frame = r.player.frame();
        r.sprite.style.backgroundPosition = ((r.frame % 4) * 100 / 3) + '% ' + (Math.floor(r.frame / 4) * 100 / 3) + '%';
        r.sprite.setAttribute('data-frame', String(r.frame));
      }
    }
    function play(r, name) {
      if (name === 'special' && !collection.progress(r.cat.id).special) name = 'sleep';
      r.player.play(name);
      r.el.setAttribute('data-state', name);
      r.el.setAttribute('aria-label', (name === 'sleep' ? '叫醒' : '摸摸') + r.cat.name);
      updateStatus(r); paint(r);
    }
    function destination(r) {
      var direction = Math.random() < 0.4 ? -r.direction : r.direction;
      var distance = viewport.clientWidth * (0.22 + Math.random() * 0.3) / width;
      if (r.x + direction * distance < bounds.left || r.x + direction * distance > bounds.right) direction *= -1;
      r.goalX = clamp(r.x + direction * distance, bounds.left, bounds.right);
      r.goalY = bounds.back + Math.random() * (bounds.front - bounds.back);
      r.direction = r.goalX >= r.x ? 1 : -1;
      r.facing.style.transform = 'scaleX(' + r.direction + ')';
      play(r, 'walk');
    }
    function rest(r) {
      r.rests++;
      play(r, collection.progress(r.cat.id).special && r.rests % 2 === 1 ? 'special' : 'sleep');
    }
    function load(r) {
      if (r.ready || r.loading) return;
      r.loading = true; r.failed = false;
      r.image.onload = function () {
        r.loading = false; r.ready = true; r.sprite.hidden = false; r.fallback.hidden = true;
        paint(r); updateStatus(r); start();
      };
      r.image.onerror = function () { r.loading = false; r.failed = true; updateStatus(r); };
      r.image.src = r.cat.atlas;
    }
    function add(cat) {
      var el = document.createElement('button');
      el.className = 'room-cat'; el.type = 'button'; el.hidden = true;
      el.setAttribute('data-cat-id', cat.id); el.setAttribute('data-state', 'idle');
      el.setAttribute('aria-label', '摸摸' + cat.name); el.title = '点击互动，睡着时可以叫醒';
      var shadow = document.createElement('span'); shadow.className = 'room-cat__shadow'; shadow.setAttribute('aria-hidden', 'true');
      var facing = document.createElement('span'); facing.className = 'room-cat__facing';
      var sprite = document.createElement('span'); sprite.className = 'room-cat__body'; sprite.hidden = true;
      sprite.setAttribute('role', 'img'); sprite.setAttribute('aria-label', cat.name);
      sprite.style.backgroundImage = 'url("' + cat.atlas + '")';
      var fallback = document.createElement('img'); fallback.className = 'room-cat__fallback'; fallback.src = cat.portrait;
      fallback.alt = ''; fallback.draggable = false;
      facing.appendChild(sprite); facing.appendChild(fallback); el.appendChild(shadow); el.appendChild(facing); world.appendChild(el);
      var r = { cat: cat, el: el, facing: facing, sprite: sprite, fallback: fallback, image: new Image(),
        player: root.TurtleCatActions.create({ profile: 'collection', specialLabel: cat.special }),
        x: 0, y: 0.65, goalX: 0, goalY: 0.65, direction: 1, rests: 0,
        placed: false, ready: false, loading: false, failed: false, frame: -1 };
      el.addEventListener('click', function () {
        selected = cat.id;
        if (root.TurtleSound) root.TurtleSound.play('tap');
        if (!r.ready) { load(r); updateStatus(r); return; }
        if (reduced && reduced.matches) { updateStatus(r); return; }
        if (r.player.action() === 'sleep') play(r, 'wake'); else rest(r);
      });
      residents.push(r); load(r);
    }
    function sync() {
      collection.list().forEach(function (p) { if (p.home && !find(p.cat.id)) add(p.cat); });
      options.findButton.disabled = residents.length === 0;
    }
    function layout(worldWidth, worldHeight, sceneScale, worldTop) {
      width = worldWidth; height = worldHeight || viewport.clientHeight;
      if (!width || !height) return;
      size = clamp(viewport.clientHeight * 0.175, 82, 152) * (sceneScale || 1);
      bounds.left = (size * 0.6 + 12) / width; bounds.right = 1 - bounds.left;
      bounds.front = clamp((viewport.clientHeight - (worldTop || 0) - footer.offsetHeight - 14) / height, 0.57, 0.84);
      bounds.back = Math.min(0.61, bounds.front - 0.06);
      residents.forEach(function (r, i) {
        r.el.style.width = size + 'px'; r.el.style.height = size + 'px';
        if (!r.placed) {
          r.x = i === 0 ? (viewport.scrollLeft + viewport.clientWidth * 0.45) / width : 0.12 + ((i - 1) % 4) * 0.22 + Math.floor((i - 1) / 4) * 0.06;
          r.y = bounds.back + (bounds.front - bounds.back) * (0.25 + (i % 3) * 0.25);
          r.goalX = r.x; r.goalY = r.y; r.placed = true;
        }
        r.x = clamp(r.x, bounds.left, bounds.right); r.y = clamp(r.y, bounds.back, bounds.front);
        r.goalX = clamp(r.goalX, bounds.left, bounds.right); r.goalY = clamp(r.goalY, bounds.back, bounds.front);
        paint(r);
      });
    }
    function tick(now) {
      raf = 0;
      if (!active || document.hidden) { lastTime = 0; return; }
      var dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0; lastTime = now;
      residents.forEach(function (r) {
        if (!r.ready || !r.placed) return;
        if (r.player.action() === 'walk') {
          var dx = (r.goalX - r.x) * width, dy = (r.goalY - r.y) * height;
          var distance = Math.sqrt(dx * dx + dy * dy), step = height * 0.065 * dt;
          r.player.update(dt, Math.min(distance, step) / size);
          if (distance <= Math.max(0.5, step)) { r.x = r.goalX; r.y = r.goalY; rest(r); }
          else { r.x += dx / distance * step / width; r.y += dy / distance * step / height; }
        } else {
          r.player.update(dt, 0);
          if (r.player.finished()) {
            if (r.player.action() === 'sleep') play(r, 'wake'); else destination(r);
          }
        }
        paint(r);
      });
      raf = requestAnimationFrame(tick);
    }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; lastTime = 0; }
    function start() {
      if (!active || document.hidden || !width || !options.background.complete || !options.background.naturalWidth) return;
      residents.forEach(function (r) { r.el.hidden = false; });
      if (reduced && reduced.matches) { residents.forEach(function (r) { play(r, 'idle'); }); return; }
      if (!raf && residents.some(function (r) { return r.ready; })) raf = requestAnimationFrame(tick);
    }
    function focus(id) {
      var r = find(id); if (!r) return false;
      selected = id; updateStatus(r); options.moveTo(r.x * width - viewport.clientWidth / 2); return true;
    }
    function perform(id, action) {
      var r = find(id), p = collection.progress(id);
      if (!r || !p.home || ['walk', 'sleep', 'special'].indexOf(action) < 0 || (action === 'special' && !p.special)) return false;
      focus(id);
      if (reduced && reduced.matches) return true;
      if (action === 'walk') destination(r); else play(r, action);
      start(); return true;
    }
    options.findButton.addEventListener('click', function () {
      if (!residents.length) return;
      var index = residents.indexOf(find(selected));
      focus(residents[(index + 1) % residents.length].cat.id);
      if (root.TurtleSound) root.TurtleSound.play('tap');
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
    if (reduced) reduced.addListener(function () { stop(); start(); });
    return {
      layout: layout, start: start, focus: focus, perform: perform,
      enter: function () { active = true; sync(); },
      leave: function () { active = false; stop(); },
      contains: function (target) { return residents.some(function (r) { return r.el.contains(target); }); }
    };
  }
  root.TurtleRoomResidents = { create: create };
})(window);
