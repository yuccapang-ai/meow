'use strict';
var assert = require('assert');
var Collection = require('../app/js/cat-collection.js'), Travel = require('../app/js/cat-travel.js');
var now = 1000000, seed = 48921;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
function memory(initial) {
  var values = initial || {};
  return { getItem: function (key) { return values[key] || null; }, setItem: function (key, value) { values[key] = value; } };
}
var collection = Collection.create(null), storage = memory();
function create(randomSource) { return Travel.create({ storage: storage, collection: collection, now: function () { return now; }, random: randomSource || random }); }
var travel = create();
for (var step = 0; step < 10; step++) { now += 100000; travel.tick(); assert.strictEqual(travel.list().filter(function (entry) { return entry.travelling; }).length, 0); }
collection.recordRun('cats', [0,30,30], 'three');
travel.tick(); now += 100000; travel.tick();
assert.strictEqual(travel.list().filter(function (entry) { return entry.travelling; }).length, 0, 'three residents must all stay home');
collection.recordRun('cats', [0,0,0,30,30,30,30,30,630], 'nine');
travel.tick(); now += 90001;
var departures = travel.tick();
assert.strictEqual(departures.length, 7);
var trips = travel.list().filter(function (entry) { return entry.travelling; });
assert.strictEqual(trips.length, 7);
trips.forEach(function (entry) { assert.ok(entry.endsAt - entry.startedAt >= 60000 && entry.endsAt - entry.startedAt <= 300000); });
assert.ok(new Set(trips.map(function (entry) { return entry.endsAt; })).size > 1, 'cats independently draw trip duration');
var reloaded = create();
assert.deepStrictEqual(reloaded.list(), travel.list(), 'reload keeps the same travel deadlines');
var firstId = trips[0].cat.id;
assert.strictEqual(travel.recall('missing'), null);
var recalled = travel.recall(firstId);
assert.ok(recalled.recalled && recalled.gifts.length === 0, 'mid-trip recall grants no furniture');
assert.strictEqual(recalled.catnip, 0, 'mid-trip recall grants no catnip');
assert.strictEqual(travel.catnip(), 0);
assert.strictEqual(travel.isAway(firstId), false);
assert.strictEqual(travel.recall(firstId), null, 'double recall cannot grant another reward');
var before = travel.furniture().reduce(function (sum, entry) { return sum + entry.count; }, 0);
var savedTripCount = travel.list().filter(function (entry) { return entry.travelling; }).length;
now += 86400000;
travel = create();
var offline = travel.tick().filter(function (entry) { return entry.type === 'return'; });
assert.strictEqual(offline.length, savedTripCount, 'offline trips finish once without replaying a day of travel');
var after = travel.furniture().reduce(function (sum, entry) { return sum + entry.count; }, 0);
assert.ok(after >= before + savedTripCount && after <= before + savedTripCount * 2);
assert.ok(travel.catnip() >= recalled.catnip + savedTripCount * 10 && travel.catnip() <= recalled.catnip + savedTripCount * 50);
assert.strictEqual(travel.tick().filter(function (entry) { return entry.type === 'return'; }).length, 0);
assert.deepStrictEqual(create().furniture(), travel.furniture(), 'furniture collection survives reload');
assert.strictEqual(create().catnip(), travel.catnip(), 'catnip survives reload');
var seen = new Set();
for (step = 0; step < 8640; step++) {
  now += 10000;
  travel.tick().forEach(function (event) { if (event.type === 'depart') seen.add(event.id); });
  travel.list().forEach(function (entry) {
    if (entry.sleeping && entry.energy > Travel.sleepThreshold) assert.strictEqual(travel.wake(entry.cat.id), true);
  });
  var home = travel.list().filter(function (entry) { return entry.unlocked && !entry.travelling; });
  assert.ok(home.length >= 3, 'at least three cats remain home across a full simulated day');
}
assert.strictEqual(seen.size, 10, 'every unlocked cat across both series gets a turn to travel');
assert.strictEqual(travel.furniture().filter(function (entry) { return entry.count; }).length, 5);
assert.ok(travel.journal().length <= 8, 'journal stays bounded');
var broken = {}; broken[Travel.storageKey] = '{broken'; storage = memory(broken);
assert.doesNotThrow(function () { create().tick(); });
storage = { getItem: function () { throw new Error('blocked'); }, setItem: function () { throw new Error('quota'); } };
assert.doesNotThrow(function () { var session = create(); now += 90001; session.tick(); session.recall(session.list().filter(function (entry) { return entry.travelling; })[0].cat.id); });
[0, 0.99999999].forEach(function (edge) {
  storage = memory(); var boundary = create(function () { return edge; }); now += 90001; boundary.tick();
  boundary.list().filter(function (entry) { return entry.travelling; }).forEach(function (entry) {
    assert.strictEqual(entry.endsAt - entry.startedAt, edge ? 300000 : 60000);
  });
});
var corrupt = { version: 1, cats: {}, furniture: { leaf: -2, cloud: '10', nest: 1e20 }, catnip: -5, journal: [{ text: '<script>hello</script>', time: now }] };
Collection.catalog.forEach(function (cat) { corrupt.cats[cat.id] = { startedAt: now, endsAt: now + 120000, nextAt: now }; });
var corruptSave = {}; corruptSave[Travel.storageKey] = JSON.stringify(corrupt); storage = memory(corruptSave);
travel = create();
assert.ok(travel.list().filter(function (entry) { return !entry.travelling; }).length >= 3, 'invalid all-away save is repaired');
assert.ok(travel.furniture().every(function (entry) { return Number.isInteger(entry.count) && entry.count >= 0 && entry.count <= 1000000; }));
var invalidCatnip = { version: 1, cats: {}, furniture: {}, catnip: -5 };
Collection.catalog.forEach(function (cat) { invalidCatnip.cats[cat.id] = { startedAt: 0, endsAt: 0, nextAt: now }; });
var invalidCatnipSave = {}; invalidCatnipSave[Travel.storageKey] = JSON.stringify(invalidCatnip); storage = memory(invalidCatnipSave);
assert.strictEqual(create().catnip(), 0, 'invalid catnip save is ignored');
console.log('PASS: independent 1–5 minute travel, three stay home, every cat travels, recall, exactly-once offline rewards, five furniture types, reload and corrupt/unavailable storage.');
var fullCollection = Collection.create(null);
Collection.series.forEach(function (series) { fullCollection.recordRun(series.id, Array(9).fill(100), 'full-' + series.id); });
var fullTravel = Travel.create({ collection: fullCollection, storage: null, now: function () { return now; }, random: random });
now += 90001; fullTravel.tick();
assert.strictEqual(fullTravel.list().filter(function (entry) { return entry.travelling; }).length, 15);
assert.strictEqual(fullTravel.list().filter(function (entry) { return entry.unlocked && !entry.travelling; }).length, 3);
assert.ok(fullTravel.list().some(function (entry) { return entry.cat.skin === 'tortie' && entry.travelling; }));
console.log('PASS: eighteen residents share the global three-at-home limit.');
