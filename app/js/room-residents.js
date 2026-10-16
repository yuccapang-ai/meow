/* 房间住户：每只猫独立位置、步态、睡觉和专属动作；只创建已解锁住户。 */
(function (root) {
  'use strict';
  function create(options) {
    var world = options.world, viewport = options.viewport, footer = options.footer;
    var collection = root.TurtleCatCollection.get(), residents = [], active = false;
    var selected = 'cool', raf = 0, lastTime = 0, width = 0, height = 0, size = 0;
    var clearanceX = 0, clearanceY = 0, layoutKey = '';
    var travel = options.travel, arranging = false;
    var furniture = root.TurtleRoomFurniture ? root.TurtleRoomFurniture.create(world, { save: function (id, position) { return travel && travel.placeFurniture(id, position); } }) : null;
    var bounds = { left: 0, right: 1, back: 0.6, front: 0.8 };
    var reduced = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
    function find(id) { return residents.filter(function (r) { return r.cat.id === id; })[0]; }
    function away(resident) { return travel && travel.isAway(resident.cat.id); }
    function activity(resident) {
      if (away(resident)) return '旅游中';
      if (travel && travel.isSleeping(resident.cat.id)) return '睡觉中';
      if (resident.jump) return resident.jump.down ? '跳下猫爬架' : '跳上猫爬架';
      if (resident.tree) return '猫爬架上打盹';
      return resident.player.action() === 'sleep' ? '睡觉中' : resident.player.label();
    }
    function updateStatus(r) {
      if (r.cat.id !== selected) return;
      options.status.textContent = r.cat.name + ' · ' + (away(r) ? '旅游中 · 可在猫咪状态召回' : r.failed ? '点击猫咪重试动作' : activity(r));
    }
    function paint(r) {
      if (!r.placed) return;
      var depth = (r.y - bounds.back) / Math.max(0.01, bounds.front - bounds.back);
      r.el.style.transform = 'translate3d(' + (r.x * width - size / 2).toFixed(2) + 'px,' +
        (r.y * height - size * 232 / 256).toFixed(2) + 'px,0) scale(' + (0.88 + depth * 0.12).toFixed(3) + ')';
      r.el.style.zIndex = String(1 + Math.round(r.y * 100));
      if (r.tree || r.lift) {
        var squash = r.jump ? Math.sin(Math.min(1, r.jump.elapsed / 0.9) * Math.PI * 2) * 0.1 : 0;
        var scale = 0.88 + depth * 0.12;
        r.facing.style.transform = 'translateY(' + (-r.lift / scale).toFixed(2) + 'px) scale(' + (r.direction * (1 - squash)) + ',' + (1 + squash) + ')';
        r.shadow.style.opacity = '0.25';
      } else {
        r.facing.style.transform = 'scaleX(' + r.direction + ')'; r.shadow.style.opacity = '1';
      }
      if (r.ready && r.frame !== r.player.frame()) {
        r.frame = r.player.frame();
        r.sprite.style.backgroundPosition = ((r.frame % 4) * 100 / 3) + '% ' + (Math.floor(r.frame / 4) * 100 / 3) + '%';
        r.sprite.setAttribute('data-frame', String(r.frame));
      }
    }
    function play(r, name) {
      if (name === 'special' && !collection.progress(r.cat.id).special) name = 'sleep';
      r.wait = 0;
      if (name === 'sleep' || name === 'special') r.stroll = 0;
      r.player.play(name);
      r.el.setAttribute('data-state', name);
      r.el.setAttribute('aria-label', (name === 'sleep' ? '叫醒' : '摸摸') + r.cat.name);
      updateStatus(r); paint(r);
    }
    // 只保护身体中心的空间，允许边缘轻微交叠；检查实际移动路段，防止穿身。
    function pathClear(r, x, y) {
      return residents.every(function (other) {
        if (other === r || !other.placed || away(other) || (other.tree && (!other.jump || !other.jump.down))) return true;
        var otherX = other.jump && other.jump.down ? other.jump.toX : other.x;
        var otherY = other.jump && other.jump.down ? other.jump.toY : other.y;
        var offsets = [(r.x - otherX) * width, (r.y - otherY) * height];
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
      r.wait = 0.15 + Math.random() * 0.2;
    }
    function destination(r) {
      var direction = Math.random() < 0.25 ? -r.direction : r.direction;
      var distance = viewport.clientWidth * (0.3 + Math.random() * 0.35) / width;
      if (r.x + direction * distance < bounds.left || r.x + direction * distance > bounds.right) direction *= -1;
      r.goalX = clamp(r.x + direction * distance, bounds.left, bounds.right);
      r.goalY = bounds.back + Math.random() * (bounds.front - bounds.back);
      if (r.stroll <= 0) r.stroll = 12 + Math.random() * 8;
      if (r.player.action() !== 'walk') play(r, 'walk');
    }
    function walkStep(r, dt) {
      if (!dt) return;
      var dx = (r.goalX - r.x) * width, dy = (r.goalY - r.y) * height;
      var distance = Math.sqrt(dx * dx + dy * dy), step = Math.min(distance, height * 0.065 * dt);
      if (distance < 1) { destination(r); return; }
      var heading = Math.atan2(dy, dx), turn = r.turn;
      var angles = [0, turn * 0.5, -turn * 0.5, turn, -turn, turn * 1.57, -turn * 1.57, Math.PI];
      for (var i = 0; i < angles.length; i++) {
        var angle = heading + angles[i];
        var x = clamp(r.x + Math.cos(angle) * step / width, bounds.left, bounds.right);
        var y = clamp(r.y + Math.sin(angle) * step / height, bounds.back, bounds.front);
        var movedX = (x - r.x) * width, movedY = (y - r.y) * height;
        var moved = Math.sqrt(movedX * movedX + movedY * movedY);
        if (moved < step * 0.5 || !pathClear(r, x, y)) continue;
        r.x = x; r.y = y;
        r.player.update(dt, moved / size);
        r.stroll -= dt;
        if (Math.abs(movedX) > step * 0.25) {
          r.direction = movedX > 0 ? 1 : -1;
          r.facing.style.transform = 'scaleX(' + r.direction + ')';
        }
        // 绕开后沿新方向走一段，避免每帧又转回来顶住同一只猫。
        if (i > 0) {
          r.goalX = clamp(r.x + Math.cos(angle) * size * 1.5 / width, bounds.left, bounds.right);
          r.goalY = clamp(r.y + Math.sin(angle) * size * 1.5 / height, bounds.back, bounds.front);
        }
        if (r.stroll <= 0) rest(r);
        else if (distance <= step && i === 0) destination(r);
        return;
      }
      waitForSpace(r);
    }
    function rest(r) {
      r.stroll = 0;
      r.rests++;
      play(r, collection.progress(r.cat.id).special && r.rests % 2 === 1 ? 'special' : 'sleep');
    }
    function releaseTree(resident) {
      if (furniture) furniture.release(resident.tree);
      resident.tree = null; resident.jump = null; resident.lift = 0; resident.perch = 0;
      resident.el.setAttribute('data-tree', ''); resident.cooldown = 8 + Math.random() * 10;
    }
    function jumpTo(resident, targetX, targetY, lift, down) {
      resident.jump = { elapsed: 0, fromX: resident.x, fromY: resident.y, toX: targetX, toY: targetY,
        fromLift: resident.lift, toLift: lift, down: down };
      resident.direction = targetX >= resident.x ? 1 : -1;
      play(resident, 'jump');
    }
    function interact(resident) {
      if (!furniture || resident.tree || resident.cooldown > 0 || away(resident)) return false;
      var tree = furniture.reserve(resident, width, height, size);
      if (!tree) return false;
      resident.tree = tree; resident.el.setAttribute('data-tree', tree.id);
      jumpTo(resident, tree.x, tree.y, tree.lift, false); return true;
    }
    function landingClear(resident, targetX, targetY) {
      return residents.every(function (other) {
        if (other === resident || !other.placed || away(other)) return true;
        if (other.jump && other.jump.down) return Math.abs((other.jump.toX - targetX) * width) >= clearanceX || Math.abs((other.jump.toY - targetY) * height) >= clearanceY;
        if (other.tree) return true;
        return Math.abs((other.x - targetX) * width) >= clearanceX || Math.abs((other.y - targetY) * height) >= clearanceY;
      });
    }
    function jumpDown(resident) {
      if (!resident.tree || resident.jump) return false;
      for (var ring = 1; ring <= 3; ring++) {
        for (var direction = 0; direction < 12; direction++) {
          var angle = direction * Math.PI / 6;
          var targetX = clamp(resident.x + Math.cos(angle) * size * ring * 0.65 / width, bounds.left, bounds.right);
          var targetY = clamp(resident.y + Math.sin(angle) * size * ring * 0.65 / height, bounds.back, bounds.front);
          if (landingClear(resident, targetX, targetY)) { jumpTo(resident, targetX, targetY, 0, true); return true; }
        }
      }
      resident.perch = 0.5; return false;
    }
    function furnitureStep(resident, elapsed) {
      if (!resident.jump) {
        resident.perch -= elapsed; resident.player.update(elapsed, 0);
        if (resident.player.finished()) resident.player.play('sleep');
        if (resident.perch <= 0) jumpDown(resident);
        return;
      }
      var jump = resident.jump;
      jump.elapsed += elapsed;
      var progress = clamp(jump.elapsed / 0.9, 0, 1), eased = progress * progress * (3 - 2 * progress);
      resident.x = jump.fromX + (jump.toX - jump.fromX) * eased;
      resident.y = jump.fromY + (jump.toY - jump.fromY) * eased;
      resident.lift = jump.fromLift + (jump.toLift - jump.fromLift) * eased + Math.sin(progress * Math.PI) * size * 0.42;
      resident.player.update(elapsed, 0);
      if (progress < 1) return;
      resident.jump = null;
      if (jump.down) { releaseTree(resident); destination(resident); }
      else { resident.perch = 5 + Math.random() * 7; play(resident, 'sleep'); }
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
      el.disabled = arranging;
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
      var r = { cat: cat, el: el, facing: facing, sprite: sprite, fallback: fallback, shadow: shadow, image: new Image(),
        player: root.TurtleCatActions.create({ profile: 'collection', specialLabel: cat.special }),
        x: 0, y: 0.65, goalX: 0, goalY: 0.65, direction: 1, rests: 0, wait: 0, stroll: 0,
        turn: residents.length % 2 ? -1 : 1, tree: null, jump: null, lift: 0, cooldown: 0, perch: 0, wasAway: false,
        wasSleeping: false, placed: false, ready: false, loading: false, failed: false, frame: -1 };
      el.addEventListener('click', function () {
        if (arranging) return;
        selected = cat.id;
        if (root.TurtleSound) root.TurtleSound.play('tap');
        if (!r.ready) { load(r); updateStatus(r); return; }
        if (r.tree) { jumpDown(r); return; }
        if (r.player.action() === 'sleep') {
          if (!travel || !travel.isSleeping(cat.id) || travel.wake(cat.id)) play(r, 'wake');
          else updateStatus(r);
        } else rest(r);
        if (reduced && reduced.matches) { updateStatus(r); return; }
      });
      residents.push(r); load(r);
    }
    function sync() {
      collection.roomList().forEach(function (p) { if (p.home && !find(p.cat.id)) add(p.cat); });
      options.findButton.disabled = residents.length === 0;
    }
    function refresh() {
      if (!travel) return;
      sync();
      if (furniture) { furniture.sync(travel.furniture()); if (width) furniture.layout(width, height, size, bounds); }
      var returned = false;
      residents.forEach(function (resident) {
        var travelling = away(resident);
        var sleeping = travel.isSleeping(resident.cat.id);
        if (travelling && !resident.wasAway) { releaseTree(resident); play(resident, 'idle'); }
        if (!travelling && resident.wasAway) { resident.placed = false; returned = true; }
        if (sleeping && !resident.wasSleeping) { if (resident.tree) releaseTree(resident); play(resident, 'sleep'); }
        if (!sleeping && resident.wasSleeping && resident.player.action() === 'sleep') play(resident, 'wake');
        resident.wasAway = travelling; resident.el.hidden = travelling || !active || !width;
        resident.wasSleeping = sleeping;
        updateStatus(resident);
      });
      if (returned) layoutKey = '';
      if (width) layout(width, height, 1, 0);
      start();
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
        clearanceX = size * 0.8 + 2; clearanceY = size * 0.7 + 2;
        bounds.left = (size * 0.6 + 12) / width; bounds.right = 1 - bounds.left;
        columns = Math.max(1, Math.floor((bounds.right - bounds.left) * width / (size + 8)) + 1);
        rows = Math.max(1, Math.ceil(residents.length / columns));
        bounds.back = Math.min(0.56, bounds.front - Math.max(height * 0.1, (rows - 1) * (size * 0.9 + 8) + (rows > 1 ? height * 0.02 : 0)) / height);
        if (bounds.back >= 0.44 && bounds.left < bounds.right) break;
        size *= 0.9;
      } while (size > 8);
      var slots = [];
      for (var row = 0; row < rows; row++) {
        var count = Math.max(1, Math.ceil((residents.length - row) / rows));
        for (var column = 0; column < count; column++) {
          slots.push({ x: count === 1 ? clamp((viewport.scrollLeft + viewport.clientWidth * 0.45) / width, bounds.left, bounds.right) : bounds.left + column * (bounds.right - bounds.left) / (count - 1),
            y: rows === 1 ? (bounds.back + bounds.front) / 2 : bounds.back + row * (bounds.front - bounds.back) / (rows - 1) });
        }
      }
      residents.forEach(function (r, i) {
        if (r.tree) releaseTree(r);
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
        if (r.player.action() === 'walk' || r.player.action() === 'jump') waitForSpace(r);
        paint(r);
      });
      if (furniture) furniture.layout(width, height, size, bounds);
    }
    function tick(now) {
      raf = 0;
      if (!active || arranging || document.hidden) { lastTime = 0; return; }
      var dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0; lastTime = now;
      residents.forEach(function (r) {
        if (!r.ready || !r.placed || away(r)) return;
        r.cooldown = Math.max(0, r.cooldown - dt);
        if (r.tree) {
          furnitureStep(r, dt);
        } else if (r.player.action() === 'walk' && interact(r)) {
          furnitureStep(r, dt);
        } else if (r.player.action() === 'walk') {
          walkStep(r, dt);
        } else if (r.wait > 0) {
          r.wait = Math.max(0, r.wait - dt);
          if (!r.wait) destination(r);
        } else {
          r.player.update(dt, 0);
          if (r.player.finished()) {
            if (r.player.action() === 'sleep') {
              if (travel && travel.isSleeping(r.cat.id)) r.player.play('sleep'); else play(r, 'wake');
            } else destination(r);
          }
          if (travel && travel.isSleeping(r.cat.id) && r.player.action() !== 'sleep') {
            play(r, 'sleep');
          }
        }
        paint(r);
      });
      raf = requestAnimationFrame(tick);
    }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; lastTime = 0; }
    function start() {
      if (!active || document.hidden || !width || !options.background.complete || !options.background.naturalWidth) return;
      residents.forEach(function (r) { r.el.hidden = !!away(r); });
      if (arranging) return;
      if (reduced && reduced.matches) {
        var occupied = residents.some(function (resident) { return !!resident.tree; });
        if (occupied) { layoutKey = ''; layout(width, height, 1, 0); }
        residents.forEach(function (r) { play(r, travel && travel.isSleeping(r.cat.id) ? 'sleep' : 'idle'); }); return;
      }
      if (!raf && residents.some(function (r) { return r.ready; })) raf = requestAnimationFrame(tick);
    }
    function focus(id) {
      var r = find(id); if (!r) return false;
      if (away(r)) { selected = id; updateStatus(r); return false; }
      selected = id; updateStatus(r); options.moveTo(r.x * width - viewport.clientWidth / 2); return true;
    }
    function wake(id) {
      var r = find(id);
      if (!r || away(r) || !travel || !travel.wake(id)) return false;
      selected = id; play(r, 'wake'); start(); return true;
    }
    function perform(id, action) {
      if (arranging) return false;
      var r = find(id), p = collection.progress(id);
      if (!r || !p.home || ['walk', 'sleep', 'special', 'jump'].indexOf(action) < 0 || (action === 'special' && !p.special)) return false;
      if (away(r)) { focus(id); return false; }
      focus(id);
      if (action === 'sleep') {
        if (travel && travel.sleep && !travel.sleep(id)) return false;
        play(r, 'sleep'); start(); return true;
      }
      if (travel && travel.isSleeping(id)) return false;
      if (reduced && reduced.matches) return true;
      if (r.tree) { jumpDown(r); return true; }
      if (action === 'jump') { r.cooldown = 0; return interact(r); }
      if (action === 'walk') destination(r); else play(r, action);
      start(); return true;
    }
    options.findButton.addEventListener('click', function () {
      var home = residents.filter(function (resident) { return !away(resident); });
      if (!home.length) return;
      var index = home.indexOf(find(selected));
      focus(home[(index + 1) % home.length].cat.id);
      if (root.TurtleSound) root.TurtleSound.play('tap');
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
    if (reduced) reduced.addListener(function () { stop(); start(); });
    function arrange(enabled) {
      if (!furniture || arranging === enabled) return;
      arranging = enabled; stop(); furniture.edit(enabled);
      residents.forEach(function (resident) { resident.el.disabled = enabled; });
      if (enabled) {
        layoutKey = ''; layout(width, height, 1, 0);
      } else start();
    }
    return {
      layout: layout, start: start, focus: focus, wake: wake, perform: perform, refresh: refresh,
      arrange: arrange, furniture: furniture,
      states: function () { return residents.map(function (resident) { return { id: resident.cat.id, activity: activity(resident) }; }); },
      enter: function () { active = true; sync(); refresh(); },
      leave: function () { active = false; stop(); },
      contains: function (target) { return residents.some(function (r) { return r.el.contains(target); }); }
    };
  }
  root.TurtleRoomResidents = { create: create };
})(window);
