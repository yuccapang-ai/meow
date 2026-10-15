/* 按套系和款式分别累计；只在真实对局结算时入账，回放不入账。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TurtleCatCollection = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var KEY = 'ttddp.catCollection.v1';
  var names = ['甜甜圈猫', '码农猫', '音乐猫', '咖啡猫', '摄影猫', '厨师猫', '健身猫', '画家猫', '派对猫'];
  var ids = ['donut', 'coder', 'music', 'coffee', 'photo', 'chef', 'fitness', 'painter', 'party'];
  var specials = ['吃甜甜圈', '敲键盘', '听歌打拍子', '喝咖啡', '拍照片', '煎鸡蛋', '举哑铃', '画爪印', '吹派对喇叭'];
  var catalog = names.map(function (name, i) {
    return { id: ids[i], name: name, index: i, skin: 'cats', special: specials[i],
      portrait: './skins/cats/' + (i + 1) + '.webp',
      atlas: './assets/room/cats/' + ids[i] + '-actions-v1.webp',
      initial: i === 0, homeAt: i === 0 ? 0 : 30, specialAt: 50 };
  });
  function integer(n) { return typeof n === 'number' && isFinite(n) ? Math.max(0, Math.min(1000000000, Math.floor(n))) : 0; }
  function emptyCounts() { return [0, 0, 0, 0, 0, 0, 0, 0, 0]; }
  function create(storage) {
    var data = { version: 1, counts: Object.create(null), lastRun: null };
    try {
      var saved = JSON.parse(storage.getItem(KEY));
      if (saved && saved.version === 1 && saved.counts && typeof saved.counts === 'object') {
        Object.keys(saved.counts).forEach(function (skin) {
          if (!/^[a-z][a-z0-9-]*$/.test(skin) || !Array.isArray(saved.counts[skin])) return;
          data.counts[skin] = emptyCounts().map(function (_, i) { return integer(saved.counts[skin][i]); });
        });
        data.lastRun = typeof saved.lastRun === 'string' ? saved.lastRun : null;
      }
    } catch (e) { /* 新存档或存储不可用时仍可在当前会话游玩。 */ }
    function progress(id) {
      var cat = catalog.filter(function (c) { return c.id === id; })[0];
      if (!cat) return null;
      var count = (data.counts[cat.skin] || emptyCounts())[cat.index];
      return { cat: cat, count: count, home: count >= cat.homeAt, special: count >= cat.specialAt };
    }
    function list() { return catalog.map(function (cat) { return progress(cat.id); }); }
    function recordRun(skin, counts, runId, replay) {
      if (replay || !runId || runId === data.lastRun || !/^[a-z][a-z0-9-]*$/.test(skin) || !Array.isArray(counts)) return [];
      var before = list(), row = data.counts[skin] || emptyCounts();
      data.counts[skin] = row.map(function (value, i) { return integer(value + integer(counts[i])); });
      data.lastRun = String(runId);
      try { storage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 保留会话内进度。 */ }
      var milestones = [];
      list().forEach(function (p, i) {
        if (p.home && !before[i].home) milestones.push({ id: p.cat.id, name: p.cat.name, kind: 'home', label: '入住啦' });
        if (p.special && !before[i].special) milestones.push({ id: p.cat.id, name: p.cat.name, kind: 'special', label: '学会了' + p.cat.special });
      });
      return milestones;
    }
    return { list: list, progress: progress, recordRun: recordRun };
  }
  var session;
  function get() {
    if (!session) {
      var storage = null;
      try { storage = window.localStorage; } catch (e) { /* 可在无持久存储环境运行。 */ }
      session = create(storage);
    }
    return session;
  }
  return { create: create, get: get, catalog: catalog, storageKey: KEY };
});
