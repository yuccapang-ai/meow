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
Object.defineProperty(Element.prototype, 'textContent', { get: function () { return this.text || ''; }, set: function (s) { this.text = s; this.children = []; } });
var ids = {}, document = { hidden: false, events: {}, createElement: function (tag) { return new Element(tag); },
  addEventListener: function (name, cb) { this.events[name] = cb; }, getElementById: function (id) { return ids[id]; } };
var images = [], scheduled = new Map(), sequence = 0, now = 0;
function Image() { images.push(this); }
function readyImages() { images.splice(0).forEach(function (image) { image.onload(); }); }
var media = { matches: false, addListener: function (cb) { this.listener = cb; } };
var collection = Collection.create(null), window = { TurtleCatActions: Actions, TurtleCatCollection: { get: function () { return collection; } }, matchMedia: function () { return media; } };
var context = { window: window, document: document, Image: Image, Math: Math,
  requestAnimationFrame: function (cb) { var id = ++sequence; scheduled.set(id, cb); return id; },
  cancelAnimationFrame: function (id) { scheduled.delete(id); } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../app/js/room-residents.js'), 'utf8'), context);
var world = new Element('div'), viewport = { clientWidth: 375, clientHeight: 667, scrollLeft: 0 };
var status = new Element('p'), findButton = new Element('button'), camera = 0;
var room = window.TurtleRoomResidents.create({ world: world, viewport: viewport, footer: { offsetHeight: 210 }, status: status,
  findButton: findButton, background: { complete: true, naturalWidth: 2103 }, moveTo: function (x) { camera = x; } });
function tick() { now += 1000 / 60; var callbacks = Array.from(scheduled.values()); scheduled.clear(); callbacks.forEach(function (cb) { cb(now); }); }
function actor(id) { return world.children.filter(function (el) { return el.getAttribute('data-cat-id') === id; })[0]; }
function pose(el) { return el.children[1].children[0].getAttribute('data-frame'); }
room.enter(); room.layout(1875); readyImages(); room.start();
assert.strictEqual(world.children.length, 1);
var donut = actor('donut');
assert.strictEqual(donut.hidden, false);
assert.strictEqual(room.perform('donut', 'special'), false);
assert.strictEqual(room.perform('coder', 'walk'), false);
room.perform('donut', 'walk');
var start = donut.style.transform, seen = new Set();
for (var i = 0; i < 160; i++) { tick(); seen.add(pose(donut)); }
assert.notStrictEqual(donut.style.transform, start);
assert.ok(seen.size >= 8, 'walk must change real sprite frames while moving');
for (i = 0; i < 1200; i++) { tick(); assert.notStrictEqual(donut.getAttribute('data-state'), 'special'); }
room.perform('donut', 'sleep'); donut.click();
assert.strictEqual(donut.getAttribute('data-state'), 'wake');
assert.strictEqual(room.contains(donut.children[1].children[0]), true);
assert.strictEqual(room.contains(new Element('span')), false);
room.leave(); start = donut.style.transform;
for (i = 0; i < 30; i++) tick();
assert.strictEqual(donut.style.transform, start); assert.strictEqual(scheduled.size, 0);

collection.recordRun('cats', [49,29], 'near'); room.enter(); room.layout(1875); room.start();
assert.strictEqual(world.children.length, 1);
assert.strictEqual(room.perform('donut', 'special'), false);
collection.recordRun('cats', [1,1], 'unlock'); room.enter(); room.layout(1875); readyImages(); room.start();
assert.strictEqual(world.children.length, 2);
assert.strictEqual(room.perform('donut', 'special'), true);
assert.strictEqual(donut.getAttribute('data-state'), 'special');
assert.strictEqual(room.perform('coder', 'special'), false);
assert.strictEqual(room.perform('coder', 'sleep'), true);
findButton.click(); assert.ok(isFinite(camera));

collection.recordRun('cats', [0,20,50,50,50,50,50,50,50], 'all');
room.enter(); room.layout(1875); readyImages(); room.start();
assert.strictEqual(world.children.length, 9);
Collection.catalog.forEach(function (cat) { assert.strictEqual(room.perform(cat.id, 'special'), true); assert.strictEqual(actor(cat.id).getAttribute('data-state'), 'special'); });
for (i = 0; i < 360; i++) tick();
assert.ok(world.children.every(function (el) { return el.hidden === false && !/NaN|Infinity/.test(el.style.transform); }));
var fullSize = parseFloat(donut.style.width);
room.layout(937.5, 667, 1, 0);
assert.strictEqual(parseFloat(donut.style.width), fullSize, 'cats keep their size when only room length is halved');
Collection.catalog.forEach(function (cat) { room.perform(cat.id, 'walk'); });
for (i = 0; i < 180; i++) tick();
assert.ok(world.children.every(function (el) { return !/NaN|Infinity/.test(el.style.transform); }));
room.focus('donut'); assert.ok(isFinite(camera), 'finding cats works in half-length world');
document.hidden = true; document.events.visibilitychange();
assert.strictEqual(scheduled.size, 0);
var paused = world.children.map(function (el) { return el.style.transform; }); now += 600000;
document.hidden = false; document.events.visibilitychange(); tick();
assert.deepStrictEqual(world.children.map(function (el) { return el.style.transform; }), paused, 'background time cannot teleport cats');
media.matches = true; media.listener(); assert.strictEqual(scheduled.size, 0);
assert.ok(world.children.every(function (el) { return el.getAttribute('data-state') === 'idle'; }));
room.leave();

// Collection cards expose only the actions unlocked by the same model.
['collection-list','collection-summary','room-collection-count','collection-notice'].forEach(function (id) { ids[id] = new Element('div'); });
vm.runInContext(fs.readFileSync(require.resolve('../app/js/collection-view.js'), 'utf8'), context);
window.TurtleCollectionView.render();
assert.strictEqual(ids['collection-list'].children.length, 9);
assert.ok(ids['collection-list'].children.every(function (card) { return card.children[1].children.every(function (button) { return button.disabled === false; }); }));
assert.ok(ids['collection-summary'].textContent.indexOf('9 / 9') >= 0);
console.log('PASS: default donut, locked actions, all nine actors, half-length world, distinct gait, wake, find, pause/resume, reduced motion and collection cards.');
