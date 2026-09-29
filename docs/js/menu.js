/* Weekly lunch menu page */
(function () {
  'use strict';
  var DM = window.DM;
  var esc = DM.esc;
  var offset = 0;

  function monday(weeksAhead) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    var day = d.getDay();
    var diff = day === 0 ? 1 : day === 6 ? 2 : 1 - day; // weekend shows the coming week
    d.setDate(d.getDate() + diff + weeksAhead * 7);
    return d;
  }
  function iso(d) {
    var x = new Date(d);
    x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
    return x.toISOString().slice(0, 10);
  }

  async function load() {
    var start = monday(offset);
    var days = [0, 1, 2, 3, 4].map(function (i) { var d = new Date(start); d.setDate(d.getDate() + i); return d; });
    var label = document.getElementById('menuWeekLabel');
    label.textContent = (offset === 0 ? 'This week: ' : offset === 1 ? 'Next week: ' : 'Week of ') +
      days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' - ' + days[4].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    var box = document.getElementById('menuWeek');
    var rows = [];
    if (DM.configured) {
      var r = await DM.sb.from('menu_days').select('*').gte('menu_date', iso(days[0])).lte('menu_date', iso(days[4]));
      rows = r.data || [];
    }
    var byDate = {};
    rows.forEach(function (m) { byDate[m.menu_date] = m; });
    var today = DM.today();
    if (!rows.length) {
      box.innerHTML = '<div class="menu-empty"><i class="fas fa-utensils" aria-hidden="true"></i><p>The menu for this week has not been posted yet. Check back soon.</p></div>';
      return;
    }
    box.innerHTML = days.map(function (d) {
      var key = iso(d), m = byDate[key] || {};
      var parts = [['Morning snack', m.morning_snack], ['Lunch', m.lunch], ['Afternoon snack', m.afternoon_snack]];
      return '<article class="menu-day' + (key === today ? ' today' : '') + '"><header><span>' + d.toLocaleDateString('en-US', { weekday: 'long' }) + '</span>' +
        '<small>' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + (key === today ? ' · Today' : '') + '</small></header>' +
        (m.menu_date ? parts.map(function (p) { return '<div class="menu-item"><b>' + p[0] + '</b><span>' + esc(p[1] || '-') + '</span></div>'; }).join('') +
          (m.notes ? '<p class="menu-day-note">' + esc(m.notes) + '</p>' : '') : '<p class="menu-day-note">Not posted yet</p>') +
        '</article>';
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('menuPrev').onclick = function () { offset--; load(); };
    document.getElementById('menuNext').onclick = function () { offset++; load(); };
    load();
  });
})();
