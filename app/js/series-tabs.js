(function (root) {
  'use strict';
  function create(options) {
    var container = options.container, panel = options.panel, series = options.series;
    var selected = series.some(function (entry) { return entry.id === options.initial; }) ? options.initial : series[0].id;
    var buttons = [];
    container.setAttribute('role', 'tablist');
    panel.setAttribute('role', 'tabpanel');
    panel.tabIndex = 0;
    function paint() {
      buttons.forEach(function (entry) {
        var active = entry.id === selected;
        entry.button.setAttribute('aria-selected', String(active));
        entry.button.tabIndex = active ? 0 : -1;
        if (active) panel.setAttribute('aria-labelledby', entry.button.id);
      });
    }
    function select(id, focus) {
      var entry = buttons.filter(function (item) { return item.id === id; })[0];
      if (!entry) return false;
      var changed = selected !== id;
      selected = id; paint();
      if (focus) entry.button.focus();
      if (changed && options.onChange) options.onChange(id);
      return true;
    }
    series.forEach(function (entry, index) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'series-tabs__tab';
      button.id = container.id + '-' + entry.id;
      button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', panel.id);
      button.setAttribute('data-series', entry.id);
      var name = document.createElement('span'); name.textContent = entry.name; button.appendChild(name);
      var count = document.createElement('small'); button.appendChild(count);
      button.addEventListener('click', function () { select(entry.id); });
      button.addEventListener('keydown', function (event) {
        var target = index;
        if (event.key === 'ArrowRight') target = (index + 1) % series.length;
        else if (event.key === 'ArrowLeft') target = (index + series.length - 1) % series.length;
        else if (event.key === 'Home') target = 0;
        else if (event.key === 'End') target = series.length - 1;
        else return;
        event.preventDefault(); select(series[target].id, true);
      });
      container.appendChild(button); buttons.push({ id: entry.id, button: button, count: count });
    });
    paint();
    return { select: select, get: function () { return selected; }, update: function (entries) {
      buttons.forEach(function (entry) {
        var group = entries.filter(function (item) { return item.cat.skin === entry.id; });
        var home = group.filter(function (item) { return item.home || item.unlocked; }).length;
        entry.count.textContent = home + '/' + group.length + ' 已入住';
      });
    } };
  }
  root.TurtleSeriesTabs = { create: create };
})(window);
