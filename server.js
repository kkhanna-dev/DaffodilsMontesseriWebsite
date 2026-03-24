require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Data Store (JSON file-based) ---
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!data.children) data.children = [];
      if (!data.contactSubmissions) data.contactSubmissions = [];
      return data;
    }
  } catch (e) {
    console.error('Error loading data:', e);
  }
  return { users: [], interestedLeads: [], enrollments: [], tourRequests: [], children: [], contactSubmissions: [] };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Initialize data with default admin if needed
function initData() {
  const data = loadData();
  if (!data.children) data.children = [];
  const adminExists = data.users.some(u => u.email === 'vlwhite396@gmail.com' && u.role === 'admin');
  if (!adminExists) {
    data.users = data.users.filter(u => u.role !== 'admin');
    data.users.push({
      id: data.users.length > 0 ? Math.max(...data.users.map(u => u.id)) + 1 : 1,
      email: 'vlwhite396@gmail.com',
      password: bcrypt.hashSync('Riishii@12', 10),
      name: 'Admin',
      role: 'admin',
      createdAt: new Date().toISOString(),
    });
  }
  saveData(data);
  return data;
}

initData();

// --- Middleware ---
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'daffodils-montessori-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
}));

// Make session user available to all responses
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/login');
  next();
}

// --- Public Pages ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'views', 'about.html')));
app.get('/programs', (req, res) => res.sendFile(path.join(__dirname, 'views', 'programs.html')));
app.get('/staff', (req, res) => res.sendFile(path.join(__dirname, 'views', 'staff.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'views', 'contact.html')));
app.get('/enrollment', (req, res) => res.sendFile(path.join(__dirname, 'views', 'enrollment.html')));
app.get('/gallery', (req, res) => res.sendFile(path.join(__dirname, 'views', 'gallery.html')));

// --- Auth Pages ---
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/portal');
  }
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/portal');
  }
  res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const data = loadData();
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  const redirect = user.role === 'admin' ? '/admin' : '/portal';
  res.json({ success: true, redirect });
});

app.post('/api/register', (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const data = loadData();
  if (data.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'An account with this email already exists. Please log in instead.' });
  }

  const newUser = {
    id: data.users.length > 0 ? Math.max(...data.users.map(u => u.id)) + 1 : 1,
    email: email.toLowerCase().trim(),
    password: bcrypt.hashSync(password, 10),
    name: name.trim(),
    phone: phone || '',
    role: 'parent',
    createdAt: new Date().toISOString(),
  };

  data.users.push(newUser);
  saveData(data);

  req.session.user = { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role };
  res.json({ success: true, redirect: '/portal' });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// --- Parent Portal ---
app.get('/portal', requireAuth, (req, res) => {
  const data = loadData();
  const user = req.session.user;

  // Check if this parent has an enrolled child
  const enrollment = data.enrollments.find(
    e => e.email.toLowerCase() === user.email.toLowerCase() && e.status === 'enrolled'
  );

  if (enrollment) {
    res.sendFile(path.join(__dirname, 'views', 'portal-enrolled.html'));
  } else {
    res.sendFile(path.join(__dirname, 'views', 'portal-not-enrolled.html'));
  }
});

app.get('/api/portal/data', requireAuth, (req, res) => {
  const data = loadData();
  const user = req.session.user;
  const fullUser = data.users.find(u => u.id === user.id);
  const enrollment = data.enrollments.find(
    e => e.email.toLowerCase() === user.email.toLowerCase() && e.status === 'enrolled'
  );
  const children = (data.children || []).filter(
    c => c.parentEmail.toLowerCase() === user.email.toLowerCase()
  );
  const contactSubmission = (data.contactSubmissions || []).find(
    s => s.userId === user.id
  );
  res.json({
    user,
    enrollment: enrollment || null,
    children,
    contactSubmission: contactSubmission || null,
    contactSubmitted: !!contactSubmission,
  });
});

// --- Child Management ---
app.post('/api/portal/add-child', requireAuth, (req, res) => {
  const { childName, dateOfBirth, gender, allergies, medicalNotes, emergencyContact, emergencyPhone, notes } = req.body;
  if (!childName) return res.status(400).json({ error: 'Child name is required.' });

  const data = loadData();
  if (!data.children) data.children = [];

  const child = {
    id: data.children.length > 0 ? Math.max(...data.children.map(c => c.id)) + 1 : 1,
    parentId: req.session.user.id,
    parentEmail: req.session.user.email,
    childName: childName.trim(),
    dateOfBirth: dateOfBirth || '',
    gender: gender || '',
    allergies: allergies || '',
    medicalNotes: medicalNotes || '',
    emergencyContact: emergencyContact || '',
    emergencyPhone: emergencyPhone || '',
    notes: notes || '',
    createdAt: new Date().toISOString(),
  };

  data.children.push(child);
  saveData(data);
  res.json({ success: true, child });
});

app.get('/api/portal/children', requireAuth, (req, res) => {
  const data = loadData();
  const children = (data.children || []).filter(
    c => c.parentEmail.toLowerCase() === req.session.user.email.toLowerCase()
  );
  res.json({ children });
});

app.delete('/api/portal/child/:id', requireAuth, (req, res) => {
  const data = loadData();
  if (!data.children) data.children = [];
  const idx = data.children.findIndex(
    c => c.id === parseInt(req.params.id) && c.parentEmail.toLowerCase() === req.session.user.email.toLowerCase()
  );
  if (idx === -1) return res.status(404).json({ error: 'Child not found.' });
  data.children.splice(idx, 1);
  saveData(data);
  res.json({ success: true });
});

// --- Admin Dashboard ---
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const data = loadData();
  res.json({
    interestedLeads: data.interestedLeads,
    enrollments: data.enrollments,
    tourRequests: data.tourRequests,
    users: data.users.map(u => ({ id: u.id, email: u.email, name: u.name, phone: u.phone || '', role: u.role, createdAt: u.createdAt })),
    children: data.children || [],
    contactSubmissions: data.contactSubmissions || [],
  });
});

// Admin: update enrollment status
app.post('/api/admin/enrollment/:id/status', requireAdmin, (req, res) => {
  const data = loadData();
  const enrollment = data.enrollments.find(e => e.id === parseInt(req.params.id));
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });

  enrollment.status = req.body.status;
  saveData(data);
  res.json({ success: true });
});

// Admin: enroll a child (approve for program selection)
app.post('/api/admin/enroll-child/:id', requireAdmin, (req, res) => {
  const data = loadData();
  const child = data.children.find(c => c.id === parseInt(req.params.id));
  if (!child) return res.status(404).json({ error: 'Child not found.' });

  child.enrollmentStatus = 'approved';
  child.approvedAt = new Date().toISOString();
  saveData(data);
  res.json({ success: true });
});

// Admin: revoke enrollment approval
app.post('/api/admin/unenroll-child/:id', requireAdmin, (req, res) => {
  const data = loadData();
  const child = data.children.find(c => c.id === parseInt(req.params.id));
  if (!child) return res.status(404).json({ error: 'Child not found.' });

  child.enrollmentStatus = 'none';
  delete child.approvedAt;
  delete child.program;
  delete child.schedule;
  delete child.paymentStatus;
  delete child.paidAt;
  saveData(data);
  res.json({ success: true });
});

// Admin: mark a contact submission as reviewed
app.post('/api/admin/contact-submission/:id/status', requireAdmin, (req, res) => {
  const data = loadData();
  const sub = (data.contactSubmissions || []).find(s => s.id === parseInt(req.params.id));
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  sub.status = req.body.status || 'reviewed';
  sub.reviewedAt = new Date().toISOString();
  saveData(data);
  res.json({ success: true });
});

// Admin: delete a lead
app.delete('/api/admin/lead/:id', requireAdmin, (req, res) => {
  const data = loadData();
  data.interestedLeads = data.interestedLeads.filter(l => l.id !== parseInt(req.params.id));
  saveData(data);
  res.json({ success: true });
});

// Admin: delete a tour request
app.delete('/api/admin/tour/:id', requireAdmin, (req, res) => {
  const data = loadData();
  data.tourRequests = data.tourRequests.filter(t => t.id !== parseInt(req.params.id));
  saveData(data);
  res.json({ success: true });
});

// --- Public Form Endpoints ---

// Parent: select program and pay for approved child
app.post('/api/portal/select-program', requireAuth, (req, res) => {
  const { childId, program, schedule } = req.body;
  if (!childId || !program || !schedule) {
    return res.status(400).json({ error: 'Child, program, and schedule are required.' });
  }
  const data = loadData();
  const child = data.children.find(
    c => c.id === parseInt(childId) && c.parentEmail.toLowerCase() === req.session.user.email.toLowerCase()
  );
  if (!child) return res.status(404).json({ error: 'Child not found.' });
  if (child.enrollmentStatus !== 'approved') {
    return res.status(400).json({ error: 'This child has not been approved for enrollment yet.' });
  }

  child.program = program;
  child.schedule = schedule;
  child.enrollmentStatus = 'enrolled';
  child.paymentStatus = 'paid';
  child.paidAt = new Date().toISOString();
  saveData(data);
  res.json({ success: true });
});

// Contact form — saves as interested lead
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }

  const data = loadData();

  // If logged in, check if they already submitted a contact form
  if (req.session.user) {
    if (!data.contactSubmissions) data.contactSubmissions = [];
    const existing = data.contactSubmissions.find(s => s.userId === req.session.user.id);
    if (existing) {
      return res.status(400).json({ error: 'You have already submitted a contact form. We are reviewing your inquiry and will get back to you shortly!' });
    }
    // Require at least one child profile before submitting
    const userChildren = (data.children || []).filter(
      c => c.parentEmail.toLowerCase() === req.session.user.email.toLowerCase()
    );
    if (userChildren.length === 0) {
      return res.status(400).json({ error: 'nochildren', redirect: '/portal' });
    }
    // Track the submission per account
    data.contactSubmissions.push({
      id: data.contactSubmissions.length > 0 ? Math.max(...data.contactSubmissions.map(s => s.id)) + 1 : 1,
      userId: req.session.user.id,
      userName: req.session.user.name,
      userEmail: req.session.user.email,
      subject: subject || 'General Inquiry',
      message,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  }

  data.interestedLeads.push({
    id: data.interestedLeads.length > 0 ? Math.max(...data.interestedLeads.map(l => l.id)) + 1 : 1,
    name,
    email,
    phone: phone || '',
    subject: subject || 'General Inquiry',
    message,
    source: 'contact_form',
    createdAt: new Date().toISOString(),
  });
  saveData(data);

  // Try to send emails (non-blocking)
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    // Notify admin
    const escapedNameAdmin = name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedEmailAdmin = email.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedPhoneAdmin = (phone || 'Not provided').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedSubjectAdmin = (subject || 'General Inquiry').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedMessageAdmin = (message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.CONTACT_EMAIL || process.env.EMAIL_USER,
      replyTo: email,
      subject: `🌼 [Daffodils Montessori] New Inquiry from ${escapedNameAdmin}`,
      html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f4f1ec;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(135deg,#2d5016 0%,#4a7c28 50%,#6ba832 100%);padding:30px 40px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">🌼 New Contact Form Inquiry</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Daffodils Montessori — Admin Notification</p>
  </td></tr>
  <tr><td style="padding:30px 40px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td colspan="2" style="padding-bottom:20px;"><h2 style="margin:0;color:#2d5016;font-size:18px;">📋 Contact Details</h2></td></tr>
      <tr style="background:#f9f7f4;"><td style="padding:12px 16px;font-weight:600;color:#555;width:120px;border-bottom:1px solid #eee;">👤 Name</td><td style="padding:12px 16px;color:#222;border-bottom:1px solid #eee;">${escapedNameAdmin}</td></tr>
      <tr><td style="padding:12px 16px;font-weight:600;color:#555;border-bottom:1px solid #eee;">📧 Email</td><td style="padding:12px 16px;border-bottom:1px solid #eee;"><a href="mailto:${escapedEmailAdmin}" style="color:#2d5016;">${escapedEmailAdmin}</a></td></tr>
      <tr style="background:#f9f7f4;"><td style="padding:12px 16px;font-weight:600;color:#555;border-bottom:1px solid #eee;">📞 Phone</td><td style="padding:12px 16px;color:#222;border-bottom:1px solid #eee;">${escapedPhoneAdmin}</td></tr>
      <tr><td style="padding:12px 16px;font-weight:600;color:#555;border-bottom:1px solid #eee;">📌 Subject</td><td style="padding:12px 16px;color:#222;border-bottom:1px solid #eee;"><span style="background:#e8f5e9;color:#2d5016;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600;">${escapedSubjectAdmin}</span></td></tr>
    </table>
    <div style="margin-top:24px;padding:20px;background:#f9f7f4;border-left:4px solid #6ba832;border-radius:8px;">
      <h3 style="margin:0 0 10px;color:#2d5016;font-size:15px;">💬 Message</h3>
      <p style="margin:0;color:#333;line-height:1.6;font-size:15px;">${escapedMessageAdmin}</p>
    </div>
    <div style="margin-top:24px;text-align:center;">
      <a href="mailto:${escapedEmailAdmin}" style="display:inline-block;background:#2d5016;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">↩️ Reply to ${escapedNameAdmin}</a>
    </div>
  </td></tr>
  <tr><td style="background:#f4f1ec;padding:20px 40px;text-align:center;border-top:1px solid #e0dcd4;">
    <p style="margin:0;color:#888;font-size:12px;">This notification was sent from the Daffodils Montessori contact form.</p>
    <p style="margin:4px 0 0;color:#aaa;font-size:11px;">🌼 Daffodils Montessori — Nurturing Young Minds</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
    });

    // Auto-reply to the user with a beautiful newsletter-style email
    const escapedName = name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    await transporter.sendMail({
      from: `"Daffodils Montessori" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🌼 Thank You for Reaching Out to Daffodils Montessori!',
      html: generateAutoReplyEmail(escapedName),
    });
  } catch (e) { console.log('Email send note:', e.message); }

  const redirect = req.session.user ? '/portal' : null;
  res.json({ success: true, message: 'Thank you! Your message has been sent.', redirect });
});

// Enrollment form
app.post('/api/enroll', async (req, res) => {
  const { childName, childAge, parentName, email, phone, program, startDate, notes } = req.body;

  if (!childName || !parentName || !email || !program) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }

  const data = loadData();
  data.enrollments.push({
    id: data.enrollments.length > 0 ? Math.max(...data.enrollments.map(e => e.id)) + 1 : 1,
    childName,
    childAge: childAge || '',
    parentName,
    email,
    phone: phone || '',
    program,
    startDate: startDate || '',
    notes: notes || '',
    status: 'pending', // pending | enrolled | waitlisted | declined
    createdAt: new Date().toISOString(),
  });
  saveData(data);

  // Also add as interested lead
  if (!data.interestedLeads.some(l => l.email.toLowerCase() === email.toLowerCase())) {
    data.interestedLeads.push({
      id: data.interestedLeads.length > 0 ? Math.max(...data.interestedLeads.map(l => l.id)) + 1 : 1,
      name: parentName,
      email,
      phone: phone || '',
      subject: 'Enrollment Application',
      message: `Applied for ${program} for ${childName}`,
      source: 'enrollment_form',
      createdAt: new Date().toISOString(),
    });
    saveData(data);
  }

  res.json({ success: true, message: 'Enrollment submitted successfully! We will contact you shortly.' });
});

// Tour booking form
app.post('/api/book-tour', (req, res) => {
  const { parentName, email, phone, tourDate, tourTime, childAge, notes } = req.body;

  if (!parentName || !email || !phone || !tourDate) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }

  const data = loadData();
  data.tourRequests.push({
    id: data.tourRequests.length > 0 ? Math.max(...data.tourRequests.map(t => t.id)) + 1 : 1,
    parentName,
    email,
    phone,
    tourDate,
    tourTime: tourTime || 'Flexible',
    childAge: childAge || '',
    notes: notes || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
  });

  // Also add as interested lead
  if (!data.interestedLeads.some(l => l.email.toLowerCase() === email.toLowerCase())) {
    data.interestedLeads.push({
      id: data.interestedLeads.length > 0 ? Math.max(...data.interestedLeads.map(l => l.id)) + 1 : 1,
      name: parentName,
      email,
      phone,
      subject: 'Tour Request',
      message: `Requested tour on ${tourDate} at ${tourTime || 'flexible time'}`,
      source: 'tour_form',
      createdAt: new Date().toISOString(),
    });
    saveData(data);
  }

  saveData(data);
  res.json({ success: true, message: 'Tour booked! We will confirm your visit shortly.' });
});

// --- Session check endpoint ---
app.get('/api/auth/me', (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: 'Not logged in' });
  }
});

// --- Beautiful Auto-Reply Email Template ---
function generateAutoReplyEmail(name) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f9f6f1;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

<!-- Header Banner -->
<div style="background:linear-gradient(135deg,#f4a825 0%,#e09000 50%,#4a7c59 100%);padding:48px 32px;text-align:center;">
  <div style="font-size:48px;margin-bottom:8px;">🌼</div>
  <h1 style="color:#ffffff;font-size:28px;margin:0 0 4px;font-family:Georgia,serif;">Daffodils Montessori</h1>
  <p style="color:rgba(255,255,255,0.92);font-size:15px;margin:0;font-style:italic;">Where Every Child Blossoms</p>
</div>

<!-- Thank You Section -->
<div style="padding:36px 32px 24px;">
  <h2 style="color:#2d3436;font-size:24px;margin:0 0 16px;font-family:Georgia,serif;">Thank You, ${name}! 💛</h2>
  <p style="color:#636e72;font-size:15px;line-height:1.8;margin:0 0 20px;">
    We're so glad you reached out to us! Your message has been received and our admissions team is reviewing it right now. We typically respond within <strong>24 hours</strong>.
  </p>
  <div style="background:#e8f5e9;border-radius:12px;padding:20px 24px;border-left:5px solid #4a7c59;margin-bottom:24px;">
    <p style="color:#3a6347;font-weight:600;margin:0;font-size:15px;">✅ Your message has been received! A member of our team will be in touch shortly.</p>
  </div>
</div>

<!-- Newsletter Section -->
<div style="background:#fdf8f0;padding:32px;border-top:2px solid #f4a825;border-bottom:2px solid #f4a825;">
  <h3 style="color:#2d3436;font-size:20px;text-align:center;margin:0 0 24px;font-family:Georgia,serif;">✨ This Week at Daffodils Montessori</h3>

  <!-- Activity 1 -->
  <div style="background:#ffffff;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #e8e2d9;">
    <div style="display:flex;align-items:center;margin-bottom:8px;">
      <span style="font-size:24px;margin-right:12px;">🌱</span>
      <h4 style="color:#4a7c59;font-size:16px;margin:0;font-family:Georgia,serif;">Spring Garden Planting</h4>
    </div>
    <p style="color:#636e72;font-size:14px;line-height:1.7;margin:0;">Our little gardeners are learning about plant life cycles by planting sunflower seeds! Each child cares for their own seedling, building responsibility and observation skills through hands-on Montessori learning.</p>
  </div>

  <!-- Activity 2 -->
  <div style="background:#ffffff;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #e8e2d9;">
    <div style="display:flex;align-items:center;margin-bottom:8px;">
      <span style="font-size:24px;margin-right:12px;">🎨</span>
      <h4 style="color:#e09000;font-size:16px;margin:0;font-family:Georgia,serif;">Creative Arts Week</h4>
    </div>
    <p style="color:#636e72;font-size:14px;line-height:1.7;margin:0;">This week features watercolor exploration, clay sculpting, and nature-inspired collages. Children express themselves through multiple artistic mediums while developing fine motor skills.</p>
  </div>

  <!-- Activity 3 -->
  <div style="background:#ffffff;border-radius:12px;padding:20px;border:1px solid #e8e2d9;">
    <div style="display:flex;align-items:center;margin-bottom:8px;">
      <span style="font-size:24px;margin-right:12px;">📚</span>
      <h4 style="color:#1565c0;font-size:16px;margin:0;font-family:Georgia,serif;">Storytime Spotlight</h4>
    </div>
    <p style="color:#636e72;font-size:14px;line-height:1.7;margin:0;">This week we're reading "The Very Hungry Caterpillar" and exploring the themes of growth, transformation, and healthy eating. Ask your child about the butterfly lifecycle!</p>
  </div>
</div>

<!-- Why Choose Us / Trust Section -->
<div style="padding:32px;">
  <h3 style="color:#2d3436;font-size:18px;text-align:center;margin:0 0 24px;font-family:Georgia,serif;">Why Families Trust Daffodils 🏆</h3>

  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:12px;text-align:center;width:33%;vertical-align:top;">
        <div style="background:#e8f5e9;width:56px;height:56px;border-radius:50%;margin:0 auto 10px;line-height:56px;font-size:24px;">🛡️</div>
        <strong style="color:#2d3436;font-size:13px;display:block;margin-bottom:4px;">State Licensed</strong>
        <span style="color:#95a5a6;font-size:12px;">Fully licensed & inspected facility</span>
      </td>
      <td style="padding:12px;text-align:center;width:33%;vertical-align:top;">
        <div style="background:#fff3d6;width:56px;height:56px;border-radius:50%;margin:0 auto 10px;line-height:56px;font-size:24px;">👩‍🏫</div>
        <strong style="color:#2d3436;font-size:13px;display:block;margin-bottom:4px;">Certified Teachers</strong>
        <span style="color:#95a5a6;font-size:12px;">AMI/AMS trained educators</span>
      </td>
      <td style="padding:12px;text-align:center;width:33%;vertical-align:top;">
        <div style="background:#e3f2fd;width:56px;height:56px;border-radius:50%;margin:0 auto 10px;line-height:56px;font-size:24px;">🔒</div>
        <strong style="color:#2d3436;font-size:13px;display:block;margin-bottom:4px;">Secure Campus</strong>
        <span style="color:#95a5a6;font-size:12px;">24/7 security & controlled access</span>
      </td>
    </tr>
    <tr>
      <td style="padding:12px;text-align:center;vertical-align:top;">
        <div style="background:#fce4ec;width:56px;height:56px;border-radius:50%;margin:0 auto 10px;line-height:56px;font-size:24px;">❤️</div>
        <strong style="color:#2d3436;font-size:13px;display:block;margin-bottom:4px;">Low Ratios</strong>
        <span style="color:#95a5a6;font-size:12px;">4:1 toddler, 8:1 primary</span>
      </td>
      <td style="padding:12px;text-align:center;vertical-align:top;">
        <div style="background:#f3e5f5;width:56px;height:56px;border-radius:50%;margin:0 auto 10px;line-height:56px;font-size:24px;">🍎</div>
        <strong style="color:#2d3436;font-size:13px;display:block;margin-bottom:4px;">Fresh Meals</strong>
        <span style="color:#95a5a6;font-size:12px;">Nutritious lunch & snacks daily</span>
      </td>
      <td style="padding:12px;text-align:center;vertical-align:top;">
        <div style="background:#e0f2f1;width:56px;height:56px;border-radius:50%;margin:0 auto 10px;line-height:56px;font-size:24px;">🌿</div>
        <strong style="color:#2d3436;font-size:13px;display:block;margin-bottom:4px;">Nature-Based</strong>
        <span style="color:#95a5a6;font-size:12px;">Outdoor gardens & nature walks</span>
      </td>
    </tr>
  </table>
</div>

<!-- CTA Section -->
<div style="background:linear-gradient(135deg,#4a7c59,#3a6347);padding:36px 32px;text-align:center;">
  <h3 style="color:#ffffff;font-size:20px;margin:0 0 12px;font-family:Georgia,serif;">Ready to See Daffodils in Person?</h3>
  <p style="color:rgba(255,255,255,0.88);font-size:14px;margin:0 0 20px;line-height:1.6;">Schedule a campus tour and experience the Daffodils difference firsthand. Limited spots available!</p>
  <a href="https://daffodilsmontessori.com/enrollment#tour" style="display:inline-block;background:#f4a825;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:50px;font-weight:700;font-size:15px;">📅 Schedule a Tour</a>
</div>

<!-- What Makes Us Different -->
<div style="padding:32px;background:#fef9ef;">
  <h3 style="color:#2d3436;font-size:18px;text-align:center;margin:0 0 20px;font-family:Georgia,serif;">What Makes Daffodils Different 🌟</h3>
  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:8px 12px;vertical-align:top;">
        <p style="margin:0 0 12px;font-size:14px;color:#636e72;line-height:1.6;">
          <strong style="color:#4a7c59;">🎯 Individualized Learning Plans</strong><br>
          Every child receives a personalized curriculum tailored to their unique developmental stage and interests.
        </p>
        <p style="margin:0 0 12px;font-size:14px;color:#636e72;line-height:1.6;">
          <strong style="color:#4a7c59;">🏡 Home-Like Environment</strong><br>
          Our classrooms feel like a second home — warm, inviting, and designed specifically for little hands and curious minds.
        </p>
        <p style="margin:0;font-size:14px;color:#636e72;line-height:1.6;">
          <strong style="color:#4a7c59;">👨‍👩‍👧 Parent Partnership Program</strong><br>
          Monthly parent workshops, daily progress updates, and an open-door policy because your involvement matters.
        </p>
      </td>
    </tr>
  </table>
</div>

<!-- Footer -->
<div style="background:#2d3436;padding:32px;text-align:center;">
  <p style="color:#f4a825;font-size:16px;margin:0 0 4px;font-family:Georgia,serif;font-weight:700;">🌼 Daffodils Montessori</p>
  <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:0 0 16px;">Nurturing Young Minds Since 2010</p>
  <p style="color:rgba(255,255,255,0.6);font-size:12px;margin:0 0 4px;">5051 86th Ave NE, Marysville, WA 98270</p>
  <p style="color:rgba(255,255,255,0.6);font-size:12px;margin:0 0 4px;">(425) 623-2684 | rishiekhanna@yahoo.com</p>
  <p style="color:rgba(255,255,255,0.6);font-size:12px;margin:0 0 16px;">Mon-Fri: 9:00 AM - 5:00 PM</p>
  <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;margin-top:8px;">
    <p style="color:rgba(255,255,255,0.4);font-size:11px;margin:0;">© 2026 Daffodils Montessori. All rights reserved.</p>
  </div>
</div>

</div>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log(`Daffodils Montessori website running at http://localhost:${PORT}`);
});
