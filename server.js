require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Stripe Initialization ---
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  const Stripe = require('stripe');
  stripe = Stripe(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn('WARNING: STRIPE_SECRET_KEY is not set. Payment features will be disabled.');
}

// --- Data Store (JSON file-based) ---
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!data.children) data.children = [];
      if (!data.contactSubmissions) data.contactSubmissions = [];
      if (!data.curriculum) data.curriculum = [];
      if (!data.siteContent) data.siteContent = {};
      if (!data.announcements) data.announcements = [];
      if (!data.activityReports) data.activityReports = [];
      if (!data.events) data.events = [];
      if (!data.staff) data.staff = [];
      if (!data.payments) data.payments = [];
      return data;
    }
  } catch (e) {
    console.error('Error loading data:', e);
  }
  return { users: [], interestedLeads: [], enrollments: [], tourRequests: [], children: [], contactSubmissions: [], curriculum: [], siteContent: {}, announcements: [], activityReports: [], events: [], staff: [], payments: [] };
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
    const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'ChangeMeImmediately!2026';
    data.users.push({
      id: data.users.length > 0 ? Math.max(...data.users.map(u => u.id)) + 1 : 1,
      email: 'vlwhite396@gmail.com',
      password: bcrypt.hashSync(adminPassword, 12),
      name: 'Admin',
      role: 'admin',
      createdAt: new Date().toISOString(),
    });
    if (!process.env.ADMIN_DEFAULT_PASSWORD) {
      console.warn('WARNING: Using default admin password. Set ADMIN_DEFAULT_PASSWORD in .env for production.');
    }
  }
  saveData(data);
  return data;
}

initData();

const isTest = process.env.NODE_ENV === 'test';

// --- File Upload Configuration (Multer) ---

// Ensure upload directories exist
const curriculumUploadDir = path.join(__dirname, 'public', 'uploads', 'curriculum');
const imagesUploadDir = path.join(__dirname, 'public', 'uploads', 'images');
if (!fs.existsSync(curriculumUploadDir)) fs.mkdirSync(curriculumUploadDir, { recursive: true });
if (!fs.existsSync(imagesUploadDir)) fs.mkdirSync(imagesUploadDir, { recursive: true });

// Curriculum upload: PDFs only, max 10MB
const curriculumStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, curriculumUploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const uploadCurriculum = multer({
  storage: curriculumStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed for curriculum uploads.'));
    }
  },
});

// Site image upload: jpg/png/gif/webp only, max 5MB
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, imagesUploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const uploadSiteImage = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, GIF, and WEBP images are allowed.'));
    }
  },
});

// --- Security Middleware ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://js.stripe.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["https://js.stripe.com", "https://www.google.com", "https://maps.google.com"],
    },
  },
}));

// Rate limiting — general
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use(generalLimiter);

// Strict rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10000 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
});

// Rate limit for form submissions
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many form submissions. Please try again later.' },
});

// --- Stripe Webhook (must be before body parser for raw body) ---
app.post('/api/payment-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Payment system is not configured.' });
  }
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    console.warn('WARNING: STRIPE_WEBHOOK_SECRET is not set. Cannot verify webhook signatures.');
    return res.status(400).json({ error: 'Webhook secret not configured.' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed.' });
  }

  // Handle payment intent events
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const data = loadData();
    if (!data.payments) data.payments = [];
    const payment = data.payments.find(p => p.stripePaymentIntentId === paymentIntent.id);
    if (payment) {
      payment.status = 'succeeded';
      payment.updatedAt = new Date().toISOString();
      saveData(data);
    }
  } else if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object;
    const data = loadData();
    if (!data.payments) data.payments = [];
    const payment = data.payments.find(p => p.stripePaymentIntentId === paymentIntent.id);
    if (payment) {
      payment.status = 'failed';
      payment.updatedAt = new Date().toISOString();
      saveData(data);
    }
  }

  res.json({ received: true });
});

// --- Middleware ---
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'daffodils-montessori-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
}));

// Make session user available to all responses
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Input sanitization helper — strips dangerous characters to prevent XSS
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/`/g, '&#x60;')
    .trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.user) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    return res.redirect('/login');
  }
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
app.get('/tuition', (req, res) => res.sendFile(path.join(__dirname, 'views', 'tuition.html')));
app.get('/events', (req, res) => res.sendFile(path.join(__dirname, 'views', 'events.html')));

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

app.post('/api/login', authLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email and password are required.' });
  }
  const data = loadData();
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  req.session.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  const redirect = user.role === 'admin' ? '/admin' : '/portal';
  res.json({ success: true, redirect });
});

app.post('/api/register', authLimiter, (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
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
    password: bcrypt.hashSync(password, 12),
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

// Forgot password - request reset
app.post('/api/forgot-password', formLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  const data = loadData();
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());

  // Always return success to prevent email enumeration
  if (!user) {
    return res.json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
  }

  // Generate reset token
  const token = crypto.randomBytes(32).toString('hex');
  user.resetToken = token;
  user.resetTokenExpiry = Date.now() + 3600000; // 1 hour
  saveData(data);

  // Send reset email (non-blocking)
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;
    const escapedName = (user.name || 'there').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    await transporter.sendMail({
      from: `"Daffodils Montessori" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Password Reset - Daffodils Montessori',
      html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f4f1ec;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(135deg,#2d5016 0%,#4a7c28 50%,#6ba832 100%);padding:30px 40px;text-align:center;">
    <div style="font-size:40px;margin-bottom:8px;">🌼</div>
    <h1 style="color:#fff;margin:0;font-size:22px;">Password Reset Request</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Daffodils Montessori</p>
  </td></tr>
  <tr><td style="padding:30px 40px;">
    <h2 style="margin:0 0 16px;color:#2d5016;font-size:18px;">Hi ${escapedName},</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;">We received a request to reset your password. Click the button below to set a new password. This link expires in 1 hour.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${resetUrl}" style="display:inline-block;background:#2d5016;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Reset My Password</a>
    </div>
    <p style="color:#999;font-size:13px;line-height:1.5;">If you didn't request this, you can safely ignore this email. Your password will remain unchanged.</p>
  </td></tr>
  <tr><td style="background:#f4f1ec;padding:16px 40px;text-align:center;border-top:1px solid #e0dcd4;">
    <p style="margin:0;color:#aaa;font-size:11px;">Daffodils Montessori - Nurturing Young Minds</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
    });
  } catch (e) { console.log('Password reset email error:', e.message); }

  res.json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
});

// Reset password page
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'reset-password.html'));
});

// Reset password - set new password
app.post('/api/reset-password', authLimiter, (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const data = loadData();
  const user = data.users.find(u => u.resetToken === token && u.resetTokenExpiry > Date.now());
  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
  }

  user.password = bcrypt.hashSync(password, 12);
  delete user.resetToken;
  delete user.resetTokenExpiry;
  saveData(data);

  res.json({ success: true, message: 'Password reset successfully! You can now log in with your new password.' });
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
    announcements: data.announcements || [],
  });
});

// --- Portal Curriculum Access ---
app.get('/api/portal/curriculum', requireAuth, (req, res) => {
  const data = loadData();
  const user = req.session.user;
  const children = (data.children || []).filter(
    c => c.parentEmail.toLowerCase() === user.email.toLowerCase()
  );

  // Gather programs for this parent's enrolled children
  const childPrograms = children
    .filter(c => c.enrollmentStatus === 'enrolled' && c.program)
    .map(c => c.program);

  if (childPrograms.length === 0) {
    return res.json({ curriculum: [] });
  }

  // Filter curriculum: match child's program or "All Programs"
  const curriculum = (data.curriculum || []).filter(
    c => c.program === 'All Programs' || childPrograms.includes(c.program)
  );

  res.json({ curriculum });
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
    childName: sanitize(childName),
    dateOfBirth: sanitize(dateOfBirth || ''),
    gender: sanitize(gender || ''),
    allergies: sanitize(allergies || ''),
    medicalNotes: sanitize(medicalNotes || ''),
    emergencyContact: sanitize(emergencyContact || ''),
    emergencyPhone: sanitize(emergencyPhone || ''),
    notes: sanitize(notes || ''),
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
    curriculum: data.curriculum || [],
    siteContent: data.siteContent || {},
    announcements: data.announcements || [],
    activityReports: data.activityReports || [],
    events: data.events || [],
    staff: data.staff || [],
  });
});

// Admin: update enrollment status
app.post('/api/admin/enrollment/:id/status', requireAdmin, (req, res) => {
  const validStatuses = ['pending', 'enrolled', 'waitlisted', 'declined'];
  if (!req.body.status || !validStatuses.includes(req.body.status)) {
    return res.status(400).json({ error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
  }

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
  const validStatuses = ['pending', 'reviewed', 'contacted'];
  const status = req.body.status || 'reviewed';
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
  }

  const data = loadData();
  const sub = (data.contactSubmissions || []).find(s => s.id === parseInt(req.params.id));
  if (!sub) return res.status(404).json({ error: 'Submission not found.' });
  sub.status = status;
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

// Admin: delete enrollment
app.delete('/api/admin/enrollment/:id', requireAdmin, (req, res) => {
  const data = loadData();
  data.enrollments = data.enrollments.filter(e => e.id !== parseInt(req.params.id));
  saveData(data);
  res.json({ success: true });
});

// Admin: delete contact submission
app.delete('/api/admin/contact-submission/:id', requireAdmin, (req, res) => {
  const data = loadData();
  data.contactSubmissions = (data.contactSubmissions || []).filter(s => s.id !== parseInt(req.params.id));
  saveData(data);
  res.json({ success: true });
});

// Admin: delete a parent (user) and all related data
app.delete('/api/admin/user/:id', requireAdmin, (req, res) => {
  const data = loadData();
  const userId = parseInt(req.params.id);
  const user = data.users.find(u => u.id === userId);
  if (!user || user.role === 'admin') return res.status(404).json({ error: 'User not found or cannot delete admin.' });

  // Remove user's children
  data.children = (data.children || []).filter(c => c.parentEmail.toLowerCase() !== user.email.toLowerCase());
  // Remove user's contact submissions
  data.contactSubmissions = (data.contactSubmissions || []).filter(s => s.userId !== userId);
  // Remove user
  data.users = data.users.filter(u => u.id !== userId);
  saveData(data);
  res.json({ success: true });
});

// --- Admin Curriculum Management ---

// Upload curriculum file with metadata
app.post('/api/admin/upload-curriculum', requireAdmin, (req, res) => {
  uploadCurriculum.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { title, program, description } = req.body;
    if (!title || !program) {
      // Remove the uploaded file if validation fails
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Title and program are required.' });
    }

    const validPrograms = ['Toddler Program', 'Primary Program', 'Kindergarten', 'Before & After Care', 'All Programs'];
    if (!validPrograms.includes(program)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid program. Must be one of: ' + validPrograms.join(', ') });
    }

    const data = loadData();
    const curriculumItem = {
      id: data.curriculum.length > 0 ? Math.max(...data.curriculum.map(c => c.id)) + 1 : 1,
      title: title.trim(),
      program,
      description: (description || '').trim(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      filepath: '/uploads/curriculum/' + req.file.filename,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
    };

    data.curriculum.push(curriculumItem);
    saveData(data);
    res.json({ success: true, curriculum: curriculumItem });
  });
});

// List all curriculum files
app.get('/api/admin/curriculum', requireAdmin, (req, res) => {
  const data = loadData();
  res.json({ curriculum: data.curriculum || [] });
});

// Delete a curriculum file
app.delete('/api/admin/curriculum/:id', requireAdmin, (req, res) => {
  const data = loadData();
  const idx = data.curriculum.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Curriculum file not found.' });

  const item = data.curriculum[idx];
  // Remove file from disk
  const filePath = path.join(__dirname, 'public', item.filepath);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error('Error deleting curriculum file:', e.message);
  }

  data.curriculum.splice(idx, 1);
  saveData(data);
  res.json({ success: true });
});

// --- Admin Site Content Management (CMS) ---

// Get all editable site content
app.get('/api/admin/site-content', requireAdmin, (req, res) => {
  const data = loadData();
  res.json({ siteContent: data.siteContent || {} });
});

// Update text content (key-value pairs)
app.post('/api/admin/update-content', requireAdmin, (req, res) => {
  // Accept any key that is alphanumeric (camelCase). This allows admins to edit
  // any data-editable field on any page without needing server code changes.
  const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9]{1,80}$/;

  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Invalid content data.' });
  }

  const data = loadData();
  if (!data.siteContent) data.siteContent = {};

  for (const key of Object.keys(updates)) {
    if (KEY_PATTERN.test(key)) {
      data.siteContent[key] = sanitize(updates[key]);
    }
  }

  saveData(data);
  res.json({ success: true, siteContent: data.siteContent });
});

// Upload images for site content (hero, about, etc.)
app.post('/api/admin/upload-site-image', requireAdmin, (req, res) => {
  uploadSiteImage.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Image too large. Maximum size is 5MB.' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded.' });
    }

    const { key } = req.body;
    if (!key) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Content key is required (e.g., heroImage, aboutImage).' });
    }

    const data = loadData();
    if (!data.siteContent) data.siteContent = {};

    // If there's an old image for this key, try to remove it
    const oldImage = data.siteContent[key];
    if (oldImage && oldImage.startsWith('/uploads/images/')) {
      const oldPath = path.join(__dirname, 'public', oldImage);
      try {
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch (e) {
        console.error('Error removing old site image:', e.message);
      }
    }

    const imagePath = '/uploads/images/' + req.file.filename;
    data.siteContent[key] = imagePath;
    saveData(data);

    res.json({ success: true, key, imagePath });
  });
});

// --- Admin Announcements ---

// Create announcement
app.post('/api/admin/announcement', requireAdmin, (req, res) => {
  const { title, text, date } = req.body;
  if (!title || !text) {
    return res.status(400).json({ error: 'Title and text are required.' });
  }

  const data = loadData();
  const announcement = {
    id: data.announcements.length > 0 ? Math.max(...data.announcements.map(a => a.id)) + 1 : 1,
    title: sanitize(title),
    text: sanitize(text),
    date: date || new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
  };

  data.announcements.push(announcement);
  saveData(data);
  res.json({ success: true, announcement });
});

// Delete announcement
app.delete('/api/admin/announcement/:id', requireAdmin, (req, res) => {
  const data = loadData();
  const idx = data.announcements.findIndex(a => a.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Announcement not found.' });

  data.announcements.splice(idx, 1);
  saveData(data);
  res.json({ success: true });
});

// Public endpoint to get announcements
app.get('/api/announcements', (req, res) => {
  const data = loadData();
  res.json({ announcements: data.announcements || [] });
});

// --- Daily Activity Reports ---

// Admin: create activity report for a child
app.post('/api/admin/activity-report', requireAdmin, (req, res) => {
  const { childId, date, activities, meals, mood, nap, notes } = req.body;
  if (!childId || !date) {
    return res.status(400).json({ error: 'Child and date are required.' });
  }

  const data = loadData();
  if (!data.activityReports) data.activityReports = [];

  const child = (data.children || []).find(c => c.id === parseInt(childId));
  if (!child) return res.status(404).json({ error: 'Child not found.' });

  const report = {
    id: data.activityReports.length > 0 ? Math.max(...data.activityReports.map(r => r.id)) + 1 : 1,
    childId: parseInt(childId),
    childName: child.childName,
    parentEmail: child.parentEmail,
    date: sanitize(date),
    activities: sanitize(activities || ''),
    meals: sanitize(meals || ''),
    mood: sanitize(mood || ''),
    nap: sanitize(nap || ''),
    notes: sanitize(notes || ''),
    createdAt: new Date().toISOString(),
  };

  data.activityReports.push(report);
  saveData(data);
  res.json({ success: true, report });
});

// Admin: get all activity reports
app.get('/api/admin/activity-reports', requireAdmin, (req, res) => {
  const data = loadData();
  res.json({ activityReports: data.activityReports || [] });
});

// Admin: delete activity report
app.delete('/api/admin/activity-report/:id', requireAdmin, (req, res) => {
  const data = loadData();
  if (!data.activityReports) data.activityReports = [];
  data.activityReports = data.activityReports.filter(r => r.id !== parseInt(req.params.id));
  saveData(data);
  res.json({ success: true });
});

// Parent: get activity reports for their children
app.get('/api/portal/activity-reports', requireAuth, (req, res) => {
  const data = loadData();
  const reports = (data.activityReports || []).filter(
    r => r.parentEmail.toLowerCase() === req.session.user.email.toLowerCase()
  );
  res.json({ activityReports: reports });
});

// --- Event Calendar ---

// Admin: create event
app.post('/api/admin/event', requireAdmin, (req, res) => {
  const { title, description, date, endDate, time, type } = req.body;
  if (!title || !date) {
    return res.status(400).json({ error: 'Title and date are required.' });
  }

  const data = loadData();
  if (!data.events) data.events = [];

  const event = {
    id: data.events.length > 0 ? Math.max(...data.events.map(e => e.id)) + 1 : 1,
    title: sanitize(title),
    description: sanitize(description || ''),
    date,
    endDate: endDate || date,
    time: time || '',
    type: type || 'general', // general, holiday, conference, field-trip
    createdAt: new Date().toISOString(),
  };

  data.events.push(event);
  saveData(data);
  res.json({ success: true, event });
});

// Admin: delete event
app.delete('/api/admin/event/:id', requireAdmin, (req, res) => {
  const data = loadData();
  if (!data.events) data.events = [];
  data.events = data.events.filter(e => e.id !== parseInt(req.params.id));
  saveData(data);
  res.json({ success: true });
});

// Public: get events
app.get('/api/events', (req, res) => {
  const data = loadData();
  res.json({ events: data.events || [] });
});

// --- Staff Management ---

// Admin: update staff
app.post('/api/admin/staff', requireAdmin, (req, res) => {
  const { staff } = req.body;
  if (!Array.isArray(staff)) {
    return res.status(400).json({ error: 'Staff must be an array.' });
  }

  const data = loadData();
  data.staff = staff.map((s, i) => ({
    id: i + 1,
    name: sanitize(s.name || ''),
    title: sanitize(s.title || ''),
    bio: sanitize(s.bio || ''),
    image: s.image || '',
    credentials: sanitize(s.credentials || ''),
  }));
  saveData(data);
  res.json({ success: true, staff: data.staff });
});

// Public: get staff
app.get('/api/staff', (req, res) => {
  const data = loadData();
  res.json({ staff: data.staff || [] });
});

// Public endpoint to get site content (for inline editing and dynamic content)
app.get('/api/site-content', (req, res) => {
  const data = loadData();
  res.json({ siteContent: data.siteContent || {} });
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
app.post('/api/contact', formLimiter, async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
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
      userName: sanitize(req.session.user.name),
      userEmail: req.session.user.email,
      subject: sanitize(subject || 'General Inquiry'),
      message: sanitize(message),
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  }

  data.interestedLeads.push({
    id: data.interestedLeads.length > 0 ? Math.max(...data.interestedLeads.map(l => l.id)) + 1 : 1,
    name: sanitize(name),
    email: email.toLowerCase().trim(),
    phone: sanitize(phone || ''),
    subject: sanitize(subject || 'General Inquiry'),
    message: sanitize(message),
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
app.post('/api/enroll', formLimiter, async (req, res) => {
  const { childName, childAge, parentName, email, phone, program, startDate, notes } = req.body;

  if (!childName || !parentName || !email || !program) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }

  const data = loadData();
  data.enrollments.push({
    id: data.enrollments.length > 0 ? Math.max(...data.enrollments.map(e => e.id)) + 1 : 1,
    childName: sanitize(childName),
    childAge: sanitize(childAge || ''),
    parentName: sanitize(parentName),
    email: email.toLowerCase().trim(),
    phone: sanitize(phone || ''),
    program: sanitize(program),
    startDate: sanitize(startDate || ''),
    notes: sanitize(notes || ''),
    status: 'pending', // pending | enrolled | waitlisted | declined
    createdAt: new Date().toISOString(),
  });
  saveData(data);

  // Also add as interested lead
  if (!data.interestedLeads.some(l => l.email.toLowerCase() === email.toLowerCase())) {
    data.interestedLeads.push({
      id: data.interestedLeads.length > 0 ? Math.max(...data.interestedLeads.map(l => l.id)) + 1 : 1,
      name: sanitize(parentName),
      email: email.toLowerCase().trim(),
      phone: sanitize(phone || ''),
      subject: 'Enrollment Application',
      message: sanitize(`Applied for ${program} for ${childName}`),
      source: 'enrollment_form',
      createdAt: new Date().toISOString(),
    });
    saveData(data);
  }

  res.json({ success: true, message: 'Enrollment submitted successfully! We will contact you shortly.' });
});

// Tour booking form
app.post('/api/book-tour', formLimiter, (req, res) => {
  const { parentName, email, phone, tourDate, tourTime, childAge, notes } = req.body;

  if (!parentName || !email || !phone || !tourDate) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }

  const data = loadData();
  data.tourRequests.push({
    id: data.tourRequests.length > 0 ? Math.max(...data.tourRequests.map(t => t.id)) + 1 : 1,
    parentName: sanitize(parentName),
    email: email.toLowerCase().trim(),
    phone: sanitize(phone),
    tourDate: sanitize(tourDate),
    tourTime: sanitize(tourTime || 'Flexible'),
    childAge: sanitize(childAge || ''),
    notes: sanitize(notes || ''),
    status: 'pending',
    createdAt: new Date().toISOString(),
  });

  // Also add as interested lead
  if (!data.interestedLeads.some(l => l.email.toLowerCase() === email.toLowerCase())) {
    data.interestedLeads.push({
      id: data.interestedLeads.length > 0 ? Math.max(...data.interestedLeads.map(l => l.id)) + 1 : 1,
      name: sanitize(parentName),
      email: email.toLowerCase().trim(),
      phone: sanitize(phone),
      subject: 'Tour Request',
      message: sanitize(`Requested tour on ${tourDate} at ${tourTime || 'flexible time'}`),
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

// --- Stripe Payment Endpoints ---

// Get Stripe publishable key for client-side
app.get('/api/stripe-config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null });
});

// Create a payment intent (requires logged-in parent)
app.post('/api/create-payment-intent', requireAuth, (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Payment system is not currently available. Please contact the school office.' });
  }

  const { amount, description, childId } = req.body;
  if (!amount || isNaN(amount) || amount < 1) {
    return res.status(400).json({ error: 'Please provide a valid payment amount.' });
  }
  if (amount > 999999) {
    return res.status(400).json({ error: 'Payment amount exceeds the maximum allowed.' });
  }

  const amountInCents = Math.round(parseFloat(amount) * 100);

  stripe.paymentIntents.create({
    amount: amountInCents,
    currency: 'usd',
    metadata: {
      userId: String(req.session.user.id),
      userEmail: req.session.user.email,
      childId: childId ? String(childId) : '',
      description: description || 'Tuition Payment',
    },
  }).then(paymentIntent => {
    // Store payment record
    const data = loadData();
    if (!data.payments) data.payments = [];
    data.payments.push({
      id: data.payments.length > 0 ? Math.max(...data.payments.map(p => p.id || 0)) + 1 : 1,
      userId: req.session.user.id,
      userEmail: req.session.user.email,
      userName: req.session.user.name,
      childId: childId || null,
      amount: parseFloat(amount),
      description: sanitize(description || 'Tuition Payment'),
      stripePaymentIntentId: paymentIntent.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    saveData(data);

    res.json({ clientSecret: paymentIntent.client_secret });
  }).catch(err => {
    console.error('Stripe payment intent creation failed:', err.message);
    res.status(500).json({ error: 'Failed to create payment. Please try again.' });
  });
});

// Get payment history for logged-in parent
app.get('/api/portal/payments', requireAuth, (req, res) => {
  const data = loadData();
  if (!data.payments) data.payments = [];
  const userPayments = data.payments
    .filter(p => p.userId === req.session.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ payments: userPayments });
});

// Get all payments for admin
app.get('/api/admin/payments', requireAdmin, (req, res) => {
  const data = loadData();
  if (!data.payments) data.payments = [];
  const allPayments = data.payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ payments: allPayments });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Daffodils Montessori website running at http://localhost:${PORT}`);
  });
}

module.exports = app;
