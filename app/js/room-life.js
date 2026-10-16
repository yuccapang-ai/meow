(function (root) {
  'use strict';
  function create(options) {
    var travel = options.travel, residents = options.residents;
    var panel = document.getElementById('room-life-panel'), trigger = document.getElementById('btn-room-life');
    var list = document.getElementById('room-life-list'), rows = [], gifts = [];
    var closeButton = document.getElementById('btn-room-life-close'), journalKey = '';
    var tabs = root.TurtleSeriesTabs.create({ container: document.getElementById('room-life-series'),
      panel: document.getElementById('room-life-series-panel'), series: root.TurtleCatCollection.series, onChange: render });
    function node(tag, className, text) {
      var element = document.createElement(tag); element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }
    function countdown(milliseconds) {
      var seconds = Math.ceil(milliseconds / 1000);
      return Math.floor(seconds / 60) + ':' + ('0' + seconds % 60).slice(-2);
    }
    function energyLabel(entry) {
      var value = Math.round(entry.energy * 10) / 10;
      return '精力 ' + (value % 1 ? value.toFixed(1) : value) + '/' + entry.maxEnergy;
    }
    function close() { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); }
    travel.list().forEach(function (entry) {
      var row = node('li', 'room-life__cat'); row.setAttribute('data-status-cat', entry.cat.id);
      var portrait = node('img', 'room-life__portrait'); portrait.src = entry.cat.portrait; portrait.alt = ''; portrait.width = 48; portrait.height = 48;
      var body = node('div', 'room-life__body'); body.appendChild(node('h3', '', entry.cat.name));
      var status = node('p', 'room-life__state'); body.appendChild(status);
      var energy = node('div', 'room-life__energy'); energy.setAttribute('role', 'meter');
      energy.setAttribute('aria-label', entry.cat.name + '精力'); energy.setAttribute('aria-valuemin', '0');
      var fill = node('span', ''); energy.appendChild(fill); body.appendChild(energy);
      var button = node('button', 'room-life__action'); button.type = 'button';
      button.addEventListener('click', function () {
        if (travel.isAway(entry.cat.id)) { travel.recall(entry.cat.id); options.refresh(); render(); }
        else if (travel.isSleeping(entry.cat.id) && travel.list().filter(function (item) { return item.cat.id === entry.cat.id; })[0].energy > travel.sleepThreshold) {
          if (residents.wake && residents.wake(entry.cat.id)) { options.refresh(); render(); }
        }
        else { close(); residents.focus(entry.cat.id); }
      });
      row.appendChild(portrait); row.appendChild(body); row.appendChild(button); list.appendChild(row);
      rows.push({ id: entry.cat.id, element: row, status: status, button: button, energy: energy, fill: fill });
    });
    var gallery = document.getElementById('room-life-furniture');
    travel.furniture().forEach(function (entry) {
      var card = node('li', 'room-life__gift'), picture = node('span', 'room-life__gift-picture');
      picture.style.backgroundPosition = entry.item.column * 50 + '% ' + entry.item.row * 100 + '%';
      picture.setAttribute('aria-hidden', 'true'); card.appendChild(picture);
      card.appendChild(node('span', '', entry.item.name));
      var count = node('b', ''); card.appendChild(count); gallery.appendChild(card);
      gifts.push({ element: card, count: count });
    });
    function render() {
      var entries = travel.list(), home = 0, travelling = 0, groupHome = 0, groupAway = 0, groupLocked = 0, states = residents.states();
      tabs.update(entries);
      entries.forEach(function (entry, index) {
        if (entry.unlocked) { if (entry.travelling) travelling++; else home++; }
        var inSeries = entry.cat.skin === tabs.get();
        if (inSeries) {
          if (!entry.unlocked) groupLocked++;
          else if (entry.travelling) groupAway++;
          else groupHome++;
        }
        rows[index].element.hidden = !inSeries;
        if (panel.hidden) return;
        var row = rows[index], state = states.filter(function (item) { return item.id === entry.cat.id; })[0];
        row.element.setAttribute('data-location', entry.travelling ? 'away' : entry.unlocked ? 'home' : 'locked');
        if (!entry.unlocked) {
          row.status.textContent = !entry.bodyUnlocked ? '未解锁本体 · 该猫还需' + (entry.cat.bodyAt - entry.count) + '只' : '本体已解锁 · 本系列还需' + (entry.cat.homeAt - entry.total) + '只可入住';
        } else if (entry.travelling) {
          row.status.textContent = '旅游中 · ' + countdown(entry.remaining) + ' 后回家 · ' + energyLabel(entry);
        } else {
          row.status.textContent = '在家 · ' + (entry.sleeping ? '睡觉中' : state ? state.activity : '休息中') + ' · ' + energyLabel(entry);
        }
        row.button.textContent = entry.travelling ? '召回' : entry.sleeping && entry.energy > travel.sleepThreshold ? '叫醒' : entry.sleeping ? '睡眠中' : entry.unlocked ? '找它' : '待入住';
        row.button.disabled = !entry.unlocked || (entry.sleeping && entry.energy <= travel.sleepThreshold);
        row.button.setAttribute('aria-label', (entry.travelling ? '召回' : entry.sleeping ? '叫醒' : '找到') + entry.cat.name);
        row.energy.hidden = !entry.unlocked;
        row.energy.setAttribute('aria-valuemax', String(entry.maxEnergy));
        row.energy.setAttribute('aria-valuenow', String(Math.round(entry.energy * 10) / 10));
        row.energy.setAttribute('data-low', String(entry.energy <= travel.sleepThreshold));
        row.fill.style.width = Math.max(0, Math.min(100, entry.energy / entry.maxEnergy * 100)) + '%';
      });
      document.getElementById('room-life-count').textContent = home + ' 在家 · ' + travelling + ' 旅游';
      if (panel.hidden) return;
      document.getElementById('room-life-summary').textContent = groupHome + ' 在家 · ' + groupAway + ' 旅游 · ' + groupLocked + ' 待入住';
      document.getElementById('room-life-total').textContent = '全系列：' + home + ' 在家 · ' + travelling + ' 旅游 · 猫薄荷 ' + travel.catnip();
      document.getElementById('room-life-rule').textContent = home + travelling <= 3 ? '再邀请伙伴入住吧！全系列合计超过 3 只后才会出游，家里始终至少留 3 只。' : '全系列共享房间，每只猫随机出门 1–5 分钟，家里始终至少留 3 只。随时都能叫它回家。';
      var total = 0, types = 0;
      travel.furniture().forEach(function (entry, index) {
        total += entry.count; if (entry.count) types++;
        gifts[index].count.textContent = entry.count ? '×' + entry.count : '待带回';
        gifts[index].element.setAttribute('data-owned', entry.count ? 'true' : 'false');
      });
      document.getElementById('room-life-gift-count').textContent = types + ' / 5 款 · 共 ' + total + ' 件';
      var entriesLog = travel.journal();
      var nextJournalKey = JSON.stringify(entriesLog);
      if (journalKey === nextJournalKey) return;
      journalKey = nextJournalKey;
      var journal = document.getElementById('room-life-journal'); journal.textContent = '';
      if (!entriesLog.length) journal.appendChild(node('li', '', '小包已经收拾好，等下一次出发。'));
      entriesLog.slice(0, 4).forEach(function (entry) { journal.appendChild(node('li', '', entry.text)); });
    }
    trigger.addEventListener('click', function () {
      if (options.beforeOpen) options.beforeOpen();
      options.refresh(); panel.hidden = false; trigger.setAttribute('aria-expanded', 'true'); render(); closeButton.focus();
    });
    closeButton.addEventListener('click', close);
    panel.addEventListener('click', function (event) { if (event.target === panel) close(); });
    panel.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key !== 'Tab') return;
      var buttons = Array.prototype.filter.call(panel.querySelectorAll('button:not(:disabled), [tabindex="0"]'), function (button) {
        return button.tabIndex >= 0 && !button.closest('[hidden]');
      });
      var first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    return { render: render, close: function () { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); } };
  }
  root.TurtleRoomLife = { create: create };
})(window);
