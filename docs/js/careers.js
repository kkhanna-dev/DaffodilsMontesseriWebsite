/* Careers page: open positions + application with resume upload */
(function () {
  'use strict';
  var DM = window.DM;
  var esc = DM.esc;

  document.addEventListener('DOMContentLoaded', async function () {
    var list = document.getElementById('jobList');
    var select = document.getElementById('jobPosition');
    var jobs = [];
    if (DM.configured) {
      var r = await DM.sb.from('job_postings').select('*').eq('active', true).order('sort_order').order('created_at', { ascending: false });
      jobs = r.data || [];
    }
    if (!jobs.length) {
      list.innerHTML = '<div class="job-empty"><i class="fas fa-seedling" aria-hidden="true"></i><p>No openings are posted right now, but we always like hearing from caring, Montessori-minded educators. Send a general application below.</p></div>';
    } else {
      list.innerHTML = jobs.map(function (j) {
        return '<article class="job-card"><div class="job-card-top"><h3>' + esc(j.title) + '</h3><span class="pill">' + esc(j.employment_type) + '</span></div>' +
          (j.description ? '<p>' + esc(j.description) + '</p>' : '') +
          '<a class="btn btn-soft btn-xs" href="#apply" data-job="' + esc(j.title) + '">Apply for this role</a></article>';
      }).join('');
      select.innerHTML = jobs.map(function (j) { return '<option value="' + esc(j.title) + '" data-id="' + j.id + '">' + esc(j.title) + '</option>'; }).join('') +
        '<option value="General interest">General interest</option>';
      list.addEventListener('click', function (e) {
        var a = e.target.closest('[data-job]');
        if (a) select.value = a.dataset.job;
      });
    }

    var form = document.getElementById('jobForm');
    var msg = document.getElementById('jobFormMessage');
    function show(type, html) { msg.className = 'form-message ' + type; msg.innerHTML = html; msg.setAttribute('role', type === 'error' ? 'alert' : 'status'); }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var file = form.resume.files[0];
      if (file && file.size > 5 * 1024 * 1024) { show('error', 'That resume is over 5 MB. Please attach a smaller file.'); return; }
      var btn = form.querySelector('button[type=submit]');
      var label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Sending...';
      var v = {
        position: form.position.value, name: form.name.value.trim(), email: form.email.value.trim(), phone: form.phone.value.trim(),
        credentials: form.credentials.value.trim(), experience: form.experience.value.trim(), message: form.message.value.trim()
      };
      var opt = form.position.selectedOptions[0];
      var saved = false;
      try {
        if (DM.configured) {
          var resumePath = null;
          if (file) {
            resumePath = 'resumes/' + Date.now() + '-' + DM.safeFileName(file.name);
            var up = await DM.sb.storage.from('applications').upload(resumePath, file, { contentType: file.type || 'application/pdf' });
            if (up.error) throw up.error;
          }
          var ins = await DM.sb.from('job_applications').insert(Object.assign({}, v, { posting_id: opt && opt.dataset.id ? opt.dataset.id : null, resume_path: resumePath }));
          if (ins.error) throw ins.error;
          saved = true;
        }
      } catch (err) { console.warn(err); }
      var emailed = false;
      try { await DM.emailCopy(v, 'New job application'); emailed = true; } catch (err) { /* optional */ }
      btn.disabled = false;
      btn.innerHTML = label;
      if (saved || emailed) {
        show('success', '<i class="fas fa-check-circle"></i> Thank you! Your application was received.' + (!saved && file ? ' Please also email your resume to <a href="mailto:rishiekhanna@yahoo.com">rishiekhanna@yahoo.com</a>.' : ''));
        form.reset();
      } else {
        show('error', '<i class="fas fa-exclamation-triangle"></i> Sorry, that did not go through. Please email your resume to <a href="mailto:rishiekhanna@yahoo.com">rishiekhanna@yahoo.com</a>.');
      }
    });
  });
})();
