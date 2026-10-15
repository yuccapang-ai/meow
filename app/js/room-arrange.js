(function (root) {
  'use strict';
  function create(options) {
    var world = options.world, viewport = options.viewport, residents = options.residents, furniture = residents.furniture;
    var button = document.getElementById('btn-room-arrange'), bar = document.getElementById('room-arrange-bar');
    var status = document.getElementById('room-arrange-status'), reset = document.getElementById('btn-room-arrange-reset');
    var editing = false, drag = null, frame = 0, lastTime = 0;
    var instructions = '拖动家具摆放 · 靠近边缘移动视角';
    function message(text) { if (status.textContent !== text) status.textContent = text; }
    function refresh() {
      button.disabled = !furniture || !furniture.list().length;
      button.title = button.disabled ? '等猫咪旅行带回家具后，就可以布置啦' : '自由摆放家具，位置自动保存';
    }
    function updatePreview() {
      if (!drag) return;
      var rect = world.getBoundingClientRect();
      var valid = furniture.preview(drag.tree.id, drag.clientX - rect.left + drag.offsetX, drag.clientY - rect.top + drag.offsetY);
      message(valid ? drag.tree.name + ' · 松手保存位置' : '家具太近啦，换个空一点的位置');
    }
    function pan(now) {
      frame = 0;
      if (!drag) return;
      var elapsed = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0; lastTime = now;
      var rect = viewport.getBoundingClientRect(), edge = Math.min(48, viewport.clientWidth * 0.15), velocity = 0;
      if (drag.clientX < rect.left + edge) velocity = -220 * Math.min(1, (rect.left + edge - drag.clientX) / edge);
      else if (drag.clientX > rect.right - edge) velocity = 220 * Math.min(1, (drag.clientX - rect.right + edge) / edge);
      if (velocity) {
        var maximum = Math.max(0, furniture.dimensions().width - viewport.clientWidth);
        viewport.scrollLeft = Math.max(0, Math.min(maximum, viewport.scrollLeft + velocity * elapsed)); updatePreview();
      }
      frame = root.requestAnimationFrame(pan);
    }
    function end(commit) {
      if (!drag) return;
      var previous = drag; drag = null;
      if (frame) root.cancelAnimationFrame(frame);
      frame = 0; lastTime = 0;
      var saved = furniture.finish(previous.tree.id, commit);
      if (world.hasPointerCapture && world.hasPointerCapture(previous.pointerId)) world.releasePointerCapture(previous.pointerId);
      residents.refresh();
      message(commit ? saved ? '位置已保存 · ' + instructions : '这里放不下，已放回原位' : '已取消移动 · ' + instructions);
    }
    function edit(enabled) {
      if (enabled && (!furniture || !furniture.list().length)) return;
      end(false); editing = enabled;
      residents.arrange(enabled); world.setAttribute('data-arranging', enabled ? 'true' : 'false');
      button.textContent = enabled ? '完成布置' : '布置家具'; button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      bar.hidden = !enabled; message(instructions); refresh();
    }
    button.addEventListener('click', function () { edit(!editing); });
    reset.addEventListener('click', function () {
      if (!editing) return;
      end(false); options.travel.resetFurniture(); residents.refresh(); message('已恢复默认摆放 · ' + instructions);
    });
    world.addEventListener('pointerdown', function (event) {
      if (!editing || drag || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
      var tree = furniture.target(event.target), dimensions = furniture.dimensions();
      if (!tree || !dimensions.width || !dimensions.height) return;
      var rect = world.getBoundingClientRect();
      drag = { tree: tree, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
        offsetX: tree.x * dimensions.width - event.clientX + rect.left, offsetY: tree.y * dimensions.height - event.clientY + rect.top };
      event.preventDefault(); event.stopPropagation();
      tree.el.focus();
      if (world.setPointerCapture) world.setPointerCapture(event.pointerId);
      updatePreview(); frame = root.requestAnimationFrame(pan);
    });
    world.addEventListener('pointermove', function (event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      drag.clientX = event.clientX; drag.clientY = event.clientY; updatePreview();
    });
    world.addEventListener('pointerup', function (event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      drag.clientX = event.clientX; drag.clientY = event.clientY; updatePreview(); end(true);
    });
    function cancelPointer(event) { if (drag && drag.pointerId === event.pointerId) end(false); }
    world.addEventListener('pointercancel', cancelPointer);
    world.addEventListener('lostpointercapture', cancelPointer);
    world.addEventListener('keydown', function (event) {
      if (!editing) return;
      var tree = furniture.target(event.target), directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (!tree || !directions[event.key] || drag) return;
      event.preventDefault(); event.stopPropagation();
      var direction = directions[event.key], distance = event.shiftKey ? 24 : 8, dimensions = furniture.dimensions();
      furniture.preview(tree.id, tree.x * dimensions.width + direction[0] * distance, tree.y * dimensions.height + direction[1] * distance);
      var saved = furniture.finish(tree.id, true); residents.refresh();
      message(saved ? tree.name + ' · 位置已保存' : '家具太近啦，换个方向试试');
    });
    document.addEventListener('keydown', function (event) {
      if (!editing || event.key !== 'Escape') return;
      event.preventDefault();
      if (drag) end(false); else { edit(false); button.focus(); }
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden && editing) edit(false); });
    root.addEventListener('resize', function () { end(false); });
    refresh();
    return { refresh: refresh, close: function () { if (editing) edit(false); }, active: function () { return editing; } };
  }
  root.TurtleRoomArrange = { create: create };
})(window);
