(function (root) {
  'use strict';
  function create(world) {
    var trees = [];
    function sync(items) {
      items.forEach(function (entry, index) {
        if (!entry.count || trees.some(function (tree) { return tree.id === entry.item.id; })) return;
        var element = document.createElement('div');
        element.className = 'room-tree'; element.setAttribute('data-tree-id', entry.item.id);
        element.setAttribute('role', 'img'); element.setAttribute('aria-label', entry.item.name);
        element.style.backgroundPosition = entry.item.column * 50 + '% ' + entry.item.row * 100 + '%';
        world.appendChild(element);
        trees.push({ id: entry.item.id, name: entry.item.name, index: index, el: element, occupant: null, x: 0, y: 0, lift: 0 });
      });
    }
    function layout(width, height, size, bounds) {
      var treeSize = Math.min(size * 1.45, width / 5.2);
      trees.forEach(function (tree) {
        tree.x = 0.1 + tree.index * 0.2;
        tree.y = bounds.front - Math.min(0.015, (bounds.front - bounds.back) * 0.1);
        tree.lift = treeSize * 0.68;
        tree.el.style.width = treeSize + 'px'; tree.el.style.height = treeSize + 'px';
        tree.el.style.transform = 'translate3d(' + (tree.x * width - treeSize / 2) + 'px,' + (tree.y * height - treeSize * 0.9) + 'px,0)';
        tree.el.style.zIndex = String(Math.round(tree.y * 100));
      });
    }
    function reserve(cat, width, height, size) {
      var nearest = null, distance = size * 0.9;
      trees.forEach(function (tree) {
        if (tree.occupant) return;
        var deltaX = (tree.x - cat.x) * width, deltaY = (tree.y - cat.y) * height;
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
    return { sync: sync, layout: layout, reserve: reserve, release: release, list: function () { return trees.slice(); } };
  }
  root.TurtleRoomFurniture = { create: create };
})(window);
