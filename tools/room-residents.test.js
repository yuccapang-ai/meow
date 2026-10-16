'use strict';
var assert = require('assert'), fs = require('fs'), vm = require('vm');
var Collection = require('../app/js/cat-collection.js'), Actions = require('../app/js/cat-actions.js');
// Small DOM/RAF harness for actor lifecycle, independently of browser layout.
function Element(tag) { this.tagName = tag; this.children = []; this.style = {}; this.attrs = {}; this.events = {}; this.hidden = false; }
Element.prototype.appendChild = function (child) { this.children.push(child); child.parentNode = this; return child; };
Element.prototype.setAttribute = function (key, value) { this.attrs[key] = value; };
Element.prototype.getAttribute = function (key) { return this.attrs[key] || null; };
Element.prototype.addEventListener = function (name, callback) { this.events[name] = callback; };
Element.prototype.contains = function (target) { return this === target || this.children.some(function (child) { return child.contains(target); }); };
Element.prototype.click = function () { if (this.events.click) this.events.click({ target: this }); };
Element.prototype.focus = function () { document.activeElement = this; };
Object.defineProperty(Element.prototype, 'textContent', { get: function () { return this.text || ''; }, set: function (s) { this.text = s; this.children = []; } });
var ids = {}, document = { hidden: false, events: {}, createElement: function (tag) { return new Element(tag); },
  addEventListener: function (name, cb) { this.events[name] = cb; }, getElementById: function (id) { return ids[id]; } };
var images = [], scheduled = new Map(), sequence = 0, now = 0;
function Image() { images.push(this); }
function readyImages() { images.splice(0).forEach(function (image) { image.onload(); }); }
var media = { matches: false, addListener: function (cb) { this.listener = cb; } };
var collection = Collection.create(null), allSeries = process.env.ROOM_TEST_SERIES === 'all';
var listAll = collection.list, roomListAll = collection.roomList;
collection.list = function (skin) { return listAll(skin || (allSeries ? undefined : 'cats')); };
collection.roomList = function (skin) { return roomListAll(skin || (allSeries ? undefined : 'cats')); };
var catalog = Collection.catalog.filter(function (cat) { return allSeries || cat.skin === 'cats'; });
var initialCount = allSeries ? 2 : 1, residentCount = catalog.length + 1;
var window = { TurtleCatActions: Actions, TurtleCatCollection: { get: function () { return collection; }, series: Collection.series }, matchMedia: function () { return media; } };
var seededMath = Object.create(Math), randomSeed = Number(process.env.ROOM_TEST_SEED) || 73421;
seededMath.random = function () { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296; };
var context = { window: window, document: document, Image: Image, Math: seededMath,
  requestAnimationFrame: function (cb) { var id = ++sequence; scheduled.set(id, cb); return id; },
  cancelAnimationFrame: function (id) { scheduled.delete(id); } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../app/js/room-residents.js'), 'utf8'), context);
var world = new Element('div'), viewport = { clientWidth: 375, clientHeight: 667, scrollLeft: 0 };
var status = new Element('p'), findButton = new Element('button'), camera = 0;
var room = window.TurtleRoomResidents.create({ world: world, viewport: viewport, footer: { offsetHeight: 210 }, status: status,
  findButton: findButton, background: { complete: true, naturalWidth: 2103 }, moveTo: function (x) { camera = x; } });
function tick(elapsed) { now += elapsed || 1000 / 60; var callbacks = Array.from(scheduled.values()); scheduled.clear(); callbacks.forEach(function (cb) { cb(now); }); assertSeparated(); }
function actor(id) { return world.children.filter(function (el) { return el.getAttribute('data-cat-id') === id; })[0]; }
function pose(el) { return el.children[1].children[0].getAttribute('data-frame'); }
var atlases = {};
Collection.catalog.concat([Collection.starter]).forEach(function (cat) { atlases[cat.id] = JSON.parse(fs.readFileSync(require.resolve('../app/' + cat.atlas.replace('.webp', '.json')), 'utf8')); });
// Check actual sprite rectangles independently of the movement controller.
// Small edge overlaps are allowed; cats must not stack on top of one another.
function body(el) {
  var transform = el.style.transform.match(/translate3d\(([-\d.]+)px,([-\d.]+)px,0\) scale\(([-\d.]+)\)/);
  assert.ok(transform, 'cat has a finite rendered position');
  var size = parseFloat(el.style.width), scale = Number(transform[3]);
  var atlas = atlases[el.getAttribute('data-cat-id')], frame = atlas.frames[Number(pose(el)) || 0];
  var left = el.children[1].style.transform === 'scaleX(-1)' ? atlas.cell - frame.left - frame.width : frame.left;
  var x = Number(transform[1]) + size / 2 + (left / atlas.cell - 0.5) * size * scale;
  var y = Number(transform[2]) + size * atlas.footY / atlas.cell + (frame.top - atlas.footY) / atlas.cell * size * scale;
  return { x: x, y: y, right: x + frame.width / atlas.cell * size * scale, bottom: y + frame.height / atlas.cell * size * scale };
}
function assertSeparated() {
  var visible = world.children.filter(function (el) { return !el.hidden && el.style.transform && el.getAttribute('data-cat-id') && !el.getAttribute('data-tree'); });
  visible.forEach(function (el, index) {
    var a = body(el);
    visible.slice(index + 1).forEach(function (other) {
      var b = body(other);
      var overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) *
        Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
      var smaller = Math.min((a.right - a.x) * (a.bottom - a.y), (b.right - b.x) * (b.bottom - b.y));
      assert.ok(overlap / smaller <= 0.25,
        el.getAttribute('data-cat-id') + ' overlaps too much with ' + other.getAttribute('data-cat-id') + ' at ' + now + ': ' + overlap / smaller);
    });
  });
}
room.enter(); room.layout(1875); readyImages(); room.start();
assert.strictEqual(world.children.length, initialCount);
var cool = actor('cool');
assert.strictEqual(cool.hidden, false);
assert.strictEqual(cool.children[1].children[0].style.backgroundSize, '400% 600%', 'sunglasses cat uses its six-row atlas');
assert.strictEqual(room.perform('cool', 'special'), false);
assert.strictEqual(room.perform('coder', 'walk'), false);
room.perform('cool', 'walk');
var start = cool.style.transform, seen = new Set();
for (var i = 0; i < 160; i++) { tick(); seen.add(pose(cool)); }
assert.notStrictEqual(cool.style.transform, start);
assert.ok(seen.size >= 8, 'walk must change real sprite frames while moving');
for (i = 0; i < 1200; i++) { tick(); assert.notStrictEqual(cool.getAttribute('data-state'), 'special'); }
room.perform('cool', 'sleep'); cool.click();
assert.strictEqual(cool.getAttribute('data-state'), 'wake');
assert.strictEqual(room.contains(cool.children[1].children[0]), true);
assert.strictEqual(room.contains(new Element('span')), false);
room.leave(); start = cool.style.transform;
for (i = 0; i < 30; i++) tick();
assert.strictEqual(cool.style.transform, start); assert.strictEqual(scheduled.size, 0);

collection.recordRun('cats', [49,29], 'near'); room.enter(); room.layout(1875); room.start();
assert.strictEqual(world.children.length, initialCount + 1);
assert.strictEqual(room.perform('donut', 'special'), false);
collection.recordRun('cats', [21,1], 'unlock'); room.enter(); room.layout(1875); readyImages(); room.start();
assertSeparated();
assert.strictEqual(world.children.length, initialCount + 2);
var donut = actor('donut');
assert.strictEqual(donut.children[1].children[0].style.backgroundSize, '400% 400%', 'collection cats keep their four-row atlas');
assert.strictEqual(room.perform('donut', 'special'), true);
assert.strictEqual(donut.getAttribute('data-state'), 'special');
assert.strictEqual(room.perform('coder', 'special'), false);
assert.strictEqual(room.perform('coder', 'sleep'), true);
findButton.click(); assert.ok(isFinite(camera));

collection.recordRun('cats', [0,20,50,50,50,50,50,50,450], 'all');
if (allSeries) collection.recordRun('tortie', Array(9).fill(100), 'all-tortie');
room.enter(); room.layout(1875); readyImages(); room.start();
assertSeparated();
assert.strictEqual(world.children.length, residentCount);
catalog.forEach(function (cat) { assert.strictEqual(room.perform(cat.id, 'special'), true); assert.strictEqual(actor(cat.id).getAttribute('data-state'), 'special'); });
for (i = 0; i < 360; i++) tick();
assert.ok(world.children.every(function (el) { return el.hidden === false && !/NaN|Infinity/.test(el.style.transform); }));
var fullSize = parseFloat(donut.style.width);
room.layout(937.5, 667, 1, 0);
assertSeparated();
if (!allSeries) assert.strictEqual(parseFloat(donut.style.width), fullSize, 'cats keep their size when only room length is halved');
else assert.ok(parseFloat(donut.style.width) >= 70, 'room cats remain readable in a shortened room');
catalog.forEach(function (cat) { room.perform(cat.id, 'walk'); });
for (i = 0; i < 180; i++) tick();
assert.ok(world.children.every(function (el) { return !/NaN|Infinity/.test(el.style.transform); }));
room.focus('donut'); assert.ok(isFinite(camera), 'finding cats works in half-length world');

// All room cats share a shortened room for two minutes, including long frames.
// Sleeping cats remain obstacles; no actor may jump when avoiding a neighbour.
var movedCats = new Set(), waiting = false;
var movingFrames = world.children.map(function () { return 0; });
var travel = world.children.map(function () { return 0; });
var extents = world.children.map(function () { return { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }; });
room.perform('donut', 'sleep');
var sleepingPosition = donut.style.transform;
for (i = 0; i < 7200; i++) {
  var before = world.children.map(function (el) {
    var match = el.style.transform.match(/translate3d\(([-\d.]+)px,([-\d.]+)px/);
    return { x: Number(match[1]), y: Number(match[2]) };
  });
  tick(i % 113 === 0 ? 250 : 1000 / 60);
  world.children.forEach(function (el, index) {
    var match = el.style.transform.match(/translate3d\(([-\d.]+)px,([-\d.]+)px/);
    var dx = Number(match[1]) - before[index].x, dy = Number(match[2]) - before[index].y;
    var extent = extents[index];
    extent.left = Math.min(extent.left, Number(match[1])); extent.right = Math.max(extent.right, Number(match[1]));
    extent.top = Math.min(extent.top, Number(match[2])); extent.bottom = Math.max(extent.bottom, Number(match[2]));
    assert.ok(Math.sqrt(dx * dx + dy * dy) <= viewport.clientHeight * 0.065 * 0.05 + 0.02, 'avoiding cats never teleports them');
    if (Math.abs(dx) + Math.abs(dy) > 0.01) {
      movedCats.add(el.getAttribute('data-cat-id'));
      movingFrames[index]++;
      travel[index] += Math.sqrt(dx * dx + dy * dy);
    }
    if (el.getAttribute('data-state') === 'idle') waiting = true;
  });
  if (i < 240) assert.strictEqual(donut.style.transform, sleepingPosition, 'walkers do not push sleeping cats');
}
assert.strictEqual(movedCats.size, residentCount, 'every cat can still walk in a crowded room');
assert.ok(waiting, 'crowded cats can stop and wait for a clear route');
console.log('Crowded-room movement:', JSON.stringify(movingFrames.map(function (frames, index) {
  return { cat: world.children[index].getAttribute('data-cat-id'), movingPercent: Math.round(frames / 7200 * 100), distance: Math.round(travel[index]) };
})));
movingFrames.forEach(function (frames, index) {
  assert.ok(frames / 7200 >= 0.35, 'every cat should visibly walk for at least 35% of the crowded simulation');
  var extent = extents[index], span = Math.max(extent.right - extent.left, extent.bottom - extent.top);
  assert.ok(span >= parseFloat(world.children[index].style.width), 'walking must explore at least one body length rather than jitter in place');
});
assert.ok(movingFrames.reduce(function (sum, frames) { return sum + frames; }, 0) / (7200 * residentCount) >= 0.5, 'at least half of cat time should be spent moving');

// Repacking on smaller screens must preserve all nine residents and safe spacing.
[[320,480], [375,568], [390,844], [480,360], [375,667]].forEach(function (dimensions) {
  viewport.clientWidth = dimensions[0]; viewport.clientHeight = dimensions[1];
  room.layout(Math.max(viewport.clientWidth, viewport.clientHeight * 2103 / 748 / 2), viewport.clientHeight, 1, 0);
  assertSeparated();
  catalog.forEach(function (cat) { room.perform(cat.id, 'walk'); });
  for (var frame = 0; frame < 180; frame++) tick();
  assert.strictEqual(world.children.filter(function (el) { return !el.hidden; }).length, residentCount);
});
document.hidden = true; document.events.visibilitychange();
assert.strictEqual(scheduled.size, 0);
var paused = world.children.map(function (el) { return el.style.transform; }); now += 600000;
document.hidden = false; document.events.visibilitychange(); tick();
assert.deepStrictEqual(world.children.map(function (el) { return el.style.transform; }), paused, 'background time cannot teleport cats');
media.matches = true; media.listener(); assert.strictEqual(scheduled.size, 0);
assert.ok(world.children.every(function (el) { return el.getAttribute('data-state') === 'idle'; }));
room.leave();

// Collection cards expose only the actions unlocked by the same model.
['collection-list','collection-summary','room-collection-count','collection-notice','collection-series','collection-scroll','collection-edition','collection-note','collection-play-label'].forEach(function (id) { ids[id] = new Element('div'); ids[id].id = id; });
vm.runInContext(fs.readFileSync(require.resolve('../app/js/series-tabs.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(require.resolve('../app/js/collection-view.js'), 'utf8'), context);
window.TurtleCollectionView.render();
assert.strictEqual(ids['collection-list'].children.length, 9);
assert.ok(ids['collection-list'].children.every(function (card) { return card.children[1].children.every(function (button) { return button.disabled === false; }); }));
assert.ok(ids['collection-summary'].textContent.indexOf('9 / 9') >= 0);
console.log('PASS: ' + residentCount + ' cats actively roam with limited edge overlap; safe spawns/resizes, sleeping obstacles, no teleporting or jitter, distinct gait, unlocks, pause/resume and collection cards.');

var Travel = require('../app/js/cat-travel.js'), wallTime = 1000000;
var initialTravel = { version: 1, cats: {}, furniture: { leaf: 1, cloud: 1, mushroom: 1, ladder: 1, nest: 1 } };
var travelStore = { getItem: function () { return JSON.stringify(initialTravel); }, setItem: function (key, value) { initialTravel = JSON.parse(value); } };
var trips = Travel.create({ collection: collection, storage: travelStore, now: function () { return wallTime; }, random: seededMath.random });
vm.runInContext(fs.readFileSync(require.resolve('../app/js/room-furniture.js'), 'utf8'), context);
world = new Element('div'); media.matches = false;
viewport.clientWidth = 375; viewport.clientHeight = 667;
room = window.TurtleRoomResidents.create({ world: world, viewport: viewport, footer: { offsetHeight: 210 }, status: status,
  findButton: findButton, background: { complete: true, naturalWidth: 2103 }, moveTo: function (value) { camera = value; }, travel: trips });
room.enter(); room.layout(937.5, 667, 1, 0); readyImages(); room.start();
function cats() { return world.children.filter(function (element) { return !!element.getAttribute('data-cat-id'); }); }
function trees() { return world.children.filter(function (element) { return !!element.getAttribute('data-tree-id'); }); }
assert.strictEqual(trees().length, 5);
assert.strictEqual(cats().length, residentCount);
var jumped = new Set(), landed = new Set(), perched = new Set(), occupiedBefore = {};
for (var furnitureFrame = 0; furnitureFrame < 7200 * Math.ceil(residentCount / 9); furnitureFrame++) {
  tick();
  var occupants = {};
  cats().forEach(function (element) {
    var catId = element.getAttribute('data-cat-id'), treeId = element.getAttribute('data-tree');
    assert.ok(!/NaN|Infinity/.test(element.style.transform + element.children[1].style.transform));
    if (treeId) {
      assert.ok(!occupants[treeId], 'each tree can be reserved by only one cat'); occupants[treeId] = catId;
      if (element.getAttribute('data-state') === 'jump') jumped.add(catId);
      if (element.getAttribute('data-state') === 'sleep') perched.add(catId);
    } else if (occupiedBefore[catId]) landed.add(catId);
    occupiedBefore[catId] = treeId;
  });
  trees().forEach(function (element) {
    assert.strictEqual(element.getAttribute('data-occupied'), occupants[element.getAttribute('data-tree-id')] || null, 'reservation matches actual cat');
  });
}
assert.strictEqual(jumped.size, residentCount, 'all cats can jump without the special-action unlock');
assert.strictEqual(perched.size, residentCount, 'all cats reach and use a platform');
assert.strictEqual(landed.size, residentCount, 'all cats jump down and safely return to the floor');
assert.ok(room.perform('donut', 'sleep'));
room.arrange(true);
assert.strictEqual(actor('donut').getAttribute('data-state'), 'sleep', 'arranging does not wake a sleeping cat');
assert.strictEqual(scheduled.size, 0, 'arranging pauses cat animation');
assert.ok(trees().every(function (element) { return !element.getAttribute('data-occupied'); }), 'cats leave every tree before furniture can move');
assert.ok(cats().every(function (element) { return element.disabled; }));
var arrangingPositions = cats().map(function (element) { return element.style.transform; });
for (furnitureFrame = 0; furnitureFrame < 30; furnitureFrame++) tick();
assert.deepStrictEqual(cats().map(function (element) { return element.style.transform; }), arrangingPositions);
assert.strictEqual(room.perform('donut', 'jump'), false);
var movedTree = room.furniture.list()[0], originalTreeX = movedTree.x, originalTreeY = movedTree.y;
assert.ok(room.furniture.preview(movedTree.id, movedTree.x * 937.5 + 24, movedTree.y * 667 - 40));
assert.ok(room.furniture.finish(movedTree.id, true)); room.refresh();
assert.ok(movedTree.x > originalTreeX && movedTree.y < originalTreeY);
assert.strictEqual(scheduled.size, 0, 'travel refresh cannot restart cats during arrangement');
room.arrange(false);
assert.strictEqual(actor('donut').getAttribute('data-state'), 'sleep', 'finishing arrangement preserves sleep');
assert.ok(scheduled.size > 0);
assert.ok(cats().every(function (element) { return !element.disabled; }));
assert.ok(room.furniture.reserve({ cat: { id: 'placement-check' }, x: movedTree.x, y: movedTree.y }, 937.5, 667, 116), 'moved furniture uses its new position for nearby cat interaction');
room.furniture.release(movedTree);
wallTime += 90001; trips.tick(); room.refresh();
assert.strictEqual(cats().filter(function (element) { return !element.hidden; }).length, 3);
var travellers = trips.list().filter(function (entry) { return entry.travelling; });
travellers.forEach(function (entry) {
  assert.strictEqual(room.focus(entry.cat.id), false);
  assert.strictEqual(room.perform(entry.cat.id, 'walk'), false);
  assert.strictEqual(actor(entry.cat.id).getAttribute('data-tree'), null, 'departure releases the tree');
});
var recalledId = travellers[0].cat.id;
assert.ok(trips.recall(recalledId)); room.refresh();
assert.strictEqual(actor(recalledId).hidden, false);
assert.strictEqual(cats().filter(function (element) { return !element.hidden; }).length, 4);
assertSeparated();
room.leave(); var beforeOffline = cats().map(function (element) { return element.style.transform; });
wallTime += 600000; trips.tick(); room.refresh();
assert.ok(cats().every(function (element) { return element.hidden; }), 'returning cats remain hidden outside the room');
room.enter(); room.layout(937.5, 667, 1, 0); room.start();
assert.ok(cats().filter(function (element) { return !element.hidden; }).length >= 3);
for (furnitureFrame = 0; furnitureFrame < 1800; furnitureFrame++) tick();
viewport.clientWidth = 320; viewport.clientHeight = 480; room.layout(675, 480, 1, 0);
assertSeparated();
assert.ok(trees().every(function (element) { return !element.getAttribute('data-occupied'); }), 'resizing releases every platform');
for (furnitureFrame = 0; furnitureFrame < 600; furnitureFrame++) tick();
media.matches = true; media.listener();
assert.strictEqual(scheduled.size, 0);
assert.ok(trees().every(function (element) { return !element.getAttribute('data-occupied'); }), 'reduced motion leaves no stuck reservations');
assertSeparated(); room.leave();
console.log('PASS: all ' + residentCount + ' cats automatically jump up/down five exclusive trees; safe landings, travelling visibility, recall, offline returns, resize and reduced motion.');
