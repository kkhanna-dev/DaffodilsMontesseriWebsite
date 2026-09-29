/* ==========================================================
   DAFFODILS MONTESSORI - Family portal
   ========================================================== */
(function () {
  'use strict';

  var DM = window.DM;
  var esc = DM.esc;
  var sb = DM.sb;
  var me = null;
  var shell = null;
  var cache = {};

  var GRADS = ['linear-gradient(135deg,#f6d365,#fda085)', 'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
    'linear-gradient(135deg,#d4fc79,#96e6a1)', 'linear-gradient(135deg,#fbc2eb,#a6c1ee)'];

  document.addEventListener('DOMContentLoaded', async function () {
    if (!DM.configured) { DM.offlineNotice(); return; }
    me = await DM.requireAuth();
    if (!me) return;

    var params = new URLSearchParams(location.search);
    if (params.get('paid')) {
      DM.toast('Thank you! Your payment went through. It may take a moment to appear below.');
      history.replaceState(null, '', 'portal.html#payments');
    } else if (params.get('canceled')) {
      DM.toast('Payment canceled. No charge was made.', 'error');
      history.replaceState(null, '', 'portal.html#payments');
    } else if (params.get('welcome')) {
      history.replaceState(null, '', 'portal.html#children');
    }

    shell = DM.appShell({
      profile: me,
      title: 'Family Portal',
      tabs: [
        { id: 'home', label: 'Overview', icon: 'fa-house' },
        { id: 'children', label: 'My Children', icon: 'fa-child-reaching', group: 'My family' },
        { id: 'documents', label: 'Documents', icon: 'fa-file-shield', group: 'My family' },
        { id: 'payments', label: 'Payments', icon: 'fa-credit-card', group: 'My family' },
        { id: 'reports', label: 'Daily Reports', icon: 'fa-clipboard-list', group: 'Day to day' },
        { id: 'absences', label: 'Attendance', icon: 'fa-calendar-check', group: 'Day to day' },
        { id: 'photos', label: 'Photos', icon: 'fa-images', group: 'Day to day' },
        { id: 'progress', label: 'Progress', icon: 'fa-seedling', group: 'Learning' },
        { id: 'conferences', label: 'Conferences', icon: 'fa-people-arrows', group: 'Learning' },
        { id: 'resources', label: 'Curriculum & Forms', icon: 'fa-folder-open', group: 'Learning' },
        { id: 'messages', label: 'Messages', icon: 'fa-envelope', group: 'Account' },
        { id: 'account', label: 'Account', icon: 'fa-user-gear', group: 'Account' }
      ],
      render: render
    });

    if (me.role === 'admin') {
      var side = document.querySelector('.app-side-foot');
      side.insertAdjacentHTML('afterbegin', '<a class="app-tab" href="admin.html"><i class="fas fa-gauge" aria-hidden="true"></i> Admin dashboard</a>');
    }
  });

  function render(tab, main) {
    var fn = { home: renderHome, children: renderChildren, reports: renderReports, absences: renderAbsences,
      resources: renderResources, payments: renderPayments, messages: renderMessages, account: renderAccount,
      documents: renderDocuments, photos: renderPhotos, progress: renderProgress, conferences: renderConferences }[tab];
    return fn(main);
  }

  /* ---------- data ---------- */
  async function loadChildren(force) {
    if (cache.children && !force) return cache.children;
    cache.children = await DM.q(sb.from('children')
      .select('*, program:programs(id, name, slug), rate:program_rates(id, label, amount_cents)')
      .eq('parent_id', me.id).order('created_at'));
    return cache.children;
  }

  async function loadPrograms() {
    if (cache.programs) return cache.programs;
    var rows = await DM.q(sb.from('programs').select('id, name, ages, slug, program_rates(id, label, amount_cents, sort_order)').eq('active', true).order('sort_order'));
    rows.forEach(function (p) { p.program_rates.sort(function (a, b) { return a.sort_order - b.sort_order; }); });
    cache.programs = rows;
    return rows;
  }

  function childAvatar(c, i) {
    return '<div class="child-avatar" style="background:' + GRADS[i % GRADS.length] + '">' + esc(DM.initials(c.full_name)) + '</div>';
  }

  function ageText(dob) {
    var d = DM.parseDay(dob);
    if (!d) return '';
    var now = new Date();
    var months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()) - (now.getDate() < d.getDate() ? 1 : 0);
    if (months < 0) return '';
    var y = Math.floor(months / 12), m = months % 12;
    return y ? y + ' yr' + (y > 1 ? 's' : '') + (m ? ' ' + m + ' mo' : '') : m + ' mo';
  }

  function head(title, sub, actions) {
    return '<div class="app-head"><div><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
      (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div>';
  }

  /* ---------- Overview ---------- */
  async function renderHome(main) {
    var res = await Promise.all([
      loadChildren(true),
      DM.q(sb.from('announcements').select('*').order('pinned', { ascending: false }).order('published_at', { ascending: false }).limit(5)),
      DM.q(sb.from('events').select('*').gte('event_date', DM.today()).order('event_date').limit(5)),
      DM.q(sb.from('daily_reports').select('*, child:children(full_name)').order('report_date', { ascending: false }).order('created_at', { ascending: false }).limit(1)),
      DM.q(sb.from('menu_days').select('*').eq('menu_date', DM.today())),
      DM.q(sb.from('family_documents').select('child_id, doc_type, status')),
      DM.q(sb.from('conference_slots').select('*, child:children(full_name)').not('child_id', 'is', null).gte('starts_at', new Date().toISOString()).order('starts_at'))
    ]);
    var kids = res[0], anns = res[1], events = res[2], latest = res[3][0];
    var menu = res[4][0], docs = res[5], myConfs = res[6];
    var first = String(me.full_name || '').split(' ')[0];
    var enrolled = kids.filter(function (k) { return k.status === 'enrolled'; });
    var pending = kids.filter(function (k) { return k.status === 'pending'; });

    var alert = '';
    if (!kids.length) {
      alert = '<div class="notice info" style="margin-bottom:18px"><i class="fas fa-child-reaching"></i><div><strong>Start here:</strong> add your child so our office can match them to a program. <button class="link-btn" data-go="children">Add a child</button></div></div>';
    } else if (pending.length) {
      alert = '<div class="notice warn" style="margin-bottom:18px"><i class="fas fa-hourglass-half"></i><div>We are reviewing ' +
        esc(pending.map(function (k) { return k.full_name; }).join(', ')) + '. Daily reports and curriculum unlock once enrollment is confirmed.</div></div>';
    }

    var missing = missingDocs(kids, docs);
    if (missing.length) {
      alert += '<div class="notice warn" style="margin-bottom:18px"><i class="fas fa-file-circle-exclamation"></i><div><strong>' + missing.length + ' document' + (missing.length > 1 ? 's' : '') +
        ' still needed</strong> before the first day. <button class="link-btn" data-go="documents">Upload documents</button></div></div>';
    }
    var extras = '';
    if (menu && (menu.lunch || menu.morning_snack || menu.afternoon_snack)) {
      extras += '<section class="app-card"><div class="app-card-head"><h2><i class="fas fa-utensils" style="color:var(--primary-dark);margin-right:8px"></i>Today\'s menu</h2><a class="btn btn-ghost btn-xs" href="menu.html">Full week</a></div>' +
        '<div class="report-grid">' + [['Morning snack', menu.morning_snack], ['Lunch', menu.lunch], ['Afternoon snack', menu.afternoon_snack]].filter(function (x) { return x[1]; })
          .map(function (x) { return '<div><b>' + x[0] + '</b>' + esc(x[1]) + '</div>'; }).join('') + '</div></section>';
    }
    if (myConfs.length) {
      extras += '<section class="app-card"><div class="app-card-head"><h2><i class="fas fa-people-arrows" style="color:var(--primary-dark);margin-right:8px"></i>Your conference</h2><button class="btn btn-ghost btn-xs" data-go="conferences">Manage</button></div>' +
        myConfs.map(function (c) { return '<div class="app-item"><h3>' + esc(c.child ? c.child.full_name : '') + '</h3><div class="meta"><span><i class="far fa-calendar"></i>' + esc(fmtSlot(c)) + '</span><span><i class="fas fa-location-dot"></i>' + esc(c.location) + '</span></div></div>'; }).join('') + '</section>';
    }

    var kidsHtml = kids.length ? kids.map(function (c, i) {
      return '<div class="app-item child-card">' + childAvatar(c, i) + '<div><div class="app-item-top"><h3>' + esc(c.full_name) + '</h3>' + DM.pill(c.status) + '</div>' +
        '<div class="meta"><span>' + esc(c.program ? c.program.name : 'Program not chosen') + (c.rate ? ' · ' + esc(c.rate.label) : '') + '</span>' +
        (c.date_of_birth ? '<span>' + esc(ageText(c.date_of_birth)) + '</span>' : '') + '</div></div></div>';
    }).join('') : DM.empty('fa-child-reaching', 'No children added yet.', '<button class="btn btn-primary btn-xs" data-go="children">Add a child</button>');

    var reportHtml = latest ? '<div class="app-item report-card"><div class="app-item-top"><h3>' + esc(latest.child ? latest.child.full_name : '') + '</h3><span class="meta">' +
      esc(DM.fmtDate(latest.report_date, { weekday: 'long', month: 'short', day: 'numeric' })) + '</span></div>' + reportGrid(latest) + '</div>' +
      '<p style="margin-top:10px"><button class="link-btn" data-go="reports">See all reports</button></p>'
      : DM.empty('fa-clipboard-list', enrolled.length ? 'No daily reports posted yet.' : 'Daily reports appear here once your child is enrolled.');

    var annHtml = anns.length ? anns.map(function (a) {
      return '<div class="app-item"><div class="app-item-top"><h3>' + (a.pinned ? '<i class="fas fa-thumbtack" style="color:var(--primary-dark);font-size:0.85em"></i> ' : '') + esc(a.title) + '</h3>' +
        (a.audience === 'families' ? DM.pill('families') : '') + '</div><div class="meta">' + esc(DM.fmtDate(a.published_at)) + '</div>' + (a.body ? '<p>' + esc(a.body) + '</p>' : '') + '</div>';
    }).join('') : DM.empty('fa-bullhorn', 'No announcements right now.');

    var evHtml = events.length ? events.map(function (e) {
      return '<div class="app-item"><div class="app-item-top"><h3>' + esc(e.title) + '</h3>' + DM.pill(e.type) + '</div><div class="meta"><span><i class="far fa-calendar"></i>' +
        esc(DM.fmtDate(e.event_date, { weekday: 'short', month: 'short', day: 'numeric' })) + '</span>' + (e.time_label ? '<span><i class="far fa-clock"></i>' + esc(e.time_label) + '</span>' : '') + '</div></div>';
    }).join('') : DM.empty('fa-calendar', 'No upcoming events.');

    main.innerHTML = head('Hi' + (first ? ', ' + first : '') + '!', 'Here is what is happening at Daffodils.',
      '<button class="btn btn-ghost btn-xs" data-go="absences"><i class="fas fa-calendar-xmark"></i> Report absence</button>' +
      (DM.cfg.stripeEnabled ? '<button class="btn btn-primary btn-xs" data-go="payments"><i class="fas fa-credit-card"></i> Pay tuition</button>' : '')) +
      alert +
      (extras ? '<div class="app-grid-2" style="margin-bottom:18px">' + extras + '</div>' : '') +
      '<div class="app-grid-2">' +
      '<section class="app-card"><div class="app-card-head"><h2>My children</h2><button class="btn btn-ghost btn-xs" data-go="children">Manage</button></div><div class="app-list">' + kidsHtml + '</div></section>' +
      '<section class="app-card"><div class="app-card-head"><h2>Latest daily report</h2></div>' + reportHtml + '</section>' +
      '</div><div class="app-grid-2" style="margin-top:18px">' +
      '<section class="app-card"><div class="app-card-head"><h2>Announcements</h2></div><div class="app-list">' + annHtml + '</div></section>' +
      '<section class="app-card"><div class="app-card-head"><h2>Upcoming events</h2><a class="btn btn-ghost btn-xs" href="events.html">Calendar</a></div><div class="app-list">' + evHtml + '</div></section>' +
      '</div>';
  }

  function reportGrid(r) {
    var parts = [['Mood', r.mood], ['Meals', r.meals], ['Nap', r.nap], ['Activities', r.activities], ['Notes', r.notes]].filter(function (x) { return x[1]; });
    return '<div class="report-grid">' + parts.map(function (x) { return '<div><b>' + x[0] + '</b>' + esc(x[1]) + '</div>'; }).join('') + '</div>';
  }

  /* ---------- Children ---------- */
  async function renderChildren(main) {
    var kids = await loadChildren(true);
    await loadPrograms();

    var list = kids.length ? kids.map(function (c, i) {
      var locked = c.status === 'enrolled';
      return '<div class="app-item child-card">' + childAvatar(c, i) + '<div>' +
        '<div class="app-item-top"><div><h3>' + esc(c.full_name) + '</h3><div class="meta">' +
        (c.date_of_birth ? '<span><i class="fas fa-cake-candles"></i>' + esc(DM.fmtDate(c.date_of_birth)) + ' (' + esc(ageText(c.date_of_birth)) + ')</span>' : '') +
        '<span><i class="fas fa-shapes"></i>' + esc(c.program ? c.program.name + (c.rate ? ' · ' + c.rate.label : '') : 'No program chosen') + '</span>' +
        (c.start_date ? '<span><i class="fas fa-flag"></i>Starts ' + esc(DM.fmtDate(c.start_date)) + '</span>' : '') +
        '</div></div>' + DM.pill(c.status) + '</div>' +
        '<dl class="kv">' +
        '<dt>Allergies</dt><dd>' + esc(c.allergies || 'None listed') + '</dd>' +
        (c.medical_notes ? '<dt>Medical notes</dt><dd>' + esc(c.medical_notes) + '</dd>' : '') +
        '<dt>Emergency contact</dt><dd>' + esc([c.emergency_contact_name, c.emergency_contact_phone].filter(Boolean).join(' · ') || 'Not provided') + '</dd>' +
        '<dt>Pickup list</dt><dd>' + esc(c.authorized_pickups || 'Parents only') + '</dd>' +
        '</dl>' +
        (c.status === 'pending' ? '<p class="meta" style="margin-top:10px"><i class="fas fa-hourglass-half"></i> Waiting for the office to confirm enrollment.</p>' : '') +
        (c.status === 'waitlisted' ? '<p class="meta" style="margin-top:10px"><i class="fas fa-list-ol"></i> On the waitlist. We will reach out when a spot opens.</p>' : '') +
        '<div class="row-actions"><button class="btn btn-ghost btn-xs" data-edit="' + c.id + '"><i class="fas fa-pen"></i> Edit details</button>' +
        (!locked && c.status !== 'waitlisted' ? '<button class="btn btn-ghost btn-xs" data-remove="' + c.id + '"><i class="fas fa-trash"></i> Remove</button>' : '') +
        '</div></div></div>';
    }).join('') : DM.empty('fa-child-reaching', 'Add each child who attends or will attend Daffodils. Our office confirms their program and start date.');

    main.innerHTML = head('My children', 'Keep allergies, emergency contacts, and pickup lists up to date.',
      '<button class="btn btn-primary" id="addChild"><i class="fas fa-plus"></i> Add a child</button>') +
      '<section class="app-card"><div class="app-list">' + list + '</div></section>';

    main.querySelector('#addChild').onclick = function () { childDialog(null); };
    main.querySelectorAll('[data-edit]').forEach(function (b) {
      b.onclick = function () { childDialog(kids.find(function (k) { return k.id === b.dataset.edit; })); };
    });
    main.querySelectorAll('[data-remove]').forEach(function (b) {
      b.onclick = async function () {
        var c = kids.find(function (k) { return k.id === b.dataset.remove; });
        if (!await DM.confirm('Remove ' + c.full_name + ' from your account?', { danger: true, okLabel: 'Remove' })) return;
        try {
          await DM.q(sb.from('children').delete().eq('id', c.id));
          DM.toast('Removed');
          shell.refresh();
        } catch (e) { DM.toast(DM.friendlyError(e), 'error'); }
      };
    });
  }

  function childDialog(c) {
    var programs = cache.programs || [];
    var options = [['', 'Not sure yet']];
    programs.forEach(function (p) {
      p.program_rates.forEach(function (r) {
        options.push([p.id + '|' + r.id, p.name + ' (' + p.ages + ') - ' + r.label + ', ' + DM.money(r.amount_cents) + '/mo']);
      });
    });
    var locked = c && c.status === 'enrolled';
    var fields = [
      { name: 'full_name', label: "Child's full name", required: true, maxlength: 120, full: true },
      { name: 'date_of_birth', label: 'Date of birth', type: 'date', required: true, max: DM.today() }
    ];
    if (!locked) fields.push({ name: 'program', label: 'Program', type: 'select', options: options });
    fields.push(
      { name: 'allergies', label: 'Allergies', type: 'textarea', rows: 2, placeholder: 'Food, medicine, environmental... or "None"' },
      { name: 'medical_notes', label: 'Medical notes / medications', type: 'textarea', rows: 2 },
      { name: 'emergency_contact_name', label: 'Emergency contact name', required: true, maxlength: 120 },
      { name: 'emergency_contact_phone', label: 'Emergency contact phone', type: 'tel', required: true, maxlength: 40 },
      { name: 'authorized_pickups', label: 'Also allowed to pick up', type: 'textarea', rows: 2, placeholder: 'Names and relationship, e.g. "Anita Rao (grandmother)"' }
    );
    var vals = c ? Object.assign({}, c, { program: c.program_id && c.rate_id ? c.program_id + '|' + c.rate_id : '' }) : {};

    DM.formDialog({
      title: c ? 'Edit ' + c.full_name : 'Add a child',
      intro: locked ? 'Program changes for enrolled children go through the office. Send us a message if you need one.' : '',
      fields: fields,
      values: vals,
      wide: true,
      submitLabel: c ? 'Save changes' : 'Add child',
      onSubmit: async function (v) {
        var row = {
          full_name: v.full_name, date_of_birth: v.date_of_birth, allergies: v.allergies, medical_notes: v.medical_notes,
          emergency_contact_name: v.emergency_contact_name, emergency_contact_phone: v.emergency_contact_phone, authorized_pickups: v.authorized_pickups
        };
        if (!locked) {
          var parts = (v.program || '').split('|');
          row.program_id = parts[0] || null;
          row.rate_id = parts[1] || null;
        }
        if (c) await DM.q(sb.from('children').update(row).eq('id', c.id));
        else await DM.q(sb.from('children').insert(row));
        DM.toast(c ? 'Saved' : 'Child added. Our office will be in touch about enrollment.');
        shell.refresh();
      }
    });
  }

  /* ---------- Daily reports ---------- */
  async function renderReports(main) {
    var kids = await loadChildren();
    var enrolled = kids.filter(function (k) { return k.status === 'enrolled'; });
    var filter = main.dataset.child || '';
    var q = sb.from('daily_reports').select('*, child:children(full_name)').order('report_date', { ascending: false }).order('created_at', { ascending: false }).limit(100);
    if (filter) q = q.eq('child_id', filter);
    var rows = await DM.q(q);

    var seg = enrolled.length > 1 ? '<div class="seg" role="group" aria-label="Filter by child"><button aria-pressed="' + (!filter) + '" data-child="">All</button>' +
      enrolled.map(function (k) { return '<button aria-pressed="' + (filter === k.id) + '" data-child="' + k.id + '">' + esc(k.full_name.split(' ')[0]) + '</button>'; }).join('') + '</div>' : '';

    main.innerHTML = head('Daily reports', 'Notes from the classroom about meals, rest, and what your child explored.') +
      (seg ? '<div class="toolbar">' + seg + '</div>' : '') +
      '<section class="app-card"><div class="app-list">' + (rows.length ? rows.map(function (r) {
        return '<article class="app-item report-card"><div class="app-item-top"><h3>' + esc(r.child ? r.child.full_name : '') + '</h3><span class="meta">' +
          esc(DM.fmtDate(r.report_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })) + '</span></div>' + reportGrid(r) + '</article>';
      }).join('') : DM.empty('fa-clipboard-list', enrolled.length ? 'No reports yet. Teachers post them at the end of the day.' : 'Daily reports appear here once your child is enrolled.')) + '</div></section>';

    main.querySelectorAll('[data-child]').forEach(function (b) {
      b.onclick = function () { main.dataset.child = b.dataset.child; renderReports(main); };
    });
  }

  /* ---------- Absences ---------- */
  async function renderAbsences(main) {
    var kids = await loadChildren();
    var active = kids.filter(function (k) { return k.status === 'enrolled' || k.status === 'pending'; });
    var rows = await DM.q(sb.from('absences').select('*, child:children(full_name)').order('absence_date', { ascending: false }).limit(100));
    var att = await DM.q(sb.from('attendance').select('*, child:children(full_name)').order('att_date', { ascending: false }).limit(40));
    var today = DM.today();
    function tm(ts) { return ts ? new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '-'; }
    var attHtml = '<section class="app-card"><div class="app-card-head"><div><h2>Check-in history</h2><p>Drop-off and pickup times recorded by teachers.</p></div></div>' +
      (att.length ? '<div class="app-table-wrap"><table class="app-table"><thead><tr><th>Date</th><th>Child</th><th>In</th><th>Out</th><th>Picked up by</th></tr></thead><tbody>' +
        att.map(function (a) {
          return '<tr><td data-label="Date">' + esc(DM.fmtDate(a.att_date, { weekday: 'short', month: 'short', day: 'numeric' })) + '</td><td data-label="Child">' + esc(a.child ? a.child.full_name : '') + '</td>' +
            '<td data-label="In">' + tm(a.check_in_at) + '</td><td data-label="Out">' + tm(a.check_out_at) + '</td><td data-label="Picked up by">' + esc(a.picked_up_by || '-') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : DM.empty('fa-door-open', 'No check-ins recorded yet.')) + '</section>';

    main.innerHTML = head('Attendance', 'Report an absence and see drop-off and pickup times.') +
      '<section class="app-card"><div class="app-card-head"><h2>Report an absence</h2></div>' +
      (active.length ? '<form id="absForm" class="dm-fields" style="margin-top:0">' +
        '<div class="dm-field"><label for="absChild">Child</label><select id="absChild" name="child" required>' +
        active.map(function (k) { return '<option value="' + k.id + '">' + esc(k.full_name) + '</option>'; }).join('') + '</select></div>' +
        '<div class="dm-field"><label for="absDate">Date</label><input type="date" id="absDate" name="date" min="' + today + '" value="' + today + '" required></div>' +
        '<div class="dm-field full"><label for="absReason">Reason (optional)</label><input type="text" id="absReason" name="reason" maxlength="300" placeholder="Sick, appointment, family trip..."></div>' +
        '<div class="dm-field full"><button class="btn btn-primary" type="submit" style="justify-self:start"><i class="fas fa-paper-plane"></i> Send to office</button></div></form>'
        : DM.empty('fa-child-reaching', 'Add your child first.', '<button class="btn btn-primary btn-xs" data-go="children">Add a child</button>')) +
      '</section>' +
      '<section class="app-card"><div class="app-card-head"><h2>Reported absences</h2></div>' +
      (rows.length ? '<div class="app-table-wrap"><table class="app-table"><thead><tr><th>Date</th><th>Child</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>' +
        rows.map(function (a) {
          return '<tr><td data-label="Date">' + esc(DM.fmtDate(a.absence_date, { weekday: 'short', month: 'short', day: 'numeric' })) + '</td>' +
            '<td data-label="Child">' + esc(a.child ? a.child.full_name : '') + '</td><td data-label="Reason">' + esc(a.reason || '-') + '</td>' +
            '<td data-label="Status">' + (a.acknowledged ? DM.pill('confirmed') : DM.pill('new')) + '</td>' +
            '<td class="actions">' + (a.absence_date >= today ? '<button class="btn btn-ghost btn-xs" data-cancel="' + a.id + '">Cancel</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : DM.empty('fa-calendar-check', 'No absences reported.')) + '</section>' + attHtml;

    var form = main.querySelector('#absForm');
    if (form) form.onsubmit = async function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var btn = form.querySelector('button');
      btn.disabled = true;
      try {
        await DM.q(sb.from('absences').insert({ child_id: form.child.value, absence_date: form.date.value, reason: form.reason.value.trim() }));
        DM.toast('Absence reported. Thank you for letting us know.');
        shell.refresh();
      } catch (err) { btn.disabled = false; DM.toast(DM.friendlyError(err), 'error'); }
    };
    main.querySelectorAll('[data-cancel]').forEach(function (b) {
      b.onclick = async function () {
        if (!await DM.confirm('Cancel this absence report?', { okLabel: 'Yes, cancel it' })) return;
        try { await DM.q(sb.from('absences').delete().eq('id', b.dataset.cancel)); DM.toast('Canceled'); shell.refresh(); }
        catch (err) { DM.toast(DM.friendlyError(err), 'error'); }
      };
    });
  }

  /* ---------- Resources ---------- */
  async function renderResources(main) {
    var kids = await loadChildren();
    var rows = await DM.q(sb.from('resources').select('*, program:programs(name, sort_order)').order('created_at', { ascending: false }));
    var groups = {};
    rows.forEach(function (r) {
      var g = r.program ? r.program.name : 'For all families';
      (groups[g] = groups[g] || []).push(r);
    });
    var names = Object.keys(groups).sort(function (a, b) { return a === 'For all families' ? -1 : b === 'For all families' ? 1 : a.localeCompare(b); });
    var hasEnrolled = kids.some(function (k) { return k.status === 'enrolled'; });

    main.innerHTML = head('Curriculum & forms', 'Lesson plans, handbooks, and forms from the school.') +
      (rows.length ? names.map(function (g) {
        return '<section class="app-card"><div class="app-card-head"><h2>' + esc(g) + '</h2></div><div class="app-list">' + groups[g].map(function (r) {
          var icon = /\.pdf$/i.test(r.file_name) ? 'fa-file-pdf' : /\.(docx?|rtf)$/i.test(r.file_name) ? 'fa-file-word' : 'fa-file';
          return '<div class="app-item"><div class="app-item-top"><div><h3><i class="far ' + icon + '" style="color:var(--accent);margin-right:6px"></i>' + esc(r.title) + '</h3>' +
            '<div class="meta"><span>Added ' + esc(DM.fmtDate(r.created_at)) + '</span></div></div>' +
            '<button class="btn btn-green btn-xs" data-dl="' + esc(r.file_path) + '" data-name="' + esc(r.file_name) + '"><i class="fas fa-download"></i> Download</button></div>' +
            (r.description ? '<p>' + esc(r.description) + '</p>' : '') + '</div>';
        }).join('') + '</div></section>';
      }).join('') : '<section class="app-card">' + DM.empty('fa-folder-open', hasEnrolled ? 'Nothing posted yet. Check back soon.' : 'Curriculum and forms unlock once your child is enrolled.') + '</section>');

    main.querySelectorAll('[data-dl]').forEach(function (b) {
      b.onclick = async function () {
        b.disabled = true;
        var r = await sb.storage.from('resources').createSignedUrl(b.dataset.dl, 120, { download: b.dataset.name || true });
        b.disabled = false;
        if (r.error) { DM.toast(DM.friendlyError(r.error), 'error'); return; }
        window.location.href = r.data.signedUrl;
      };
    });
  }

  /* ---------- Payments ---------- */
  async function renderPayments(main) {
    var kids = await loadChildren();
    var rows = await DM.q(sb.from('payments').select('*, child:children(full_name)').order('created_at', { ascending: false }).limit(100));
    var payable = kids.filter(function (k) { return k.status === 'enrolled' || k.status === 'pending'; });
    var paidTotal = rows.filter(function (p) { return p.status === 'paid'; }).reduce(function (s, p) { return s + p.amount_cents; }, 0);

    var payCard;
    if (!DM.cfg.stripeEnabled) {
      payCard = '<div class="notice info"><i class="fas fa-circle-info"></i><div>Online card payments are not switched on yet. Please pay by check or in person, or <button class="link-btn" data-go="messages">message the office</button> with questions.</div></div>';
    } else if (!payable.length) {
      payCard = DM.empty('fa-child-reaching', 'Add your child before making a payment.', '<button class="btn btn-primary btn-xs" data-go="children">Add a child</button>');
    } else {
      payCard = '<form id="payForm" class="dm-fields" style="margin-top:0">' +
        '<div class="dm-field"><label for="payChild">Child</label><select id="payChild" name="child" required>' +
        payable.map(function (k) { return '<option value="' + k.id + '">' + esc(k.full_name) + '</option>'; }).join('') + '</select></div>' +
        '<div class="dm-field"><label for="payKind">What are you paying?</label><select id="payKind" name="kind"></select></div>' +
        '<div class="dm-field" id="amtWrap" hidden><label for="payAmount">Amount ($)</label><input type="number" id="payAmount" name="amount" min="1" max="10000" step="0.01"></div>' +
        '<div class="dm-field" id="noteWrap" hidden><label for="payNote">What is it for?</label><input type="text" id="payNote" name="note" maxlength="120" placeholder="e.g. Enrollment deposit"></div>' +
        '<div class="dm-field full"><button class="btn btn-primary btn-large" type="submit" style="justify-self:start"><i class="fas fa-lock"></i> <span id="payBtnText">Continue to secure checkout</span></button>' +
        '<small><i class="fab fa-stripe"></i> Card details are handled by Stripe. Daffodils never sees or stores your card number.</small></div></form>';
    }

    main.innerHTML = head('Payments', 'Pay tuition online and see your payment history.') +
      '<section class="app-card"><div class="app-card-head"><h2>Make a payment</h2></div>' + payCard + '</section>' +
      '<section class="app-card"><div class="app-card-head"><div><h2>Payment history</h2><p>Total paid: ' + DM.money(paidTotal) + '</p></div></div>' +
      (rows.length ? '<div class="app-table-wrap"><table class="app-table"><thead><tr><th>Date</th><th>Description</th><th>Child</th><th>Method</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>' +
        rows.map(function (p) {
          return '<tr><td data-label="Date">' + esc(DM.fmtDate(p.paid_at || p.created_at)) + '</td><td data-label="Description">' + esc(p.description || 'Payment') + '</td>' +
            '<td data-label="Child">' + esc(p.child ? p.child.full_name : '-') + '</td><td data-label="Method">' + esc(p.method === 'stripe' ? 'Card' : p.method) + '</td>' +
            '<td data-label="Amount" class="num">' + DM.money(p.amount_cents) + '</td><td data-label="Status">' + DM.pill(p.status) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : DM.empty('fa-receipt', 'No payments yet.')) + '</section>';

    var form = main.querySelector('#payForm');
    if (!form) return;
    var kindSel = form.kind, amtWrap = main.querySelector('#amtWrap'), noteWrap = main.querySelector('#noteWrap');

    function fillKinds() {
      var c = payable.find(function (k) { return k.id === form.child.value; });
      var opts = '';
      if (c && c.rate) {
        var month = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
        opts += '<option value="tuition">' + esc(month + ' tuition, ' + (c.rate.label || '') + ' (' + DM.money(c.rate.amount_cents) + ')') + '</option>';
      }
      opts += '<option value="custom">Another amount</option>';
      kindSel.innerHTML = opts;
      toggleCustom();
    }
    function toggleCustom() {
      var custom = kindSel.value === 'custom';
      amtWrap.hidden = !custom; noteWrap.hidden = !custom;
      form.amount.required = custom; form.note.required = custom;
    }
    form.child.onchange = fillKinds;
    kindSel.onchange = toggleCustom;
    fillKinds();

    form.onsubmit = async function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      main.querySelector('#payBtnText').textContent = 'Opening checkout...';
      try {
        var body = { child_id: form.child.value, kind: kindSel.value, return_url: DM.url('portal.html') };
        if (kindSel.value === 'custom') { body.amount_cents = DM.toCents(form.amount.value); body.description = form.note.value.trim(); }
        var r = await sb.functions.invoke('create-checkout', { body: body });
        if (r.error) {
          var msg = r.error.message;
          try { var ctx = await r.error.context.json(); msg = ctx.error || msg; } catch (x) { /* ignore */ }
          throw new Error(msg);
        }
        if (!r.data || !r.data.url) throw new Error('Checkout could not start. Please try again.');
        window.location.href = r.data.url;
      } catch (err) {
        btn.disabled = false;
        main.querySelector('#payBtnText').textContent = 'Continue to secure checkout';
        DM.toast(DM.friendlyError(err), 'error');
      }
    };
  }

  /* ---------- Messages ---------- */
  async function renderMessages(main) {
    var rows = await DM.q(sb.from('contact_messages').select('*').eq('submitted_by', me.id).order('created_at', { ascending: false }).limit(50));
    main.innerHTML = head('Messages', 'Questions for the office? We reply by email or phone, usually within a day.') +
      '<section class="app-card"><div class="app-card-head"><h2>New message</h2></div>' +
      '<form id="msgForm" class="dm-fields" style="margin-top:0">' +
      '<div class="dm-field full"><label for="msgSubject">Subject</label><select id="msgSubject" name="subject">' +
      ['General question', 'Enrollment', 'Tuition & billing', 'Schedule change', 'Health or allergies', 'Pickup change', 'Other'].map(function (s) { return '<option>' + s + '</option>'; }).join('') +
      '</select></div><div class="dm-field full"><label for="msgBody">Message</label><textarea id="msgBody" name="message" rows="4" maxlength="5000" required></textarea></div>' +
      '<div class="dm-field full"><button class="btn btn-primary" type="submit" style="justify-self:start"><i class="fas fa-paper-plane"></i> Send</button></div></form></section>' +
      '<section class="app-card"><div class="app-card-head"><h2>Sent</h2></div><div class="app-list">' +
      (rows.length ? rows.map(function (m) {
        return '<div class="app-item"><div class="app-item-top"><h3>' + esc(m.subject || 'Message') + '</h3>' + DM.pill(m.status) + '</div><div class="meta">' + esc(DM.fmtDateTime(m.created_at)) + '</div><p>' + esc(m.message) + '</p></div>';
      }).join('') : DM.empty('fa-envelope', 'No messages yet.')) + '</div></section>';

    var form = main.querySelector('#msgForm');
    form.onsubmit = async function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var btn = form.querySelector('button');
      btn.disabled = true;
      try {
        await DM.q(sb.from('contact_messages').insert({ name: me.full_name || me.email, email: me.email, phone: me.phone || '', subject: form.subject.value, message: form.message.value.trim() }));
        DM.toast('Message sent');
        shell.refresh();
      } catch (err) { btn.disabled = false; DM.toast(DM.friendlyError(err), 'error'); }
    };
  }

  /* ---------- Account ---------- */
  async function renderAccount(main) {
    me = await DM.getProfile(true);
    main.innerHTML = head('Account', 'Your contact details and login.') +
      '<div class="app-grid-2">' +
      '<section class="app-card"><div class="app-card-head"><h2>Contact details</h2></div>' +
      '<form id="profForm" class="dm-fields" style="margin-top:0">' +
      '<div class="dm-field full"><label for="pName">Name</label><input id="pName" name="full_name" maxlength="120" required value="' + esc(me.full_name) + '"></div>' +
      '<div class="dm-field full"><label for="pPhone">Phone</label><input id="pPhone" name="phone" type="tel" maxlength="40" value="' + esc(me.phone) + '"></div>' +
      '<div class="dm-field full"><button class="btn btn-primary" type="submit" style="justify-self:start">Save</button></div></form></section>' +
      '<section class="app-card"><div class="app-card-head"><h2>Login</h2></div>' +
      '<form id="emailForm" class="dm-fields" style="margin-top:0">' +
      '<div class="dm-field full"><label for="aEmail">Email</label><input id="aEmail" name="email" type="email" required value="' + esc(me.email) + '"><small>Changing it sends a confirmation link to the new address.</small></div>' +
      '<div class="dm-field full"><button class="btn btn-ghost" type="submit" style="justify-self:start">Update email</button></div></form>' +
      '<form id="pwForm" class="dm-fields">' +
      '<div class="dm-field full"><label for="aPw">New password</label><input id="aPw" name="password" type="password" minlength="8" autocomplete="new-password" required></div>' +
      '<div class="dm-field full"><button class="btn btn-ghost" type="submit" style="justify-self:start">Change password</button></div></form>' +
      '</section></div>' +
      '<section class="app-card"><div class="app-card-head"><div><h2>Log out</h2><p>Sign out of the portal on this device.</p></div><button class="btn btn-ghost" id="logout2"><i class="fas fa-sign-out-alt"></i> Log out</button></div></section>';

    main.querySelector('#logout2').onclick = function () { DM.signOut(); };

    var pf = main.querySelector('#profForm');
    pf.onsubmit = async function (e) {
      e.preventDefault();
      try {
        await DM.q(sb.from('profiles').update({ full_name: pf.full_name.value.trim(), phone: pf.phone.value.trim() }).eq('id', me.id));
        DM.toast('Saved');
        me = await DM.getProfile(true);
      } catch (err) { DM.toast(DM.friendlyError(err), 'error'); }
    };
    var ef = main.querySelector('#emailForm');
    ef.onsubmit = async function (e) {
      e.preventDefault();
      if (!ef.checkValidity()) { ef.reportValidity(); return; }
      var r = await sb.auth.updateUser({ email: ef.email.value.trim() }, { emailRedirectTo: DM.url('portal.html#account') });
      if (r.error) DM.toast(DM.friendlyError(r.error), 'error');
      else DM.toast('Check your new inbox for a confirmation link.');
    };
    var pw = main.querySelector('#pwForm');
    pw.onsubmit = async function (e) {
      e.preventDefault();
      if (!pw.checkValidity()) { pw.reportValidity(); return; }
      var r = await sb.auth.updateUser({ password: pw.password.value });
      if (r.error) DM.toast(DM.friendlyError(r.error), 'error');
      else { DM.toast('Password changed'); pw.reset(); }
    };
  }
  /* ---------- helpers for new tabs ---------- */
  function missingDocs(kids, docs) {
    var out = [];
    kids.filter(function (k) { return k.status === 'enrolled' || k.status === 'pending'; }).forEach(function (k) {
      DM.DOC_TYPES.filter(function (t) { return t.required; }).forEach(function (t) {
        var ok = docs.some(function (d) { return d.child_id === k.id && d.doc_type === t.id && d.status !== 'needs_update'; });
        if (!ok) out.push({ child: k, type: t });
      });
    });
    return out;
  }

  function fmtSlot(c) {
    var d = new Date(c.starts_at);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  /* ---------- Documents ---------- */
  async function renderDocuments(main) {
    var kids = (await loadChildren(true)).filter(function (k) { return k.status !== 'withdrawn'; });
    var docs = await DM.q(sb.from('family_documents').select('*').order('created_at', { ascending: false }));
    var STATUS = { submitted: 'Received, under review', approved: 'Approved', needs_update: 'Needs an update' };

    main.innerHTML = head('Documents', 'Upload immunization records and signed forms. The office reviews each one.',
      kids.length ? '<button class="btn btn-primary" id="uploadDoc"><i class="fas fa-upload"></i> Upload a document</button>' : '') +
      '<div class="notice info" style="margin-bottom:18px"><i class="fas fa-circle-info"></i><div>Blank forms are in <button class="link-btn" data-go="resources">Curriculum &amp; Forms</button>. Sign them, then snap a photo or scan and upload here. PDF, JPG, or PNG up to 10 MB.</div></div>' +
      (kids.length ? kids.map(function (k) {
        var mine = docs.filter(function (d) { return d.child_id === k.id; });
        var checklist = DM.DOC_TYPES.filter(function (t) { return t.required; }).map(function (t) {
          var d = mine.find(function (x) { return x.doc_type === t.id; });
          var st = d ? d.status : 'missing';
          var icon = st === 'approved' ? 'fa-circle-check' : st === 'submitted' ? 'fa-clock' : st === 'needs_update' ? 'fa-rotate' : 'fa-circle-exclamation';
          return '<li class="doc-check ' + st + '"><i class="fas ' + icon + '" aria-hidden="true"></i><div><strong>' + esc(t.label) + '</strong><span>' +
            (d ? esc(STATUS[st]) : 'Not uploaded yet') + (d && d.admin_note ? ' · ' + esc(d.admin_note) : '') + '</span></div>' +
            (st === 'missing' || st === 'needs_update' ? '<button class="btn btn-soft btn-xs" data-up="' + k.id + '|' + t.id + '">Upload</button>' : '') + '</li>';
        }).join('');
        var files = mine.map(function (d) {
          return '<tr><td data-label="Document"><strong>' + esc(DM.docLabel(d.doc_type)) + '</strong>' + (d.title ? '<br><span class="meta">' + esc(d.title) + '</span>' : '') + '</td>' +
            '<td data-label="File">' + esc(d.file_name) + '</td><td data-label="Uploaded">' + esc(DM.fmtDate(d.created_at)) + '</td>' +
            '<td data-label="Status">' + DM.pill(d.status.replace('_', '-')) + '</td>' +
            '<td class="actions"><button class="btn btn-ghost btn-xs" data-view="' + esc(d.file_path) + '">View</button>' +
            (d.status !== 'approved' ? '<button class="btn btn-ghost btn-xs" data-deldoc="' + d.id + '" aria-label="Delete"><i class="fas fa-trash"></i></button>' : '') + '</td></tr>';
        }).join('');
        return '<section class="app-card"><div class="app-card-head"><h2>' + esc(k.full_name) + '</h2>' + DM.pill(k.status) + '</div>' +
          '<ul class="doc-checklist">' + checklist + '</ul>' +
          (files ? '<div class="app-table-wrap" style="margin-top:14px"><table class="app-table"><thead><tr><th>Document</th><th>File</th><th>Uploaded</th><th>Status</th><th></th></tr></thead><tbody>' + files + '</tbody></table></div>' : '') +
          '</section>';
      }).join('') : '<section class="app-card">' + DM.empty('fa-child-reaching', 'Add your child first, then upload their documents here.', '<button class="btn btn-primary btn-xs" data-go="children">Add a child</button>') + '</section>');

    function upload(childId, type) {
      DM.formDialog({
        title: 'Upload a document',
        fields: [
          { name: 'child', label: 'Child', type: 'select', required: true, options: kids.map(function (k) { return [k.id, k.full_name]; }) },
          { name: 'doc_type', label: 'Document', type: 'select', required: true, options: DM.DOC_TYPES.map(function (t) { return [t.id, t.label]; }) },
          { name: 'file', label: 'File (PDF, JPG, or PNG, up to 10 MB)', type: 'file', required: true, full: true, accept: 'application/pdf,image/jpeg,image/png,image/heic,image/webp' },
          { name: 'title', label: 'Note (optional)', full: true, placeholder: 'e.g., Updated after 4-year shots' }
        ],
        values: { child: childId || (kids[0] && kids[0].id), doc_type: type || 'immunization' },
        submitLabel: 'Upload',
        onSubmit: async function (v) {
          if (v.file.size > 10 * 1024 * 1024) throw new Error('That file is over 10 MB. Try a smaller photo or scan.');
          var path = me.id + '/' + v.child + '/' + Date.now() + '-' + DM.safeFileName(v.file.name);
          var up = await sb.storage.from('documents').upload(path, v.file, { contentType: v.file.type || 'application/pdf' });
          if (up.error) throw up.error;
          var ins = await sb.from('family_documents').insert({ child_id: v.child, doc_type: v.doc_type, title: v.title, file_path: path, file_name: v.file.name });
          if (ins.error) { await sb.storage.from('documents').remove([path]); throw ins.error; }
          DM.toast('Uploaded. The office will review it.');
          shell.refresh();
        }
      });
    }
    var ub = main.querySelector('#uploadDoc');
    if (ub) ub.onclick = function () { upload(null, null); };
    main.querySelectorAll('[data-up]').forEach(function (b) { b.onclick = function () { var p = b.dataset.up.split('|'); upload(p[0], p[1]); }; });
    main.querySelectorAll('[data-view]').forEach(function (b) {
      b.onclick = async function () {
        var r = await sb.storage.from('documents').createSignedUrl(b.dataset.view, 120);
        if (r.error) DM.toast(DM.friendlyError(r.error), 'error'); else window.open(r.data.signedUrl, '_blank', 'noopener');
      };
    });
    main.querySelectorAll('[data-deldoc]').forEach(function (b) {
      b.onclick = async function () {
        var d = docs.find(function (x) { return x.id === b.dataset.deldoc; });
        if (!await DM.confirm('Delete this upload?', { danger: true, okLabel: 'Delete' })) return;
        try {
          await DM.q(sb.from('family_documents').delete().eq('id', d.id));
          await sb.storage.from('documents').remove([d.file_path]);
          DM.toast('Deleted');
          shell.refresh();
        } catch (err) { DM.toast(DM.friendlyError(err), 'error'); }
      };
    });
  }

  /* ---------- Photos ---------- */
  async function renderPhotos(main) {
    var rows = await DM.q(sb.from('gallery_photos').select('*').order('taken_on', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(200));
    var priv = rows.filter(function (p) { return p.bucket === 'family-photos'; }).map(function (p) { return p.file_path; });
    var signed = {};
    if (priv.length) {
      var r = await sb.storage.from('family-photos').createSignedUrls(priv, 3600);
      (r.data || []).forEach(function (x) { if (x.signedUrl) signed[x.path] = x.signedUrl; });
    }
    var photos = rows.map(function (p) {
      return { url: p.bucket === 'media' ? sb.storage.from('media').getPublicUrl(p.file_path).data.publicUrl : signed[p.file_path], caption: p.caption, families: p.visibility === 'families', date: p.taken_on || p.created_at };
    }).filter(function (p) { return p.url; });

    main.innerHTML = head('Photos', 'Moments from the classroom. Families-only photos are private to enrolled families.') +
      '<section class="app-card">' + (photos.length ? '<div class="photo-grid">' + photos.map(function (p, i) {
        return '<button type="button" class="photo-tile" data-i="' + i + '"><img src="' + esc(p.url) + '" alt="' + esc(p.caption || 'Class photo') + '" loading="lazy">' +
          (p.families ? '<span class="photo-badge"><i class="fas fa-lock"></i> Families</span>' : '') +
          (p.caption ? '<span class="photo-cap">' + esc(p.caption) + '</span>' : '') + '</button>';
      }).join('') + '</div>' : DM.empty('fa-images', 'No photos yet. Teachers share classroom moments here.')) + '</section>';
    main.querySelectorAll('.photo-tile').forEach(function (b) { b.onclick = function () { DM.lightbox(photos, Number(b.dataset.i)); }; });
  }

  /* ---------- Progress ---------- */
  var STAGES = { introduced: 'Introduced', practicing: 'Practicing', mastered: 'Mastered' };
  async function renderProgress(main) {
    var kids = (await loadChildren()).filter(function (k) { return k.status === 'enrolled'; });
    if (!kids.length) {
      main.innerHTML = head('Progress', 'Lessons your child has been shown and is working on.') + '<section class="app-card">' + DM.empty('fa-seedling', 'Progress appears here once your child is enrolled.') + '</section>';
      return;
    }
    var sel = main.dataset.child && kids.some(function (k) { return k.id === main.dataset.child; }) ? main.dataset.child : kids[0].id;
    var rows = await DM.q(sb.from('child_lessons').select('stage, note, updated_at, lesson:lessons(area, name, sort_order)').eq('child_id', sel));
    var areas = {};
    rows.forEach(function (r) { if (!r.lesson) return; (areas[r.lesson.area] = areas[r.lesson.area] || []).push(r); });
    var ORDER = ['Practical Life', 'Sensorial', 'Language', 'Mathematics', 'Culture', 'Art & Music'];
    var counts = { introduced: 0, practicing: 0, mastered: 0 };
    rows.forEach(function (r) { counts[r.stage]++; });

    main.innerHTML = head('Progress', 'In Montessori, children move from a first lesson, to practice, to mastery at their own pace.') +
      (kids.length > 1 ? '<div class="toolbar"><div class="seg" role="group">' + kids.map(function (k) { return '<button type="button" data-child="' + k.id + '" aria-pressed="' + (k.id === sel) + '">' + esc(k.full_name.split(' ')[0]) + '</button>'; }).join('') + '</div></div>' : '') +
      '<div class="app-stats"><div class="app-stat"><div class="ico"><i class="fas fa-hand-sparkles"></i></div><div><b>' + counts.introduced + '</b><span>Introduced</span></div></div>' +
      '<div class="app-stat blue"><div class="ico"><i class="fas fa-repeat"></i></div><div><b>' + counts.practicing + '</b><span>Practicing</span></div></div>' +
      '<div class="app-stat green"><div class="ico"><i class="fas fa-star"></i></div><div><b>' + counts.mastered + '</b><span>Mastered</span></div></div></div>' +
      (rows.length ? ORDER.filter(function (a) { return areas[a]; }).map(function (a) {
        var list = areas[a].sort(function (x, y) { return x.lesson.sort_order - y.lesson.sort_order; });
        return '<section class="app-card"><div class="app-card-head"><h2>' + esc(a) + '</h2><span class="meta">' + list.length + ' lesson' + (list.length > 1 ? 's' : '') + '</span></div><ul class="lesson-list">' +
          list.map(function (r) { return '<li><span>' + esc(r.lesson.name) + (r.note ? '<small>' + esc(r.note) + '</small>' : '') + '</span><span class="stage ' + r.stage + '">' + STAGES[r.stage] + '</span></li>'; }).join('') + '</ul></section>';
      }).join('') : '<section class="app-card">' + DM.empty('fa-seedling', 'Teachers have not recorded lessons yet. Check back soon.') + '</section>');
    main.querySelectorAll('[data-child]').forEach(function (b) { b.onclick = function () { main.dataset.child = b.dataset.child; renderProgress(main); }; });
  }

  /* ---------- Conferences ---------- */
  async function renderConferences(main) {
    var kids = (await loadChildren()).filter(function (k) { return k.status === 'enrolled'; });
    var now = new Date().toISOString();
    var slots = kids.length ? await DM.q(sb.from('conference_slots').select('*').gte('starts_at', now).order('starts_at')) : [];
    var mine = slots.filter(function (s) { return s.child_id; });
    var open = slots.filter(function (s) { return !s.child_id; });
    var byDay = {};
    open.forEach(function (s) { var k = new Date(s.starts_at).toDateString(); (byDay[k] = byDay[k] || []).push(s); });
    var kidName = function (id) { var k = kids.find(function (x) { return x.id === id; }); return k ? k.full_name : ''; };
    var unbooked = kids.filter(function (k) { return !mine.some(function (m) { return m.child_id === k.id; }); });

    main.innerHTML = head('Conferences', 'Book a time to talk with your child\'s teacher.') +
      (!kids.length ? '<section class="app-card">' + DM.empty('fa-people-arrows', 'Conference sign-ups open to enrolled families.') + '</section>' :
      '<section class="app-card"><div class="app-card-head"><h2>Your bookings</h2></div>' + (mine.length ? '<div class="app-list">' + mine.map(function (m) {
        return '<div class="app-item"><div class="app-item-top"><div><h3>' + esc(kidName(m.child_id)) + '</h3><div class="meta"><span><i class="far fa-calendar"></i>' + esc(fmtSlot(m)) + '</span><span>' + m.minutes + ' min</span><span><i class="fas fa-location-dot"></i>' + esc(m.location) + '</span></div></div>' +
          '<button class="btn btn-ghost btn-xs" data-cancel="' + m.id + '">Cancel</button></div></div>';
      }).join('') + '</div>' : DM.empty('fa-calendar-plus', 'No conference booked.')) + '</section>' +
      (unbooked.length ? '<section class="app-card"><div class="app-card-head"><div><h2>Open times</h2><p>Pick a time for ' +
        (unbooked.length > 1 ? '<select id="confChild" class="app-input" style="width:auto;display:inline-block;padding:4px 10px">' + unbooked.map(function (k) { return '<option value="' + k.id + '">' + esc(k.full_name) + '</option>'; }).join('') + '</select>' : '<strong>' + esc(unbooked[0].full_name) + '</strong><input type="hidden" id="confChild" value="' + unbooked[0].id + '">') +
        '</p></div></div>' + (open.length ? Object.keys(byDay).map(function (day) {
          return '<div class="slot-day"><h3>' + esc(new Date(day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })) + '</h3><div class="slot-list">' +
            byDay[day].map(function (s) { return '<button type="button" class="slot-btn" data-book="' + s.id + '">' + esc(new Date(s.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })) + '<small>' + esc(s.location) + '</small></button>'; }).join('') + '</div></div>';
        }).join('') : DM.empty('fa-hourglass-half', 'No open times right now. We will post them before conference week.')) + '</section>' : ''));

    main.querySelectorAll('[data-book]').forEach(function (b) {
      b.onclick = async function () {
        var child = main.querySelector('#confChild').value;
        var s = open.find(function (x) { return x.id === b.dataset.book; });
        if (!await DM.confirm('Book ' + fmtSlot(s) + ' for ' + kidName(child) + '?', { title: 'Book this time?', okLabel: 'Book it' })) return;
        var r = await sb.rpc('book_conference_slot', { slot: s.id, child: child });
        if (r.error) { DM.toast(DM.friendlyError(r.error), 'error'); shell.refresh(); return; }
        DM.toast('Booked! See you then.');
        shell.refresh();
      };
    });
    main.querySelectorAll('[data-cancel]').forEach(function (b) {
      b.onclick = async function () {
        if (!await DM.confirm('Cancel this conference booking?', { okLabel: 'Cancel booking', danger: true })) return;
        var r = await sb.rpc('cancel_conference_booking', { slot: b.dataset.cancel });
        if (r.error) DM.toast(DM.friendlyError(r.error), 'error'); else DM.toast('Canceled');
        shell.refresh();
      };
    });
  }
})();
