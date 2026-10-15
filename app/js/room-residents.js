/* 房间住户：每只猫独立位置、步态、睡觉和专属动作；只创建已解锁住户。 */
(function (root) {
  'use strict';
  function create(options) {
    var world = options.world, viewport = options.viewport, footer = options.footer;
    var collection = root.TurtleCatCollection.get(), residents = [], active = false;
    var selected = 'donut', raf = 0, lastTime = 0, width = 0, height = 0, size = 0;
    var clearanceX = 0, clearanceY = 0, layoutKey = '';
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
      r.wait = 0;
      r.player.play(name);
      r.el.setAttribute('data-state', name);
      r.el.setAttribute('aria-label', (name === 'sleep' ? '叫醒' : '摸摸') + r.cat.name);
      updateStatus(r); paint(r);
    }
    // 检查整段路线与其他猫的可见身体包围盒，避免低帧率时一步穿过。
    // 留白按全部动作的最大轮廓预留，睡觉或切换专属动作也不会挤到邻居。
    function pathClear(r, x, y) {
      return residents.every(function (other) {
        if (other === r || !other.placed) return true;
        var offsets = [(r.x - other.x) * width, (r.y - other.y) * height];
        var deltas = [(x - r.x) * width, (y - r.y) * height];
        var gaps = [clearanceX - 0.01, clearanceY - 0.01];
        var enter = 0, leave = 1;
        for (var axis = 0; axis < 2; axis++) {
          if (Math.abs(deltas[axis]) < 0.000001) {
            if (Math.abs(offsets[axis]) >= gaps[axis]) return true;
          } else {
            var first = (-gaps[axis] - offsets[axis]) / deltas[axis];
            var last = (gaps[axis] - offsets[axis]) / deltas[axis];
            enter = Math.max(enter, Math.min(first, last));
            leave = Math.min(leave, Math.max(first, last));
            if (enter > leave) return true;
          }
        }
        return false;
      });
    }
    function waitForSpace(r) {
      play(r, 'idle');
      r.wait = 0.5 + Math.random() * 0.8;
    }
    function destination(r) {
      for (var attempt = 0; attempt < 24; attempt++) {
        var direction = Math.random() < 0.4 ? -r.direction : r.direction;
        var distance = viewport.clientWidth * (0.18 + Math.random() * 0.35) / width;
        if (r.x + direction * distance < bounds.left || r.x + direction * distance > bounds.right) direction *= -1;
        // 横向受阻时也尝试向前后让路；只选择当前没有猫挡住的路线。
        var x = attempt >= 16 ? r.x : clamp(r.x + direction * distance, bounds.left, bounds.right);
        var y = bounds.back + Math.random() * (bounds.front - bounds.back);
        if (Math.abs(x - r.x) * width + Math.abs(y - r.y) * height < 8 || !pathClear(r, x, y)) continue;
        r.goalX = x; r.goalY = y;
        if (Math.abs(x - r.x) > 0.001) r.direction = x > r.x ? 1 : -1;
        r.facing.style.transform = 'scaleX(' + r.direction + ')';
        play(r, 'walk');
        return;
      }
      waitForSpace(r);
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
        x: 0, y: 0.65, goalX: 0, goalY: 0.65, direction: 1, rests: 0, wait: 0,
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
      var key = [width, height, sceneScale || 1, worldTop || 0, viewport.clientHeight, footer.offsetHeight, residents.length].join(':');
      if (key === layoutKey) return;
      layoutKey = key;
      size = clamp(viewport.clientHeight * 0.175, 82, 152) * (sceneScale || 1);
      bounds.front = clamp((viewport.clientHeight - (worldTop || 0) - footer.offsetHeight - 14) / height, 0.57, 0.84);
      var columns, rows;
      // 入住和窗口缩放时先预留不相交的落点。猫多时利用前后两排地板；
      // 极小窗口放不下时才适当缩小角色，房间仍保持既定尺寸。
      do {
        clearanceX = size + 6; clearanceY = size * 0.9 + 6;
        bounds.left = (size * 0.6 + 12) / width; bounds.right = 1 - bounds.left;
        columns = Math.max(1, Math.floor((bounds.right - bounds.left) * width / (clearanceX + 2)) + 1);
        rows = Math.max(1, Math.ceil(residents.length / columns));
        bounds.back = Math.min(0.61, bounds.front - Math.max(height * 0.06, (rows - 1) * (clearanceY + 2) + (rows > 1 ? height * 0.02 : 0)) / height);
        if (bounds.back >= 0.44 && bounds.left < bounds.right) break;
        size *= 0.9;
      } while (size > 8);
      var slots = [];
      for (var row = 0; row < rows; row++) {
        for (var column = 0; column < columns; column++) {
          slots.push({ x: columns === 1 ? 0.5 : bounds.left + column * (bounds.right - bounds.left) / (columns - 1),
            y: rows === 1 ? (bounds.back + bounds.front) / 2 : bounds.back + row * (bounds.front - bounds.back) / (rows - 1) });
        }
      }
      residents.forEach(function (r, i) {
        r.el.style.width = size + 'px'; r.el.style.height = size + 'px';
        var preferredX = r.placed ? r.x : (i === 0 ? (viewport.scrollLeft + viewport.clientWidth * 0.45) / width : 0.12 + ((i - 1) % 4) * 0.22);
        var preferredY = r.placed ? r.y : (bounds.back + bounds.front) / 2;
        var best = 0, bestDistance = Infinity;
        for (var j = 0; j < slots.length; j++) {
          var dx = (slots[j].x - preferredX) * width, dy = (slots[j].y - preferredY) * height;
          if (dx * dx + dy * dy < bestDistance) { best = j; bestDistance = dx * dx + dy * dy; }
        }
        var slot = slots.splice(best, 1)[0];
        r.x = slot.x; r.y = slot.y; r.goalX = r.x; r.goalY = r.y; r.placed = true;
        if (r.player.action() === 'walk') waitForSpace(r);
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
          var moved = Math.min(distance, step);
          var nextX = distance ? r.x + dx / distance * moved / width : r.x;
          var nextY = distance ? r.y + dy / distance * moved / height : r.y;
          // 逐猫提交安全位置，后来移动的猫也能看到本帧的新位置。
          if (!pathClear(r, nextX, nextY)) waitForSpace(r);
          else {
            r.x = nextX; r.y = nextY;
            r.player.update(dt, moved / size);
            if (distance <= step) rest(r);
          }
        } else if (r.wait > 0) {
          r.wait = Math.max(0, r.wait - dt);
          if (!r.wait) destination(r);
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
