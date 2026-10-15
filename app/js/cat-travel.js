(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TurtleCatTravel = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var KEY = 'ttddp.catTravel.v1';
  var MAX_ENERGY = 15, SLEEP_THRESHOLD = 5;
  var TRAVEL_DRAIN = 2, HOME_DRAIN = 1, SLEEP_RECOVERY = 2;
  var furniture = [
    { id: 'leaf', name: '叶叶观景台', column: 0, row: 0 },
    { id: 'cloud', name: '云朵软绵架', column: 1, row: 0 },
    { id: 'mushroom', name: '蘑菇小屋架', column: 2, row: 0 },
    { id: 'ladder', name: '木木阶梯架', column: 0, row: 1 },
    { id: 'nest', name: '圆圆树洞架', column: 1, row: 1 }
  ];
  var MAX_CATNIP = 1000000000;
  function create(options) {
    var collection = options.collection, storage = options.storage;
    var clock = options.now || Date.now, random = options.random || Math.random;
    var data = { version: 1, cats: {}, furniture: {}, positions: {}, journal: [], catnip: 0 }, savedText = '';
    function between(minimum, maximum) { return minimum + Math.floor(random() * (maximum - minimum + 1)); }
    function nextDeparture(now) { return now + between(20000, 90000); }
    function validTime(value) { return typeof value === 'number' && isFinite(value) && value > 0; }
    function validWakeEnergy(value) { return typeof value === 'number' && isFinite(value) && value >= 10 && value <= MAX_ENERGY; }
    function validPosition(position) {
      return position && typeof position.x === 'number' && isFinite(position.x) && position.x >= 0 && position.x <= 1 &&
        typeof position.y === 'number' && isFinite(position.y) && position.y >= 0 && position.y <= 1;
    }
    try {
      var saved = JSON.parse(storage.getItem(KEY));
      if (saved && saved.version === 1) {
        var loadedAt = clock();
        collection.list().forEach(function (progress) {
          var entry = saved.cats && saved.cats[progress.cat.id];
          if (!entry || !progress.home) return;
          var travelling = validTime(entry.startedAt) && validTime(entry.endsAt) &&
            entry.endsAt - entry.startedAt >= 60000 && entry.endsAt - entry.startedAt <= 300000 && entry.startedAt <= clock();
          var hasEnergy = typeof entry.energy === 'number' && isFinite(entry.energy);
          var sleeping = entry.sleeping === true;
          data.cats[progress.cat.id] = { startedAt: travelling ? entry.startedAt : 0, endsAt: travelling ? entry.endsAt : 0,
            nextAt: validTime(entry.nextAt) ? Math.min(entry.nextAt, loadedAt + 90000) : nextDeparture(loadedAt),
            energy: hasEnergy ? Math.max(0, Math.min(MAX_ENERGY, entry.energy)) : MAX_ENERGY,
            energyAt: validTime(entry.energyAt) ? Math.min(entry.energyAt, loadedAt) : travelling ? entry.startedAt : loadedAt,
            sleeping: sleeping,
            wakeAt: sleeping && validWakeEnergy(entry.wakeAt) ? entry.wakeAt : sleeping && hasEnergy && entry.energy < SLEEP_THRESHOLD ? between(10, MAX_ENERGY) : 0 };
        });
        furniture.forEach(function (item) {
          var count = saved.furniture && saved.furniture[item.id];
          if (typeof count === 'number' && isFinite(count) && count > 0) data.furniture[item.id] = Math.min(1000000, Math.floor(count));
          var position = saved.positions && saved.positions[item.id];
          if (data.furniture[item.id] && validPosition(position)) data.positions[item.id] = { x: position.x, y: position.y };
        });
        if (Array.isArray(saved.journal)) data.journal = saved.journal.filter(function (entry) {
          return entry && typeof entry.text === 'string' && entry.text.length < 160 && validTime(entry.time);
        }).slice(0, 8);
        if (typeof saved.catnip === 'number' && isFinite(saved.catnip) && saved.catnip > 0) {
          data.catnip = Math.min(MAX_CATNIP, Math.floor(saved.catnip));
        }
      }
    } catch (error) {}
    function persist() {
      var text = JSON.stringify(data);
      if (text === savedText) return;
      savedText = text;
      try { storage.setItem(KEY, text); } catch (error) {}
    }
    function sync(now) {
      collection.list().forEach(function (progress) {
        if (progress.home && !data.cats[progress.cat.id]) data.cats[progress.cat.id] = {
          startedAt: 0, endsAt: 0, nextAt: nextDeparture(now), energy: MAX_ENERGY, energyAt: now, sleeping: false, wakeAt: 0
        };
        if (!progress.home) delete data.cats[progress.cat.id];
      });
    }
    function advanceEntry(id, now) {
      var entry = data.cats[id];
      if (!entry) return false;
      var cursor = validTime(entry.energyAt) ? Math.min(entry.energyAt, now) : now, changed = false;
      if (cursor < now) {
        if (entry.endsAt && cursor < entry.endsAt) {
          var travelUntil = Math.min(now, entry.endsAt);
          entry.energy = Math.max(0, entry.energy - (travelUntil - cursor) / 60000 * TRAVEL_DRAIN);
          cursor = travelUntil;
        }
        if (cursor < now) {
          var recovery = entry.sleeping ? SLEEP_RECOVERY : -HOME_DRAIN;
          entry.energy = Math.max(0, Math.min(MAX_ENERGY, entry.energy + (now - cursor) / 60000 * recovery));
          cursor = now;
        }
        changed = true;
      }
      if (entry.sleeping && validWakeEnergy(entry.wakeAt) && entry.energy >= entry.wakeAt) {
        entry.sleeping = false; entry.wakeAt = 0; changed = true;
      }
      if (!entry.endsAt && !entry.sleeping && entry.energy < SLEEP_THRESHOLD) {
        entry.sleeping = true; entry.wakeAt = between(10, MAX_ENERGY); changed = true;
      }
      if (entry.energyAt !== cursor) { entry.energyAt = cursor; changed = true; }
      return changed;
    }
    function advanceAll(now) {
      var changed = false;
      Object.keys(data.cats).forEach(function (id) { if (advanceEntry(id, now)) changed = true; });
      return changed;
    }
    function log(text, now) { data.journal.unshift({ text: text, time: now }); data.journal = data.journal.slice(0, 8); }
    function finish(id, now, recalled) {
      var entry = data.cats[id];
      if (!entry || !entry.endsAt) return null;
      advanceEntry(id, now);
      var gifts = [], catnip = 0, progress = collection.progress(id);
      if (!recalled) {
        var quantity = between(1, 2);
        for (var index = 0; index < quantity; index++) {
          var item = furniture[between(0, furniture.length - 1)];
          data.furniture[item.id] = Math.min(1000000, (data.furniture[item.id] || 0) + 1);
          gifts.push(item.id);
        }
        catnip = between(10, 50);
        data.catnip = Math.min(MAX_CATNIP, data.catnip + catnip);
      }
      entry.startedAt = 0; entry.endsAt = 0; entry.nextAt = nextDeparture(now);
      if (entry.energy < SLEEP_THRESHOLD) { entry.sleeping = true; entry.wakeAt = between(10, MAX_ENERGY); }
      else { entry.sleeping = false; entry.wakeAt = 0; }
      entry.energyAt = now;
      log(recalled ? progress.cat.name + '被召回啦' : progress.cat.name + '旅行回来啦，带回' + gifts.map(function (id) {
        return furniture.filter(function (item) { return item.id === id; })[0].name;
      }).join('、') + '和' + catnip + '猫薄荷', now);
      return { type: 'return', id: id, gifts: gifts, catnip: catnip, recalled: recalled };
    }
    function list(now) {
      now = now === undefined ? clock() : now;
      sync(now); advanceAll(now);
      return collection.list().map(function (progress) {
        var entry = data.cats[progress.cat.id];
        return { cat: progress.cat, bodyUnlocked: progress.body, count: progress.count, total: progress.total, unlocked: progress.home, travelling: !!(entry && entry.endsAt),
          remaining: entry && entry.endsAt ? Math.max(0, entry.endsAt - now) : 0,
          startedAt: entry ? entry.startedAt : 0, endsAt: entry ? entry.endsAt : 0,
          energy: entry ? Math.round(entry.energy * 10) / 10 : MAX_ENERGY, maxEnergy: MAX_ENERGY,
          sleeping: !!(entry && entry.sleeping) };
      });
    }
    function tick() {
      var now = clock(), events = [];
      sync(now);
      advanceAll(now);
      Object.keys(data.cats).forEach(function (id) {
        if (data.cats[id].endsAt && data.cats[id].endsAt <= now) events.push(finish(id, now, false));
      });
      var home = list(now).filter(function (entry) { return entry.unlocked && !entry.travelling; }).length;
      var candidates = Object.keys(data.cats).sort(function (first, second) { return data.cats[first].nextAt - data.cats[second].nextAt; });
      candidates.forEach(function (id) {
        var entry = data.cats[id];
        if (entry.endsAt || entry.nextAt > now) return;
        if (entry.sleeping || entry.energy < SLEEP_THRESHOLD) {
          if (!entry.sleeping) { entry.sleeping = true; entry.wakeAt = between(10, MAX_ENERGY); }
          entry.nextAt = nextDeparture(now);
          return;
        }
        if (home <= 3) { entry.nextAt = nextDeparture(now); return; }
        entry.startedAt = now; entry.endsAt = now + between(60000, 300000); entry.energyAt = now; entry.sleeping = false; entry.wakeAt = 0; home--;
        events.push({ type: 'depart', id: id });
        log(collection.progress(id).cat.name + '背上小包出门旅行啦', now);
      });
      persist(); return events;
    }
    function recall(id) {
      var event = finish(id, clock(), true);
      if (event) persist();
      return event;
    }
    function sleep(id) {
      var now = clock(), entry = data.cats[id];
      if (!entry || entry.endsAt) return false;
      advanceEntry(id, now); entry.sleeping = true; entry.wakeAt = 0; entry.energyAt = now; persist(); return true;
    }
    function wake(id) {
      var now = clock(), entry = data.cats[id];
      if (!entry || entry.endsAt || !entry.sleeping) return false;
      advanceEntry(id, now);
      if (entry.energy <= SLEEP_THRESHOLD) return false;
      entry.sleeping = false; entry.wakeAt = 0; entry.energyAt = now; persist(); return true;
    }
    function placeFurniture(id, position) {
      if (!furniture.some(function (item) { return item.id === id; }) || !data.furniture[id] || !validPosition(position)) return false;
      data.positions[id] = { x: position.x, y: position.y }; persist(); return true;
    }
    sync(clock());
    var away = list().filter(function (entry) { return entry.travelling; });
    var maximumAway = Math.max(0, Object.keys(data.cats).length - 3);
    away.slice(maximumAway).forEach(function (entry) { finish(entry.cat.id, clock(), true); });
    persist();
    return { tick: tick, list: list, recall: recall, sleep: sleep, wake: wake,
      catnip: function () { return data.catnip; },
      isSleeping: function (id) { advanceEntry(id, clock()); return !!(data.cats[id] && data.cats[id].sleeping); },
      isAway: function (id) { return !!(data.cats[id] && data.cats[id].endsAt); },
      furniture: function () { return furniture.map(function (item) {
        var position = data.positions[item.id];
        return { item: item, count: data.furniture[item.id] || 0, position: position ? { x: position.x, y: position.y } : null };
      }); },
      placeFurniture: placeFurniture,
      resetFurniture: function () { data.positions = {}; persist(); },
      journal: function () { return data.journal.slice(); } };
  }
  return { create: create, catalog: furniture, storageKey: KEY,
    maxEnergy: MAX_ENERGY, sleepThreshold: SLEEP_THRESHOLD };
});
