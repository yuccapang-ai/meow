(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TurtleCatTravel = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var KEY = 'ttddp.catTravel.v1';
  var furniture = [
    { id: 'leaf', name: '叶叶观景台', column: 0, row: 0 },
    { id: 'cloud', name: '云朵软绵架', column: 1, row: 0 },
    { id: 'mushroom', name: '蘑菇小屋架', column: 2, row: 0 },
    { id: 'ladder', name: '木木阶梯架', column: 0, row: 1 },
    { id: 'nest', name: '圆圆树洞架', column: 1, row: 1 }
  ];
  function create(options) {
    var collection = options.collection, storage = options.storage;
    var clock = options.now || Date.now, random = options.random || Math.random;
    var data = { version: 1, cats: {}, furniture: {}, journal: [] }, savedText = '';
    function between(minimum, maximum) { return minimum + Math.floor(random() * (maximum - minimum + 1)); }
    function nextDeparture(now) { return now + between(20000, 90000); }
    function validTime(value) { return typeof value === 'number' && isFinite(value) && value > 0; }
    try {
      var saved = JSON.parse(storage.getItem(KEY));
      if (saved && saved.version === 1) {
        collection.list().forEach(function (progress) {
          var entry = saved.cats && saved.cats[progress.cat.id];
          if (!entry || !progress.home) return;
          var travelling = validTime(entry.startedAt) && validTime(entry.endsAt) &&
            entry.endsAt - entry.startedAt >= 60000 && entry.endsAt - entry.startedAt <= 300000 && entry.startedAt <= clock();
          data.cats[progress.cat.id] = { startedAt: travelling ? entry.startedAt : 0, endsAt: travelling ? entry.endsAt : 0,
            nextAt: validTime(entry.nextAt) ? Math.min(entry.nextAt, clock() + 90000) : nextDeparture(clock()) };
        });
        furniture.forEach(function (item) {
          var count = saved.furniture && saved.furniture[item.id];
          if (typeof count === 'number' && isFinite(count) && count > 0) data.furniture[item.id] = Math.min(1000000, Math.floor(count));
        });
        if (Array.isArray(saved.journal)) data.journal = saved.journal.filter(function (entry) {
          return entry && typeof entry.text === 'string' && entry.text.length < 160 && validTime(entry.time);
        }).slice(0, 8);
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
        if (progress.home && !data.cats[progress.cat.id]) data.cats[progress.cat.id] = { startedAt: 0, endsAt: 0, nextAt: nextDeparture(now) };
        if (!progress.home) delete data.cats[progress.cat.id];
      });
    }
    function log(text, now) { data.journal.unshift({ text: text, time: now }); data.journal = data.journal.slice(0, 8); }
    function finish(id, now, recalled) {
      var entry = data.cats[id];
      if (!entry || !entry.endsAt) return null;
      var gifts = [], quantity = between(1, 2), progress = collection.progress(id);
      for (var index = 0; index < quantity; index++) {
        var item = furniture[between(0, furniture.length - 1)];
        data.furniture[item.id] = Math.min(1000000, (data.furniture[item.id] || 0) + 1);
        gifts.push(item.id);
      }
      entry.startedAt = 0; entry.endsAt = 0; entry.nextAt = nextDeparture(now);
      log(progress.cat.name + (recalled ? '被召回啦' : '旅行回来啦') + '，带回' + gifts.map(function (id) {
        return furniture.filter(function (item) { return item.id === id; })[0].name;
      }).join('、'), now);
      return { type: 'return', id: id, gifts: gifts, recalled: recalled };
    }
    function list(now) {
      now = now === undefined ? clock() : now;
      return collection.list().map(function (progress) {
        var entry = data.cats[progress.cat.id];
        return { cat: progress.cat, unlocked: progress.home, travelling: !!(entry && entry.endsAt),
          remaining: entry && entry.endsAt ? Math.max(0, entry.endsAt - now) : 0,
          startedAt: entry ? entry.startedAt : 0, endsAt: entry ? entry.endsAt : 0 };
      });
    }
    function tick() {
      var now = clock(), events = [];
      sync(now);
      Object.keys(data.cats).forEach(function (id) {
        if (data.cats[id].endsAt && data.cats[id].endsAt <= now) events.push(finish(id, now, false));
      });
      var home = list(now).filter(function (entry) { return entry.unlocked && !entry.travelling; }).length;
      var candidates = Object.keys(data.cats).sort(function (first, second) { return data.cats[first].nextAt - data.cats[second].nextAt; });
      candidates.forEach(function (id) {
        var entry = data.cats[id];
        if (entry.endsAt || entry.nextAt > now) return;
        if (home <= 3) { entry.nextAt = nextDeparture(now); return; }
        entry.startedAt = now; entry.endsAt = now + between(60000, 300000); home--;
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
    sync(clock());
    var away = list().filter(function (entry) { return entry.travelling; });
    var maximumAway = Math.max(0, Object.keys(data.cats).length - 3);
    away.slice(maximumAway).forEach(function (entry) { finish(entry.cat.id, clock(), true); });
    persist();
    return { tick: tick, list: list, recall: recall,
      isAway: function (id) { return !!(data.cats[id] && data.cats[id].endsAt); },
      furniture: function () { return furniture.map(function (item) { return { item: item, count: data.furniture[item.id] || 0 }; }); },
      journal: function () { return data.journal.slice(); } };
  }
  return { create: create, catalog: furniture, storageKey: KEY };
});
