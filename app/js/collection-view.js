/* 收集进度卡片使用真实累计数；动作入口与住户使用同一解锁条件。 */
(function (root) {
  'use strict';
  var collection = root.TurtleCatCollection.get();
  var lastMilestones = [];
  function node(tag, cls, text) {
    var el = document.createElement(tag); el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function render() {
    var rows = collection.list(), home = 0, specials = 0;
    var list = document.getElementById('collection-list'); list.textContent = '';
    rows.forEach(function (p) {
      if (p.home) home++; if (p.special) specials++;
      var card = node('article', 'cat-card' + (p.home ? ' is-home' : ' is-locked'));
      card.setAttribute('data-collection-cat', p.cat.id);
      var top = node('div', 'cat-card__top');
      var image = node('img', 'cat-card__portrait'); image.src = p.cat.portrait; image.alt = p.cat.name; image.width = 76; image.height = 76;
      var body = node('div', 'cat-card__body');
      var title = node('div', 'cat-card__title'); title.appendChild(node('h2', '', p.cat.name));
      title.appendChild(node('span', 'cat-card__badge', p.cat.initial ? '初始伙伴' : p.home ? '已入住' : '待入住'));
      body.appendChild(title);
      var target = p.home ? p.cat.specialAt : p.cat.homeAt;
      body.appendChild(node('p', 'cat-card__count', '已收集 ' + p.count + ' 只' + (p.special ? ' · 全部解锁' : ' / ' + target)));
      var bar = node('div', 'cat-card__bar');
      bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', p.cat.name + (p.home ? '专属动作' : '入住') + '进度');
      bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(target)); bar.setAttribute('aria-valuenow', String(Math.min(target, p.count)));
      var fill = node('span', ''); fill.style.width = Math.min(100, p.count / target * 100) + '%'; bar.appendChild(fill); body.appendChild(bar);
      body.appendChild(node('p', 'cat-card__next', p.special ? '可以在房间自由活动啦' : '再收集 ' + (target - p.count) + ' 只，' + (p.home ? '解锁' + p.cat.special : '邀请它住进房间')));
      top.appendChild(image); top.appendChild(body); card.appendChild(top);
      var actions = node('div', 'cat-card__actions');
      [{ id: 'walk', name: '散步', open: p.home }, { id: 'sleep', name: '睡觉', open: p.home }, { id: 'special', name: p.cat.special, open: p.special }].forEach(function (action, i) {
        var button = node('button', 'cat-card__action', (action.open ? '' : '待解锁 · ') + action.name);
        button.type = 'button'; button.disabled = !action.open;
        button.setAttribute('data-cat', p.cat.id); button.setAttribute('data-action', action.id);
        button.setAttribute('aria-label', p.cat.name + '：' + action.name + (action.open ? '，去房间观看' : '，累计' + (i === 2 ? p.cat.specialAt : p.cat.homeAt) + '只解锁'));
        actions.appendChild(button);
      });
      card.appendChild(actions); list.appendChild(card);
    });
    document.getElementById('collection-summary').textContent = home + ' / 9 只已入住 · ' + specials + ' / 9 个专属动作';
    document.getElementById('room-collection-count').textContent = home + ' / 9';
    var notice = document.getElementById('collection-notice');
    notice.hidden = !lastMilestones.length;
    notice.textContent = lastMilestones.map(function (m) { return m.name + m.label; }).join(' · ');
  }
  root.TurtleCollectionView = { render: render, milestones: function (items) { lastMilestones = items; } };
})(window);
