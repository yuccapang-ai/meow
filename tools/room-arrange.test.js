'use strict';
var assert = require('assert'), fs = require('fs'), vm = require('vm');
var Collection = require('../app/js/cat-collection.js'), Travel = require('../app/js/cat-travel.js');
function Element() { this.children = []; this.attrs = {}; this.style = {}; this.events = {}; this.hidden = false; this.disabled = false; this.captured = new Set(); }
Element.prototype.appendChild = function (child) { this.children.push(child); return child; };
Element.prototype.setAttribute = function (key, value) { this.attrs[key] = value; };
Element.prototype.addEventListener = function (name, callback) { (this.events[name] || (this.events[name] = [])).push(callback); };
Element.prototype.emit = function (name, event) { (this.events[name] || []).forEach(function (callback) { callback(event); }); };
Element.prototype.contains = function (element) { return this === element || this.children.some(function (child) { return child.contains(element); }); };
Element.prototype.focus = function () { document.activeElement = this; };
Element.prototype.click = function () { if (!this.disabled) this.emit('click', { target: this }); };
Element.prototype.setPointerCapture = function (pointerId) { this.captured.add(pointerId); };
Element.prototype.hasPointerCapture = function (pointerId) { return this.captured.has(pointerId); };
Element.prototype.releasePointerCapture = function (pointerId) { this.captured.delete(pointerId); this.emit('lostpointercapture', { pointerId: pointerId }); };
var ids = {}, document = new Element(); document.hidden = false;
document.createElement = function () { return new Element(); };
document.getElementById = function (id) { return ids[id]; };
['btn-room-arrange', 'room-arrange-bar', 'room-arrange-status', 'btn-room-arrange-reset'].forEach(function (id) { ids[id] = new Element(); });
var window = new Element(), scheduled = new Map(), sequence = 0, now = 1000;
window.requestAnimationFrame = function (callback) { var id = ++sequence; scheduled.set(id, callback); return id; };
window.cancelAnimationFrame = function (id) { scheduled.delete(id); };
var context = { window: window, document: document };
vm.createContext(context);
['room-furniture.js', 'room-arrange.js'].forEach(function (file) { vm.runInContext(fs.readFileSync(require.resolve('../app/js/' + file), 'utf8'), context); });
var saved = { version: 1, cats: {}, furniture: { leaf: 1, cloud: 1, mushroom: 1, ladder: 1, nest: 1 } };
var storage = { getItem: function () { return JSON.stringify(saved); }, setItem: function (key, value) { saved = JSON.parse(value); } };
var travel = Travel.create({ collection: Collection.create(null), storage: storage, now: function () { return now; } });
var world = new Element(), viewport = new Element(); viewport.scrollLeft = 0; viewport.clientWidth = 375;
viewport.getBoundingClientRect = function () { return { left: 20, top: 30, right: 395, bottom: 697 }; };
world.getBoundingClientRect = function () { return { left: 20 - viewport.scrollLeft, top: 30 }; };
var worldWidth = 937.5, worldHeight = 667, catSize = 116, bounds = { left: 0.09, right: 0.91, back: 0.45, front: 0.66 };
var furniture = window.TurtleRoomFurniture.create(world, { save: travel.placeFurniture });
var paused = false, residents = { furniture: furniture, arrange: function (enabled) { paused = enabled; furniture.edit(enabled); },
  refresh: function () { furniture.sync(travel.furniture()); furniture.layout(worldWidth, worldHeight, catSize, bounds); } };
var editor = window.TurtleRoomArrange.create({ world: world, viewport: viewport, residents: residents, travel: travel });
assert.ok(ids['btn-room-arrange'].disabled, 'no furniture means no empty editor');
residents.refresh(); editor.refresh(); assert.strictEqual(ids['btn-room-arrange'].disabled, false);
ids['btn-room-arrange'].click(); assert.ok(paused && editor.active());
assert.ok(furniture.list().every(function (tree) { return tree.el.tabIndex === 0; }));
assert.strictEqual(furniture.reserve({ cat: { id: 'donut' }, x: 0.1, y: 0.6 }, worldWidth, worldHeight, catSize), null);
var leaf = furniture.list()[0], cloud = furniture.list()[1];
function pointer(name, tree, clientX, clientY, overrides) {
  var event = Object.assign({ target: tree.el, clientX: clientX, clientY: clientY, pointerId: 1, pointerType: 'mouse', button: 0,
    preventDefault: function () { this.prevented = true; }, stopPropagation: function () { this.stopped = true; } }, overrides || {});
  world.emit(name, event); return event;
}
function grab(tree, overrides) { return pointer('pointerdown', tree, 20 - viewport.scrollLeft + tree.x * worldWidth, 30 + tree.y * worldHeight - 50, overrides); }
var originalX = leaf.x, originalY = leaf.y;
var start = grab(leaf);
assert.ok(start.prevented && start.stopped && world.hasPointerCapture(1));
pointer('pointermove', leaf, start.clientX + 28, start.clientY - 42);
pointer('pointerup', leaf, start.clientX + 28, start.clientY - 42);
assert.ok(leaf.x > originalX && leaf.y < originalY);
assert.ok(travel.furniture()[0].position);
assert.strictEqual(scheduled.size, 0); assert.strictEqual(world.hasPointerCapture(1), false);
var stored = JSON.stringify(travel.furniture()[0].position), placedX = leaf.x, placedY = leaf.y;
start = grab(leaf);
pointer('pointermove', leaf, 20 - viewport.scrollLeft + cloud.x * worldWidth, 30 + cloud.y * worldHeight - 50);
assert.strictEqual(leaf.el.attrs['data-placement'], 'invalid');
pointer('pointerup', leaf, 20 - viewport.scrollLeft + cloud.x * worldWidth, 30 + cloud.y * worldHeight - 50);
assert.strictEqual(JSON.stringify(travel.furniture()[0].position), stored, 'overlapping drop must not replace saved position');
assert.strictEqual(leaf.x, placedX); assert.strictEqual(leaf.y, placedY);
start = grab(leaf, { pointerType: 'touch', pointerId: 7 });
pointer('pointermove', leaf, start.clientX + 25, start.clientY - 5, { pointerId: 8 });
assert.strictEqual(leaf.x, placedX, 'secondary touch cannot move the primary drag');
pointer('pointermove', leaf, start.clientX + 25, start.clientY - 5, { pointerId: 7 });
world.emit('pointercancel', { pointerId: 7 });
assert.strictEqual(leaf.x, placedX); assert.strictEqual(scheduled.size, 0);
start = grab(leaf); pointer('pointermove', leaf, 392, start.clientY - 40);
for (var frame = 0; frame < 90; frame++) {
  now += 1000 / 60; var callbacks = Array.from(scheduled.values()); scheduled.clear(); callbacks.forEach(function (callback) { callback(now); });
}
assert.ok(viewport.scrollLeft > 200, 'holding near the edge pans a long room without further pointer movement');
assert.ok(leaf.x * worldWidth > 500, 'preview follows world coordinates while the viewport moves');
world.emit('lostpointercapture', { pointerId: 1 });
assert.strictEqual(scheduled.size, 0); assert.strictEqual(leaf.x, placedX);
start = grab(leaf); pointer('pointermove', leaf, start.clientX + 24, start.clientY - 10);
window.emit('resize', {}); assert.strictEqual(scheduled.size, 0); assert.strictEqual(leaf.x, placedX);
var keyEvent = { target: leaf.el, key: 'ArrowRight', shiftKey: true, preventDefault: function () { this.prevented = true; }, stopPropagation: function () { this.stopped = true; } };
world.emit('keydown', keyEvent);
assert.ok(keyEvent.prevented && keyEvent.stopped); assert.ok(leaf.x > placedX);
var reloaded = Travel.create({ collection: Collection.create(null), storage: storage, now: function () { return now; } });
assert.deepStrictEqual(reloaded.furniture()[0].position, travel.furniture()[0].position);
var positionCopy = travel.furniture()[0].position, originalStoredX = positionCopy.x; positionCopy.x = 0.99;
assert.strictEqual(travel.furniture()[0].position.x, originalStoredX, 'returned positions cannot mutate storage');
[{ x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: -1, y: 0.5 }, { x: 0.2, y: 1.01 }, { x: '0.5', y: 0.5 }, null].forEach(function (position) {
  assert.strictEqual(travel.placeFurniture('leaf', position), false);
});
assert.strictEqual(travel.placeFurniture('unknown', { x: 0.5, y: 0.5 }), false);
var empty = Travel.create({ collection: Collection.create(null), storage: null });
assert.strictEqual(empty.placeFurniture('leaf', { x: 0.5, y: 0.5 }), false, 'unowned furniture cannot gain a position');
var preserved = JSON.stringify(travel.furniture().map(function (entry) { return entry.position; }));
[[675, 480, 84], [1186, 844, 147], [937.5, 667, 116]].forEach(function (dimensions) {
  worldWidth = dimensions[0]; worldHeight = dimensions[1]; catSize = dimensions[2]; residents.refresh();
  furniture.list().forEach(function (tree) {
    assert.ok(tree.x > 0 && tree.x < 1 && tree.y >= 0.52 && tree.y < bounds.front);
    assert.ok(!/NaN|Infinity/.test(tree.el.style.transform));
  });
});
assert.strictEqual(JSON.stringify(travel.furniture().map(function (entry) { return entry.position; })), preserved, 'responsive placement never overwrites saved coordinates');
var extraWorld = new Element(), crowdedFurniture = window.TurtleRoomFurniture.create(extraWorld);
var crowdedItems = travel.furniture().map(function (entry) { return { item: entry.item, count: 1, position: { x: 0.5, y: 0.5 } }; });
crowdedFurniture.sync(crowdedItems);
[[675, 480, 84], [1186, 844, 147], [937.5, 667, 116]].forEach(function (dimensions) {
  crowdedFurniture.layout(dimensions[0], dimensions[1], dimensions[2], bounds);
  var rendered = crowdedFurniture.list();
  rendered.forEach(function (tree, index) {
    rendered.slice(index + 1).forEach(function (other) {
      var size = parseFloat(tree.el.style.width);
      assert.ok(Math.abs(tree.x - other.x) * dimensions[0] >= size * 0.7 + 3.99 || Math.abs(tree.y - other.y) * dimensions[1] >= size * 0.28 + 3.99, 'resize resolves overlapping saved placements');
    });
  });
});
ids['btn-room-arrange-reset'].click();
assert.ok(travel.furniture().every(function (entry) { return entry.position === null && entry.count === 1; }));
start = grab(leaf); pointer('pointermove', leaf, start.clientX + 20, start.clientY - 20);
document.emit('keydown', { key: 'Escape', preventDefault: function () {} });
assert.ok(editor.active()); assert.strictEqual(scheduled.size, 0);
document.emit('keydown', { key: 'Escape', preventDefault: function () {} });
assert.ok(!paused && !editor.active()); assert.strictEqual(document.activeElement, ids['btn-room-arrange']);
ids['btn-room-arrange'].click(); start = grab(leaf); document.hidden = true; document.emit('visibilitychange', {});
assert.strictEqual(editor.active(), false); assert.strictEqual(scheduled.size, 0);
assert.ok(furniture.list().every(function (tree) { return tree.el.tabIndex === -1; }));
var unavailableStore = { getItem: function () { return JSON.stringify(saved); }, setItem: function () { throw new Error('quota'); } };
var sessionOnly = Travel.create({ collection: Collection.create(null), storage: unavailableStore });
assert.ok(sessionOnly.placeFurniture('leaf', { x: 0.1, y: 0.2 }));
assert.deepStrictEqual(sessionOnly.furniture()[0].position, { x: 0.1, y: 0.2 }, 'storage failure still preserves session placement');
var malformed = { version: 1, cats: {}, furniture: { leaf: 1, cloud: 1 }, positions: { leaf: { x: -1, y: 0.5 }, cloud: { x: 0.2, y: '0.3' } } };
var recovered = Travel.create({ collection: Collection.create(null), storage: { getItem: function () { return JSON.stringify(malformed); }, setItem: function () {} } });
assert.ok(recovered.furniture().every(function (entry) { return entry.position === null; }), 'invalid stored positions fall back to automatic layout');
console.log('PASS: mouse/touch placement, safe overlap rejection, saved positions, edge panning, pointer cancellation, keyboard placement, resizing, reset and editor lifecycle.');
