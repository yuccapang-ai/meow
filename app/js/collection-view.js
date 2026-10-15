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
    var rows = collection.list(), bodies = 0, home = 0, specials = 0;
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
      var target, current, countText, nextText;
      if (!p.body) {
        target = p.cat.bodyAt; current = p.count;
        countText = '已收集 ' + p.count + ' 只 / ' + target;
        nextText = '再收集 ' + (target - p.count) + ' 只，解锁猫本体';
      } else if (!p.home) {
        target = p.cat.homeAt; current = p.total;
        countText = '本体已解锁 · 套系累计 ' + p.total + ' 只 / ' + target;
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
      [{ id: 'walk', name: '散步', open: p.home }, { id: 'sleep', name: '睡觉', open: p.home }, { id: 'special', name: p.cat.special, open: p.special }].forEach(function (action, i) {
        var button = node('button', 'cat-card__action', (action.open ? '' : '待解锁 · ') + action.name);
        button.type = 'button'; button.disabled = !action.open || travelling;
        button.setAttribute('data-cat', p.cat.id); button.setAttribute('data-action', action.id);
        var actionTarget = i === 2 ? p.cat.specialAt : p.body ? p.cat.homeAt : p.cat.bodyAt;
        var actionProgress = i === 2 || !p.body ? '累计' + actionTarget + '只' : '套系累计' + actionTarget + '只';
        button.setAttribute('aria-label', p.cat.name + '：' + action.name + (action.open ? '，去房间观看' : '，' + actionProgress + '解锁'));
        actions.appendChild(button);
      });
      card.appendChild(actions); list.appendChild(card);
    });
    document.getElementById('collection-summary').textContent = bodies + ' / 9 只本体已解锁 · ' + home + ' / 9 只已入住 · ' + specials + ' / 9 个专属动作';
    document.getElementById('room-collection-count').textContent = home + ' / 9';
    var notice = document.getElementById('collection-notice');
    notice.hidden = !lastMilestones.length;
    notice.textContent = lastMilestones.map(function (m) { return m.name + m.label; }).join(' · ');
  }
  root.TurtleCollectionView = { render: render, milestones: function (items) { lastMilestones = items; } };
})(window);
