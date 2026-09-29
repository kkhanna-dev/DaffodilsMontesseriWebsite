/* ==========================================================
   DAFFODILS MONTESSORI - Admin dashboard
   Every write here is also checked by the database security
   rules, so a non-admin cannot use this page even if they load it.
   ========================================================== */
(function () {
  'use strict';

  var DM = window.DM;
  var esc = DM.esc;
  var sb = DM.sb;
  var me = null;
  var shell = null;
  var state = {}; // per-tab filters

  var MOODS = ['Happy', 'Calm', 'Energetic', 'Curious', 'Tired', 'Fussy', 'Sad'];
  var EVENT_TYPES = [['general', 'General'], ['holiday', 'Holiday'], ['closure', 'School closed'], ['conference', 'Conference'], ['field-trip', 'Field trip']];
  var ICONS = [['fa-baby', 'Baby'], ['fa-star', 'Star'], ['fa-graduation-cap', 'Graduation cap'], ['fa-seedling', 'Seedling'], ['fa-sun', 'Sun'],
    ['fa-palette', 'Palette'], ['fa-music', 'Music'], ['fa-book-open', 'Book'], ['fa-puzzle-piece', 'Puzzle'], ['fa-leaf', 'Leaf']];

  document.addEventListener('DOMContentLoaded', async function () {
    if (!DM.configured) { DM.offlineNotice(); return; }
    me = await DM.requireAuth({ admin: true });
    if (!me) return;

    shell = DM.appShell({
      profile: me,
      title: 'Admin',
      tabs: [
        { id: 'home', label: 'Overview', icon: 'fa-gauge' },
        { id: 'attendance', label: 'Check-in / out', icon: 'fa-door-open', group: 'Today' },
        { id: 'reports', label: 'Daily reports', icon: 'fa-clipboard-list', group: 'Today' },
        { id: 'absences', label: 'Absences', icon: 'fa-calendar-xmark', group: 'Today' },
        { id: 'applications', label: 'Applications', icon: 'fa-file-signature', group: 'Inbox' },
        { id: 'tours', label: 'Tour requests', icon: 'fa-calendar-check', group: 'Inbox' },
        { id: 'messages', label: 'Messages', icon: 'fa-envelope', group: 'Inbox' },
        { id: 'jobapps', label: 'Job applications', icon: 'fa-briefcase', group: 'Inbox' },
        { id: 'children', label: 'Children', icon: 'fa-child-reaching', group: 'Families' },
        { id: 'families', label: 'Family accounts', icon: 'fa-users', group: 'Families' },
        { id: 'documents', label: 'Documents', icon: 'fa-file-shield', group: 'Families' },
        { id: 'payments', label: 'Payments', icon: 'fa-credit-card', group: 'Families' },
        { id: 'progress', label: 'Lesson progress', icon: 'fa-seedling', group: 'Learning' },
        { id: 'conferences', label: 'Conferences', icon: 'fa-people-arrows', group: 'Learning' },
        { id: 'resources', label: 'Curriculum & forms', icon: 'fa-folder-open', group: 'Learning' },
        { id: 'programs', label: 'Programs & tuition', icon: 'fa-shapes', group: 'School' },
        { id: 'events', label: 'Events', icon: 'fa-calendar-days', group: 'School' },
        { id: 'announcements', label: 'Announcements', icon: 'fa-bullhorn', group: 'School' },
        { id: 'menu', label: 'Lunch menu', icon: 'fa-utensils', group: 'School' },
        { id: 'photos', label: 'Photos', icon: 'fa-images', group: 'School' },
        { id: 'staff', label: 'Staff', icon: 'fa-id-badge', group: 'School' },
        { id: 'testimonials', label: 'Testimonials', icon: 'fa-quote-left', group: 'School' },
        { id: 'jobs', label: 'Job postings', icon: 'fa-bullseye', group: 'School' },
        { id: 'website', label: 'Website text & photos', icon: 'fa-pen-to-square', group: 'School' }
      ],
      render: render
    });

    var foot = document.querySelector('.app-side-foot');
    foot.insertAdjacentHTML('afterbegin', '<a class="app-tab" href="index.html"><i class="fas fa-globe" aria-hidden="true"></i> View website</a>');
    refreshCounts();
  });

  function render(tab, main) {
    var fn = {
      home: renderHome, applications: renderApplications, tours: renderTours, messages: renderMessages,
      children: renderChildren, families: renderFamilies, reports: renderReports, absences: renderAbsences, payments: renderPayments,
      programs: renderPrograms, events: renderEvents, announcements: renderAnnouncements, staff: renderStaff,
      resources: renderResources, website: renderWebsite,
      attendance: renderAttendance, documents: renderDocuments, progress: renderProgress, conferences: renderConferences,
      menu: renderMenu, photos: renderPhotos, testimonials: renderTestimonials, jobs: renderJobs, jobapps: renderJobApps
    }[tab];
    return fn(main).then(refreshCounts);
  }

  async function count(table, filter) {
    var q = sb.from(table).select('id', { count: 'exact', head: true });
    q = filter(q);
    var r = await q;
    return r.count || 0;
  }

  async function refreshCounts() {
    try {
      var c = await Promise.all([
        count('enrollment_applications', function (q) { return q.eq('status', 'new'); }),
        count('tour_requests', function (q) { return q.eq('status', 'new'); }),
        count('contact_messages', function (q) { return q.eq('status', 'new'); }),
        count('children', function (q) { return q.eq('status', 'pending'); }),
        count('absences', function (q) { return q.eq('acknowledged', false).gte('absence_date', DM.today()); }),
        count('family_documents', function (q) { return q.eq('status', 'submitted'); }),
        count('job_applications', function (q) { return q.eq('status', 'new'); })
      ]);
      shell.setCount('documents', c[5]);
      shell.setCount('jobapps', c[6]);
      shell.setCount('applications', c[0]);
      shell.setCount('tours', c[1]);
      shell.setCount('messages', c[2]);
      shell.setCount('children', c[3]);
      shell.setCount('absences', c[4]);
      return c;
    } catch (e) { return [0, 0, 0, 0, 0, 0, 0]; }
  }

  function head(title, sub, actions) {
    return '<div class="app-head"><div><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
      (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div>';
  }

  function seg(key, options, current) {
    return '<div class="seg" role="group">' + options.map(function (o) {
      var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
      return '<button type="button" data-seg="' + key + '" data-val="' + esc(v) + '" aria-pressed="' + (String(current) === String(v)) + '">' + esc(l) + '</button>';
    }).join('') + '</div>';
  }

  function bindSeg(main) {
    main.querySelectorAll('[data-seg]').forEach(function (b) {
      b.onclick = function () { state[b.dataset.seg] = b.dataset.val; shell.refresh(); };
    });
  }

  function statusSelect(id, statuses, current, attr) {
    return '<select class="app-input" style="width:auto;padding:5px 10px;font-size:0.85rem" data-' + attr + '="' + id + '" aria-label="Status">' +
      statuses.map(function (s) { return '<option value="' + s + '"' + (s === current ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>'; }).join('') + '</select>';
  }

  async function run(promise, okMsg) {
    try {
      await DM.q(promise);
      if (okMsg) DM.toast(okMsg);
      return true;
    } catch (e) {
      DM.toast(DM.friendlyError(e), 'error');
      return false;
    }
  }

  function contactLinks(email, phone, subject) {
    return (email ? '<a class="btn btn-ghost btn-xs" href="mailto:' + esc(email) + (subject ? '?subject=' + encodeURIComponent(subject) : '') + '"><i class="fas fa-reply"></i> Email</a>' : '') +
      (phone ? '<a class="btn btn-ghost btn-xs" href="tel:' + esc(String(phone).replace(/[^0-9+]/g, '')) + '"><i class="fas fa-phone"></i> Call</a>' : '');
  }

  /* =========================== OVERVIEW =========================== */
  async function renderHome(main) {
    var today = DM.today();
    var monthStart = today.slice(0, 8) + '01';
    var res = await Promise.all([
      refreshCounts(),
      count('children', function (q) { return q.eq('status', 'enrolled'); }),
      DM.q(sb.from('absences').select('*, child:children(full_name)').eq('absence_date', today)),
      DM.q(sb.from('payments').select('amount_cents').eq('status', 'paid').gte('paid_at', monthStart)),
      DM.q(sb.from('events').select('*').gte('event_date', today).order('event_date').limit(4)),
      DM.q(sb.from('tour_requests').select('*').in('status', ['new', 'confirmed']).gte('tour_date', today).order('tour_date').limit(5)),
      count('attendance', function (q) { return q.eq('att_date', today).not('check_in_at', 'is', null); })
    ]);
    var c = res[0], enrolled = res[1], absToday = res[2], pays = res[3], events = res[4], tours = res[5];
    var monthTotal = pays.reduce(function (s, p) { return s + p.amount_cents; }, 0);

    function stat(icon, n, label, tab, tone) {
      return '<button class="app-stat ' + (tone || '') + '" data-go="' + tab + '"><div class="ico"><i class="fas ' + icon + '"></i></div><div><b>' + n + '</b><span>' + label + '</span></div></button>';
    }

    main.innerHTML = head('Good ' + (new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening') + ', ' + (String(me.full_name || '').split(' ')[0] || 'there'),
      new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      '<button class="btn btn-primary btn-xs" data-go="reports"><i class="fas fa-plus"></i> Daily report</button><button class="btn btn-ghost btn-xs" data-go="announcements"><i class="fas fa-bullhorn"></i> Announce</button>') +
      '<div class="app-stats">' +
      stat('fa-file-signature', c[0], 'New applications', 'applications') +
      stat('fa-calendar-check', c[1], 'New tour requests', 'tours') +
      stat('fa-envelope', c[2], 'New messages', 'messages') +
      stat('fa-hourglass-half', c[3], 'Children to review', 'children', 'rose') +
      stat('fa-child-reaching', enrolled, 'Enrolled children', 'children', 'green') +
      stat('fa-sack-dollar', DM.money(monthTotal), 'Paid this month', 'payments', 'blue') +
      stat('fa-door-open', res[6] + ' / ' + enrolled, 'Checked in today', 'attendance', 'green') +
      stat('fa-file-shield', c[5], 'Documents to review', 'documents') +
      stat('fa-briefcase', c[6], 'New job applications', 'jobapps') +
      '</div>' +
      '<div class="app-grid-2">' +
      '<section class="app-card"><div class="app-card-head"><h2>Out today</h2><button class="btn btn-ghost btn-xs" data-go="absences">All absences</button></div><div class="app-list">' +
      (absToday.length ? absToday.map(function (a) {
        return '<div class="app-item"><div class="app-item-top"><h3>' + esc(a.child ? a.child.full_name : '') + '</h3>' + (a.acknowledged ? DM.pill('confirmed') : DM.pill('new')) + '</div>' + (a.reason ? '<p>' + esc(a.reason) + '</p>' : '') + '</div>';
      }).join('') : DM.empty('fa-sun', 'Everyone is expected today.')) + '</div></section>' +
      '<section class="app-card"><div class="app-card-head"><h2>Upcoming tours</h2><button class="btn btn-ghost btn-xs" data-go="tours">All tours</button></div><div class="app-list">' +
      (tours.length ? tours.map(function (t) {
        return '<div class="app-item"><div class="app-item-top"><h3>' + esc(t.parent_name) + '</h3>' + DM.pill(t.status) + '</div><div class="meta"><span><i class="far fa-calendar"></i>' +
          esc(DM.fmtDate(t.tour_date, { weekday: 'short', month: 'short', day: 'numeric' })) + (t.tour_time ? ' at ' + esc(t.tour_time) : '') + '</span>' + (t.phone ? '<span><i class="fas fa-phone"></i>' + esc(t.phone) + '</span>' : '') + '</div></div>';
      }).join('') : DM.empty('fa-calendar', 'No tours scheduled.')) + '</div></section>' +
      '</div>' +
      '<section class="app-card" style="margin-top:18px"><div class="app-card-head"><h2>Coming up</h2><button class="btn btn-ghost btn-xs" data-go="events">Manage events</button></div><div class="app-list">' +
      (events.length ? events.map(function (e) {
        return '<div class="app-item"><div class="app-item-top"><h3>' + esc(e.title) + '</h3>' + DM.pill(e.type) + '</div><div class="meta"><span>' + esc(DM.fmtDate(e.event_date, { weekday: 'long', month: 'short', day: 'numeric' })) + '</span>' + (e.time_label ? '<span>' + esc(e.time_label) + '</span>' : '') + '</div></div>';
      }).join('') : DM.empty('fa-calendar-days', 'No upcoming events.', '<button class="btn btn-primary btn-xs" data-go="events">Add an event</button>')) + '</div></section>';
  }

  /* =========================== INBOX =========================== */
  function inboxRenderer(cfg) {
    return async function (main) {
      var filter = state[cfg.key] || 'new';
      var q = sb.from(cfg.table).select('*').order(cfg.order || 'created_at', { ascending: !!cfg.asc }).limit(200);
      if (filter !== 'all') q = q.eq('status', filter);
      var rows = await DM.q(q);
      main.innerHTML = head(cfg.title, cfg.sub) +
        '<div class="toolbar">' + seg(cfg.key, cfg.statuses.concat([['all', 'All']]).map(function (s) { return Array.isArray(s) ? s : [s, s.charAt(0).toUpperCase() + s.slice(1)]; }), filter) + '</div>' +
        '<section class="app-card"><div class="app-list">' + (rows.length ? rows.map(function (r) {
          return '<article class="app-item"><div class="app-item-top"><div><h3>' + esc(cfg.title_of(r)) + '</h3><div class="meta">' + cfg.meta_of(r) + '</div></div>' +
            statusSelect(r.id, cfg.statuses, r.status, 'status') + '</div>' + cfg.body_of(r) +
            '<div class="row-actions">' + contactLinks(r.email, r.phone, cfg.reply_subject && cfg.reply_subject(r)) + (cfg.extra_actions ? cfg.extra_actions(r) : '') +
            '<button class="btn btn-ghost btn-xs" data-del="' + r.id + '"><i class="fas fa-trash"></i> Delete</button></div></article>';
        }).join('') : DM.empty(cfg.empty_icon, filter === 'new' ? 'Nothing new. You are all caught up.' : 'Nothing here.')) + '</div></section>';

      bindSeg(main);
      main.querySelectorAll('[data-status]').forEach(function (s) {
        s.onchange = async function () {
          if (await run(sb.from(cfg.table).update({ status: s.value }).eq('id', s.dataset.status), 'Updated')) shell.refresh();
        };
      });
      main.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = async function () {
          if (!await DM.confirm('Delete this ' + cfg.noun + ' permanently?', { danger: true, okLabel: 'Delete' })) return;
          if (await run(sb.from(cfg.table).delete().eq('id', b.dataset.del), 'Deleted')) shell.refresh();
        };
      });
      if (cfg.bind) cfg.bind(main, rows);
    };
  }

  function kv(pairs) {
    var p = pairs.filter(function (x) { return x[1]; });
    return p.length ? '<dl class="kv">' + p.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>' : '';
  }

  var renderApplications = inboxRenderer({
    key: 'apps', table: 'enrollment_applications', title: 'Enrollment applications', noun: 'application',
    sub: 'Submitted from the Apply page. Accepted families can create an account and add their child.',
    statuses: ['new', 'reviewing', 'accepted', 'waitlisted', 'declined'], empty_icon: 'fa-file-signature',
    title_of: function (r) { return r.child_name; },
    meta_of: function (r) { return '<span><i class="far fa-clock"></i>' + esc(DM.fmtDateTime(r.created_at)) + '</span><span><i class="fas fa-shapes"></i>' + esc(r.program || 'No program chosen') + '</span>'; },
    body_of: function (r) {
      return kv([['Parent', r.parent_name], ['Email', r.email], ['Phone', r.phone], ['Date of birth', r.child_dob ? DM.fmtDate(r.child_dob) : ''],
        ['Age', r.child_age], ['Start date', r.start_date ? DM.fmtDate(r.start_date) : ''], ['Notes', r.notes]]);
    },
    reply_subject: function (r) { return 'Your Daffodils Montessori application for ' + r.child_name; }
  });

  var renderTours = inboxRenderer({
    key: 'tours', table: 'tour_requests', title: 'Tour requests', noun: 'tour request', order: 'tour_date', asc: true,
    sub: 'Confirm by phone or email, then set the status.',
    statuses: ['new', 'confirmed', 'completed', 'cancelled'], empty_icon: 'fa-calendar-check',
    title_of: function (r) { return r.parent_name; },
    meta_of: function (r) {
      return '<span><i class="far fa-calendar"></i>' + esc(r.tour_date ? DM.fmtDate(r.tour_date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'No date') +
        (r.tour_time ? ' at ' + esc(r.tour_time) : '') + '</span><span>Requested ' + esc(DM.fmtDate(r.created_at)) + '</span>';
    },
    body_of: function (r) { return kv([['Email', r.email], ['Phone', r.phone], ["Child's age", r.child_age], ['Notes', r.notes]]); },
    reply_subject: function () { return 'Your Daffodils Montessori tour'; }
  });

  var renderMessages = inboxRenderer({
    key: 'msgs', table: 'contact_messages', title: 'Messages', noun: 'message',
    sub: 'From the Contact page and the family portal. Reply by email, then mark as replied.',
    statuses: ['new', 'replied', 'closed'], empty_icon: 'fa-envelope',
    title_of: function (r) { return (r.subject || 'Message') + ' - ' + r.name; },
    meta_of: function (r) { return '<span><i class="far fa-clock"></i>' + esc(DM.fmtDateTime(r.created_at)) + '</span>' + (r.submitted_by ? '<span>' + DM.pill('families') + '</span>' : ''); },
    body_of: function (r) { return '<p>' + esc(r.message) + '</p>' + kv([['Email', r.email], ['Phone', r.phone]]); },
    reply_subject: function (r) { return 'Re: ' + (r.subject || 'Your message to Daffodils Montessori'); }
  });

  /* =========================== CHILDREN =========================== */
  var programsCache = null;
  async function loadPrograms(force) {
    if (programsCache && !force) return programsCache;
    programsCache = await DM.q(sb.from('programs').select('*, program_rates(*)').order('sort_order'));
    programsCache.forEach(function (p) { p.program_rates.sort(function (a, b) { return a.sort_order - b.sort_order; }); });
    return programsCache;
  }

  function rateOptions(programs, withBlank) {
    var o = withBlank ? [['', 'No program yet']] : [];
    programs.forEach(function (p) {
      p.program_rates.forEach(function (r) { o.push([p.id + '|' + r.id, p.name + ' - ' + r.label + ' (' + DM.money(r.amount_cents) + ')']); });
    });
    return o;
  }

  async function renderChildren(main) {
    var filter = state.kids || 'pending';
    var search = state.kidSearch || '';
    var programs = await loadPrograms();
    var q = sb.from('children').select('*, parent:profiles(id, full_name, email, phone), program:programs(name), rate:program_rates(label, amount_cents)').order('full_name');
    if (filter !== 'all') q = q.eq('status', filter);
    var rows = await DM.q(q);
    if (search) {
      var s = search.toLowerCase();
      rows = rows.filter(function (r) { return (r.full_name + ' ' + (r.parent ? r.parent.full_name + ' ' + r.parent.email : '')).toLowerCase().indexOf(s) >= 0; });
    }

    main.innerHTML = head('Children', 'Review new children, enroll them in a program, and keep records current.',
      '<button class="btn btn-primary btn-xs" id="addKid"><i class="fas fa-plus"></i> Add child</button>') +
      '<div class="toolbar">' + seg('kids', [['pending', 'To review'], ['enrolled', 'Enrolled'], ['waitlisted', 'Waitlist'], ['withdrawn', 'Withdrawn'], ['all', 'All']], filter) +
      '<input class="app-input" type="search" id="kidSearch" placeholder="Search child or parent" value="' + esc(search) + '"></div>' +
      '<section class="app-card"><div class="app-list">' + (rows.length ? rows.map(function (c) {
        return '<article class="app-item"><div class="app-item-top"><div><h3>' + esc(c.full_name) + '</h3><div class="meta">' +
          '<span><i class="fas fa-shapes"></i>' + esc(c.program ? c.program.name + (c.rate ? ' · ' + c.rate.label + ' ' + DM.money(c.rate.amount_cents) : '') : 'No program') + '</span>' +
          (c.date_of_birth ? '<span><i class="fas fa-cake-candles"></i>' + esc(DM.fmtDate(c.date_of_birth)) + '</span>' : '') +
          (c.start_date ? '<span><i class="fas fa-flag"></i>Start ' + esc(DM.fmtDate(c.start_date)) + '</span>' : '') +
          '</div></div>' + DM.pill(c.status) + '</div>' +
          kv([['Parent', c.parent ? c.parent.full_name + ' · ' + c.parent.email + (c.parent.phone ? ' · ' + c.parent.phone : '') : ''],
            ['Allergies', c.allergies], ['Medical', c.medical_notes],
            ['Emergency', [c.emergency_contact_name, c.emergency_contact_phone].filter(Boolean).join(' · ')],
            ['Pickups', c.authorized_pickups], ['Office notes', c.admin_notes]]) +
          '<div class="row-actions">' +
          (c.status !== 'enrolled' ? '<button class="btn btn-green btn-xs" data-enroll="' + c.id + '"><i class="fas fa-check"></i> Enroll</button>' : '') +
          (c.status !== 'waitlisted' && c.status !== 'enrolled' ? '<button class="btn btn-ghost btn-xs" data-st="waitlisted" data-id="' + c.id + '">Waitlist</button>' : '') +
          (c.status !== 'withdrawn' ? '<button class="btn btn-ghost btn-xs" data-st="withdrawn" data-id="' + c.id + '">Withdraw</button>' : '') +
          '<button class="btn btn-ghost btn-xs" data-editkid="' + c.id + '"><i class="fas fa-pen"></i> Edit</button>' +
          (c.parent ? contactLinks(c.parent.email, c.parent.phone, 'About ' + c.full_name) : '') +
          '</div></article>';
      }).join('') : DM.empty('fa-child-reaching', filter === 'pending' ? 'No children waiting for review.' : 'No children found.')) + '</div></section>';

    bindSeg(main);
    var si = main.querySelector('#kidSearch');
    var t;
    si.oninput = function () { clearTimeout(t); t = setTimeout(function () { state.kidSearch = si.value; shell.refresh().then(function () { var n = document.getElementById('kidSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 300); };

    main.querySelectorAll('[data-enroll]').forEach(function (b) {
      b.onclick = function () {
        var c = rows.find(function (r) { return r.id === b.dataset.enroll; });
        DM.formDialog({
          title: 'Enroll ' + c.full_name,
          intro: 'The family will see the program, and daily reports and curriculum unlock for them.',
          fields: [
            { name: 'prog', label: 'Program and schedule', type: 'select', required: true, options: [['', 'Choose...']].concat(rateOptions(programs)), full: true },
            { name: 'start_date', label: 'Start date', type: 'date', required: true }
          ],
          values: { prog: c.program_id && c.rate_id ? c.program_id + '|' + c.rate_id : '', start_date: c.start_date || '' },
          submitLabel: 'Enroll',
          onSubmit: async function (v) {
            var p = v.prog.split('|');
            await DM.q(sb.from('children').update({ status: 'enrolled', program_id: p[0], rate_id: p[1], start_date: v.start_date }).eq('id', c.id));
            DM.toast(c.full_name + ' is enrolled');
            shell.refresh();
          }
        });
      };
    });
    main.querySelectorAll('[data-st]').forEach(function (b) {
      b.onclick = async function () {
        if (b.dataset.st === 'withdrawn' && !await DM.confirm('Mark this child as withdrawn? Their family keeps past reports but loses curriculum access.', { okLabel: 'Withdraw' })) return;
        if (await run(sb.from('children').update({ status: b.dataset.st }).eq('id', b.dataset.id), 'Updated')) shell.refresh();
      };
    });
    main.querySelectorAll('[data-editkid]').forEach(function (b) {
      b.onclick = function () { childDialog(rows.find(function (r) { return r.id === b.dataset.editkid; }), programs); };
    });
    main.querySelector('#addKid').onclick = async function () {
      var fams = await DM.q(sb.from('profiles').select('id, full_name, email').order('full_name'));
      childDialog(null, programs, fams);
    };
  }

  function childDialog(c, programs, families) {
    var fields = [];
    if (!c) fields.push({ name: 'parent_id', label: 'Family account', type: 'select', required: true, full: true,
      options: [['', 'Choose a family...']].concat((families || []).map(function (f) { return [f.id, (f.full_name || '(no name)') + ' - ' + f.email]; })),
      help: 'The parent needs an account first. They can sign up from the Parent Login page.' });
    fields.push(
      { name: 'full_name', label: 'Full name', required: true },
      { name: 'date_of_birth', label: 'Date of birth', type: 'date' },
      { name: 'prog', label: 'Program and schedule', type: 'select', options: rateOptions(programs, true) },
      { name: 'status', label: 'Status', type: 'select', options: [['pending', 'Pending review'], ['enrolled', 'Enrolled'], ['waitlisted', 'Waitlisted'], ['withdrawn', 'Withdrawn']] },
      { name: 'start_date', label: 'Start date', type: 'date' },
      { name: 'emergency_contact_name', label: 'Emergency contact' },
      { name: 'emergency_contact_phone', label: 'Emergency phone', type: 'tel' },
      { name: 'allergies', label: 'Allergies', type: 'textarea', rows: 2 },
      { name: 'medical_notes', label: 'Medical notes', type: 'textarea', rows: 2 },
      { name: 'authorized_pickups', label: 'Authorized pickups', type: 'textarea', rows: 2 },
      { name: 'admin_notes', label: 'Office notes (the family sees these)', type: 'textarea', rows: 2 }
    );
    DM.formDialog({
      title: c ? 'Edit ' + c.full_name : 'Add a child', wide: true, fields: fields,
      values: c ? Object.assign({}, c, { prog: c.program_id && c.rate_id ? c.program_id + '|' + c.rate_id : '' }) : { status: 'pending' },
      onSubmit: async function (v) {
        var p = (v.prog || '').split('|');
        var row = {
          full_name: v.full_name, date_of_birth: v.date_of_birth, program_id: p[0] || null, rate_id: p[1] || null, status: v.status,
          start_date: v.start_date, emergency_contact_name: v.emergency_contact_name, emergency_contact_phone: v.emergency_contact_phone,
          allergies: v.allergies, medical_notes: v.medical_notes, authorized_pickups: v.authorized_pickups, admin_notes: v.admin_notes
        };
        if (c) await DM.q(sb.from('children').update(row).eq('id', c.id));
        else { row.parent_id = v.parent_id; await DM.q(sb.from('children').insert(row)); }
        DM.toast('Saved');
        shell.refresh();
      }
    });
  }

  /* =========================== FAMILIES =========================== */
  async function renderFamilies(main) {
    var rows = await DM.q(sb.from('profiles').select('*, children(id, full_name, status)').order('created_at', { ascending: false }));
    var search = (state.famSearch || '').toLowerCase();
    if (search) rows = rows.filter(function (r) { return (r.full_name + ' ' + r.email + ' ' + r.phone).toLowerCase().indexOf(search) >= 0; });

    main.innerHTML = head('Family accounts', 'Everyone who has signed up. Parents create accounts from the Parent Login page.') +
      '<div class="toolbar"><input class="app-input" type="search" id="famSearch" placeholder="Search name, email, phone" value="' + esc(state.famSearch || '') + '"></div>' +
      '<section class="app-card">' + (rows.length ? '<div class="app-table-wrap"><table class="app-table"><thead><tr><th>Name</th><th>Contact</th><th>Children</th><th>Joined</th><th>Role</th><th></th></tr></thead><tbody>' +
        rows.map(function (f) {
          return '<tr><td data-label="Name"><strong>' + esc(f.full_name || '(no name)') + '</strong></td>' +
            '<td data-label="Contact">' + esc(f.email) + (f.phone ? '<br><span class="meta">' + esc(f.phone) + '</span>' : '') + '</td>' +
            '<td data-label="Children">' + (f.children.length ? f.children.map(function (k) { return esc(k.full_name) + ' ' + DM.pill(k.status); }).join('<br>') : '<span class="meta">None</span>') + '</td>' +
            '<td data-label="Joined">' + esc(DM.fmtDate(f.created_at)) + '</td>' +
            '<td data-label="Role">' + DM.pill(f.role) + '</td>' +
            '<td class="actions">' + contactLinks(f.email, f.phone) +
            (f.id !== me.id ? '<button class="btn btn-ghost btn-xs" data-role="' + f.id + '" data-to="' + (f.role === 'admin' ? 'parent' : 'admin') + '">' + (f.role === 'admin' ? 'Remove admin' : 'Make admin') + '</button>' : '') +
            '</td></tr>';
        }).join('') + '</tbody></table></div>' : DM.empty('fa-users', 'No accounts found.')) + '</section>' +
      '<p class="meta" style="margin-top:6px"><i class="fas fa-circle-info"></i> To delete a login completely, use Supabase &gt; Authentication &gt; Users.</p>';

    var si = main.querySelector('#famSearch'), t;
    si.oninput = function () { clearTimeout(t); t = setTimeout(function () { state.famSearch = si.value; shell.refresh().then(function () { var n = document.getElementById('famSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 300); };
    main.querySelectorAll('[data-role]').forEach(function (b) {
      b.onclick = async function () {
        var toAdmin = b.dataset.to === 'admin';
        if (!await DM.confirm(toAdmin ? 'Give this person full admin access to every family record?' : 'Remove admin access from this person?', { okLabel: toAdmin ? 'Make admin' : 'Remove admin', danger: toAdmin })) return;
        if (await run(sb.from('profiles').update({ role: b.dataset.to }).eq('id', b.dataset.role), 'Role updated')) shell.refresh();
      };
    });
  }

  /* =========================== DAILY REPORTS =========================== */
  async function renderReports(main) {
    var date = state.repDate || DM.today();
    var kids = await DM.q(sb.from('children').select('id, full_name, program:programs(name)').eq('status', 'enrolled').order('full_name'));
    var reps = await DM.q(sb.from('daily_reports').select('*').eq('report_date', date).order('created_at'));
    var byChild = {};
    reps.forEach(function (r) { (byChild[r.child_id] = byChild[r.child_id] || []).push(r); });

    main.innerHTML = head('Daily reports', 'Post a quick note for each child. Families see it in their portal right away.') +
      '<div class="toolbar"><label for="repDate" class="meta">Date</label><input class="app-input" type="date" id="repDate" value="' + esc(date) + '" max="' + DM.today() + '" style="max-width:200px">' +
      '<span class="meta">' + reps.length + ' of ' + kids.length + ' posted</span></div>' +
      '<section class="app-card"><div class="app-list">' + (kids.length ? kids.map(function (k) {
        var list = byChild[k.id] || [];
        return '<div class="app-item' + (list.length ? ' report-card' : '') + '"><div class="app-item-top"><div><h3>' + esc(k.full_name) + '</h3><div class="meta">' + esc(k.program ? k.program.name : '') + '</div></div>' +
          '<button class="btn ' + (list.length ? 'btn-ghost' : 'btn-primary') + ' btn-xs" data-new="' + k.id + '"><i class="fas fa-plus"></i> ' + (list.length ? 'Add another' : 'Write report') + '</button></div>' +
          list.map(function (r) {
            var parts = [['Mood', r.mood], ['Meals', r.meals], ['Nap', r.nap], ['Activities', r.activities], ['Notes', r.notes]].filter(function (x) { return x[1]; });
            return '<div class="report-grid">' + parts.map(function (x) { return '<div><b>' + x[0] + '</b>' + esc(x[1]) + '</div>'; }).join('') + '</div>' +
              '<div class="row-actions"><button class="btn btn-ghost btn-xs" data-edit="' + r.id + '"><i class="fas fa-pen"></i> Edit</button><button class="btn btn-ghost btn-xs" data-del="' + r.id + '"><i class="fas fa-trash"></i> Delete</button></div>';
          }).join('') + '</div>';
      }).join('') : DM.empty('fa-child-reaching', 'No enrolled children yet. Enroll children from the Children tab.')) + '</div></section>';

    main.querySelector('#repDate').onchange = function (e) { state.repDate = e.target.value || DM.today(); shell.refresh(); };
    function dialog(childId, r) {
      var k = kids.find(function (x) { return x.id === childId; });
      DM.formDialog({
        title: (r ? 'Edit report for ' : 'Daily report for ') + (k ? k.full_name : ''), wide: true,
        fields: [
          { name: 'report_date', label: 'Date', type: 'date', required: true, max: DM.today() },
          { name: 'mood', label: 'Mood', type: 'select', options: [['', '-']].concat(MOODS.map(function (m) { return [m, m]; })) },
          { name: 'meals', label: 'Meals & snacks', type: 'textarea', rows: 2, placeholder: 'Ate all of lunch, half of snack' },
          { name: 'nap', label: 'Nap / rest', placeholder: '12:30 - 2:00', full: true },
          { name: 'activities', label: 'Activities & learning', type: 'textarea', rows: 3, placeholder: 'Pink tower, pouring work, garden walk' },
          { name: 'notes', label: 'Notes for the family', type: 'textarea', rows: 2 }
        ],
        values: r || { report_date: date },
        submitLabel: r ? 'Save' : 'Post report',
        onSubmit: async function (v) {
          var row = { report_date: v.report_date, mood: v.mood, meals: v.meals, nap: v.nap, activities: v.activities, notes: v.notes };
          if (r) await DM.q(sb.from('daily_reports').update(row).eq('id', r.id));
          else { row.child_id = childId; await DM.q(sb.from('daily_reports').insert(row)); }
          DM.toast('Report saved');
          shell.refresh();
        }
      });
    }
    main.querySelectorAll('[data-new]').forEach(function (b) { b.onclick = function () { dialog(b.dataset.new, null); }; });
    main.querySelectorAll('[data-edit]').forEach(function (b) {
      b.onclick = function () { var r = reps.find(function (x) { return x.id === b.dataset.edit; }); dialog(r.child_id, r); };
    });
    main.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!await DM.confirm('Delete this report?', { danger: true, okLabel: 'Delete' })) return;
        if (await run(sb.from('daily_reports').delete().eq('id', b.dataset.del), 'Deleted')) shell.refresh();
      };
    });
  }

  /* =========================== ABSENCES =========================== */
  async function renderAbsences(main) {
    var view = state.absView || 'upcoming';
    var q = sb.from('absences').select('*, child:children(full_name, parent:profiles(full_name, phone, email))');
    q = view === 'upcoming' ? q.gte('absence_date', DM.today()).order('absence_date') : q.lt('absence_date', DM.today()).order('absence_date', { ascending: false }).limit(200);
    var rows = await DM.q(q);
    main.innerHTML = head('Absences', 'Reported by families from their portal.') +
      '<div class="toolbar">' + seg('absView', [['upcoming', 'Today & upcoming'], ['past', 'Past']], view) + '</div>' +
      '<section class="app-card">' + (rows.length ? '<div class="app-table-wrap"><table class="app-table"><thead><tr><th>Date</th><th>Child</th><th>Reason</th><th>Parent</th><th></th></tr></thead><tbody>' +
        rows.map(function (a) {
          var p = a.child && a.child.parent;
          return '<tr><td data-label="Date"><strong>' + esc(DM.fmtDate(a.absence_date, { weekday: 'short', month: 'short', day: 'numeric' })) + '</strong></td>' +
            '<td data-label="Child">' + esc(a.child ? a.child.full_name : '') + '</td><td data-label="Reason">' + esc(a.reason || '-') + '</td>' +
            '<td data-label="Parent">' + esc(p ? p.full_name : '') + (p && p.phone ? '<br><span class="meta">' + esc(p.phone) + '</span>' : '') + '</td>' +
            '<td class="actions">' + (a.acknowledged ? DM.pill('confirmed') : '<button class="btn btn-green btn-xs" data-ack="' + a.id + '"><i class="fas fa-check"></i> Got it</button>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : DM.empty('fa-calendar-check', view === 'upcoming' ? 'No upcoming absences.' : 'No past absences.')) + '</section>';
    bindSeg(main);
    main.querySelectorAll('[data-ack]').forEach(function (b) {
      b.onclick = async function () { if (await run(sb.from('absences').update({ acknowledged: true }).eq('id', b.dataset.ack), 'Marked as seen')) shell.refresh(); };
    });
  }

  /* =========================== PAYMENTS =========================== */
  async function renderPayments(main) {
    var rows = await DM.q(sb.from('payments').select('*, parent:profiles(full_name, email), child:children(full_name)').order('created_at', { ascending: false }).limit(300));
    var monthStart = DM.today().slice(0, 8) + '01';
    var paid = rows.filter(function (p) { return p.status === 'paid'; });
    var month = paid.filter(function (p) { return (p.paid_at || p.created_at) >= monthStart; }).reduce(function (s, p) { return s + p.amount_cents; }, 0);
    var all = paid.reduce(function (s, p) { return s + p.amount_cents; }, 0);

    main.innerHTML = head('Payments', 'Card payments arrive here automatically. Record checks and cash by hand.',
      '<button class="btn btn-primary btn-xs" id="recordPay"><i class="fas fa-plus"></i> Record payment</button>') +
      '<div class="app-stats"><div class="app-stat green"><div class="ico"><i class="fas fa-calendar"></i></div><div><b>' + DM.money(month) + '</b><span>Paid this month</span></div></div>' +
      '<div class="app-stat blue"><div class="ico"><i class="fas fa-sack-dollar"></i></div><div><b>' + DM.money(all) + '</b><span>Paid (last 300 records)</span></div></div></div>' +
      '<section class="app-card">' + (rows.length ? '<div class="app-table-wrap"><table class="app-table"><thead><tr><th>Date</th><th>Family</th><th>Child</th><th>Description</th><th>Method</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>' +
        rows.map(function (p) {
          return '<tr><td data-label="Date">' + esc(DM.fmtDate(p.paid_at || p.created_at)) + '</td><td data-label="Family">' + esc(p.parent ? p.parent.full_name || p.parent.email : '') + '</td>' +
            '<td data-label="Child">' + esc(p.child ? p.child.full_name : '-') + '</td><td data-label="Description">' + esc(p.description) + '</td>' +
            '<td data-label="Method">' + esc(p.method === 'stripe' ? 'Card' : p.method) + '</td><td data-label="Amount" class="num">' + DM.money(p.amount_cents) + '</td>' +
            '<td data-label="Status">' + DM.pill(p.status) + '</td>' +
            '<td class="actions">' + (p.method !== 'stripe' ? '<button class="btn btn-ghost btn-xs" data-editpay="' + p.id + '">Edit</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : DM.empty('fa-receipt', 'No payments yet.')) + '</section>' +
      '<p class="meta"><i class="fas fa-circle-info"></i> Refunds for card payments are made in the Stripe dashboard. Mark them refunded here with Edit only for checks or cash.</p>';

    async function payDialog(p) {
      var fams = await DM.q(sb.from('profiles').select('id, full_name, email, children(id, full_name)').order('full_name'));
      var kids = [['', 'Not tied to one child']];
      fams.forEach(function (f) { f.children.forEach(function (k) { kids.push([k.id, k.full_name + ' (' + (f.full_name || f.email) + ')']); }); });
      DM.formDialog({
        title: p ? 'Edit payment' : 'Record a payment',
        fields: [
          { name: 'parent_id', label: 'Family', type: 'select', required: true, full: true, options: [['', 'Choose...']].concat(fams.map(function (f) { return [f.id, (f.full_name || '(no name)') + ' - ' + f.email]; })) },
          { name: 'child_id', label: 'Child', type: 'select', full: true, options: kids },
          { name: 'amount_cents', label: 'Amount ($)', type: 'money', required: true },
          { name: 'method', label: 'Method', type: 'select', options: [['check', 'Check'], ['cash', 'Cash'], ['zelle', 'Zelle'], ['other', 'Other']] },
          { name: 'paid_on', label: 'Date received', type: 'date', required: true },
          { name: 'status', label: 'Status', type: 'select', options: [['paid', 'Paid'], ['refunded', 'Refunded'], ['canceled', 'Canceled']] },
          { name: 'description', label: 'Description', required: true, placeholder: 'October tuition', full: true }
        ],
        values: p ? Object.assign({}, p, { paid_on: (p.paid_at || p.created_at).slice(0, 10) }) : { method: 'check', status: 'paid', paid_on: DM.today() },
        onSubmit: async function (v) {
          if (!v.amount_cents || v.amount_cents <= 0) throw new Error('Enter an amount greater than $0');
          var row = { parent_id: v.parent_id, child_id: v.child_id || null, amount_cents: v.amount_cents, method: v.method, status: v.status,
            description: v.description, paid_at: v.status === 'paid' ? v.paid_on + 'T12:00:00Z' : null };
          if (p) await DM.q(sb.from('payments').update(row).eq('id', p.id));
          else await DM.q(sb.from('payments').insert(row));
          DM.toast('Payment saved');
          shell.refresh();
        }
      });
    }
    main.querySelector('#recordPay').onclick = function () { payDialog(null); };
    main.querySelectorAll('[data-editpay]').forEach(function (b) { b.onclick = function () { payDialog(rows.find(function (x) { return x.id === b.dataset.editpay; })); }; });
  }

  /* =========================== PROGRAMS =========================== */
  async function renderPrograms(main) {
    var programs = await loadPrograms(true);
    main.innerHTML = head('Programs & tuition', 'These drive the Tuition page, Programs page prices, the Apply form, and card payments.',
      '<button class="btn btn-primary btn-xs" id="addProg"><i class="fas fa-plus"></i> Add program</button>') +
      programs.map(function (p) {
        return '<section class="app-card"><div class="app-card-head"><div><h2><i class="fas ' + esc(p.icon) + '" style="color:var(--primary-dark);margin-right:8px"></i>' + esc(p.name) + '</h2>' +
          '<p>' + esc(p.ages) + (p.featured ? ' · Featured' : '') + (p.active ? '' : ' · <strong>Hidden</strong>') + '</p></div>' +
          '<div class="row-actions" style="margin:0"><button class="btn btn-ghost btn-xs" data-editprog="' + p.id + '"><i class="fas fa-pen"></i> Edit</button>' +
          '<button class="btn btn-ghost btn-xs" data-addrate="' + p.id + '"><i class="fas fa-plus"></i> Rate</button></div></div>' +
          (p.description ? '<p class="meta" style="margin-bottom:12px">' + esc(p.description) + '</p>' : '') +
          (p.program_rates.length ? '<div class="app-table-wrap"><table class="app-table"><thead><tr><th>Schedule</th><th class="num">Monthly</th><th></th></tr></thead><tbody>' +
            p.program_rates.map(function (r) {
              return '<tr><td data-label="Schedule">' + esc(r.label) + '</td><td data-label="Monthly" class="num"><strong>' + DM.money(r.amount_cents) + '</strong></td>' +
                '<td class="actions"><button class="btn btn-ghost btn-xs" data-editrate="' + r.id + '">Edit</button><button class="btn btn-ghost btn-xs" data-delrate="' + r.id + '"><i class="fas fa-trash"></i></button></td></tr>';
            }).join('') + '</tbody></table></div>' : DM.empty('fa-dollar-sign', 'No rates yet.')) + '</section>';
      }).join('');

    function progDialog(p) {
      DM.formDialog({
        title: p ? 'Edit ' + p.name : 'Add a program', wide: true,
        fields: [
          { name: 'name', label: 'Name', required: true },
          { name: 'ages', label: 'Ages', placeholder: 'Ages 3-5' },
          { name: 'slug', label: 'Short id (letters, numbers, dashes)', required: true, help: 'Used in links. Programs page sections use toddler, primary, kindergarten.' },
          { name: 'icon', label: 'Icon', type: 'select', options: ICONS },
          { name: 'description', label: 'Short description', type: 'textarea', rows: 2 },
          { name: 'sort_order', label: 'Order', type: 'number' },
          { name: 'featured', label: 'Highlight as "Most Popular"', type: 'checkbox' },
          { name: 'active', label: 'Show on the website', type: 'checkbox' }
        ],
        values: p || { active: true, icon: 'fa-star', sort_order: programs.length + 1 },
        onSubmit: async function (v) {
          v.slug = String(v.slug).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
          if (!v.slug) throw new Error('Short id is required');
          v.sort_order = v.sort_order || 0;
          if (p) await DM.q(sb.from('programs').update(v).eq('id', p.id));
          else await DM.q(sb.from('programs').insert(v));
          DM.toast('Program saved');
          shell.refresh();
        }
      });
    }
    function rateDialog(programId, r) {
      DM.formDialog({
        title: r ? 'Edit rate' : 'Add a rate',
        fields: [
          { name: 'label', label: 'Schedule name', required: true, placeholder: 'Half-day' },
          { name: 'amount_cents', label: 'Monthly tuition ($)', type: 'money', required: true },
          { name: 'sort_order', label: 'Order', type: 'number' }
        ],
        values: r || { sort_order: 1 },
        onSubmit: async function (v) {
          if (!v.amount_cents || v.amount_cents <= 0) throw new Error('Enter an amount greater than $0');
          v.sort_order = v.sort_order || 0;
          if (r) await DM.q(sb.from('program_rates').update(v).eq('id', r.id));
          else { v.program_id = programId; await DM.q(sb.from('program_rates').insert(v)); }
          DM.toast('Rate saved');
          shell.refresh();
        }
      });
    }
    function findRate(id) { var out = null; programs.forEach(function (p) { p.program_rates.forEach(function (r) { if (r.id === id) out = r; }); }); return out; }

    main.querySelector('#addProg').onclick = function () { progDialog(null); };
    main.querySelectorAll('[data-editprog]').forEach(function (b) { b.onclick = function () { progDialog(programs.find(function (p) { return p.id === b.dataset.editprog; })); }; });
    main.querySelectorAll('[data-addrate]').forEach(function (b) { b.onclick = function () { rateDialog(b.dataset.addrate, null); }; });
    main.querySelectorAll('[data-editrate]').forEach(function (b) { b.onclick = function () { var r = findRate(b.dataset.editrate); rateDialog(r.program_id, r); }; });
    main.querySelectorAll('[data-delrate]').forEach(function (b) {
      b.onclick = async function () {
        if (!await DM.confirm('Delete this rate? Children on it keep their program but lose the schedule.', { danger: true, okLabel: 'Delete' })) return;
        if (await run(sb.from('program_rates').delete().eq('id', b.dataset.delrate), 'Deleted')) shell.refresh();
      };
    });
  }

  /* =========================== SIMPLE LISTS =========================== */
  function listEditor(cfg) {
    return async function (main) {
      var rows = await DM.q(cfg.query());
      main.innerHTML = head(cfg.title, cfg.sub, '<button class="btn btn-primary btn-xs" id="addRow"><i class="fas fa-plus"></i> ' + esc(cfg.addLabel) + '</button>') +
        '<section class="app-card"><div class="app-list">' + (rows.length ? rows.map(function (r) {
          return '<article class="app-item">' + cfg.item(r) + '<div class="row-actions"><button class="btn btn-ghost btn-xs" data-edit="' + r.id + '"><i class="fas fa-pen"></i> Edit</button>' +
            '<button class="btn btn-ghost btn-xs" data-del="' + r.id + '"><i class="fas fa-trash"></i> Delete</button></div></article>';
        }).join('') : DM.empty(cfg.icon, cfg.emptyText)) + '</div></section>';

      function dialog(r) {
        DM.formDialog({
          title: r ? 'Edit' : cfg.addLabel, wide: true, fields: cfg.fields, values: r ? (cfg.toForm ? cfg.toForm(r) : r) : (cfg.defaults ? cfg.defaults() : {}),
          onSubmit: async function (v) {
            var row = cfg.fromForm ? await cfg.fromForm(v, r) : v;
            if (r) await DM.q(sb.from(cfg.table).update(row).eq('id', r.id));
            else await DM.q(sb.from(cfg.table).insert(row));
            DM.toast('Saved');
            if (DM.loadPublicData) DM.loadPublicData(true);
            shell.refresh();
          }
        });
      }
      main.querySelector('#addRow').onclick = function () { dialog(null); };
      main.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { dialog(rows.find(function (x) { return x.id === b.dataset.edit; })); }; });
      main.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = async function () {
          if (!await DM.confirm('Delete this permanently?', { danger: true, okLabel: 'Delete' })) return;
          if (await run(sb.from(cfg.table).delete().eq('id', b.dataset.del), 'Deleted')) shell.refresh();
        };
      });
    };
  }

  var renderEvents = listEditor({
    table: 'events', title: 'Events', sub: 'Shown on the public Events calendar and in family portals.', addLabel: 'Add event', icon: 'fa-calendar-days',
    emptyText: 'No events yet.',
    query: function () { return sb.from('events').select('*').gte('event_date', new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)).order('event_date'); },
    item: function (e) {
      return '<div class="app-item-top"><div><h3>' + esc(e.title) + '</h3><div class="meta"><span><i class="far fa-calendar"></i>' +
        esc(DM.fmtDate(e.event_date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })) + (e.end_date ? ' - ' + esc(DM.fmtDate(e.end_date)) : '') + '</span>' +
        (e.time_label ? '<span><i class="far fa-clock"></i>' + esc(e.time_label) + '</span>' : '') + (e.location ? '<span><i class="fas fa-location-dot"></i>' + esc(e.location) + '</span>' : '') +
        '</div></div>' + DM.pill(e.type) + '</div>' + (e.description ? '<p>' + esc(e.description) + '</p>' : '');
    },
    fields: [
      { name: 'title', label: 'Title', required: true, full: true },
      { name: 'event_date', label: 'Date', type: 'date', required: true },
      { name: 'end_date', label: 'End date (multi-day)', type: 'date' },
      { name: 'time_label', label: 'Time', placeholder: '10:00 AM - 12:00 PM' },
      { name: 'type', label: 'Type', type: 'select', options: EVENT_TYPES },
      { name: 'location', label: 'Location', full: true },
      { name: 'description', label: 'Description', type: 'textarea', rows: 3 }
    ],
    defaults: function () { return { type: 'general', event_date: DM.today() }; }
  });

  var renderAnnouncements = listEditor({
    table: 'announcements', title: 'Announcements', sub: '"Everyone" shows on the homepage banner. "Families only" shows just in parent portals.', addLabel: 'New announcement',
    icon: 'fa-bullhorn', emptyText: 'No announcements yet.',
    query: function () { return sb.from('announcements').select('*').order('pinned', { ascending: false }).order('published_at', { ascending: false }).limit(100); },
    item: function (a) {
      return '<div class="app-item-top"><div><h3>' + (a.pinned ? '<i class="fas fa-thumbtack" style="color:var(--primary-dark)"></i> ' : '') + esc(a.title) + '</h3><div class="meta"><span>' +
        esc(DM.fmtDate(a.published_at)) + (new Date(a.published_at) > new Date() ? ' (scheduled)' : '') + '</span></div></div>' + DM.pill(a.audience) + '</div>' + (a.body ? '<p>' + esc(a.body) + '</p>' : '');
    },
    fields: [
      { name: 'title', label: 'Title', required: true, full: true },
      { name: 'body', label: 'Message', type: 'textarea', rows: 4 },
      { name: 'audience', label: 'Who sees it', type: 'select', options: [['everyone', 'Everyone (website + portal)'], ['families', 'Families only (portal)']] },
      { name: 'publish_on', label: 'Publish date', type: 'date', required: true },
      { name: 'pinned', label: 'Pin to the top', type: 'checkbox' }
    ],
    defaults: function () { return { audience: 'everyone', publish_on: DM.today() }; },
    toForm: function (a) { return Object.assign({}, a, { publish_on: a.published_at.slice(0, 10) }); },
    fromForm: function (v) {
      var at = v.publish_on === DM.today() ? new Date().toISOString() : new Date(v.publish_on + 'T07:00:00').toISOString();
      return { title: v.title, body: v.body, audience: v.audience, pinned: v.pinned, published_at: at };
    }
  });

  var renderStaff = listEditor({
    table: 'staff', title: 'Staff', sub: 'Shown on the Staff page, in this order.', addLabel: 'Add staff member', icon: 'fa-id-badge', emptyText: 'No staff yet.',
    query: function () { return sb.from('staff').select('*').order('sort_order'); },
    item: function (s) {
      return '<div class="child-card" style="grid-template-columns:56px 1fr">' +
        (s.photo_url ? '<img src="' + esc(s.photo_url) + '" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover">' : '<div class="child-avatar" style="background:linear-gradient(135deg,#f6d365,#fda085)">' + esc(DM.initials(s.name)) + '</div>') +
        '<div><h3>' + esc(s.name) + '</h3><div class="meta">' + esc(s.title || 'No title yet') + (s.credentials ? ' · ' + esc(s.credentials) : '') + '</div>' + (s.bio ? '<p>' + esc(s.bio) + '</p>' : '') + '</div></div>';
    },
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'title', label: 'Title', placeholder: 'Lead Guide, Primary' },
      { name: 'credentials', label: 'Credentials', placeholder: 'AMS Early Childhood Credential', full: true },
      { name: 'bio', label: 'Bio', type: 'textarea', rows: 4 },
      { name: 'photo', label: 'Photo (JPG/PNG, under 5 MB)', type: 'file', accept: 'image/jpeg,image/png,image/webp' },
      { name: 'remove_photo', label: 'Remove current photo', type: 'checkbox' },
      { name: 'sort_order', label: 'Order', type: 'number' }
    ],
    fromForm: async function (v, r) {
      var row = { name: v.name, title: v.title, credentials: v.credentials, bio: v.bio, sort_order: v.sort_order || 0 };
      if (v.photo) row.photo_url = await DM.uploadPublicImage(v.photo, 'staff');
      else if (v.remove_photo) row.photo_url = '';
      return row;
    }
  });

  /* =========================== RESOURCES =========================== */
  async function renderResources(main) {
    var programs = await loadPrograms();
    var rows = await DM.q(sb.from('resources').select('*, program:programs(name)').order('created_at', { ascending: false }));
    main.innerHTML = head('Curriculum & forms', 'Files for enrolled families. Pick a program, or "All families" for handbooks and forms.',
      '<button class="btn btn-primary btn-xs" id="upload"><i class="fas fa-upload"></i> Upload file</button>') +
      '<section class="app-card">' + (rows.length ? '<div class="app-table-wrap"><table class="app-table"><thead><tr><th>Title</th><th>Who sees it</th><th>Added</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td data-label="Title"><strong>' + esc(r.title) + '</strong><br><span class="meta">' + esc(r.file_name) + '</span></td>' +
            '<td data-label="Who sees it">' + esc(r.program ? r.program.name : 'All families') + '</td><td data-label="Added">' + esc(DM.fmtDate(r.created_at)) + '</td>' +
            '<td class="actions"><button class="btn btn-ghost btn-xs" data-open="' + esc(r.file_path) + '">Open</button><button class="btn btn-ghost btn-xs" data-del="' + r.id + '"><i class="fas fa-trash"></i></button></td></tr>';
        }).join('') + '</tbody></table></div>' : DM.empty('fa-folder-open', 'Nothing uploaded yet.')) + '</section>';

    main.querySelector('#upload').onclick = function () {
      DM.formDialog({
        title: 'Upload a file',
        fields: [
          { name: 'file', label: 'File (PDF, Word, or image, up to 25 MB)', type: 'file', required: true, full: true, accept: '.pdf,.doc,.docx,image/jpeg,image/png' },
          { name: 'title', label: 'Title', required: true, full: true, placeholder: 'October curriculum - Primary' },
          { name: 'program_id', label: 'Who can see it', type: 'select', full: true, options: [['', 'All families']].concat(programs.map(function (p) { return [p.id, p.name + ' families']; })) },
          { name: 'description', label: 'Description', type: 'textarea', rows: 2 }
        ],
        submitLabel: 'Upload',
        onSubmit: async function (v) {
          if (v.file.size > 25 * 1024 * 1024) throw new Error('That file is over 25 MB.');
          var prog = programs.find(function (p) { return p.id === v.program_id; });
          var path = (prog ? prog.slug : 'all') + '/' + Date.now() + '-' + DM.safeFileName(v.file.name);
          var up = await sb.storage.from('resources').upload(path, v.file, { contentType: v.file.type || 'application/octet-stream' });
          if (up.error) throw up.error;
          var ins = await sb.from('resources').insert({ title: v.title, description: v.description, program_id: v.program_id || null, file_path: path, file_name: v.file.name });
          if (ins.error) { await sb.storage.from('resources').remove([path]); throw ins.error; }
          DM.toast('Uploaded');
          shell.refresh();
        }
      });
    };
    main.querySelectorAll('[data-open]').forEach(function (b) {
      b.onclick = async function () {
        var r = await sb.storage.from('resources').createSignedUrl(b.dataset.open, 120);
        if (r.error) DM.toast(DM.friendlyError(r.error), 'error'); else window.open(r.data.signedUrl, '_blank', 'noopener');
      };
    });
    main.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = async function () {
        var r = rows.find(function (x) { return x.id === b.dataset.del; });
        if (!await DM.confirm('Delete "' + r.title + '"? Families lose access right away.', { danger: true, okLabel: 'Delete' })) return;
        await sb.storage.from('resources').remove([r.file_path]);
        if (await run(sb.from('resources').delete().eq('id', r.id), 'Deleted')) shell.refresh();
      };
    });
  }

  /* =========================== WEBSITE =========================== */
  var PAGES = [['index.html', 'Home'], ['about.html', 'About'], ['programs.html', 'Programs'], ['gallery.html', 'Gallery'],
    ['tuition.html', 'Tuition'], ['events.html', 'Events'], ['contact.html', 'Contact'], ['enrollment.html', 'Apply']];

  async function renderWebsite(main) {
    var rows = await DM.q(sb.from('site_content').select('*').order('updated_at', { ascending: false }));
    var texts = rows.filter(function (r) { return !/^https?:\/\//.test(r.value); });
    var photos = rows.filter(function (r) { return /^https?:\/\//.test(r.value); });

    main.innerHTML = head('Website text & photos', 'Edit the public pages directly: open a page, then use the "Edit this page" button at the bottom.') +
      '<section class="app-card"><div class="app-card-head"><h2>Open a page to edit</h2></div><div class="row-actions" style="margin-top:0">' +
      PAGES.map(function (p) { return '<a class="btn btn-ghost btn-xs" href="' + p[0] + '" target="_blank" rel="noopener"><i class="fas fa-arrow-up-right-from-square"></i> ' + p[1] + '</a>'; }).join('') +
      '</div><p class="meta" style="margin-top:12px">Highlighted text becomes editable; click a photo spot to upload a new picture. Programs, prices, staff, and events are edited from their own tabs here instead.</p></section>' +
      '<section class="app-card"><div class="app-card-head"><h2>Photos you have uploaded</h2></div>' +
      (photos.length ? '<div class="app-list">' + photos.map(function (r) {
        return '<div class="app-item"><div class="app-item-top"><div style="display:flex;gap:12px;align-items:center"><img src="' + esc(r.value) + '" alt="" style="width:72px;height:54px;object-fit:cover;border-radius:8px">' +
          '<div><h3>' + esc(r.key) + '</h3><div class="meta">Updated ' + esc(DM.fmtDate(r.updated_at)) + '</div></div></div>' +
          '<button class="btn btn-ghost btn-xs" data-reset="' + esc(r.key) + '">Remove photo</button></div></div>';
      }).join('') + '</div>' : DM.empty('fa-image', 'No photos uploaded yet. The site shows colored placeholders until you add some.')) + '</section>' +
      '<section class="app-card"><div class="app-card-head"><h2>Edited text</h2></div>' +
      (texts.length ? '<div class="app-table-wrap"><table class="app-table"><thead><tr><th>Spot</th><th>Current text</th><th>Updated</th><th></th></tr></thead><tbody>' +
        texts.map(function (r) {
          return '<tr><td data-label="Spot"><code>' + esc(r.key) + '</code></td><td data-label="Text">' + esc(r.value.length > 140 ? r.value.slice(0, 140) + '…' : r.value) + '</td>' +
            '<td data-label="Updated">' + esc(DM.fmtDate(r.updated_at)) + '</td><td class="actions"><button class="btn btn-ghost btn-xs" data-reset="' + esc(r.key) + '">Restore original</button></td></tr>';
        }).join('') + '</tbody></table></div>' : DM.empty('fa-pen-to-square', 'No text changes yet.')) + '</section>';

    main.querySelectorAll('[data-reset]').forEach(function (b) {
      b.onclick = async function () {
        if (!await DM.confirm('Go back to the original for "' + b.dataset.reset + '"?', { okLabel: 'Restore' })) return;
        if (await run(sb.from('site_content').delete().eq('key', b.dataset.reset), 'Restored')) shell.refresh();
      };
    });
  }
  /* =========================== CHECK-IN / OUT =========================== */
  var GRADS = ['linear-gradient(135deg,#f6d365,#fda085)', 'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
    'linear-gradient(135deg,#d4fc79,#96e6a1)', 'linear-gradient(135deg,#fbc2eb,#a6c1ee)'];

  function pickupPeople(c) {
    var list = [];
    if (c.parent && c.parent.full_name) list.push(c.parent.full_name + ' (parent)');
    String(c.authorized_pickups || '').split(/[\n;,]+/).map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (x) { list.push(x); });
    return list;
  }

  async function renderAttendance(main) {
    var date = state.attDate || DM.today();
    var res = await Promise.all([
      DM.q(sb.from('children').select('id, full_name, authorized_pickups, allergies, program:programs(name), parent:profiles(full_name, phone)').eq('status', 'enrolled').order('full_name')),
      DM.q(sb.from('attendance').select('*').eq('att_date', date)),
      DM.q(sb.from('absences').select('child_id, reason').eq('absence_date', date))
    ]);
    var kids = res[0], att = {}, absent = {};
    res[1].forEach(function (a) { att[a.child_id] = a; });
    res[2].forEach(function (a) { absent[a.child_id] = a; });
    var inCount = res[1].filter(function (a) { return a.check_in_at && !a.check_out_at; }).length;
    var outCount = res[1].filter(function (a) { return a.check_out_at; }).length;
    function tm(ts) { return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }

    main.innerHTML = head('Check-in / out', 'Tap to sign children in at drop-off and out at pickup.') +
      '<div class="toolbar"><input class="app-input" type="date" id="attDate" value="' + esc(date) + '" max="' + DM.today() + '" style="max-width:200px">' +
      '<span class="meta">' + inCount + ' here · ' + outCount + ' gone home · ' + Object.keys(absent).length + ' absent · ' + kids.length + ' enrolled</span></div>' +
      '<section class="app-card"><div class="app-list">' + (kids.length ? kids.map(function (c, i) {
        var a = att[c.id], ab = absent[c.id];
        var st = a && a.check_out_at ? 'out' : a && a.check_in_at ? 'in' : ab ? 'absent' : 'none';
        var meta = [];
        if (a && a.check_in_at) meta.push('<span><i class="fas fa-right-to-bracket"></i> In ' + tm(a.check_in_at) + (a.dropped_off_by ? ' · ' + esc(a.dropped_off_by) : '') + '</span>');
        if (a && a.check_out_at) meta.push('<span><i class="fas fa-right-from-bracket"></i> Out ' + tm(a.check_out_at) + (a.picked_up_by ? ' · ' + esc(a.picked_up_by) : '') + '</span>');
        if (!a && ab) meta.push('<span><i class="fas fa-calendar-xmark"></i> Reported absent' + (ab.reason ? ': ' + esc(ab.reason) : '') + '</span>');
        if (c.allergies && !/^none$/i.test(c.allergies.trim())) meta.push('<span style="color:#a93226"><i class="fas fa-triangle-exclamation"></i> ' + esc(c.allergies) + '</span>');
        var actions = st === 'none' || st === 'absent' ? '<button class="btn btn-green btn-xs" data-in="' + c.id + '"><i class="fas fa-right-to-bracket"></i> Check in</button>'
          : st === 'in' ? '<button class="btn btn-primary btn-xs" data-out="' + c.id + '"><i class="fas fa-right-from-bracket"></i> Check out</button>' : '<span class="pill completed">Picked up</span>';
        if (a) actions += '<button class="btn btn-ghost btn-xs" data-edit="' + c.id + '" aria-label="Edit times"><i class="fas fa-pen"></i></button>';
        return '<div class="att-row ' + st + '"><div class="child-avatar" style="background:' + GRADS[i % GRADS.length] + '">' + esc(DM.initials(c.full_name)) + '</div>' +
          '<div><h3>' + esc(c.full_name) + '</h3><div class="meta">' + (meta.join('') || '<span>' + esc(c.program ? c.program.name : '') + '</span>') + '</div></div>' +
          '<div class="att-actions">' + actions + '</div></div>';
      }).join('') : DM.empty('fa-child-reaching', 'No enrolled children yet.')) + '</div></section>';

    main.querySelector('#attDate').onchange = function (e) { state.attDate = e.target.value || DM.today(); shell.refresh(); };
    function stamp(timeStr) {
      if (!timeStr) return new Date().toISOString();
      return new Date(date + 'T' + timeStr + ':00').toISOString();
    }
    function nowTime() { var d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    function personDialog(c, kind) {
      var people = pickupPeople(c);
      var opts = people.map(function (p) { return [p, p]; }).concat([['__other', 'Someone else (enter below)']]);
      DM.formDialog({
        title: (kind === 'in' ? 'Check in ' : 'Check out ') + c.full_name,
        intro: kind === 'out' ? 'Only release to people on the pickup list. Check photo ID for anyone you do not know.' : '',
        fields: [
          { name: 'who', label: kind === 'in' ? 'Dropped off by' : 'Picked up by', type: 'select', options: opts, full: true },
          { name: 'other', label: 'Name (if someone else)', full: true },
          { name: 'time', label: 'Time', type: 'time', required: true },
          { name: 'note', label: 'Note', full: true }
        ],
        values: { who: people[0] || '__other', time: nowTime(), note: att[c.id] ? att[c.id].note : '' },
        submitLabel: kind === 'in' ? 'Check in' : 'Check out',
        onSubmit: async function (v) {
          var who = v.who === '__other' ? v.other : v.who;
          if (!who) throw new Error('Enter who ' + (kind === 'in' ? 'dropped off' : 'picked up') + ' ' + c.full_name.split(' ')[0]);
          if (kind === 'out' && v.who === '__other' && !await DM.confirm(who + ' is not on the pickup list. Did a parent confirm this pickup?', { okLabel: 'Yes, confirmed', danger: true })) throw new Error('Pickup not confirmed');
          var row = { child_id: c.id, att_date: date, note: v.note || '' };
          if (kind === 'in') { row.check_in_at = stamp(v.time); row.dropped_off_by = who; }
          else { row.check_out_at = stamp(v.time); row.picked_up_by = who; }
          await DM.q(sb.from('attendance').upsert(row, { onConflict: 'child_id,att_date' }));
          DM.toast(c.full_name.split(' ')[0] + (kind === 'in' ? ' checked in' : ' checked out'));
          shell.refresh();
        }
      });
    }
    main.querySelectorAll('[data-in]').forEach(function (b) { b.onclick = function () { personDialog(kids.find(function (k) { return k.id === b.dataset.in; }), 'in'); }; });
    main.querySelectorAll('[data-out]').forEach(function (b) { b.onclick = function () { personDialog(kids.find(function (k) { return k.id === b.dataset.out; }), 'out'); }; });
    main.querySelectorAll('[data-edit]').forEach(function (b) {
      b.onclick = function () {
        var c = kids.find(function (k) { return k.id === b.dataset.edit; }), a = att[c.id];
        function hm(ts) { if (!ts) return ''; var d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
        DM.formDialog({
          title: 'Edit ' + c.full_name + ', ' + DM.fmtDate(date),
          fields: [
            { name: 'in', label: 'Check-in time', type: 'time' }, { name: 'dropped_off_by', label: 'Dropped off by' },
            { name: 'out', label: 'Check-out time', type: 'time' }, { name: 'picked_up_by', label: 'Picked up by' },
            { name: 'note', label: 'Note', full: true }, { name: 'remove', label: 'Delete this attendance record', type: 'checkbox' }
          ],
          values: { in: hm(a.check_in_at), out: hm(a.check_out_at), dropped_off_by: a.dropped_off_by, picked_up_by: a.picked_up_by, note: a.note },
          onSubmit: async function (v) {
            if (v.remove) await DM.q(sb.from('attendance').delete().eq('id', a.id));
            else await DM.q(sb.from('attendance').update({ check_in_at: v.in ? stamp(v.in) : null, check_out_at: v.out ? stamp(v.out) : null, dropped_off_by: v.dropped_off_by, picked_up_by: v.picked_up_by, note: v.note }).eq('id', a.id));
            DM.toast('Saved');
            shell.refresh();
          }
        });
      };
    });
  }

  /* =========================== DOCUMENTS =========================== */
  async function renderDocuments(main) {
    var view = state.docView || 'submitted';
    var kids = await DM.q(sb.from('children').select('id, full_name, status, parent:profiles(full_name, email)').in('status', ['enrolled', 'pending']).order('full_name'));
    var docs = await DM.q(sb.from('family_documents').select('*, child:children(full_name, parent:profiles(full_name))').order('created_at', { ascending: false }));
    var html;
    if (view === 'missing') {
      var rows = [];
      kids.forEach(function (k) {
        var have = docs.filter(function (d) { return d.child_id === k.id && d.status !== 'needs_update'; }).map(function (d) { return d.doc_type; });
        var miss = DM.DOC_TYPES.filter(function (t) { return t.required && have.indexOf(t.id) < 0; });
        if (miss.length) rows.push('<tr><td data-label="Child"><strong>' + esc(k.full_name) + '</strong> ' + DM.pill(k.status) + '</td><td data-label="Parent">' + esc(k.parent ? k.parent.full_name : '') + '</td>' +
          '<td data-label="Missing">' + miss.map(function (t) { return esc(t.label); }).join('<br>') + '</td>' +
          '<td class="actions">' + (k.parent ? contactLinks(k.parent.email, null, 'Documents needed for ' + k.full_name) : '') + '</td></tr>');
      });
      html = rows.length ? '<div class="app-table-wrap"><table class="app-table"><thead><tr><th>Child</th><th>Parent</th><th>Still needed</th><th></th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>'
        : DM.empty('fa-circle-check', 'Every enrolled and pending child has their required documents in.');
    } else {
      var list = docs.filter(function (d) { return view === 'all' || d.status === view; });
      html = list.length ? '<div class="app-list">' + list.map(function (d) {
        return '<article class="app-item"><div class="app-item-top"><div><h3>' + esc(DM.docLabel(d.doc_type)) + '</h3><div class="meta"><span><i class="fas fa-child-reaching"></i>' +
          esc(d.child ? d.child.full_name : '') + '</span><span>' + esc(d.child && d.child.parent ? d.child.parent.full_name : '') + '</span><span>' + esc(DM.fmtDate(d.created_at)) + '</span><span>' + esc(d.file_name) + '</span></div></div>' +
          DM.pill(d.status.replace('_', '-')) + '</div>' + (d.title ? '<p>' + esc(d.title) + '</p>' : '') + (d.admin_note ? '<p><strong>Office note:</strong> ' + esc(d.admin_note) + '</p>' : '') +
          '<div class="row-actions"><button class="btn btn-ghost btn-xs" data-view="' + esc(d.file_path) + '"><i class="fas fa-eye"></i> View</button>' +
          (d.status !== 'approved' ? '<button class="btn btn-green btn-xs" data-approve="' + d.id + '"><i class="fas fa-check"></i> Approve</button>' : '') +
          '<button class="btn btn-ghost btn-xs" data-fix="' + d.id + '"><i class="fas fa-rotate"></i> Needs update</button>' +
          '<button class="btn btn-ghost btn-xs" data-del="' + d.id + '"><i class="fas fa-trash"></i></button></div></article>';
      }).join('') + '</div>' : DM.empty('fa-file-shield', view === 'submitted' ? 'No documents waiting for review.' : 'Nothing here.');
    }
    main.innerHTML = head('Documents', 'Immunization records and signed forms uploaded by families.') +
      '<div class="toolbar">' + seg('docView', [['submitted', 'To review'], ['missing', 'Missing'], ['needs_update', 'Needs update'], ['approved', 'Approved'], ['all', 'All']], view) + '</div>' +
      '<section class="app-card">' + html + '</section>';
    bindSeg(main);
    main.querySelectorAll('[data-view]').forEach(function (b) {
      b.onclick = async function () {
        var r = await sb.storage.from('documents').createSignedUrl(b.dataset.view, 300);
        if (r.error) DM.toast(DM.friendlyError(r.error), 'error'); else window.open(r.data.signedUrl, '_blank', 'noopener');
      };
    });
    main.querySelectorAll('[data-approve]').forEach(function (b) {
      b.onclick = async function () { if (await run(sb.from('family_documents').update({ status: 'approved', admin_note: '' }).eq('id', b.dataset.approve), 'Approved')) shell.refresh(); };
    });
    main.querySelectorAll('[data-fix]').forEach(function (b) {
      b.onclick = function () {
        DM.formDialog({
          title: 'Ask for an update', fields: [{ name: 'admin_note', label: 'What needs to change? (the family sees this)', type: 'textarea', required: true }],
          onSubmit: async function (v) { await DM.q(sb.from('family_documents').update({ status: 'needs_update', admin_note: v.admin_note }).eq('id', b.dataset.fix)); DM.toast('Family will see your note'); shell.refresh(); }
        });
      };
    });
    main.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = async function () {
        var d = docs.find(function (x) { return x.id === b.dataset.del; });
        if (!await DM.confirm('Delete this document permanently?', { danger: true, okLabel: 'Delete' })) return;
        await sb.storage.from('documents').remove([d.file_path]);
        if (await run(sb.from('family_documents').delete().eq('id', d.id), 'Deleted')) shell.refresh();
      };
    });
  }

  /* =========================== LESSON PROGRESS =========================== */
  var AREAS = ['Practical Life', 'Sensorial', 'Language', 'Mathematics', 'Culture', 'Art & Music'];
  async function renderProgress(main) {
    var kids = await DM.q(sb.from('children').select('id, full_name, program:programs(name)').eq('status', 'enrolled').order('full_name'));
    if (!kids.length) { main.innerHTML = head('Lesson progress', 'Track Montessori lessons for each child.') + '<section class="app-card">' + DM.empty('fa-child-reaching', 'Enroll children first.') + '</section>'; return; }
    var sel = state.progChild && kids.some(function (k) { return k.id === state.progChild; }) ? state.progChild : kids[0].id;
    var res = await Promise.all([
      DM.q(sb.from('lessons').select('*').eq('active', true).order('area').order('sort_order')),
      DM.q(sb.from('child_lessons').select('*').eq('child_id', sel))
    ]);
    var lessons = res[0], rec = {};
    res[1].forEach(function (r) { rec[r.lesson_id] = r; });
    main.innerHTML = head('Lesson progress', 'Tap a stage to record it. Families see this in their portal.', '<button class="btn btn-ghost btn-xs" id="addLesson"><i class="fas fa-plus"></i> Add lesson</button>') +
      '<div class="toolbar"><select class="app-input" id="progChild" style="max-width:320px">' + kids.map(function (k) { return '<option value="' + k.id + '"' + (k.id === sel ? ' selected' : '') + '>' + esc(k.full_name) + (k.program ? ' (' + esc(k.program.name) + ')' : '') + '</option>'; }).join('') + '</select>' +
      '<span class="meta">' + res[1].length + ' of ' + lessons.length + ' lessons recorded</span></div>' +
      AREAS.map(function (area) {
        var list = lessons.filter(function (l) { return l.area === area; });
        if (!list.length) return '';
        return '<section class="app-card"><div class="app-card-head"><h2>' + esc(area) + '</h2></div><ul class="lesson-list">' + list.map(function (l) {
          var cur = rec[l.id] ? rec[l.id].stage : 'none';
          return '<li><span>' + esc(l.name) + '</span><span class="stage-picker" role="group" aria-label="' + esc(l.name) + ' stage">' +
            [['none', '-'], ['introduced', 'Introduced'], ['practicing', 'Practicing'], ['mastered', 'Mastered']].map(function (o) {
              return '<button type="button" class="' + o[0] + '" data-lesson="' + l.id + '" data-stage="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + o[1] + '</button>';
            }).join('') + '</span></li>';
        }).join('') + '</ul></section>';
      }).join('');
    main.querySelector('#progChild').onchange = function (e) { state.progChild = e.target.value; shell.refresh(); };
    main.querySelectorAll('[data-stage]').forEach(function (b) {
      b.onclick = async function () {
        var group = b.parentElement;
        var q = b.dataset.stage === 'none'
          ? sb.from('child_lessons').delete().eq('child_id', sel).eq('lesson_id', b.dataset.lesson)
          : sb.from('child_lessons').upsert({ child_id: sel, lesson_id: b.dataset.lesson, stage: b.dataset.stage, updated_at: new Date().toISOString() });
        if (await run(q)) group.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      };
    });
    main.querySelector('#addLesson').onclick = function () {
      DM.formDialog({
        title: 'Add a lesson', fields: [{ name: 'area', label: 'Area', type: 'select', options: AREAS }, { name: 'name', label: 'Lesson name', required: true }, { name: 'sort_order', label: 'Order', type: 'number' }],
        values: { sort_order: 99 },
        onSubmit: async function (v) { await DM.q(sb.from('lessons').insert({ area: v.area, name: v.name, sort_order: v.sort_order || 0 })); DM.toast('Lesson added'); shell.refresh(); }
      });
    };
  }

  /* =========================== CONFERENCES =========================== */
  async function renderConferences(main) {
    var slots = await DM.q(sb.from('conference_slots').select('*, child:children(full_name, parent:profiles(full_name, email, phone))').gte('starts_at', new Date(Date.now() - 864e5).toISOString()).order('starts_at'));
    var byDay = {};
    slots.forEach(function (s) { var k = new Date(s.starts_at).toDateString(); (byDay[k] = byDay[k] || []).push(s); });
    var booked = slots.filter(function (s) { return s.child_id; }).length;
    main.innerHTML = head('Conferences', 'Open time slots; enrolled families book them in their portal.', '<button class="btn btn-primary btn-xs" id="addSlots"><i class="fas fa-plus"></i> Add time slots</button>') +
      '<div class="toolbar"><span class="meta">' + booked + ' of ' + slots.length + ' upcoming slots booked</span></div>' +
      (slots.length ? Object.keys(byDay).map(function (day) {
        return '<section class="app-card"><div class="app-card-head"><h2>' + esc(new Date(day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })) + '</h2></div>' +
          '<div class="app-table-wrap"><table class="app-table"><thead><tr><th>Time</th><th>Where</th><th>Booked by</th><th></th></tr></thead><tbody>' +
          byDay[day].map(function (s) {
            var p = s.child && s.child.parent;
            return '<tr><td data-label="Time"><strong>' + esc(new Date(s.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })) + '</strong> <span class="meta">' + s.minutes + ' min</span></td>' +
              '<td data-label="Where">' + esc(s.location) + '</td>' +
              '<td data-label="Booked by">' + (s.child ? esc(s.child.full_name) + (p ? '<br><span class="meta">' + esc(p.full_name) + (p.phone ? ' · ' + esc(p.phone) : '') + '</span>' : '') : '<span class="meta">Open</span>') + '</td>' +
              '<td class="actions">' + (s.child_id ? '<button class="btn btn-ghost btn-xs" data-unbook="' + s.id + '">Cancel booking</button>' : '') + '<button class="btn btn-ghost btn-xs" data-del="' + s.id + '"><i class="fas fa-trash"></i></button></td></tr>';
          }).join('') + '</tbody></table></div></section>';
      }).join('') : '<section class="app-card">' + DM.empty('fa-people-arrows', 'No conference times yet. Add a block of slots to open sign-ups.') + '</section>');

    main.querySelector('#addSlots').onclick = function () {
      DM.formDialog({
        title: 'Add conference slots', intro: 'Creates back-to-back slots between the start and end time.',
        fields: [
          { name: 'date', label: 'Date', type: 'date', required: true, min: DM.today() },
          { name: 'minutes', label: 'Minutes each', type: 'number', required: true },
          { name: 'start', label: 'First slot starts', type: 'time', required: true },
          { name: 'end', label: 'Last slot ends by', type: 'time', required: true },
          { name: 'location', label: 'Where', full: true, placeholder: 'In person, classroom / Zoom link' }
        ],
        values: { minutes: 20, start: '15:30', end: '18:00', location: 'In person' },
        onSubmit: async function (v) {
          var start = new Date(v.date + 'T' + v.start + ':00'), end = new Date(v.date + 'T' + v.end + ':00');
          var mins = Math.max(5, Math.min(120, v.minutes || 20)), rows = [];
          for (var t = start; t.getTime() + mins * 60000 <= end.getTime(); t = new Date(t.getTime() + mins * 60000)) {
            rows.push({ starts_at: t.toISOString(), minutes: mins, location: v.location || 'In person' });
          }
          if (!rows.length) throw new Error('No slots fit between those times');
          if (rows.length > 60) throw new Error('That makes more than 60 slots. Try a shorter window.');
          await DM.q(sb.from('conference_slots').insert(rows));
          DM.toast(rows.length + ' slots added');
          shell.refresh();
        }
      });
    };
    main.querySelectorAll('[data-unbook]').forEach(function (b) {
      b.onclick = async function () {
        if (!await DM.confirm('Cancel this family\'s booking? Let them know so they can pick a new time.', { okLabel: 'Cancel booking', danger: true })) return;
        var r = await sb.rpc('cancel_conference_booking', { slot: b.dataset.unbook });
        if (r.error) DM.toast(DM.friendlyError(r.error), 'error'); else DM.toast('Booking canceled');
        shell.refresh();
      };
    });
    main.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = async function () {
        if (!await DM.confirm('Delete this time slot?', { danger: true, okLabel: 'Delete' })) return;
        if (await run(sb.from('conference_slots').delete().eq('id', b.dataset.del), 'Deleted')) shell.refresh();
      };
    });
  }

  /* =========================== LUNCH MENU =========================== */
  function mondayOf(offset) {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    var day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? 1 : day === 6 ? 2 : 1 - day) + offset * 7);
    return d;
  }
  function isoDay(d) { var x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); }

  async function renderMenu(main) {
    var off = state.menuWeek || 0;
    var mon = mondayOf(off);
    var days = [0, 1, 2, 3, 4].map(function (i) { var d = new Date(mon); d.setDate(d.getDate() + i); return d; });
    var rows = await DM.q(sb.from('menu_days').select('*').gte('menu_date', isoDay(days[0])).lte('menu_date', isoDay(days[4])));
    var by = {}; rows.forEach(function (r) { by[r.menu_date] = r; });
    var F = [['morning_snack', 'Morning snack'], ['lunch', 'Lunch'], ['afternoon_snack', 'Afternoon snack']];
    main.innerHTML = head('Lunch menu', 'Shown on the public Lunch Menu page and in family portals.') +
      '<div class="toolbar"><button class="btn btn-ghost btn-xs" id="mPrev"><i class="fas fa-chevron-left"></i></button><strong>Week of ' + esc(days[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric' })) + '</strong>' +
      '<button class="btn btn-ghost btn-xs" id="mNext"><i class="fas fa-chevron-right"></i></button><button class="btn btn-ghost btn-xs" id="mCopy"><i class="fas fa-copy"></i> Copy last week</button></div>' +
      '<section class="app-card"><form id="menuForm" class="menu-editor">' + days.map(function (d) {
        var k = isoDay(d), r = by[k] || {};
        return '<div class="menu-row"><div><strong>' + d.toLocaleDateString('en-US', { weekday: 'long' }) + '</strong><small>' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '</small></div>' +
          F.map(function (f) { return '<div><label for="' + k + f[0] + '">' + f[1] + '</label><textarea id="' + k + f[0] + '" data-day="' + k + '" data-field="' + f[0] + '" maxlength="' + (f[0] === 'lunch' ? 500 : 300) + '">' + esc(r[f[0]] || '') + '</textarea></div>'; }).join('') + '</div>';
      }).join('') + '<div><button class="btn btn-primary" type="submit"><i class="fas fa-save"></i> Save week</button></div></form></section>';
    main.querySelector('#mPrev').onclick = function () { state.menuWeek = off - 1; shell.refresh(); };
    main.querySelector('#mNext').onclick = function () { state.menuWeek = off + 1; shell.refresh(); };
    main.querySelector('#mCopy').onclick = async function () {
      var prev = days.map(function (d) { var x = new Date(d); x.setDate(x.getDate() - 7); return isoDay(x); });
      var old = await DM.q(sb.from('menu_days').select('*').in('menu_date', prev));
      if (!old.length) { DM.toast('Last week has no menu to copy', 'error'); return; }
      old.forEach(function (r) {
        var i = prev.indexOf(r.menu_date), k = isoDay(days[i]);
        F.forEach(function (f) { var el = main.querySelector('[data-day="' + k + '"][data-field="' + f[0] + '"]'); if (el) el.value = r[f[0]] || ''; });
      });
      DM.toast('Copied. Review and click Save week.');
    };
    main.querySelector('#menuForm').onsubmit = async function (e) {
      e.preventDefault();
      var upserts = [], deletes = [];
      days.forEach(function (d) {
        var k = isoDay(d), row = { menu_date: k, updated_at: new Date().toISOString() }, any = false;
        F.forEach(function (f) { var v = main.querySelector('[data-day="' + k + '"][data-field="' + f[0] + '"]').value.trim(); row[f[0]] = v; if (v) any = true; });
        if (any) upserts.push(row); else if (by[k]) deletes.push(k);
      });
      try {
        if (upserts.length) await DM.q(sb.from('menu_days').upsert(upserts));
        if (deletes.length) await DM.q(sb.from('menu_days').delete().in('menu_date', deletes));
        DM.toast('Menu saved');
        shell.refresh();
      } catch (err) { DM.toast(DM.friendlyError(err), 'error'); }
    };
  }

  /* =========================== PHOTOS =========================== */
  var CATS = [['classrooms', 'Classrooms'], ['outdoor', 'Outdoor'], ['activities', 'Activities'], ['events', 'Events'], ['campus', 'Campus']];
  async function renderPhotos(main) {
    var rows = await DM.q(sb.from('gallery_photos').select('*').order('created_at', { ascending: false }).limit(300));
    var priv = rows.filter(function (p) { return p.bucket === 'family-photos'; }).map(function (p) { return p.file_path; });
    var signed = {};
    if (priv.length) { var r = await sb.storage.from('family-photos').createSignedUrls(priv, 3600); (r.data || []).forEach(function (x) { signed[x.path] = x.signedUrl; }); }
    function url(p) { return p.bucket === 'media' ? sb.storage.from('media').getPublicUrl(p.file_path).data.publicUrl : signed[p.file_path]; }
    main.innerHTML = head('Photos', 'Public photos appear on the Gallery page. Families-only photos appear only in parent portals.',
      '<button class="btn btn-primary btn-xs" id="addPhotos"><i class="fas fa-upload"></i> Upload photos</button>') +
      '<div class="notice warn" style="margin-bottom:18px"><i class="fas fa-camera"></i><div>Only post children whose families signed a photo release. Use "Families only" for everyday classroom moments.</div></div>' +
      '<section class="app-card">' + (rows.length ? '<div class="photo-grid">' + rows.map(function (p) {
        return '<div class="photo-tile" style="cursor:default"><img src="' + esc(url(p) || '') + '" alt="' + esc(p.caption) + '" loading="lazy">' +
          '<span class="photo-badge">' + (p.visibility === 'families' ? '<i class="fas fa-lock"></i> Families' : '<i class="fas fa-globe"></i> Public') + '</span>' +
          '<span class="photo-cap">' + esc(p.caption || '') + '<br><button class="btn btn-ghost btn-xs" style="background:#fff;margin-top:6px" data-edit="' + p.id + '">Edit</button> <button class="btn btn-ghost btn-xs" style="background:#fff;margin-top:6px" data-del="' + p.id + '"><i class="fas fa-trash"></i></button></span></div>';
      }).join('') + '</div>' : DM.empty('fa-images', 'No photos yet.')) + '</section>';

    main.querySelector('#addPhotos').onclick = function () {
      DM.formDialog({
        title: 'Upload photos', wide: true,
        fields: [
          { name: 'files', label: 'Photos (JPG, PNG, or WEBP; up to 20 at a time)', type: 'file', multiple: true, required: true, full: true, accept: 'image/jpeg,image/png,image/webp' },
          { name: 'visibility', label: 'Who can see them', type: 'select', options: [['families', 'Families only (portal)'], ['public', 'Public (website gallery)']] },
          { name: 'category', label: 'Category', type: 'select', options: CATS },
          { name: 'caption', label: 'Caption (applies to all)', full: true },
          { name: 'taken_on', label: 'Date taken', type: 'date' }
        ],
        values: { visibility: 'families', category: 'activities', taken_on: DM.today() },
        submitLabel: 'Upload',
        onSubmit: async function (v) {
          var files = v.files.slice(0, 20);
          if (!files.length) throw new Error('Choose at least one photo');
          var bucket = v.visibility === 'public' ? 'media' : 'family-photos';
          var done = 0;
          for (var i = 0; i < files.length; i++) {
            var f = files[i];
            if (!/^image\/(jpeg|png|webp)$/.test(f.type)) continue;
            if (f.size > (bucket === 'media' ? 5 : 8) * 1024 * 1024) { DM.toast(f.name + ' is too large, skipped', 'error'); continue; }
            var path = (bucket === 'media' ? 'gallery/' : (v.taken_on || DM.today()).slice(0, 7) + '/') + Date.now() + '-' + i + '-' + DM.safeFileName(f.name);
            var up = await sb.storage.from(bucket).upload(path, f, { contentType: f.type, cacheControl: '31536000' });
            if (up.error) throw up.error;
            var ins = await sb.from('gallery_photos').insert({ bucket: bucket, file_path: path, visibility: v.visibility, category: v.category, caption: v.caption, taken_on: v.taken_on });
            if (ins.error) throw ins.error;
            done++;
          }
          DM.toast(done + ' photo' + (done === 1 ? '' : 's') + ' uploaded');
          shell.refresh();
        }
      });
    };
    main.querySelectorAll('[data-edit]').forEach(function (b) {
      b.onclick = function () {
        var p = rows.find(function (x) { return x.id === b.dataset.edit; });
        DM.formDialog({
          title: 'Edit photo', fields: [{ name: 'caption', label: 'Caption', full: true }, { name: 'category', label: 'Category', type: 'select', options: CATS }, { name: 'taken_on', label: 'Date taken', type: 'date' }, { name: 'sort_order', label: 'Order', type: 'number' }],
          values: p,
          onSubmit: async function (v) { await DM.q(sb.from('gallery_photos').update({ caption: v.caption, category: v.category, taken_on: v.taken_on, sort_order: v.sort_order || 0 }).eq('id', p.id)); DM.toast('Saved'); shell.refresh(); }
        });
      };
    });
    main.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = async function () {
        var p = rows.find(function (x) { return x.id === b.dataset.del; });
        if (!await DM.confirm('Delete this photo?', { danger: true, okLabel: 'Delete' })) return;
        await sb.storage.from(p.bucket).remove([p.file_path]);
        if (await run(sb.from('gallery_photos').delete().eq('id', p.id), 'Deleted')) shell.refresh();
      };
    });
  }

  /* =========================== TESTIMONIALS + JOBS =========================== */
  var renderTestimonials = listEditor({
    table: 'testimonials', title: 'Testimonials', sub: 'Real quotes from families, with their permission. Published ones show on the home page.', addLabel: 'Add testimonial',
    icon: 'fa-quote-left', emptyText: 'No testimonials yet. Ask a happy family if you can share a few words.',
    query: function () { return sb.from('testimonials').select('*').order('sort_order').order('created_at', { ascending: false }); },
    item: function (t) { return '<div class="app-item-top"><h3>' + esc(t.author) + '</h3>' + (t.published ? DM.pill('published') : DM.pill('draft')) + '</div><p>' + esc(t.quote) + '</p>'; },
    fields: [
      { name: 'quote', label: 'Quote', type: 'textarea', rows: 4, required: true },
      { name: 'author', label: 'Attribution', required: true, placeholder: 'e.g., Priya P., parent of a Primary student', full: true },
      { name: 'sort_order', label: 'Order', type: 'number' },
      { name: 'published', label: 'Show on the website (family gave permission)', type: 'checkbox' }
    ],
    fromForm: function (v) { v.sort_order = v.sort_order || 0; return v; }
  });

  var renderJobs = listEditor({
    table: 'job_postings', title: 'Job postings', sub: 'Open positions on the Careers page. Uncheck "Show" to hide one.', addLabel: 'Add position',
    icon: 'fa-bullseye', emptyText: 'No positions posted. The Careers page still accepts general applications.',
    query: function () { return sb.from('job_postings').select('*').order('sort_order').order('created_at', { ascending: false }); },
    item: function (j) { return '<div class="app-item-top"><div><h3>' + esc(j.title) + '</h3><div class="meta">' + esc(j.employment_type) + '</div></div>' + (j.active ? DM.pill('open') : DM.pill('closed')) + '</div>' + (j.description ? '<p>' + esc(j.description) + '</p>' : ''); },
    fields: [
      { name: 'title', label: 'Title', required: true, placeholder: 'Assistant Guide, Primary' },
      { name: 'employment_type', label: 'Type', placeholder: 'Full-time' },
      { name: 'description', label: 'Description', type: 'textarea', rows: 6 },
      { name: 'sort_order', label: 'Order', type: 'number' },
      { name: 'active', label: 'Show on the Careers page', type: 'checkbox' }
    ],
    defaults: function () { return { active: true, employment_type: 'Full-time' }; },
    fromForm: function (v) { v.sort_order = v.sort_order || 0; return v; }
  });

  var renderJobApps = inboxRenderer({
    key: 'jobapps', table: 'job_applications', title: 'Job applications', noun: 'application',
    sub: 'From the Careers page. Resumes open in a new tab.',
    statuses: ['new', 'reviewing', 'interview', 'hired', 'declined'], empty_icon: 'fa-briefcase',
    title_of: function (r) { return r.name + ' - ' + (r.position || 'General interest'); },
    meta_of: function (r) { return '<span><i class="far fa-clock"></i>' + esc(DM.fmtDateTime(r.created_at)) + '</span>'; },
    body_of: function (r) { return kv([['Email', r.email], ['Phone', r.phone], ['Credentials', r.credentials], ['Experience', r.experience], ['Message', r.message]]); },
    reply_subject: function (r) { return 'Your application to Daffodils Montessori'; },
    extra_actions: function (r) { return r.resume_path ? '<button class="btn btn-green btn-xs" data-resume="' + esc(r.resume_path) + '"><i class="fas fa-file-lines"></i> Resume</button>' : ''; },
    bind: function (main) {
      main.querySelectorAll('[data-resume]').forEach(function (b) {
        b.onclick = async function () {
          var r = await sb.storage.from('applications').createSignedUrl(b.dataset.resume, 300);
          if (r.error) DM.toast(DM.friendlyError(r.error), 'error'); else window.open(r.data.signedUrl, '_blank', 'noopener');
        };
      });
    }
  });
})();
