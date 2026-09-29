/* ==========================================================
   DAFFODILS MONTESSORI - shared client helpers
   Loaded on every page after config.js and supabase.js.
   Exposes window.DM
   ========================================================== */
(function () {
  'use strict';

  var cfg = window.DAFFODILS_CONFIG || {};
  var configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase && window.supabase.createClient);
  var sb = null;
  if (configured) {
    try {
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch (e) {
      console.error('Supabase init failed', e);
      configured = false;
    }
  }

  var DM = window.DM = { sb: sb, configured: configured, cfg: cfg };

  /* ---------- small utils ---------- */
  DM.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  DM.money = function (cents) {
    var n = (Number(cents) || 0) / 100;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  };

  DM.toCents = function (dollars) {
    var n = parseFloat(String(dollars).replace(/[^0-9.]/g, ''));
    return isFinite(n) ? Math.round(n * 100) : 0;
  };

  // "2026-10-24" is a calendar day, not a UTC instant
  DM.parseDay = function (d) {
    if (!d) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { var p = d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
    return new Date(d);
  };

  DM.fmtDate = function (d, opts) {
    var x = DM.parseDay(d);
    if (!x || isNaN(x)) return '';
    return x.toLocaleDateString('en-US', opts || { month: 'short', day: 'numeric', year: 'numeric' });
  };

  DM.fmtDateTime = function (d) {
    var x = new Date(d);
    if (isNaN(x)) return '';
    return x.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  DM.today = function () {
    var t = new Date();
    t.setMinutes(t.getMinutes() - t.getTimezoneOffset());
    return t.toISOString().slice(0, 10);
  };

  DM.url = function (page) { return new URL(page, window.location.href).href; };

  DM.initials = function (name) {
    return String(name || '?').trim().split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 3).toUpperCase();
  };

  DM.friendlyError = function (err) {
    var m = (err && (err.message || err.error_description || err.msg)) || String(err || 'Something went wrong');
    if (/Invalid login credentials/i.test(m)) return 'That email and password do not match. Try again or reset your password.';
    if (/Email not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox for the link we sent.';
    if (/User already registered/i.test(m)) return 'An account with that email already exists. Try logging in instead.';
    if (/Password should be at least/i.test(m)) return 'Please choose a password with at least 8 characters.';
    if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a minute and try again.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Could not reach the server. Check your connection and try again.';
    if (/JWT expired/i.test(m)) return 'Your session expired. Please log in again.';
    return m;
  };

  /* ---------- auth ---------- */
  var profilePromise = null;

  DM.getSession = async function () {
    if (!configured) return null;
    try {
      var r = await sb.auth.getSession();
      return r.data.session;
    } catch (e) { return null; }
  };

  DM.getProfile = function (force) {
    if (!configured) return Promise.resolve(null);
    if (profilePromise && !force) return profilePromise;
    profilePromise = (async function () {
      var session = await DM.getSession();
      if (!session) return null;
      var r = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      if (r.error || !r.data) return { id: session.user.id, email: session.user.email, full_name: '', role: 'parent' };
      return r.data;
    })();
    return profilePromise;
  };

  DM.signOut = async function () {
    if (configured) { try { await sb.auth.signOut(); } catch (e) { /* ignore */ } }
    profilePromise = null;
    window.location.href = DM.url('index.html');
  };

  // Redirects to login if needed. Returns the profile.
  DM.requireAuth = async function (opts) {
    opts = opts || {};
    if (!configured) return null;
    var profile = await DM.getProfile();
    if (!profile) {
      var here = window.location.pathname.split('/').pop() + window.location.search;
      window.location.replace(DM.url('login.html?next=' + encodeURIComponent(here)));
      return null;
    }
    if (opts.admin && profile.role !== 'admin') {
      window.location.replace(DM.url('portal.html'));
      return null;
    }
    return profile;
  };

  if (configured) {
    sb.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') profilePromise = null;
    });
  }

  /* ---------- public data (live, with site-data.js fallback) ---------- */
  var publicPromise = null;

  function fallbackData() {
    var S = window.SITE_DATA || {};
    return {
      source: 'fallback',
      programs: (S.programs || []).map(function (p) {
        return {
          id: p.id, slug: p.id, name: p.name, ages: p.ages, icon: p.icon, featured: !!p.featured, description: p.description || '',
          rates: (p.rates || []).map(function (r) { return { id: null, label: r.label, price: r.price, amount_cents: DM.toCents(r.price) }; })
        };
      }),
      events: (S.events || []).map(function (e) {
        return { title: e.title, date: e.date, time: e.time || '', type: e.type || 'general', description: e.description || '', location: e.location || '' };
      }),
      announcements: (S.announcements || []).map(function (a) { return { title: a.title, text: a.text || '', date: a.date || '' }; }),
      staff: (S.staff || []).map(function (s) { return { name: s.name, title: s.title || '', bio: s.bio || '', credentials: s.credentials || '', image: s.image || '' }; }),
      content: {},
      images: S.images || {},
      testimonials: [],
      photos: []
    };
  }

  DM.loadPublicData = function (force) {
    if (publicPromise && !force) return publicPromise;
    publicPromise = (async function () {
      var fb = fallbackData();
      if (!configured) return fb;
      try {
        var res = await Promise.all([
          sb.from('programs').select('id, slug, name, ages, icon, featured, description, sort_order, program_rates(id, label, amount_cents, sort_order)').eq('active', true).order('sort_order'),
          sb.from('events').select('*').order('event_date'),
          sb.from('announcements').select('*').order('pinned', { ascending: false }).order('published_at', { ascending: false }).limit(20),
          sb.from('staff').select('*').order('sort_order'),
          sb.from('site_content').select('key, value'),
          sb.from('testimonials').select('quote, author, sort_order').eq('published', true).order('sort_order'),
          sb.from('gallery_photos').select('id, file_path, caption, category, sort_order, created_at').eq('visibility', 'public').order('sort_order').order('created_at', { ascending: false })
        ]);
        var err = res.find(function (r) { return r.error; });
        if (err) throw err.error;

        var content = {};
        res[4].data.forEach(function (row) { content[row.key] = row.value; });

        return {
          source: 'live',
          programs: res[0].data.map(function (p) {
            var rates = (p.program_rates || []).slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
            return {
              id: p.slug, uuid: p.id, slug: p.slug, name: p.name, ages: p.ages, icon: p.icon, featured: p.featured, description: p.description,
              rates: rates.map(function (r) { return { id: r.id, label: r.label, amount_cents: r.amount_cents, price: DM.money(r.amount_cents) }; })
            };
          }),
          events: res[1].data.map(function (e) {
            return { id: e.id, title: e.title, date: e.event_date, endDate: e.end_date, time: e.time_label, type: e.type, description: e.description, location: e.location };
          }),
          announcements: res[2].data.map(function (a) { return { title: a.title, text: a.body, date: a.published_at, audience: a.audience, pinned: a.pinned }; }),
          staff: res[3].data.map(function (s) { return { name: s.name, title: s.title, bio: s.bio, credentials: s.credentials, image: s.photo_url }; }),
          content: content,
          images: fb.images,
          testimonials: res[5].data || [],
          photos: (res[6].data || []).map(function (p) {
            return { id: p.id, caption: p.caption, category: p.category, url: sb.storage.from('media').getPublicUrl(p.file_path).data.publicUrl };
          })
        };
      } catch (e) {
        console.warn('Live data unavailable, using site-data.js', e);
        return fb;
      }
    })();
    return publicPromise;
  };

  /* ---------- email copy of a form (FormSubmit) ---------- */
  DM.emailCopy = function (payload, subject) {
    var S = window.SITE_DATA || {};
    var endpoint = S.forms && S.forms.endpoint;
    if (!endpoint) return Promise.reject(new Error('no email endpoint'));
    var body = {};
    Object.keys(payload).forEach(function (k) { if (typeof payload[k] === 'string') body[k] = payload[k]; });
    var who = payload.name || payload.parentName || '';
    body._subject = subject + (who ? ' - ' + who : '');
    body._template = 'table';
    var reply = payload.email || payload.parentEmail;
    if (reply) body._replyto = reply;
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || String(j.success) === 'false') throw new Error(j.message || 'email failed');
        return true;
      });
    });
  };

  /* ---------- toasts ---------- */
  DM.toast = function (msg, type) {
    var box = document.getElementById('dm-toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'dm-toasts';
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    var t = document.createElement('div');
    t.className = 'dm-toast ' + (type || 'success');
    t.innerHTML = '<i class="fas ' + (type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle') + '" aria-hidden="true"></i><span></span>';
    t.querySelector('span').textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, type === 'error' ? 6000 : 3200);
    setTimeout(function () { t.remove(); }, type === 'error' ? 6500 : 3700);
  };

  /* ---------- dialogs ---------- */
  function makeDialog(inner, wide) {
    var d = document.createElement('dialog');
    d.className = 'dm-dialog' + (wide ? ' wide' : '');
    d.innerHTML = inner;
    document.body.appendChild(d);
    d.addEventListener('close', function () { setTimeout(function () { d.remove(); }, 50); });
    d.addEventListener('click', function (e) { if (e.target === d) d.close('cancel'); });
    d.showModal();
    return d;
  }

  DM.confirm = function (message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var d = makeDialog(
        '<form method="dialog" class="dm-dialog-body">' +
        '<h3>' + DM.esc(opts.title || 'Are you sure?') + '</h3>' +
        '<p>' + DM.esc(message) + '</p>' +
        '<div class="dm-dialog-actions">' +
        '<button value="cancel" class="btn btn-ghost">Cancel</button>' +
        '<button value="ok" class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '">' + DM.esc(opts.okLabel || 'Confirm') + '</button>' +
        '</div></form>');
      d.addEventListener('close', function () { resolve(d.returnValue === 'ok'); });
    });
  };

  /*
    DM.formDialog({
      title, submitLabel, values, wide,
      fields: [{ name, label, type: text|email|tel|date|number|money|textarea|select|checkbox|file,
                 required, options: [[value,label]], help, placeholder, accept, full }],
      onSubmit: async (values, formEl) => { ... throw to show error }
    })
  */
  DM.formDialog = function (spec) {
    var values = spec.values || {};
    var fieldsHtml = spec.fields.map(function (f, i) {
      var id = 'dmf-' + f.name + '-' + i;
      var v = values[f.name];
      if (f.type === 'money' && v != null && v !== '') v = (v / 100).toFixed(2);
      var req = f.required ? ' required' : '';
      var ph = f.placeholder ? ' placeholder="' + DM.esc(f.placeholder) + '"' : '';
      var input;
      if (f.type === 'textarea') {
        input = '<textarea id="' + id + '" name="' + f.name + '" rows="' + (f.rows || 3) + '"' + req + ph + '>' + DM.esc(v == null ? '' : v) + '</textarea>';
      } else if (f.type === 'select') {
        input = '<select id="' + id + '" name="' + f.name + '"' + req + '>' + (f.options || []).map(function (o) {
          var ov = Array.isArray(o) ? o[0] : o, ol = Array.isArray(o) ? o[1] : o;
          return '<option value="' + DM.esc(ov) + '"' + (String(ov) === String(v == null ? '' : v) ? ' selected' : '') + '>' + DM.esc(ol) + '</option>';
        }).join('') + '</select>';
      } else if (f.type === 'checkbox') {
        return '<div class="dm-field dm-check' + (f.full ? ' full' : '') + '"><label><input type="checkbox" name="' + f.name + '"' + (v ? ' checked' : '') + '> ' + DM.esc(f.label) + '</label>' + (f.help ? '<small>' + DM.esc(f.help) + '</small>' : '') + '</div>';
      } else if (f.type === 'file') {
        input = '<input type="file" id="' + id + '" name="' + f.name + '"' + (f.accept ? ' accept="' + DM.esc(f.accept) + '"' : '') + (f.multiple ? ' multiple' : '') + req + '>';
      } else {
        var t = f.type === 'money' ? 'number" step="0.01" min="0' : (f.type || 'text');
        input = '<input type="' + t + '" id="' + id + '" name="' + f.name + '" value="' + DM.esc(v == null ? '' : v) + '"' + req + ph + (f.min ? ' min="' + f.min + '"' : '') + (f.max ? ' max="' + f.max + '"' : '') + (f.maxlength ? ' maxlength="' + f.maxlength + '"' : '') + (f.autocomplete ? ' autocomplete="' + f.autocomplete + '"' : '') + '>';
      }
      return '<div class="dm-field' + (f.full || f.type === 'textarea' ? ' full' : '') + '"><label for="' + id + '">' + DM.esc(f.label) + (f.required ? ' <span class="required">*</span>' : '') + '</label>' + input + (f.help ? '<small>' + DM.esc(f.help) + '</small>' : '') + '</div>';
    }).join('');

    var d = makeDialog(
      '<form class="dm-dialog-body" novalidate>' +
      '<div class="dm-dialog-head"><h3>' + DM.esc(spec.title) + '</h3><button type="button" class="dm-x" aria-label="Close"><i class="fas fa-times"></i></button></div>' +
      (spec.intro ? '<p class="dm-intro">' + DM.esc(spec.intro) + '</p>' : '') +
      '<div class="dm-fields">' + fieldsHtml + '</div>' +
      '<div class="dm-form-error" role="alert" hidden></div>' +
      '<div class="dm-dialog-actions">' +
      '<button type="button" class="btn btn-ghost dm-cancel">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">' + DM.esc(spec.submitLabel || 'Save') + '</button>' +
      '</div></form>', spec.wide);

    var form = d.querySelector('form');
    d.querySelector('.dm-x').onclick = function () { d.close(); };
    d.querySelector('.dm-cancel').onclick = function () { d.close(); };
    var first = form.querySelector('input:not([type=checkbox]), textarea, select');
    if (first) first.focus();

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var errBox = form.querySelector('.dm-form-error');
      errBox.hidden = true;
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      var out = {};
      spec.fields.forEach(function (f) {
        var el = form.elements[f.name];
        if (!el) return;
        if (f.type === 'checkbox') out[f.name] = el.checked;
        else if (f.type === 'file') out[f.name] = f.multiple ? Array.prototype.slice.call(el.files || []) : (el.files && el.files[0] ? el.files[0] : null);
        else if (f.type === 'money') out[f.name] = el.value === '' ? null : DM.toCents(el.value);
        else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
        else if (f.type === 'date' || f.type === 'time') out[f.name] = el.value || null;
        else out[f.name] = el.value.trim();
      });
      var btn = form.querySelector('button[type=submit]');
      var label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      try {
        await spec.onSubmit(out, form);
        d.close('ok');
      } catch (err) {
        errBox.textContent = DM.friendlyError(err);
        errBox.hidden = false;
        btn.disabled = false;
        btn.innerHTML = label;
      }
    });
    return d;
  };

  /* ---------- storage ---------- */
  DM.safeFileName = function (name) {
    var parts = String(name || 'file').toLowerCase().split('.');
    var ext = parts.length > 1 ? parts.pop().replace(/[^a-z0-9]/g, '') : '';
    var base = parts.join('.').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';
    return base + (ext ? '.' + ext : '');
  };

  DM.uploadPublicImage = async function (file, folder) {
    if (!file) throw new Error('Choose an image first');
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Please use a JPG, PNG, WEBP, or GIF image');
    if (file.size > 5 * 1024 * 1024) throw new Error('That image is over 5 MB. Please resize it and try again.');
    var path = (folder || 'site') + '/' + Date.now() + '-' + DM.safeFileName(file.name);
    var up = await sb.storage.from('media').upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
    if (up.error) throw up.error;
    return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
  };
  /* ---------- document types families upload ---------- */
  DM.DOC_TYPES = [
    { id: 'immunization', label: 'Certificate of Immunization Status (CIS)', required: true, help: 'Required by Washington for child care. Get it from MyIR or your doctor.' },
    { id: 'enrollment_agreement', label: 'Signed enrollment agreement', required: true },
    { id: 'emergency_medical', label: 'Emergency & medical consent form', required: true },
    { id: 'photo_release', label: 'Photo release form (yes or no)', required: true },
    { id: 'allergy_plan', label: 'Allergy or health care plan', required: false, help: 'Only if your child has one.' },
    { id: 'other', label: 'Other document', required: false }
  ];
  DM.docLabel = function (id) { var t = DM.DOC_TYPES.find(function (d) { return d.id === id; }); return t ? t.label : id; };

  /* ---------- photo lightbox ---------- */
  DM.lightbox = function (photos, index) {
    var d = document.createElement('dialog');
    d.className = 'lightbox';
    d.innerHTML = '<button type="button" class="lb-close" aria-label="Close"><i class="fas fa-times"></i></button>' +
      (photos.length > 1 ? '<button type="button" class="lb-prev" aria-label="Previous photo"><i class="fas fa-chevron-left"></i></button>' : '') +
      '<figure><img alt=""><figcaption></figcaption></figure>' +
      (photos.length > 1 ? '<button type="button" class="lb-next" aria-label="Next photo"><i class="fas fa-chevron-right"></i></button>' : '');
    document.body.appendChild(d);
    function show(i) {
      index = (i + photos.length) % photos.length;
      var p = photos[index];
      var img = d.querySelector('img');
      img.src = p.url;
      img.alt = p.caption || 'Photo';
      d.querySelector('figcaption').textContent = p.caption || '';
    }
    d.querySelector('.lb-close').onclick = function () { d.close(); };
    if (photos.length > 1) {
      d.querySelector('.lb-prev').onclick = function () { show(index - 1); };
      d.querySelector('.lb-next').onclick = function () { show(index + 1); };
    }
    d.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') show(index - 1); if (e.key === 'ArrowRight') show(index + 1); });
    d.addEventListener('click', function (e) { if (e.target === d || e.target.tagName === 'FIGURE') d.close(); });
    d.addEventListener('close', function () { d.remove(); });
    show(index || 0);
    d.showModal();
  };

  /* ---------- portal/admin shell ---------- */
  /*
    DM.appShell({
      profile, tabs: [{ id, label, icon, group, count }], render: async (tabId, mainEl) => {}
    })
    Tabs are routed through the URL hash (#children) so refresh/back work.
  */
  DM.appShell = function (opts) {
    var tabsEl = document.getElementById('appTabs');
    var main = document.getElementById('appMain');
    var user = document.getElementById('appUser');
    var p = opts.profile || {};
    user.innerHTML = '<div class="app-avatar">' + DM.esc(DM.initials(p.full_name || p.email)) + '</div>' +
      '<div><strong>' + DM.esc(p.full_name || 'Welcome') + '</strong><small>' + DM.esc(p.role === 'admin' ? 'Administrator' : p.email || '') + '</small></div>';

    var lastGroup = null;
    tabsEl.innerHTML = opts.tabs.map(function (t) {
      var g = '';
      if (t.group && t.group !== lastGroup) { g = '<div class="app-group-label">' + DM.esc(t.group) + '</div>'; lastGroup = t.group; }
      return g + '<button type="button" class="app-tab" role="tab" id="tab-' + t.id + '" data-tab="' + t.id + '" aria-selected="false" aria-controls="appMain">' +
        '<i class="fas ' + t.icon + '" aria-hidden="true"></i> <span>' + DM.esc(t.label) + '</span><span class="count" hidden></span></button>';
    }).join('');

    document.getElementById('signOutBtn').addEventListener('click', function () { DM.signOut(); });

    var current = null;
    var shell = {
      go: function (id, push) {
        var t = opts.tabs.find(function (x) { return x.id === id; }) || opts.tabs[0];
        current = t.id;
        tabsEl.querySelectorAll('.app-tab').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === t.id ? 'true' : 'false'); });
        var active = tabsEl.querySelector('[data-tab="' + t.id + '"]');
        if (active && active.scrollIntoView && window.innerWidth < 960) active.scrollIntoView({ block: 'nearest', inline: 'center' });
        if (push !== false && location.hash !== '#' + t.id) history.replaceState(null, '', '#' + t.id);
        document.title = t.label + ' - ' + (opts.title || 'Daffodils Montessori');
        main.innerHTML = '<div class="app-loading"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Loading…</div>';
        return Promise.resolve(opts.render(t.id, main)).catch(function (err) {
          console.error(err);
          main.innerHTML = '<div class="app-card"><div class="notice err"><i class="fas fa-exclamation-circle"></i><div>' +
            DM.esc(DM.friendlyError(err)) + ' <button class="link-btn" type="button" id="retryTab">Try again</button></div></div></div>';
          var rb = document.getElementById('retryTab');
          if (rb) rb.onclick = function () { shell.go(current); };
        });
      },
      refresh: function () { return shell.go(current, false); },
      current: function () { return current; },
      setCount: function (id, n) {
        var el = tabsEl.querySelector('[data-tab="' + id + '"] .count');
        if (!el) return;
        el.hidden = !n;
        el.textContent = n > 99 ? '99+' : String(n || '');
      }
    };

    tabsEl.addEventListener('click', function (e) {
      var b = e.target.closest('.app-tab');
      if (b) { shell.go(b.dataset.tab); main.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
    });
    window.addEventListener('hashchange', function () {
      var id = location.hash.slice(1);
      if (id && id !== current) shell.go(id, false);
    });
    main.addEventListener('click', function (e) {
      var go = e.target.closest('[data-go]');
      if (go) { e.preventDefault(); shell.go(go.getAttribute('data-go')); window.scrollTo({ top: 0 }); }
    });

    shell.go((location.hash || '').slice(1) || opts.tabs[0].id, false);
    return shell;
  };

  DM.offlineNotice = function () {
    var app = document.getElementById('app');
    if (!app) return;
    app.outerHTML = '<div class="container offline-card"><div class="app-card"><h2 style="margin-bottom:8px;">Accounts are not connected yet</h2>' +
      '<p style="color:var(--text-light)">The family portal and admin dashboard need the Supabase keys in <code>js/config.js</code>. ' +
      'See <strong>SETUP.md</strong> in the project folder for the 10-minute setup.</p>' +
      '<p style="margin-top:14px"><a class="btn btn-primary" href="index.html">Back to the website</a></p></div></div>';
  };

  DM.empty = function (icon, text, actionHtml) {
    return '<div class="empty"><i class="fas ' + icon + '" aria-hidden="true"></i><p>' + DM.esc(text) + '</p>' + (actionHtml || '') + '</div>';
  };

  DM.pill = function (status) {
    return '<span class="pill ' + DM.esc(String(status || '').toLowerCase()) + '">' + DM.esc(String(status || '').replace(/-/g, ' ')) + '</span>';
  };

  // throws on Supabase error, returns data
  DM.q = async function (promise) {
    var r = await promise;
    if (r.error) throw r.error;
    return r.data;
  };
})();
