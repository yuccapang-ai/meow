'use strict';
var assert = require('assert');
var Actions = require('../app/js/cat-actions.js');

// A stopped cat must not mime walking just because time passes.
var still = Actions.create();
still.play('walk');
still.update(30, 0);
assert.strictEqual(still.frame(), 0);

// Real movement exposes all eight different limb poses and loops the gait.
var gait = Actions.create(), seen = new Set();
gait.play('walk');
for (var i = 0; i < 80; i++) { gait.update(0.01, 0.45 / 80); seen.add(gait.frame()); }
assert.strictEqual(seen.size, 8);
assert.ok(gait.frame() === 0 || gait.frame() === 7); // floating point at the exact cycle boundary

// Frame selection depends on distance, independent of refresh frequency.
var fast = Actions.create(), slow = Actions.create();
fast.play('walk'); slow.play('walk');
for (i = 0; i < 60; i++) fast.update(1 / 60, 0.32 / 60);
for (i = 0; i < 10; i++) slow.update(0.1, 0.32 / 10);
assert.strictEqual(fast.frame(), slow.frame());

// Rest actions finish on a valid pose and stay there until explicitly changed.
['sit', 'groom', 'stretch', 'sleep', 'wake', 'stand'].forEach(function (name) {
  var action = Actions.create();
  action.play(name); action.update(60, 0);
  assert.strictEqual(action.finished(), true, name);
  var frame = action.frame();
  assert.ok(frame >= 8 && frame < 24, name);
  action.update(60, 0); assert.strictEqual(action.frame(), frame, name);
  action.play('walk'); assert.strictEqual(action.finished(), false, name);
});
var sleeper = Actions.create();
sleeper.play('sleep'); sleeper.update(60, 0); sleeper.play('wake'); sleeper.update(60, 0);
assert.strictEqual(sleeper.frame(), 8); // wake up finishes standing, ready to walk
console.log('PASS: eight-frame distance-driven gait, refresh-rate independence, action completion and wake-up.');

['idle','walk','sleep','wake','special'].forEach(function (name) {
  var action = Actions.create({ profile: 'collection', specialLabel: '吃甜甜圈' });
  action.play(name);
  var frames = new Set();
  for (var t = 0; t < 1200; t++) {
    action.update(0.01, name === 'walk' ? 0.003 : 0);
    assert.ok(action.frame() >= 0 && action.frame() < 16);
    frames.add(action.frame());
  }
  if (name === 'special') { assert.strictEqual(frames.size, 4); assert.strictEqual(action.label(), '吃甜甜圈'); }
  if (name === 'sleep') { assert.strictEqual(frames.size, 4); assert.strictEqual(action.finished(), true); }
  if (name === 'walk') assert.strictEqual(frames.size, 8);
});
console.log('PASS: collection atlas uses only its 16 frames and exposes all three animation groups.');
