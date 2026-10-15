'use strict';
var assert = require('assert');
var Collection = require('../app/js/cat-collection.js'), Travel = require('../app/js/cat-travel.js');

var now = 1000000, values = {};
var storage = {
  getItem: function (key) { return values[key] || null; },
  setItem: function (key, value) { values[key] = value; }
};
var collection = Collection.create(null);
var travel = Travel.create({
  collection: collection,
  storage: storage,
  now: function () { return now; },
  random: function () { return 0.5; }
});

function cat(id) { return travel.list().filter(function (entry) { return entry.cat.id === id; })[0]; }

assert.strictEqual(cat('donut').energy, 15);
now += 60000; travel.tick();
assert.strictEqual(cat('donut').energy, 14, 'home cats lose one energy per minute');
for (var minute = 0; minute < 9; minute++) { now += 60000; travel.tick(); }
assert.strictEqual(cat('donut').energy, 5);
now += 60000; travel.tick();
assert.strictEqual(cat('donut').energy, 4);
assert.strictEqual(cat('donut').sleeping, true, 'energy below five forces sleep');
assert.strictEqual(travel.wake('donut'), false, 'cats below five energy cannot wake');
now += 90000; travel.tick();
assert.strictEqual(cat('donut').energy, 7);
assert.strictEqual(cat('donut').sleeping, true, 'sleep persists until explicitly woken');
assert.strictEqual(travel.wake('donut'), true, 'cats above five energy can wake');
assert.strictEqual(cat('donut').sleeping, false);

collection.recordRun('cats', [0,30,30,30,30,30,30,30,30], 'unlock');
collection.recordRun('cats', [0,100,100,100,100,100,100,100,100], 'home-slots');
travel.tick();
now += 90001;
var departures = travel.tick();
assert.strictEqual(departures.length, 6);
var trip = travel.list().filter(function (entry) { return entry.travelling; })[0];
var tripEnergy = trip.energy;
now += 30000; travel.tick();
assert.strictEqual(tripEnergy - cat(trip.cat.id).energy, 1, 'travelling cats lose two energy per minute');
assert.strictEqual(travel.list().filter(function (entry) { return entry.travelling; }).length, 6);

var reloaded = Travel.create({
  collection: collection,
  storage: storage,
  now: function () { return now; },
  random: function () { return 0.5; }
});
assert.strictEqual(cat(trip.cat.id).energy, reloaded.list().filter(function (entry) { return entry.cat.id === trip.cat.id; })[0].energy);
console.log('PASS: default energy, home/travel drain, forced sleep, recovery, wake threshold and reload persistence.');
