/* ==========================================================
   Login, sign-up, and password reset pages
   ========================================================== */
(function () {
  'use strict';

  var DM = window.DM;
  var hash = window.location.hash || '';
  var isRecoveryLink = /type=recovery/.test(hash);
  var hashError = (function () {
    var m = hash.match(/error_description=([^&]+)/);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  })();

  function $(s) { return document.querySelector(s); }

  function notice(type, html) {
    var box = $('#authNotice');
    if (!box) return;
    var icon = { ok: 'fa-check-circle', err: 'fa-exclamation-circle', warn: 'fa-info-circle', info: 'fa-envelope-open-text' }[type] || 'fa-info-circle';
    box.innerHTML = html ? '<div class="notice ' + type + '" role="' + (type === 'err' ? 'alert' : 'status') + '"><i class="fas ' + icon + '" aria-hidden="true"></i><div>' + html + '</div></div>' : '';
    box.style.marginBottom = html ? '16px' : '';
  }

  function busy(form, on, label) {
    var btn = form.querySelector('button[type=submit]');
    if (on) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> ' + (label || 'Please wait...');
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  }

  function nextUrl(profile) {
    var next = new URLSearchParams(window.location.search).get('next');
    // only allow same-site relative pages
    if (next && /^[a-z0-9-]+\.html(\?[^#]*)?$/i.test(next)) return DM.url(next);
    return DM.url(profile && profile.role === 'admin' ? 'admin.html' : 'portal.html');
  }

  document.addEventListener('DOMContentLoaded', async function () {
    // show / hide password
    document.querySelectorAll('.pw-toggle').forEach(function (b) {
      b.addEventListener('click', function () {
        var input = b.parentElement.querySelector('input');
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        b.innerHTML = '<i class="fas ' + (show ? 'fa-eye-slash' : 'fa-eye') + '" aria-hidden="true"></i>';
      });
    });

    var forms = document.querySelectorAll('.auth-form');
    if (!DM || !DM.configured) {
      notice('warn', 'Family accounts are not switched on yet. Please call or email the school for now.');
      forms.forEach(function (f) { f.querySelectorAll('input, button').forEach(function (el) { el.disabled = true; }); });
      return;
    }

    if (hashError) notice('err', DM.esc(hashError) + (/expired|invalid/i.test(hashError) ? '. Please request a new link.' : ''));

    if ($('#loginForm')) initLogin();
    if ($('#registerForm')) initRegister();
    if ($('#requestResetForm')) initReset();
  });

  /* ---------- Login ---------- */
  async function initLogin() {
    var form = $('#loginForm');
    var params = new URLSearchParams(window.location.search);
    if (params.get('registered')) notice('info', 'Almost done! We sent a confirmation link to your email. Click it, then log in here.');
    if (params.get('reset')) notice('ok', 'Your password was updated. Please log in.');

    // Already signed in (or just clicked the email confirmation link)
    await new Promise(function (r) { setTimeout(r, 50); });
    var session = await DM.getSession();
    if (session) {
      var p = await DM.getProfile(true);
      window.location.replace(nextUrl(p));
      return;
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      notice('', '');
      busy(form, true, 'Logging in...');
      var r = await DM.sb.auth.signInWithPassword({ email: form.email.value.trim(), password: form.password.value });
      if (r.error) {
        busy(form, false);
        notice('err', DM.esc(DM.friendlyError(r.error)));
        return;
      }
      var profile = await DM.getProfile(true);
      window.location.replace(nextUrl(profile));
    });
  }

  /* ---------- Register ---------- */
  async function initRegister() {
    var form = $('#registerForm');
    var session = await DM.getSession();
    if (session) { window.location.replace(DM.url('portal.html')); return; }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (form.password.value !== form.password2.value) {
        notice('err', 'The two passwords do not match.');
        form.password2.focus();
        return;
      }
      notice('', '');
      busy(form, true, 'Creating account...');
      var r = await DM.sb.auth.signUp({
        email: form.email.value.trim(),
        password: form.password.value,
        options: {
          emailRedirectTo: DM.url('login.html'),
          data: { full_name: form.fullName.value.trim(), phone: form.phone.value.trim() }
        }
      });
      if (r.error) {
        busy(form, false);
        notice('err', DM.esc(DM.friendlyError(r.error)));
        return;
      }
      if (r.data && r.data.session) {
        window.location.replace(DM.url('portal.html?welcome=1'));
        return;
      }
      // Email confirmation is on
      form.hidden = true;
      notice('info', '<strong>Check your email.</strong> We sent a confirmation link to ' + DM.esc(form.email.value.trim()) +
        '. Click it to finish setting up your account, then <a href="login.html">log in</a>.');
    });
  }

  /* ---------- Password reset ---------- */
  function initReset() {
    var requestForm = $('#requestResetForm');
    var newForm = $('#newPasswordForm');

    function showNewPasswordForm() {
      requestForm.hidden = true;
      newForm.hidden = false;
      $('#resetTitle').textContent = 'Choose a new password';
      $('#resetSub').textContent = 'Pick something at least 8 characters long.';
      if (!hashError) notice('', '');
      newForm.password.focus();
    }

    DM.sb.auth.onAuthStateChange(function (event) {
      if (event === 'PASSWORD_RECOVERY') showNewPasswordForm();
    });
    if (isRecoveryLink && !hashError) showNewPasswordForm();

    requestForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!requestForm.checkValidity()) { requestForm.reportValidity(); return; }
      busy(requestForm, true, 'Sending...');
      var r = await DM.sb.auth.resetPasswordForEmail(requestForm.email.value.trim(), { redirectTo: DM.url('reset-password.html') });
      busy(requestForm, false);
      if (r.error && /rate|too many/i.test(r.error.message || '')) {
        notice('err', DM.esc(DM.friendlyError(r.error)));
        return;
      }
      requestForm.hidden = true;
      notice('info', 'If an account exists for <strong>' + DM.esc(requestForm.email.value.trim()) + '</strong>, a reset link is on its way. The link works once and expires in an hour.');
    });

    newForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!newForm.checkValidity()) { newForm.reportValidity(); return; }
      if (newForm.password.value !== newForm.password2.value) { notice('err', 'The two passwords do not match.'); return; }
      busy(newForm, true, 'Saving...');
      var session = await DM.getSession();
      if (!session) {
        busy(newForm, false);
        notice('err', 'This reset link has expired. Please request a new one.');
        newForm.hidden = true;
        requestForm.hidden = false;
        return;
      }
      var r = await DM.sb.auth.updateUser({ password: newForm.password.value });
      if (r.error) {
        busy(newForm, false);
        notice('err', DM.esc(DM.friendlyError(r.error)));
        return;
      }
      await DM.sb.auth.signOut();
      window.location.replace(DM.url('login.html?reset=1'));
    });
  }
})();
