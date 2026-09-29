/* ========================================
   DAFFODILS MONTESSORI - Public site script
   Content comes from Supabase when connected (js/config.js),
   otherwise from js/site-data.js.
   ======================================== */

(function () {
  'use strict';

  var S = window.SITE_DATA || {};
  var DM = window.DM || { configured: false, esc: function (s) { return String(s); } };
  var esc = DM.esc;
  var DATA = null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  document.addEventListener('DOMContentLoaded', function () {
    initNav();
    initYear();
    initFaq();
    initGalleryFilters();
    initForms();
    initTourDate();
    initSmoothScroll();
    renderSocial();
    renderFooterExtras();
    initSubMenus();
    applyImages(S.images || {}, {});

    var dataReady = DM.loadPublicData ? DM.loadPublicData() : Promise.resolve(null);
    dataReady.then(function (data) {
      DATA = data || { programs: [], events: [], announcements: [], staff: [], content: {}, images: S.images || {} };
      applyContent(DATA.content || {});
      applyImages(DATA.images || {}, DATA.content || {});
      renderAnnouncements();
      renderTuitionGrid();
      renderProgramRates();
      renderEnrollmentPrograms();
      renderStaff();
      renderTestimonials();
      renderGallery();
      initReveal();
      document.dispatchEvent(new CustomEvent('dm:data', { detail: DATA }));
    });

    initAccountNav();
  });

  /* ---------- Navigation ---------- */
  function initNav() {
    var toggle = $('#navToggle');
    var menu = $('#navMenu');
    var navbar = $('#navbar');

    function setOpen(open) {
      menu.classList.toggle('active', open);
      toggle.classList.toggle('active', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('nav-open', open);
    }

    if (toggle && menu) {
      toggle.addEventListener('click', function () { setOpen(!menu.classList.contains('active')); });
      menu.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && menu.classList.contains('active')) { setOpen(false); toggle.focus(); }
      });
    }

    if (navbar) {
      var onScroll = function () { navbar.classList.toggle('scrolled', window.scrollY > 20); };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  // Swap "Parent Login" for "My Portal" / "Admin" when signed in
  async function initAccountNav() {
    var link = $('#navAccount');
    if (!link) return;
    if (!DM.configured) return;
    var profile = await DM.getProfile();
    if (!profile) return;
    var isAdmin = profile.role === 'admin';
    link.href = isAdmin ? 'admin' : 'portal';
    link.innerHTML = '<i class="fas ' + (isAdmin ? 'fa-gauge' : 'fa-user-circle') + '" aria-hidden="true"></i> ' + (isAdmin ? 'Admin' : 'My Portal');
    if (isAdmin) initInlineEditing();
  }

  function initYear() {
    $all('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
  }

  /* ---------- Editable text + photos ---------- */
  function applyContent(content) {
    $all('[data-editable]').forEach(function (el) {
      var key = el.getAttribute('data-editable');
      if (Object.prototype.hasOwnProperty.call(content, key) && !/^https?:\/\//.test(content[key])) {
        el.textContent = content[key];
        el.classList.add('dm-edited');
      }
    });
  }

  function applyImages(images, content) {
    $all('[data-image-upload]').forEach(function (el) {
      var key = el.getAttribute('data-image-upload');
      var src = content[key] || images[key];
      if (!src) return;
      setSpotImage(el, src);
    });
  }

  function setSpotImage(el, src) {
    el.style.backgroundImage = 'url("' + String(src).replace(/"/g, '%22') + '")';
    el.classList.add('has-image');
    $all(':scope > i, :scope > span', el).forEach(function (c) { c.style.display = 'none'; });
  }

  /* ---------- Announcements banner (home) ---------- */
  function renderAnnouncements() {
    var bar = $('#homeAnnouncementsBar');
    var box = $('#homeAnnouncementsContent');
    var list = (DATA.announcements || []).filter(function (a) { return a.audience !== 'families'; });
    if (!bar || !box || !list.length) return;
    box.innerHTML = list.slice(0, 3).map(function (a) {
      return '<div class="home-ann-item"><strong>' + esc(a.title) + '</strong> <span>' + esc(a.text) + '</span></div>';
    }).join('');
    bar.style.display = '';
  }

  /* ---------- Tuition page ---------- */
  function renderTuitionGrid() {
    var grid = $('#tuitionGrid');
    if (!grid) return;
    var list = DATA.programs || [];
    if (!list.length) {
      grid.innerHTML = '<p class="empty-note">Contact us for current tuition rates.</p>';
      return;
    }
    grid.className = 'tuition-plans';
    grid.innerHTML = list.map(function (p) {
      var rates = (p.rates || []).map(function (r) {
        return '<li><span>' + esc(r.label) + '</span><strong>' + esc(r.price) + '<small>/mo</small></strong></li>';
      }).join('');
      var short = String(p.name).replace(/ Program$/, '');
      return '<article class="plan-card' + (p.featured ? ' featured' : '') + '">' +
        (p.featured ? '<span class="plan-badge">Most Popular</span>' : '') +
        '<div class="plan-icon"><i class="fas ' + esc(p.icon || 'fa-star') + '" aria-hidden="true"></i></div>' +
        '<h3>' + esc(p.name) + '</h3>' +
        '<p class="plan-ages">' + esc(p.ages) + '</p>' +
        '<ul class="plan-rates">' + rates + '</ul>' +
        '<a class="btn ' + (p.featured ? 'btn-primary' : 'btn-soft') + ' btn-full" href="enrollment?program=' + encodeURIComponent(p.slug || p.id || '') + '">Apply for ' + esc(short) + '</a>' +
        '</article>';
    }).join('');
  }

  /* ---------- Programs page prices ---------- */
  function renderProgramRates() {
    var bySlug = {};
    (DATA.programs || []).forEach(function (p) { bySlug[p.slug || p.id] = p; });
    $all('[data-program-rates]').forEach(function (el) {
      var p = bySlug[el.getAttribute('data-program-rates')];
      if (!p || !p.rates || !p.rates.length) return;
      el.innerHTML = p.rates.map(function (r) { return esc(r.label) + ': ' + esc(r.price) + '/month'; }).join('<br>');
    });
  }

  /* ---------- Enrollment page ---------- */
  function renderEnrollmentPrograms() {
    var table = $('#enrollTuitionTable');
    var select = $('#program');
    var list = DATA.programs || [];

    if (table) {
      var html = '<div class="tuition-row header"><span>Program</span><span>Monthly</span></div>';
      if (!list.length) html += '<div class="tuition-row"><span>Contact us for current rates</span><span></span></div>';
      list.forEach(function (p) {
        (p.rates || []).forEach(function (r) {
          html += '<div class="tuition-row"><span>' + esc(String(p.name).replace(/ Program$/, '')) + ' <em>' + esc(r.label) + '</em></span><span>' + esc(r.price) + '</span></div>';
        });
      });
      table.innerHTML = html;
    }

    if (select) {
      var want = new URLSearchParams(window.location.search).get('program');
      var opts = '<option value="">Select a program</option>';
      list.forEach(function (p) {
        opts += '<optgroup label="' + esc(p.name + (p.ages ? ' (' + p.ages + ')' : '')) + '">';
        (p.rates || []).forEach(function (r, i) {
          var val = p.name + ' - ' + r.label + ' (' + r.price + '/mo)';
          var sel = (want && want === (p.slug || p.id) && i === 0) ? ' selected' : '';
          opts += '<option value="' + esc(val) + '"' + sel + '>' + esc(String(p.name).replace(/ Program$/, '') + ' - ' + r.label + ' (' + r.price + '/mo)') + '</option>';
        });
        opts += '</optgroup>';
      });
      opts += '<option value="Not sure yet">Not sure yet</option>';
      select.innerHTML = opts;
    }
  }

  /* ---------- Staff page ---------- */
  function renderStaff() {
    var box = $('#staffContainer');
    if (!box) return;
    var gradients = [
      'linear-gradient(135deg, #f6d365, #fda085)',
      'linear-gradient(135deg, #a1c4fd, #c2e9fb)',
      'linear-gradient(135deg, #d4fc79, #96e6a1)',
      'linear-gradient(135deg, #fbc2eb, #a6c1ee)',
      'linear-gradient(135deg, #ffecd2, #fcb69f)'
    ];
    box.innerHTML = (DATA.staff || []).map(function (s, i) {
      var photo = s.image
        ? '<img class="staff-img" src="' + esc(s.image) + '" alt="' + esc(s.name) + '" loading="lazy">'
        : '<div class="staff-avatar" style="background:' + gradients[i % gradients.length] + ';"><span>' + esc(DM.initials ? DM.initials(s.name) : '') + '</span></div>';
      return '<div class="staff-card leadership-card">' +
        '<div class="staff-photo">' + photo + '</div>' +
        '<div class="staff-info">' +
          '<h3>' + esc(s.name) + '</h3>' +
          (s.title ? '<span class="staff-title">' + esc(s.title) + '</span>' : '') +
          (s.bio ? '<p>' + esc(s.bio) + '</p>' : '') +
          (s.credentials ? '<div class="staff-credentials"><i class="fas fa-certificate" aria-hidden="true"></i> ' + esc(s.credentials) + '</div>' : '') +
        '</div></div>';
    }).join('');
  }

  /* ---------- Testimonials (home) ---------- */
  function renderTestimonials() {
    var sec = $('#testimonialsSection');
    if (!sec) return;
    var list = DATA.testimonials || [];
    var reviews = S.googleReviewsUrl;
    if (!list.length && !reviews) return;
    $('#testimonialsGrid').innerHTML = list.map(function (t) {
      return '<figure class="testimonial-card"><blockquote>' + esc(t.quote) + '</blockquote><figcaption>' + esc(t.author) + '</figcaption></figure>';
    }).join('');
    if (reviews) {
      $('#reviewsLink').innerHTML = '<a class="btn btn-soft" href="' + esc(reviews) + '" target="_blank" rel="noopener"><i class="fab fa-google" aria-hidden="true"></i> Read our Google reviews</a>';
    }
    sec.hidden = false;
  }

  /* ---------- Gallery page: real photos when uploaded ---------- */
  function renderGallery() {
    var grid = $('.gallery-grid');
    var photos = DATA.photos || [];
    if (!grid || !photos.length) return;
    grid.innerHTML = photos.map(function (p, i) {
      return '<button type="button" class="gallery-item gallery-photo" data-category="' + esc(p.category) + '" data-index="' + i + '">' +
        '<img src="' + esc(p.url) + '" alt="' + esc(p.caption || 'Daffodils Montessori photo') + '" loading="lazy">' +
        (p.caption ? '<span class="gallery-caption">' + esc(p.caption) + '</span>' : '') + '</button>';
    }).join('');
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('.gallery-photo');
      if (b) openLightbox(photos, Number(b.dataset.index));
    });
  }

  function openLightbox(photos, index) { DM.lightbox(photos, index); }

  /* ---------- Social links (contact page) ---------- */
  function renderSocial() {
    var card = $('#socialCard');
    var box = $('#socialLinks');
    if (!card || !box) return;
    var social = S.social || {};
    var defs = [['facebook', 'fa-facebook-f', 'Facebook'], ['instagram', 'fa-instagram', 'Instagram'], ['youtube', 'fa-youtube', 'YouTube']];
    var html = defs.filter(function (d) { return social[d[0]]; }).map(function (d) {
      return '<a href="' + esc(social[d[0]]) + '" class="social-btn ' + d[0] + '" target="_blank" rel="noopener"><i class="fab ' + d[1] + '" aria-hidden="true"></i> ' + d[2] + '</a>';
    }).join('');
    if (html) { box.innerHTML = html; card.hidden = false; }
  }

  /* ---------- Footer: social icons + license line ---------- */
  function renderFooterExtras() {
    var social = S.social || {};
    var box = $('#footerSocial');
    var defs = [['facebook', 'fa-facebook-f', 'Facebook'], ['instagram', 'fa-instagram', 'Instagram'], ['youtube', 'fa-youtube', 'YouTube']];
    var html = defs.filter(function (d) { return social[d[0]]; }).map(function (d) {
      return '<a href="' + esc(social[d[0]]) + '" target="_blank" rel="noopener" aria-label="' + d[2] + '"><i class="fab ' + d[1] + '" aria-hidden="true"></i></a>';
    }).join('');
    if (box && html) { box.innerHTML = html; box.hidden = false; }
    var lic = (S.contact || {}).license;
    $all('[data-license]').forEach(function (el) { el.textContent = lic ? lic : ''; });
  }

  /* ---------- Dropdown menus (tap/keyboard support) ---------- */
  function initSubMenus() {
    var subs = $all('.has-sub');
    subs.forEach(function (li) {
      var btn = $('.sub-toggle', li);
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = !li.classList.contains('open');
        subs.forEach(function (o) { o.classList.remove('open'); var b = $('.sub-toggle', o); if (b) b.setAttribute('aria-expanded', 'false'); });
        li.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
    document.addEventListener('click', function () {
      subs.forEach(function (o) { o.classList.remove('open'); var b = $('.sub-toggle', o); if (b) b.setAttribute('aria-expanded', 'false'); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      subs.forEach(function (o) { if (o.classList.contains('open')) { o.classList.remove('open'); var b = $('.sub-toggle', o); if (b) { b.setAttribute('aria-expanded', 'false'); b.focus(); } } });
    });
  }

  /* ---------- FAQ accordion ---------- */
  function initFaq() {
    $all('.faq-question').forEach(function (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', function () {
        var item = btn.parentElement;
        var wasOpen = item.classList.contains('active');
        $all('.faq-item.active').forEach(function (it) {
          it.classList.remove('active');
          var q = $('.faq-question', it);
          if (q) q.setAttribute('aria-expanded', 'false');
        });
        if (!wasOpen) { item.classList.add('active'); btn.setAttribute('aria-expanded', 'true'); }
      });
    });
  }

  /* ---------- Gallery filters ---------- */
  function initGalleryFilters() {
    var filters = $all('.gallery-filter');
    filters.forEach(function (f) {
      f.addEventListener('click', function () {
        var cat = f.dataset.filter;
        var items = $all('.gallery-item');
        filters.forEach(function (x) { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
        f.classList.add('active');
        f.setAttribute('aria-pressed', 'true');
        items.forEach(function (it) { it.hidden = !(cat === 'all' || it.dataset.category === cat); });
      });
    });
  }

  /* ---------- Forms: saved to the admin dashboard + emailed ---------- */
  var FORM_CONFIG = {
    contactForm: {
      msg: '#contactFormMessage', table: 'contact_messages', subject: 'New message from the website', busy: 'Sending...',
      ok: 'Thanks for reaching out! We will get back to you within 24 hours.',
      map: function (v) { return { name: v.name, email: v.email, phone: v.phone || '', subject: v.subject || '', message: v.message }; }
    },
    tourForm: {
      msg: '#tourFormMessage', table: 'tour_requests', subject: 'New tour request', busy: 'Booking...',
      ok: 'Tour request received! We will call or email to confirm your visit.',
      map: function (v) { return { parent_name: v.parentName, email: v.email, phone: v.phone || '', tour_date: v.tourDate || null, tour_time: v.tourTime || '', child_age: v.childAge || '', notes: v.notes || '' }; }
    },
    campForm: {
      msg: '#campFormMessage', table: 'contact_messages', subject: 'Summer camp interest', busy: 'Sending...',
      ok: "You're on the list! We will email you when summer camp registration opens.",
      map: function (v) { return { name: v.name, email: v.email, phone: v.phone || '', subject: 'Summer camp interest', message: 'Child age: ' + (v.childAge || '-') + (v.notes ? '\n' + v.notes : '') }; }
    },
    enrollmentForm: {
      msg: '#enrollmentFormMessage', table: 'enrollment_applications', subject: 'New enrollment application', busy: 'Submitting...',
      ok: 'Application received! We will contact you within 2 business days.',
      map: function (v) { return { child_name: v.childName, child_dob: v.childDob || null, child_age: v.childAge || '', program: v.program || '', parent_name: v.parentName, email: v.parentEmail, phone: v.parentPhone || '', start_date: v.startDate || null, notes: v.notes || '' }; }
    }
  };

  function initForms() {
    Object.keys(FORM_CONFIG).forEach(function (id) {
      var form = document.getElementById(id);
      if (!form) return;
      var trap = document.createElement('input');
      trap.type = 'text'; trap.name = '_honey'; trap.tabIndex = -1; trap.autocomplete = 'off';
      trap.className = 'hp-field'; trap.setAttribute('aria-hidden', 'true');
      form.appendChild(trap);
      form.addEventListener('submit', function (e) { e.preventDefault(); submitForm(form, FORM_CONFIG[id]); });
    });
  }

  function sendEmailCopy(payload, cfg) {
    return DM.emailCopy ? DM.emailCopy(payload, cfg.subject) : Promise.reject(new Error('no helper'));
  }

  async function submitForm(form, cfg) {
    var msg = $(cfg.msg);
    var btn = $('button[type="submit"]', form);
    var original = btn.innerHTML;
    var contact = S.contact || {};

    function show(type, html) {
      msg.className = 'form-message ' + type;
      msg.innerHTML = html;
      msg.setAttribute('role', type === 'error' ? 'alert' : 'status');
    }

    var payload = {};
    new FormData(form).forEach(function (v, k) { payload[k] = typeof v === 'string' ? v.trim() : v; });
    if (payload._honey) return;
    delete payload._honey;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> ' + cfg.busy;

    var saved = false, emailed = false;
    var emailPromise = sendEmailCopy(payload, cfg).then(function () { emailed = true; }, function () {});
    if (DM.configured) {
      try {
        var r = await DM.sb.from(cfg.table).insert(cfg.map(payload));
        if (!r.error) saved = true; else console.warn(r.error);
      } catch (e) { console.warn(e); }
    }
    await emailPromise;

    if (saved || emailed) {
      show('success', '<i class="fas fa-check-circle" aria-hidden="true"></i> ' + esc(cfg.ok));
      form.reset();
    } else {
      show('error', '<i class="fas fa-exclamation-triangle" aria-hidden="true"></i> Sorry, that did not go through. Please call us at ' +
        '<a href="tel:' + esc((contact.phone || '').replace(/[^0-9+]/g, '')) + '">' + esc(contact.phone) + '</a> or email ' +
        '<a href="mailto:' + esc(contact.email) + '">' + esc(contact.email) + '</a>.');
    }
    btn.disabled = false;
    btn.innerHTML = original;
  }

  function initTourDate() {
    var d = $('#tourDate');
    if (d && DM.today) d.min = DM.today();
  }

  /* ---------- Smooth in-page scrolling ---------- */
  function initSmoothScroll() {
    $all('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (id.length < 2) return;
        var target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ---------- Reveal-on-scroll ---------- */
  var revealed = false;
  function initReveal() {
    if (revealed) return;
    revealed = true;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) return;
    var selectors = ['.program-card', '.why-card', '.mission-card', '.method-card', '.staff-card', '.support-card', '.stat-card',
      '.step-card', '.program-detail', '.gallery-item', '.faq-item', '.contact-info-card', '.tuition-card', '.plan-card', '.diff-card', '.credential-badge'];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    selectors.forEach(function (sel) {
      $all(sel).forEach(function (el, i) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) return; // already on screen: no flash
        el.classList.add('fade-in');
        el.style.transitionDelay = Math.min(i % 6, 5) * 0.06 + 's';
        io.observe(el);
      });
    });
  }

  /* ---------- Admin: edit text and photos right on the page ---------- */
  function initInlineEditing() {
    var editables = $all('[data-editable]');
    var spots = $all('[data-image-upload]');
    if (!editables.length && !spots.length) return;

    var bar = document.createElement('div');
    bar.className = 'dm-editbar';
    bar.innerHTML =
      '<button type="button" class="dm-edit-toggle" aria-pressed="false"><i class="fas fa-pen" aria-hidden="true"></i> <span>Edit this page</span></button>' +
      '<span class="dm-edit-hint" hidden>Click any highlighted text to change it. Click a photo spot to upload. Changes save automatically.</span>';
    document.body.appendChild(bar);
    var toggle = $('.dm-edit-toggle', bar);
    var hint = $('.dm-edit-hint', bar);
    var on = false;

    function save(key, value, el) {
      el && el.classList.add('dm-saving');
      return DM.sb.from('site_content').upsert({ key: key, value: value, updated_at: new Date().toISOString() }).then(function (r) {
        el && el.classList.remove('dm-saving');
        if (r.error) { DM.toast('Could not save: ' + DM.friendlyError(r.error), 'error'); return false; }
        DM.toast('Saved');
        return true;
      });
    }

    editables.forEach(function (el) {
      el.addEventListener('focus', function () { el.dataset.before = el.innerText; });
      el.addEventListener('blur', function () {
        if (!on) return;
        var val = el.innerText.replace(/ /g, ' ').trim();
        if (val === (el.dataset.before || '').trim()) return;
        if (!val) { DM.toast('Text cannot be empty. Undoing.', 'error'); el.innerText = el.dataset.before; return; }
        save(el.getAttribute('data-editable'), val, el).then(function (ok) {
          if (ok) { el.classList.add('dm-edited'); el.textContent = val; }
        });
      });
      el.addEventListener('keydown', function (e) {
        if (!on) return;
        if (e.key === 'Escape') { el.innerText = el.dataset.before || el.innerText; el.blur(); }
        if (e.key === 'Enter' && !/^(P|DIV|LI)$/.test(el.tagName)) { e.preventDefault(); el.blur(); }
      });
      el.addEventListener('click', function (e) { if (on && el.closest('a')) e.preventDefault(); });
    });

    spots.forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (!on) return;
        e.preventDefault();
        e.stopPropagation();
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp,image/gif';
        input.onchange = async function () {
          var file = input.files[0];
          if (!file) return;
          el.classList.add('dm-saving');
          try {
            var url = await DM.uploadPublicImage(file, 'site');
            var key = el.getAttribute('data-image-upload');
            if (await save(key, url, null)) setSpotImage(el, url);
          } catch (err) {
            DM.toast(DM.friendlyError(err), 'error');
          }
          el.classList.remove('dm-saving');
        };
        input.click();
      }, true);
    });

    toggle.addEventListener('click', function () {
      on = !on;
      document.body.classList.toggle('dm-editing', on);
      toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
      $('span', toggle).textContent = on ? 'Done editing' : 'Edit this page';
      hint.hidden = !on;
      editables.forEach(function (el) {
        if (on) { el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'true'); }
        else { el.removeAttribute('contenteditable'); }
      });
    });
  }
})();
