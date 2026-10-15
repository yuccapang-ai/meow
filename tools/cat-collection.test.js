'use strict';
var assert = require('assert');
var Collection = require('../app/js/cat-collection.js');
var Engine = require('../app/js/engine.js');
var values = {}, storage = { getItem: function (key) { return values[key] || null; }, setItem: function (key, value) { values[key] = value; } };
var collection = Collection.create(storage);
assert.strictEqual(collection.list().length, 9);
assert.deepStrictEqual(collection.list().filter(function (p) { return p.home; }).map(function (p) { return p.cat.id; }), ['donut']);
assert.strictEqual(collection.progress('donut').special, false);
assert.strictEqual(collection.progress('missing'), null);

collection.recordRun('cats', [29,29,0,0,0,0,0,0,0], 'first');
assert.strictEqual(collection.progress('coder').home, false);
var milestones = collection.recordRun('cats', [1,1,0,0,0,0,0,0,0], 'second');
assert.deepStrictEqual(milestones.map(function (m) { return m.id + ':' + m.kind; }), ['coder:home']);
assert.strictEqual(collection.progress('coder').home, true);
assert.strictEqual(collection.progress('coder').special, false);
collection.recordRun('cats', [19,19], 'third');
assert.strictEqual(collection.progress('donut').special, false);
assert.strictEqual(collection.progress('coder').special, false);
milestones = collection.recordRun('cats', [1,1], 'fourth');
assert.deepStrictEqual(milestones.map(function (m) { return m.id + ':' + m.kind; }), ['donut:special','coder:special']);
assert.strictEqual(collection.progress('donut').count, 50);
collection.recordRun('cats', [100,100], 'fourth');
collection.recordRun('cats', [100,100], 'replay', true);
assert.strictEqual(collection.progress('donut').count, 50, 'duplicate settlement and replays cannot add cats');

// Different skins share color indices but represent different cats.
collection.recordRun('pengci', [100,100,100,100,100,100,100,100,100], 'other-skin');
assert.strictEqual(collection.progress('music').count, 0);
assert.strictEqual(collection.progress('donut').count, 50);
var restored = Collection.create(storage);
assert.strictEqual(restored.progress('coder').special, true);
assert.strictEqual(restored.progress('donut').count, 50);
assert.strictEqual(restored.progress('music').home, false);

// All nine amounts from the engine are added, including cats remaining on board.
var run = Engine.startRun({}, Engine.seededRandom(17));
run.stash = [1,2,3,4,5,6,7,8,9]; run.board = [0,1,2,3,4,5,6,7,8];
var tally = Engine.tally(run), before = restored.list().map(function (p) { return p.count; });
restored.recordRun('cats', tally.counts, 'engine-result');
restored.list().forEach(function (p, i) { assert.strictEqual(p.count - before[i], tally.counts[i]); });
assert.strictEqual(restored.list().reduce(function (sum, p, i) { return sum + p.count - before[i]; }, 0), tally.total);

var jump = Collection.create(null);
milestones = jump.recordRun('cats', [0,0,100], 'jump');
assert.deepStrictEqual(milestones.map(function (m) { return m.kind; }), ['home','special']);
assert.strictEqual(jump.progress('music').special, true, 'storage unavailable still keeps session progress');
assert.doesNotThrow(function () { jump.recordRun('constructor', [5], 'weird-skin'); });
var corrupt = Collection.create({ getItem: function () { return '{bad json'; } });
assert.strictEqual(corrupt.progress('donut').home, true);
var invalid = Collection.create({ getItem: function () { return JSON.stringify({ version: 1, counts: { cats: [-5,'100',null,1e20,50.9] } }); } });
assert.deepStrictEqual(invalid.list().slice(0,5).map(function (p) { return p.count; }), [0,0,0,1000000000,50]);
var oldSave = Collection.create({ getItem: function () { return JSON.stringify({ version: 1, counts: { cats: [50,30,49,50] } }); } });
assert.strictEqual(oldSave.progress('coder').home, true);
assert.strictEqual(oldSave.progress('coder').special, false);
assert.strictEqual(oldSave.progress('music').special, false);
assert.strictEqual(oldSave.progress('coffee').special, true);
console.log('PASS: individual 30/50 unlocks, existing-save compatibility, starter cat, nine engine counts, separate skins, persistence, replay and duplicate guards.');
