/* 收集进度卡片使用真实累计数；动作入口与住户使用同一解锁条件。 */
(function (root) {
  'use strict';
  var collection = root.TurtleCatCollection.get();
  var lastMilestones = [];
  var series = root.TurtleCatCollection.series;
  var tabs = root.TurtleSeriesTabs.create({ container: document.getElementById('collection-series'),
    panel: document.getElementById('collection-scroll'), series: series, onChange: render });
  function node(tag, cls, text) {
    var el = document.createElement(tag); el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function render() {
    var allRows = collection.list(), rows = collection.list(tabs.get()), bodies = 0, home = 0, specials = 0;
    var selected = series.filter(function (entry) { return entry.id === tabs.get(); })[0];
    tabs.update(allRows);
    var list = document.getElementById('collection-list'); list.textContent = '';
    rows.forEach(function (p) {
      var travelling = !!(root.TurtleRoom && root.TurtleRoom.isAway(p.cat.id));
      if (p.body) bodies++; if (p.home) home++; if (p.special) specials++;
      var card = node('article', 'cat-card' + (p.home ? ' is-home' : ' is-locked'));
      card.setAttribute('data-collection-cat', p.cat.id);
      var top = node('div', 'cat-card__top');
      var image = node('img', 'cat-card__portrait'); image.src = p.cat.portrait; image.alt = p.cat.name; image.width = 76; image.height = 76;
      var body = node('div', 'cat-card__body');
      var title = node('div', 'cat-card__title'); title.appendChild(node('h2', '', p.cat.name));
      title.appendChild(node('span', 'cat-card__badge', travelling ? '旅游中' : p.cat.initial ? '初始伙伴' : p.home ? '已入住' : p.body ? '待入住' : '本体待解锁'));
      body.appendChild(title);
      var stages = node('div', 'cat-card__stages');
      [{ label: '本体', open: p.body, value: p.count, target: p.cat.bodyAt },
        { label: '入住', open: p.home, value: p.total, target: p.cat.homeAt },
        { label: '专属', open: p.special, value: p.count, target: p.cat.specialAt }].forEach(function (stage) {
        stages.appendChild(node('span', stage.open ? 'is-complete' : '', stage.label + ' ' + (stage.open ? '✓' : Math.min(stage.value, stage.target) + '/' + stage.target)));
      });
      body.appendChild(stages);
      var target, current, countText, nextText;
      if (!p.body) {
        target = p.cat.bodyAt; current = p.count;
        countText = '已收集 ' + p.count + ' 只 / ' + target;
        nextText = '再收集 ' + (target - p.count) + ' 只，解锁猫本体';
      } else if (!p.home) {
        target = p.cat.homeAt; current = p.total;
        countText = '本体已解锁 · 本系列累计 ' + p.total + ' 只 / ' + target;
        nextText = '再收集 ' + (target - p.total) + ' 只，邀请它住进房间';
      } else {
        target = p.cat.specialAt; current = p.count;
        countText = '已收集 ' + p.count + ' 只' + (p.special ? ' · 全部解锁' : ' / ' + target);
        nextText = p.special ? '可以在房间自由活动啦' : '再收集 ' + (target - p.count) + ' 只，解锁' + p.cat.special;
      }
      body.appendChild(node('p', 'cat-card__count', countText));
      var bar = node('div', 'cat-card__bar');
      bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', p.cat.name + (!p.body ? '本体解锁' : !p.home ? '入住' : '专属动作') + '进度');
      bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(target)); bar.setAttribute('aria-valuenow', String(Math.min(target, current)));
      var fill = node('span', ''); fill.style.width = Math.min(100, current / target * 100) + '%'; bar.appendChild(fill); body.appendChild(bar);
      body.appendChild(node('p', 'cat-card__next', travelling ? '正在旅行，可在房间「猫咪状态」召回' : nextText));
      top.appendChild(image); top.appendChild(body); card.appendChild(top);
      var actions = node('div', 'cat-card__actions');
      [{ id: 'walk', name: '散步', open: p.home }, { id: 'sleep', name: '睡觉', open: p.home }, { id: 'special', name: p.cat.special, open: p.home && p.special }].forEach(function (action) {
        var learned = action.id === 'special' && p.special && !p.home;
        var prefix = action.open ? '' : learned ? '已学会 · 待入住 · ' : '待解锁 · ';
        var button = node('button', 'cat-card__action', prefix + action.name);
        button.type = 'button'; button.disabled = !action.open || travelling;
        button.setAttribute('data-cat', p.cat.id); button.setAttribute('data-action', action.id);
        var requirement = !p.home ? (!p.body ? '本体累计' + p.cat.bodyAt + '只，' : '') + '本系列累计' + p.cat.homeAt + '只后入住' : '该猫累计' + p.cat.specialAt + '只解锁';
        if (!p.home && action.id === 'special' && !p.special) requirement += '，该猫累计' + p.cat.specialAt + '只学会专属动作';
        button.setAttribute('aria-label', p.cat.name + '：' + action.name + (travelling ? '，旅行中，请先召回' : action.open ? '，去房间观看' : '，' + (learned ? '已学会，' : '') + requirement));
        actions.appendChild(button);
      });
      card.appendChild(actions); list.appendChild(card);
    });
    document.getElementById('collection-summary').textContent = '本体 ' + bodies + ' / ' + rows.length + ' · 入住 ' + home + ' / ' + rows.length + ' · 专属 ' + specials + ' / ' + rows.length;
    document.getElementById('collection-edition').textContent = selected.name;
    document.getElementById('collection-note').textContent = rows[0].cat.name + '默认入住，散步和睡觉直接开放。两系列门槛相同、进度独立；专属动作学会后需入住才能使用。';
    document.getElementById('collection-play-label').textContent = '进入' + selected.name + '对对碰';
    document.getElementById('room-collection-count').textContent = allRows.filter(function (entry) { return entry.home; }).length + ' / ' + allRows.length;
    var notice = document.getElementById('collection-notice');
    var visibleMilestones = lastMilestones.filter(function (entry) { return rows.some(function (row) { return row.cat.id === entry.id; }); });
    notice.hidden = !visibleMilestones.length;
    notice.textContent = visibleMilestones.map(function (entry) { return entry.name + entry.label; }).join(' · ');
  }
  root.TurtleCollectionView = { render: render, selectSeries: tabs.select, selectedSeries: tabs.get, milestones: function (items) { lastMilestones = items; } };
})(window);
