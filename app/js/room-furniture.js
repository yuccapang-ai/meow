(function (root) {
  'use strict';
  function create(world, options) {
    options = options || {};
    var trees = [], editing = false, width = 0, height = 0, treeSize = 0, limits = null;
    function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
    function find(id) { return trees.filter(function (tree) { return tree.id === id; })[0]; }
    function sync(items) {
      items.forEach(function (entry, index) {
        var tree = find(entry.item.id);
        if (!entry.count) return;
        if (!tree) {
          var element = document.createElement('div');
          element.className = 'room-tree'; element.setAttribute('data-tree-id', entry.item.id);
          element.style.backgroundPosition = entry.item.column * 50 + '% ' + entry.item.row * 100 + '%';
          world.appendChild(element);
          tree = { id: entry.item.id, name: entry.item.name, index: index, el: element, occupant: null, x: 0, y: 0, lift: 0, draft: null };
          trees.push(tree);
        }
        tree.position = entry.position ? { x: entry.position.x, y: entry.position.y } : null;
        accessible(tree);
      });
    }
    function accessible(tree) {
      tree.el.tabIndex = editing ? 0 : -1;
      tree.el.setAttribute('role', editing ? 'button' : 'img');
      tree.el.setAttribute('aria-label', tree.name + (editing ? '，拖动或用方向键调整位置' : ''));
      tree.el.setAttribute('data-editing', editing ? 'true' : 'false');
    }
    function clearAt(tree, point, others) {
      return others.every(function (other) {
        return other === tree || Math.abs(point.x - other.x) * width >= treeSize * 0.7 + 4 ||
          Math.abs(point.y - other.y) * height >= treeSize * 0.28 + 4;
      });
    }
    function normalized(point) {
      return { x: clamp((point.x - limits.left) / Math.max(0.0001, limits.right - limits.left), 0, 1),
        y: clamp((point.y - limits.back) / Math.max(0.0001, limits.front - limits.back), 0, 1) };
    }
    function coordinates(position) {
      return { x: limits.left + position.x * (limits.right - limits.left), y: limits.back + position.y * (limits.front - limits.back) };
    }
    function paint(tree) {
      tree.el.style.width = treeSize + 'px'; tree.el.style.height = treeSize + 'px';
      tree.el.style.transform = 'translate3d(' + (tree.x * width - treeSize / 2) + 'px,' + (tree.y * height - treeSize * 0.9) + 'px,0)';
      tree.el.style.zIndex = String(tree.draft ? 150 : Math.round(tree.y * 100));
      tree.el.setAttribute('data-placement', tree.draft ? tree.valid ? 'valid' : 'invalid' : '');
    }
    function safePoint(tree, desired, placed) {
      if (clearAt(tree, desired, placed)) return desired;
      var columns = Math.max(1, Math.floor((limits.right - limits.left) * width / (treeSize * 0.7 + 4)));
      var rows = Math.max(1, Math.floor((limits.front - limits.back) * height / (treeSize * 0.28 + 4)));
      var nearest = desired, nearestDistance = Infinity;
      for (var column = 0; column <= columns; column++) {
        for (var row = 0; row <= rows; row++) {
          var point = coordinates({ x: column / columns, y: row / rows });
          if (!clearAt(tree, point, placed)) continue;
          var distance = Math.pow((point.x - desired.x) * width, 2) + Math.pow((point.y - desired.y) * height, 2);
          if (distance < nearestDistance) { nearest = point; nearestDistance = distance; }
        }
      }
      return nearest;
    }
    function layout(worldWidth, worldHeight, size, bounds) {
      width = worldWidth; height = worldHeight;
      if (!width || !height) return;
      treeSize = Math.min(size * 1.45, width / 5.2);
      var margin = Math.max(treeSize * 0.5 + 4, bounds.left * width) / width;
      var front = bounds.front - Math.min(0.015, (bounds.front - bounds.back) * 0.1);
      limits = { left: margin, right: 1 - margin, back: Math.min(front, Math.max(0.52, bounds.back)), front: front };
      var placed = [];
      trees.forEach(function (tree) {
        tree.lift = treeSize * 0.68;
        if (tree.draft) return;
        var desired = tree.position ? coordinates(tree.position) : { x: clamp(0.1 + tree.index * 0.2, limits.left, limits.right), y: limits.front };
        var point = safePoint(tree, desired, placed);
        tree.x = point.x; tree.y = point.y; placed.push(tree); paint(tree);
      });
      trees.forEach(function (tree) {
        if (!tree.draft) return;
        var point = coordinates(tree.draft); tree.x = point.x; tree.y = point.y;
        tree.valid = clearAt(tree, point, placed); paint(tree);
      });
    }
    function preview(id, pixelX, pixelY) {
      var tree = find(id);
      if (!editing || !tree || !limits || !isFinite(pixelX) || !isFinite(pixelY)) return false;
      tree.x = clamp(pixelX / width, limits.left, limits.right); tree.y = clamp(pixelY / height, limits.back, limits.front);
      tree.draft = normalized(tree); tree.valid = clearAt(tree, tree, trees); paint(tree); return tree.valid;
    }
    function finish(id, commit) {
      var tree = find(id);
      if (!tree || !tree.draft) return false;
      var saved = !!(commit && tree.valid && options.save && options.save(tree.id, tree.draft));
      if (saved) tree.position = { x: tree.draft.x, y: tree.draft.y };
      tree.draft = null; tree.el.setAttribute('data-placement', '');
      return saved;
    }
    function reserve(cat, worldWidth, worldHeight, size) {
      if (editing) return null;
      var nearest = null, distance = size * 0.9;
      trees.forEach(function (tree) {
        if (tree.occupant) return;
        var deltaX = (tree.x - cat.x) * worldWidth, deltaY = (tree.y - cat.y) * worldHeight;
        var gap = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (gap < distance) { distance = gap; nearest = tree; }
      });
      if (nearest) { nearest.occupant = cat.cat.id; nearest.el.setAttribute('data-occupied', cat.cat.id); }
      return nearest;
    }
    function release(tree) {
      if (!tree) return;
      tree.occupant = null; tree.el.setAttribute('data-occupied', '');
    }
    return { sync: sync, layout: layout, reserve: reserve, release: release, preview: preview, finish: finish,
      edit: function (enabled) { editing = enabled; trees.forEach(accessible); },
      target: function (element) { return trees.filter(function (tree) { return tree.el.contains(element); })[0] || null; },
      dimensions: function () { return { width: width, height: height }; },
      list: function () { return trees.slice(); } };
  }
  root.TurtleRoomFurniture = { create: create };
})(window);
