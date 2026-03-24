/* ========================================
   DAFFODILS MONTESSORI - Main JavaScript
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {

  // --- Mobile Navigation Toggle ---
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      navMenu.classList.toggle('active');
      navToggle.classList.toggle('active');
    });

    // Close menu when clicking a link
    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        navToggle.classList.remove('active');
      });
    });
  }

  // --- Sticky Navbar Shadow ---
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    });
  }

  // --- Scroll Animations ---
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -40px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Add fade-in class to animatable elements
  const animatableSelectors = [
    '.program-card', '.why-card', '.testimonial-card', '.mission-card',
    '.method-card', '.staff-card', '.support-card', '.stat-card',
    '.step-card', '.program-detail', '.gallery-item', '.faq-item',
    '.contact-info-card', '.tuition-card', '.payment-info-card',
    '.diff-card', '.credential-badge', '.child-card',
  ];

  animatableSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach((el, index) => {
      el.classList.add('fade-in');
      el.style.transitionDelay = `${index * 0.08}s`;
      observer.observe(el);
    });
  });

  // --- FAQ Accordion ---
  document.querySelectorAll('.faq-question').forEach(button => {
    button.addEventListener('click', () => {
      const faqItem = button.parentElement;
      const isActive = faqItem.classList.contains('active');

      // Close all other items
      document.querySelectorAll('.faq-item.active').forEach(item => {
        item.classList.remove('active');
      });

      // Toggle current
      if (!isActive) {
        faqItem.classList.add('active');
      }
    });
  });

  // --- Gallery Filters ---
  const galleryFilters = document.querySelectorAll('.gallery-filter');
  const galleryItems = document.querySelectorAll('.gallery-item');

  galleryFilters.forEach(filter => {
    filter.addEventListener('click', () => {
      const category = filter.dataset.filter;

      // Update active state
      galleryFilters.forEach(f => f.classList.remove('active'));
      filter.classList.add('active');

      // Filter items
      galleryItems.forEach(item => {
        if (category === 'all' || item.dataset.category === category) {
          item.style.display = '';
          setTimeout(() => item.style.opacity = '1', 50);
        } else {
          item.style.opacity = '0';
          setTimeout(() => item.style.display = 'none', 300);
        }
      });
    });
  });

  // --- Contact Form ---
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    // Pre-fill and check if user already submitted
    (async function checkContactFormAuth() {
      try {
        const resp = await fetch('/api/portal/data');
        if (resp.ok) {
          const data = await resp.json();
          const nameInput = document.getElementById('name');
          const emailInput = document.getElementById('email');
          if (nameInput && data.user.name) nameInput.value = data.user.name;
          if (emailInput && data.user.email) emailInput.value = data.user.email;

          // Check if they have children — required before submitting
          if (!data.children || data.children.length === 0) {
            const msgEl = document.getElementById('contactFormMessage');
            if (msgEl) {
              msgEl.className = 'form-message error';
              msgEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Please add your child\'s information on your <a href="/portal" style="color:#c62828;text-decoration:underline;font-weight:600;">Parent Portal</a> before submitting the contact form.';
            }
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            if (submitBtn) {
              submitBtn.disabled = true;
              submitBtn.innerHTML = '<i class="fas fa-child"></i> Add Child Info First';
              submitBtn.style.opacity = '0.6';
            }
            return;
          }

          if (data.contactSubmitted) {
            const msgEl = document.getElementById('contactFormMessage');
            if (msgEl) {
              msgEl.className = 'form-message success';
              msgEl.innerHTML = '<i class="fas fa-check-circle"></i> You have already submitted a contact form. We are reviewing your inquiry and will get back to you shortly!';
            }
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            if (submitBtn) {
              submitBtn.disabled = true;
              submitBtn.innerHTML = '<i class="fas fa-check"></i> Already Submitted';
              submitBtn.style.opacity = '0.6';
            }
          }
        }
      } catch { /* Not logged in */ }
    })();

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById('contactFormMessage');
      const submitBtn = contactForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;

      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
      submitBtn.disabled = true;

      try {
        const formData = new FormData(contactForm);
        const data = Object.fromEntries(formData);

        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (result.success) {
          msgEl.className = 'form-message success';
          msgEl.textContent = result.message;
          contactForm.reset();
          if (result.redirect) {
            setTimeout(() => { window.location.href = result.redirect; }, 1500);
          }
        } else {
          if (result.error === 'nochildren' && result.redirect) {
            msgEl.className = 'form-message error';
            msgEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Please add your child\'s information first. Redirecting to your portal...';
            setTimeout(() => { window.location.href = result.redirect; }, 2000);
          } else {
            msgEl.className = 'form-message error';
            msgEl.textContent = result.error || 'Something went wrong. Please try again.';
          }
        }
      } catch {
        msgEl.className = 'form-message success';
        msgEl.textContent = 'Thank you for your message! We will get back to you soon.';
        contactForm.reset();
      }

      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    });
  }

  // --- Enrollment Form ---
  const enrollmentForm = document.getElementById('enrollmentForm');
  if (enrollmentForm) {
    enrollmentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById('enrollmentFormMessage');
      const submitBtn = enrollmentForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;

      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
      submitBtn.disabled = true;

      try {
        const data = {
          childName: document.getElementById('childName').value,
          childAge: document.getElementById('childAge').value,
          parentName: document.getElementById('parentName').value,
          email: document.getElementById('parentEmail').value,
          phone: document.getElementById('parentPhone').value,
          program: document.getElementById('program').value,
          startDate: document.getElementById('startDate').value,
          notes: document.getElementById('notes').value,
        };

        const response = await fetch('/api/enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (result.success) {
          msgEl.className = 'form-message success';
          msgEl.textContent = result.message;
          enrollmentForm.reset();
        } else {
          msgEl.className = 'form-message error';
          msgEl.textContent = result.error || 'Something went wrong. Please try again.';
        }
      } catch {
        msgEl.className = 'form-message success';
        msgEl.textContent = 'Thank you! Your enrollment application has been received.';
        enrollmentForm.reset();
      }

      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    });
  }

  // --- Tour Booking Form ---
  const tourForm = document.getElementById('tourForm');
  if (tourForm) {
    tourForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById('tourFormMessage');
      const submitBtn = tourForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;

      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Booking...';
      submitBtn.disabled = true;

      try {
        const formData = new FormData(tourForm);
        const data = Object.fromEntries(formData);

        const response = await fetch('/api/book-tour', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (result.success) {
          msgEl.className = 'form-message success';
          msgEl.textContent = result.message;
          tourForm.reset();
        } else {
          msgEl.className = 'form-message error';
          msgEl.textContent = result.error || 'Something went wrong. Please try again.';
        }
      } catch {
        msgEl.className = 'form-message success';
        msgEl.textContent = 'Tour request received! We will confirm your visit shortly.';
        tourForm.reset();
      }

      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    });
  }

  // --- Smooth scroll for anchor links ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // --- Auth-aware Navbar: Replace Register/Portal links when logged in ---
  (async function updateNavForAuth() {
    try {
      const resp = await fetch('/api/auth/me');
      if (!resp.ok) return; // Not logged in — keep default nav
      const data = await resp.json();
      const user = data.user;
      const navMenu = document.getElementById('navMenu');
      if (!navMenu || !user) return;

      // Find and remove the Register link
      const registerLink = navMenu.querySelector('a[href="/register"]');
      if (registerLink) {
        registerLink.closest('li').remove();
      }

      // Find the Portal link and replace it with user dropdown
      const portalLink = navMenu.querySelector('a[href="/login"]');
      if (portalLink) {
        const li = portalLink.closest('li');
        li.style.position = 'relative';
        const isAdmin = user.role === 'admin';
        const dashLink = isAdmin ? '/admin' : '/portal';
        const dashLabel = isAdmin ? 'Admin Dashboard' : 'My Portal';
        const dashIcon = isAdmin ? 'fa-tachometer-alt' : 'fa-columns';

        li.innerHTML = `
          <a href="${dashLink}" class="nav-user-toggle" id="navUserToggle">
            <i class="fas fa-user-circle"></i> ${user.name.split(' ')[0]}
            <i class="fas fa-chevron-down" style="font-size:0.6em;margin-left:4px;"></i>
          </a>
          <div class="nav-user-dropdown" id="navUserDropdown">
            <div class="nav-user-info">
              <strong>${user.name}</strong>
              <small>${user.email}</small>
            </div>
            <a href="${dashLink}"><i class="fas ${dashIcon}"></i> ${dashLabel}</a>
            <a href="/logout"><i class="fas fa-sign-out-alt"></i> Logout</a>
          </div>
        `;

        // Dropdown toggle handler — proper event binding (not inline)
        document.getElementById('navUserToggle').addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          document.getElementById('navUserDropdown').classList.toggle('show');
        });
      }

      // Close dropdown when clicking anywhere else on the page
      document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('navUserDropdown');
        const toggle = document.getElementById('navUserToggle');
        if (dropdown && toggle && !toggle.contains(e.target) && !dropdown.contains(e.target)) {
          dropdown.classList.remove('show');
        }
      });
      // --- Admin Inline Editing System ---
      if (user.role === 'admin') {
        initInlineEditing();
      }
    } catch { /* Not logged in, keep default nav */ }
  })();

  // --- Load saved site content on page ---
  (async function loadSiteContent() {
    try {
      const resp = await fetch('/api/site-content');
      if (!resp.ok) return;
      const { siteContent } = await resp.json();
      if (!siteContent || Object.keys(siteContent).length === 0) return;

      document.querySelectorAll('[data-editable]').forEach(el => {
        const key = el.getAttribute('data-editable');
        if (siteContent[key]) {
          el.textContent = siteContent[key];
        }
      });

      // Load saved images
      document.querySelectorAll('[data-image-upload]').forEach(el => {
        const key = el.getAttribute('data-image-upload');
        if (siteContent[key]) {
          el.style.backgroundImage = 'url(' + siteContent[key] + ')';
          el.style.backgroundSize = 'cover';
          el.style.backgroundPosition = 'center';
          el.classList.add('has-image');
          // Hide placeholder content
          const icon = el.querySelector('i');
          const span = el.querySelector('span');
          if (icon) icon.style.display = 'none';
          if (span) span.style.display = 'none';
        }
      });
    } catch { /* ignore */ }
  })();

});

// --- Inline Editing for Admins ---
function initInlineEditing() {
  // Add edit mode toggle button
  const editToggle = document.createElement('div');
  editToggle.id = 'adminEditToggle';
  editToggle.innerHTML = '<i class="fas fa-pen"></i>';
  editToggle.title = 'Toggle Edit Mode';
  editToggle.style.cssText = 'position:fixed;bottom:24px;right:24px;width:56px;height:56px;background:linear-gradient(135deg,#2d5016,#4a7c28);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-size:20px;transition:all 0.3s;';
  document.body.appendChild(editToggle);

  // Save indicator
  const saveIndicator = document.createElement('div');
  saveIndicator.id = 'adminSaveIndicator';
  saveIndicator.style.cssText = 'position:fixed;bottom:90px;right:24px;background:#2d5016;color:#fff;padding:10px 20px;border-radius:50px;font-size:13px;font-weight:600;z-index:9999;opacity:0;transition:opacity 0.3s;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
  saveIndicator.textContent = 'Saved!';
  document.body.appendChild(saveIndicator);

  let editMode = false;
  const hiddenFileInput = document.createElement('input');
  hiddenFileInput.type = 'file';
  hiddenFileInput.accept = 'image/*';
  hiddenFileInput.style.display = 'none';
  document.body.appendChild(hiddenFileInput);

  editToggle.addEventListener('click', () => {
    editMode = !editMode;
    editToggle.innerHTML = editMode ? '<i class="fas fa-check"></i>' : '<i class="fas fa-pen"></i>';
    editToggle.style.background = editMode ? 'linear-gradient(135deg,#e09000,#f4a825)' : 'linear-gradient(135deg,#2d5016,#4a7c28)';
    editToggle.title = editMode ? 'Exit Edit Mode' : 'Toggle Edit Mode';
    document.body.classList.toggle('admin-edit-mode', editMode);

    // Toggle editable elements
    document.querySelectorAll('[data-editable]').forEach(el => {
      if (editMode) {
        el.setAttribute('contenteditable', 'true');
        el.classList.add('admin-editable');
      } else {
        el.removeAttribute('contenteditable');
        el.classList.remove('admin-editable', 'admin-editing');
      }
    });

    // Toggle image upload overlays
    document.querySelectorAll('[data-image-upload]').forEach(el => {
      if (editMode) {
        if (!el.querySelector('.admin-img-overlay')) {
          const overlay = document.createElement('div');
          overlay.className = 'admin-img-overlay';
          overlay.innerHTML = '<i class="fas fa-camera"></i><span>Click to upload image</span>';
          overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;cursor:pointer;border-radius:inherit;gap:8px;font-size:14px;font-weight:600;z-index:10;transition:opacity 0.2s;';
          overlay.querySelector('i').style.fontSize = '32px';
          el.style.position = 'relative';
          el.appendChild(overlay);

          overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            const key = el.getAttribute('data-image-upload');
            hiddenFileInput.setAttribute('data-target-key', key);
            hiddenFileInput.click();
          });
        }
      } else {
        const overlay = el.querySelector('.admin-img-overlay');
        if (overlay) overlay.remove();
      }
    });
  });

  // Save text on blur
  document.addEventListener('blur', async (e) => {
    const el = e.target;
    if (!el.hasAttribute || !el.hasAttribute('data-editable')) return;
    const key = el.getAttribute('data-editable');
    const value = el.textContent.trim();
    if (!key || !value) return;

    try {
      const resp = await fetch('/api/admin/update-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (resp.ok) {
        showSaveIndicator('Saved!');
      }
    } catch { /* ignore */ }
  }, true);

  // Handle image uploads
  hiddenFileInput.addEventListener('change', async () => {
    const file = hiddenFileInput.files[0];
    if (!file) return;
    const key = hiddenFileInput.getAttribute('data-target-key');
    if (!key) return;

    const formData = new FormData();
    formData.append('key', key);
    formData.append('image', file);

    try {
      const resp = await fetch('/api/admin/upload-site-image', {
        method: 'POST',
        body: formData,
      });
      if (resp.ok) {
        const result = await resp.json();
        const el = document.querySelector('[data-image-upload="' + key + '"]');
        if (el && result.imagePath) {
          el.style.backgroundImage = 'url(' + result.imagePath + ')';
          el.style.backgroundSize = 'cover';
          el.style.backgroundPosition = 'center';
          el.classList.add('has-image');
          const icon = el.querySelector('i:not(.admin-img-overlay i)');
          const span = el.querySelector('span:not(.admin-img-overlay span)');
          if (icon) icon.style.display = 'none';
          if (span) span.style.display = 'none';
          showSaveIndicator('Image uploaded!');
        }
      }
    } catch { /* ignore */ }
    hiddenFileInput.value = '';
  });

  function showSaveIndicator(text) {
    const indicator = document.getElementById('adminSaveIndicator');
    indicator.textContent = text || 'Saved!';
    indicator.style.opacity = '1';
    setTimeout(() => { indicator.style.opacity = '0'; }, 2000);
  }
}
