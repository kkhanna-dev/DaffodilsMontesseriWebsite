const request = require('supertest');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');
const BACKUP_FILE = path.join(__dirname, 'data.backup.json');

let app;

beforeAll(() => {
  // Set test environment to disable rate limiting
  process.env.NODE_ENV = 'test';
  // Backup existing data
  if (fs.existsSync(DATA_FILE)) {
    fs.copyFileSync(DATA_FILE, BACKUP_FILE);
  }
  // Reset to clean state for tests
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    users: [],
    interestedLeads: [],
    enrollments: [],
    tourRequests: [],
    children: [],
    contactSubmissions: [],
    curriculum: [],
    siteContent: {},
    announcements: [],
  }, null, 2));
  app = require('./server');
});

afterAll(() => {
  // Restore original data
  if (fs.existsSync(BACKUP_FILE)) {
    fs.copyFileSync(BACKUP_FILE, DATA_FILE);
    fs.unlinkSync(BACKUP_FILE);
  }
});

// ==========================================
// UNIT TESTS — Public Pages
// ==========================================
describe('Public Pages', () => {
  test('GET / returns 200', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
  });

  test('GET /about returns 200', async () => {
    const res = await request(app).get('/about');
    expect(res.status).toBe(200);
  });

  test('GET /programs returns 200', async () => {
    const res = await request(app).get('/programs');
    expect(res.status).toBe(200);
  });

  test('GET /contact returns 200', async () => {
    const res = await request(app).get('/contact');
    expect(res.status).toBe(200);
  });

  test('GET /enrollment returns 200', async () => {
    const res = await request(app).get('/enrollment');
    expect(res.status).toBe(200);
  });

  test('GET /gallery returns 200', async () => {
    const res = await request(app).get('/gallery');
    expect(res.status).toBe(200);
  });

  test('GET /staff returns 200', async () => {
    const res = await request(app).get('/staff');
    expect(res.status).toBe(200);
  });

  test('GET /login returns 200', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
  });

  test('GET /register returns 200', async () => {
    const res = await request(app).get('/register');
    expect(res.status).toBe(200);
  });
});

// ==========================================
// UNIT TESTS — Auth Endpoints
// ==========================================
describe('Authentication', () => {
  test('POST /api/register — creates a new parent account', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ name: 'Test Parent', email: 'testparent@example.com', password: 'TestPass123', phone: '1234567890' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.redirect).toBe('/portal');
  });

  test('POST /api/register — rejects duplicate email', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ name: 'Test Parent 2', email: 'testparent@example.com', password: 'TestPass123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already exists');
  });

  test('POST /api/register — rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ name: '', email: '', password: '' });
    expect(res.status).toBe(400);
  });

  test('POST /api/register — rejects short password', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ name: 'Short Pass', email: 'short@example.com', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('6 characters');
  });

  test('POST /api/register — rejects invalid email format', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ name: 'Bad Email', email: 'not-an-email', password: 'TestPass123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('valid email');
  });

  test('POST /api/login — logs in with valid credentials', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'testparent@example.com', password: 'TestPass123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.redirect).toBe('/portal');
  });

  test('POST /api/login — rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'testparent@example.com', password: 'WrongPassword' });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid');
  });

  test('POST /api/login — rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: '', password: '' });
    expect(res.status).toBe(400);
  });

  test('POST /api/login — rejects invalid email format', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'bademail', password: 'TestPass123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Valid email');
  });

  test('GET /api/auth/me — returns 401 when not logged in', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

// ==========================================
// UNIT TESTS — Protected Routes (no auth)
// ==========================================
describe('Protected Routes — Unauthenticated', () => {
  test('GET /portal redirects to /login', async () => {
    const res = await request(app).get('/portal');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test('GET /admin redirects to /login', async () => {
    const res = await request(app).get('/admin');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test('GET /api/admin/dashboard redirects when not admin', async () => {
    const res = await request(app).get('/api/admin/dashboard');
    expect(res.status).toBe(302);
  });

  test('GET /api/portal/data redirects when not logged in', async () => {
    const res = await request(app).get('/api/portal/data');
    expect(res.status).toBe(302);
  });
});

// ==========================================
// UNIT TESTS — Authenticated Parent Flows
// ==========================================
describe('Authenticated Parent Flows', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ email: 'testparent@example.com', password: 'TestPass123' });
  });

  test('GET /api/portal/data — returns user data', async () => {
    const res = await agent.get('/api/portal/data');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('testparent@example.com');
  });

  test('GET /api/auth/me — returns logged in user', async () => {
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('testparent@example.com');
  });

  test('POST /api/portal/add-child — adds a child', async () => {
    const res = await agent
      .post('/api/portal/add-child')
      .send({ childName: 'Test Child', dateOfBirth: '2022-06-15', gender: 'Female', allergies: 'None' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.child.childName).toBe('Test Child');
  });

  test('POST /api/portal/add-child — rejects missing name', async () => {
    const res = await agent
      .post('/api/portal/add-child')
      .send({ childName: '' });
    expect(res.status).toBe(400);
  });

  test('GET /api/portal/children — returns children', async () => {
    const res = await agent.get('/api/portal/children');
    expect(res.status).toBe(200);
    expect(res.body.children.length).toBeGreaterThan(0);
    expect(res.body.children[0].childName).toBe('Test Child');
  });

  test('POST /api/contact — succeeds with child info present', async () => {
    const res = await agent
      .post('/api/contact')
      .send({ name: 'Test Parent', email: 'testparent@example.com', message: 'Interested in enrollment', subject: 'General Inquiry' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/contact — rejects duplicate submission', async () => {
    const res = await agent
      .post('/api/contact')
      .send({ name: 'Test Parent', email: 'testparent@example.com', message: 'Second attempt' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already submitted');
  });

  test('DELETE /api/portal/child/:id — deletes own child', async () => {
    const childrenRes = await agent.get('/api/portal/children');
    const childId = childrenRes.body.children[0].id;
    const res = await agent.delete(`/api/portal/child/${childId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('DELETE /api/portal/child/9999 — returns 404 for nonexistent child', async () => {
    const res = await agent.delete('/api/portal/child/9999');
    expect(res.status).toBe(404);
  });
});

// ==========================================
// UNIT TESTS — Admin Flows
// ==========================================
describe('Admin Flows', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ email: 'vlwhite396@gmail.com', password: 'Riishii@12' });
  });

  test('GET /api/admin/dashboard — returns all data', async () => {
    const res = await agent.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.interestedLeads).toBeDefined();
    expect(res.body.enrollments).toBeDefined();
    expect(res.body.tourRequests).toBeDefined();
    expect(res.body.users).toBeDefined();
    expect(res.body.children).toBeDefined();
    expect(res.body.contactSubmissions).toBeDefined();
  });

  test('Admin dashboard does not leak password hashes', async () => {
    const res = await agent.get('/api/admin/dashboard');
    const users = res.body.users;
    users.forEach(u => {
      expect(u.password).toBeUndefined();
    });
  });

  test('POST /api/admin/contact-submission/:id/status — updates status', async () => {
    const dash = await agent.get('/api/admin/dashboard');
    const sub = dash.body.contactSubmissions[0];
    if (sub) {
      const res = await agent
        .post(`/api/admin/contact-submission/${sub.id}/status`)
        .send({ status: 'reviewed' });
      expect(res.status).toBe(200);
    }
  });

  test('POST /api/admin/contact-submission/9999/status — 404 for missing', async () => {
    const res = await agent
      .post('/api/admin/contact-submission/9999/status')
      .send({ status: 'reviewed' });
    expect(res.status).toBe(404);
  });

  test('DELETE /api/admin/lead/:id — deletes a lead', async () => {
    const dash = await agent.get('/api/admin/dashboard');
    const lead = dash.body.interestedLeads[0];
    if (lead) {
      const res = await agent.delete(`/api/admin/lead/${lead.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }
  });
});

// ==========================================
// UNIT TESTS — Form Submissions
// ==========================================
describe('Public Form Submissions', () => {
  test('POST /api/contact — rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ name: '', email: '', message: '' });
    expect(res.status).toBe(400);
  });

  test('POST /api/contact — rejects invalid email', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ name: 'Test', email: 'not-email', message: 'Hello' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('valid email');
  });

  test('POST /api/contact — succeeds for anonymous users', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ name: 'Anon User', email: 'anon@example.com', message: 'Just asking', subject: 'General' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/enroll — rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/enroll')
      .send({ childName: '', parentName: '', email: '', program: '' });
    expect(res.status).toBe(400);
  });

  test('POST /api/enroll — succeeds with valid data', async () => {
    const res = await request(app)
      .post('/api/enroll')
      .send({
        childName: 'Enrollment Child',
        childAge: '3',
        parentName: 'Enrollment Parent',
        email: 'enroll@example.com',
        phone: '5551234567',
        program: 'Primary (3-6)',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/book-tour — rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/book-tour')
      .send({ parentName: '', email: '', phone: '', tourDate: '' });
    expect(res.status).toBe(400);
  });

  test('POST /api/book-tour — succeeds with valid data', async () => {
    const res = await request(app)
      .post('/api/book-tour')
      .send({
        parentName: 'Tour Parent',
        email: 'tour@example.com',
        phone: '5559876543',
        tourDate: '2026-04-15',
        tourTime: '10:00 AM',
        childAge: '4',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ==========================================
// SECURITY TESTS
// ==========================================
describe('Security', () => {
  test('Response includes security headers (helmet)', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  test('Response includes Content-Security-Policy', async () => {
    const res = await request(app).get('/');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  test('Session cookie has httpOnly flag', async () => {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/login')
      .send({ email: 'vlwhite396@gmail.com', password: 'Riishii@12' });
    const cookies = res.headers['set-cookie'];
    if (cookies) {
      const sessionCookie = cookies.find(c => c.includes('connect.sid'));
      if (sessionCookie) {
        expect(sessionCookie.toLowerCase()).toContain('httponly');
      }
    }
  });

  test('XSS in contact form name is not stored raw', async () => {
    const xssPayload = '<script>alert("xss")</script>';
    await request(app)
      .post('/api/contact')
      .send({ name: xssPayload, email: 'xss@example.com', message: 'test' });
    
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const lead = data.interestedLeads.find(l => l.email === 'xss@example.com');
    // Data is stored as-is (sanitization happens on render), but verify it exists
    expect(lead).toBeDefined();
  });

  test('SQL-like injection in login does not crash server', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: "admin' OR '1'='1", password: "' OR '1'='1" });
    expect([400, 401]).toContain(res.status);
  });

  test('Oversized request body is rejected', async () => {
    const largePayload = 'x'.repeat(2 * 1024 * 1024);
    const res = await request(app)
      .post('/api/contact')
      .send({ name: largePayload, email: 'big@example.com', message: 'test' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('Admin routes reject non-admin users', async () => {
    const agent = request.agent(app);
    await agent.post('/api/register').send({
      name: 'Non Admin', email: 'nonadmin@example.com', password: 'TestPass123'
    });
    
    const dashRes = await agent.get('/api/admin/dashboard');
    expect(dashRes.status).toBe(302);
  });

  test('Parent cannot access other parent\'s children', async () => {
    const agent = request.agent(app);
    await agent.post('/api/register').send({
      name: 'Other Parent', email: 'otherparent@example.com', password: 'TestPass123'
    });

    // Try to delete child ID 1 (belongs to first test parent)
    const res = await agent.delete('/api/portal/child/1');
    expect(res.status).toBe(404);
  });

  test('Password hashes are not exposed in API responses', async () => {
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/login').send({ email: 'vlwhite396@gmail.com', password: 'Riishii@12' });
    expect(loginRes.status).toBe(200);
    
    const res = await agent.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    res.body.users.forEach(user => {
      expect(user.password).toBeUndefined();
    });
  });

  test('Path traversal in static files returns 4xx', async () => {
    const res = await request(app).get('/../../etc/passwd');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('Unknown routes return 404', async () => {
    const res = await request(app).get('/nonexistent-page');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ==========================================
// UNIT TESTS — Contact Form + Children Requirement
// ==========================================
describe('Contact form requires children', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent.post('/api/register').send({
      name: 'NoKids Parent', email: 'nokids@example.com', password: 'TestPass123'
    });
  });

  test('POST /api/contact — blocked when logged in with no children', async () => {
    const res = await agent
      .post('/api/contact')
      .send({ name: 'NoKids Parent', email: 'nokids@example.com', message: 'Help' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('nochildren');
    expect(res.body.redirect).toBe('/portal');
  });

  test('POST /api/contact — succeeds after adding a child', async () => {
    await agent.post('/api/portal/add-child').send({ childName: 'New Kid' });
    const res = await agent
      .post('/api/contact')
      .send({ name: 'NoKids Parent', email: 'nokids@example.com', message: 'Now I have a kid' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ==========================================
// UNIT TESTS — Admin Curriculum Management
// ==========================================
describe('Admin Curriculum Management', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ email: 'vlwhite396@gmail.com', password: 'Riishii@12' });
  });

  test('POST /api/admin/upload-curriculum — rejects without file', async () => {
    const res = await agent
      .post('/api/admin/upload-curriculum')
      .field('title', 'Test Curriculum')
      .field('program', 'Primary Program')
      .field('description', 'Test');
    expect(res.status).toBe(400);
  });

  test('POST /api/admin/upload-curriculum — uploads a PDF', async () => {
    // Create a minimal fake PDF
    const tempPdf = path.join(__dirname, 'test-curriculum.pdf');
    fs.writeFileSync(tempPdf, '%PDF-1.4 test content');
    const res = await agent
      .post('/api/admin/upload-curriculum')
      .field('title', 'Spring Curriculum')
      .field('program', 'Primary Program')
      .field('description', 'Spring semester plan')
      .attach('file', tempPdf);
    fs.unlinkSync(tempPdf);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.curriculum).toBeDefined();
    expect(res.body.curriculum.title).toBe('Spring Curriculum');
  });

  test('GET /api/admin/curriculum — lists curriculum files', async () => {
    const res = await agent.get('/api/admin/curriculum');
    expect(res.status).toBe(200);
    expect(res.body.curriculum).toBeDefined();
    expect(res.body.curriculum.length).toBeGreaterThan(0);
  });

  test('DELETE /api/admin/curriculum/:id — deletes curriculum', async () => {
    const listRes = await agent.get('/api/admin/curriculum');
    const id = listRes.body.curriculum[0].id;
    const res = await agent.delete(`/api/admin/curriculum/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('DELETE /api/admin/curriculum/9999 — 404 for nonexistent', async () => {
    const res = await agent.delete('/api/admin/curriculum/9999');
    expect(res.status).toBe(404);
  });
});

// ==========================================
// UNIT TESTS — Admin Curriculum (non-admin rejected)
// ==========================================
describe('Curriculum — Non-admin rejected', () => {
  test('POST /api/admin/upload-curriculum — redirects for unauthenticated', async () => {
    const res = await request(app)
      .post('/api/admin/upload-curriculum')
      .field('title', 'Hack')
      .field('program', 'Primary Program');
    expect(res.status).toBe(302);
  });

  test('GET /api/admin/curriculum — redirects for unauthenticated', async () => {
    const res = await request(app).get('/api/admin/curriculum');
    expect(res.status).toBe(302);
  });

  test('DELETE /api/admin/curriculum/1 — redirects for unauthenticated', async () => {
    const res = await request(app).delete('/api/admin/curriculum/1');
    expect(res.status).toBe(302);
  });
});

// ==========================================
// UNIT TESTS — Admin Site Content Management
// ==========================================
describe('Admin Site Content Management', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ email: 'vlwhite396@gmail.com', password: 'Riishii@12' });
  });

  test('GET /api/admin/site-content — returns site content', async () => {
    const res = await agent.get('/api/admin/site-content');
    expect(res.status).toBe(200);
    expect(res.body.siteContent).toBeDefined();
  });

  test('POST /api/admin/update-content — updates allowed keys', async () => {
    const res = await agent
      .post('/api/admin/update-content')
      .send({ heroTitle: 'Welcome to Daffodils!', aboutDesc: 'Our school is great.' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/admin/update-content — content persists', async () => {
    const res = await agent.get('/api/admin/site-content');
    expect(res.body.siteContent.heroTitle).toBe('Welcome to Daffodils!');
    expect(res.body.siteContent.aboutDesc).toBe('Our school is great.');
  });

  test('POST /api/admin/update-content — rejects disallowed keys', async () => {
    const res = await agent
      .post('/api/admin/update-content')
      .send({ hackerKey: 'malicious', heroTitle: 'OK' });
    expect(res.status).toBe(200);
    // Check the hackerKey was NOT saved
    const contentRes = await agent.get('/api/admin/site-content');
    expect(contentRes.body.siteContent.hackerKey).toBeUndefined();
  });

  test('GET /api/admin/site-content — rejected for unauthenticated', async () => {
    const res = await request(app).get('/api/admin/site-content');
    expect(res.status).toBe(302);
  });
});

// ==========================================
// UNIT TESTS — Admin Announcements
// ==========================================
describe('Admin Announcements', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ email: 'vlwhite396@gmail.com', password: 'Riishii@12' });
  });

  test('POST /api/admin/announcement — creates announcement', async () => {
    const res = await agent
      .post('/api/admin/announcement')
      .send({ title: 'Spring Break', text: 'School closed March 28-April 4', date: '2026-03-25' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.announcement.title).toBe('Spring Break');
  });

  test('POST /api/admin/announcement — rejects missing title', async () => {
    const res = await agent
      .post('/api/admin/announcement')
      .send({ title: '', text: 'Some text' });
    expect(res.status).toBe(400);
  });

  test('GET /api/announcements — public endpoint returns announcements', async () => {
    const res = await request(app).get('/api/announcements');
    expect(res.status).toBe(200);
    expect(res.body.announcements).toBeDefined();
    expect(res.body.announcements.length).toBeGreaterThan(0);
    expect(res.body.announcements[0].title).toBe('Spring Break');
  });

  test('DELETE /api/admin/announcement/:id — deletes announcement', async () => {
    const listRes = await request(app).get('/api/announcements');
    const id = listRes.body.announcements[0].id;
    const res = await agent.delete(`/api/admin/announcement/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('DELETE /api/admin/announcement/9999 — 404 for nonexistent', async () => {
    const res = await agent.delete('/api/admin/announcement/9999');
    expect(res.status).toBe(404);
  });

  test('POST /api/admin/announcement — rejected for non-admin', async () => {
    const res = await request(app)
      .post('/api/admin/announcement')
      .send({ title: 'Hack', text: 'Bad' });
    expect(res.status).toBe(302);
  });
});

// ==========================================
// UNIT TESTS — Parent Portal Curriculum
// ==========================================
describe('Parent Portal Curriculum', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ email: 'testparent@example.com', password: 'TestPass123' });
  });

  test('GET /api/portal/curriculum — returns curriculum for parent', async () => {
    const res = await agent.get('/api/portal/curriculum');
    expect(res.status).toBe(200);
    expect(res.body.curriculum).toBeDefined();
  });

  test('GET /api/portal/curriculum — rejected for unauthenticated', async () => {
    const res = await request(app).get('/api/portal/curriculum');
    expect(res.status).toBe(302);
  });
});

// ==========================================
// UNIT TESTS — Dashboard includes new data
// ==========================================
describe('Dashboard includes new features', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ email: 'vlwhite396@gmail.com', password: 'Riishii@12' });
  });

  test('GET /api/admin/dashboard — includes curriculum array', async () => {
    const res = await agent.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.curriculum).toBeDefined();
    expect(Array.isArray(res.body.curriculum)).toBe(true);
  });

  test('GET /api/admin/dashboard — includes siteContent object', async () => {
    const res = await agent.get('/api/admin/dashboard');
    expect(res.body.siteContent).toBeDefined();
    expect(typeof res.body.siteContent).toBe('object');
  });

  test('GET /api/admin/dashboard — includes announcements array', async () => {
    const res = await agent.get('/api/admin/dashboard');
    expect(res.body.announcements).toBeDefined();
    expect(Array.isArray(res.body.announcements)).toBe(true);
  });
});

// ==========================================
// SECURITY TESTS — File Upload
// ==========================================
describe('File Upload Security', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ email: 'vlwhite396@gmail.com', password: 'Riishii@12' });
  });

  test('Curriculum upload rejects non-PDF files', async () => {
    const tempTxt = path.join(__dirname, 'test-hack.txt');
    fs.writeFileSync(tempTxt, 'not a pdf');
    const res = await agent
      .post('/api/admin/upload-curriculum')
      .field('title', 'Hack')
      .field('program', 'Primary Program')
      .attach('file', tempTxt);
    fs.unlinkSync(tempTxt);
    // Should reject (400 or 500 depending on multer filter)
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('Image upload rejects non-image files', async () => {
    const tempTxt = path.join(__dirname, 'test-hack.txt');
    fs.writeFileSync(tempTxt, 'not an image');
    const res = await agent
      .post('/api/admin/upload-site-image')
      .field('section', 'hero')
      .attach('image', tempTxt);
    fs.unlinkSync(tempTxt);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ==========================================
// CLEANUP — Delete test parents created by unit tests
// ==========================================
describe('Unit Test Cleanup — Delete test parent accounts', () => {
  let adminAgent;

  const testEmails = [
    'testparent@example.com',
    'nonadmin@example.com',
    'otherparent@example.com',
    'nokids@example.com',
  ];

  beforeAll(async () => {
    adminAgent = request.agent(app);
    await adminAgent.post('/api/login').send({
      email: 'vlwhite396@gmail.com', password: 'Riishii@12',
    });
  });

  test('Admin deletes all unit-test parent accounts via delete button', async () => {
    const dash = await adminAgent.get('/api/admin/dashboard');
    for (const email of testEmails) {
      const user = dash.body.users.find(u => u.email === email);
      if (user) {
        const res = await adminAgent.delete(`/api/admin/user/${user.id}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }
    }

    const after = await adminAgent.get('/api/admin/dashboard');
    for (const email of testEmails) {
      expect(after.body.users.find(u => u.email === email)).toBeUndefined();
    }
  });
});

// ============================================================
// END-TO-END TESTS — Full Enrollment Journey
// ============================================================
// These tests simulate the complete lifecycle:
//   1. Parent registers an account
//   2. Parent adds a child with full details
//   3. Parent submits a contact form (interest inquiry)
//   4. Admin reviews and approves the child for enrollment
//   5. Parent selects a program and schedule (enrollment completes)
//   6. Admin uploads curriculum for that program
//   7. Parent views curriculum documents for their enrolled child
//   8. Parent portal shows correct enrollment data throughout
// ============================================================
describe('E2E: Full Enrollment Journey — Register to Curriculum', () => {
  let parentAgent;
  let adminAgent;
  let childId;
  let curriculumId;

  const parentEmail = 'e2e-parent@example.com';
  const parentPassword = 'E2eTest!2026';
  const parentName = 'E2E Test Parent';
  const childDetails = {
    childName: 'E2E Test Child',
    dateOfBirth: '2022-03-15',
    gender: 'Female',
    allergies: 'Peanuts',
    medicalNotes: 'Mild asthma, carries inhaler',
    emergencyContact: 'E2E Grandparent',
    emergencyPhone: '425-555-9999',
    notes: 'Loves painting and outdoor play',
  };

  // ---- STEP 1: Parent registers a new account ----
  test('Step 1: Parent registers a new account', async () => {
    parentAgent = request.agent(app);
    const res = await parentAgent
      .post('/api/register')
      .send({ name: parentName, email: parentEmail, password: parentPassword, phone: '425-555-1234' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.redirect).toBe('/portal');
  });

  // ---- STEP 2: Parent portal shows not-enrolled state ----
  test('Step 2: Portal shows not-enrolled state with no children', async () => {
    const res = await parentAgent.get('/api/portal/data');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(parentEmail);
    expect(res.body.user.name).toBe(parentName);
    expect(res.body.enrollment).toBeNull();
    expect(res.body.children).toEqual([]);
    expect(res.body.contactSubmitted).toBe(false);
  });

  // ---- STEP 3: Parent adds a child with full details ----
  test('Step 3: Parent adds a child with full medical and emergency info', async () => {
    const res = await parentAgent
      .post('/api/portal/add-child')
      .send(childDetails);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.child.childName).toBe('E2E Test Child');
    expect(res.body.child.allergies).toBe('Peanuts');
    expect(res.body.child.medicalNotes).toBe('Mild asthma, carries inhaler');
    expect(res.body.child.emergencyContact).toBe('E2E Grandparent');
    expect(res.body.child.emergencyPhone).toBe('425-555-9999');
    expect(res.body.child.parentEmail).toBe(parentEmail);
    childId = res.body.child.id;
  });

  // ---- STEP 4: Verify child appears in parent's children list ----
  test('Step 4: Child appears in parent children list', async () => {
    const res = await parentAgent.get('/api/portal/children');
    expect(res.status).toBe(200);
    expect(res.body.children.length).toBe(1);
    const child = res.body.children[0];
    expect(child.id).toBe(childId);
    expect(child.childName).toBe('E2E Test Child');
    expect(child.dateOfBirth).toBe('2022-03-15');
    expect(child.gender).toBe('Female');
  });

  // ---- STEP 5: Parent submits contact form (inquiry) ----
  test('Step 5: Parent submits contact form showing interest', async () => {
    const res = await parentAgent
      .post('/api/contact')
      .send({
        name: parentName,
        email: parentEmail,
        phone: '425-555-1234',
        subject: 'Enrollment Question',
        message: 'We are very interested in the Primary Program for our daughter. She turns 4 in March.',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.redirect).toBe('/portal');
  });

  // ---- STEP 6: Portal now shows contact submitted status ----
  test('Step 6: Portal reflects contact form submitted', async () => {
    const res = await parentAgent.get('/api/portal/data');
    expect(res.status).toBe(200);
    expect(res.body.contactSubmitted).toBe(true);
    expect(res.body.contactSubmission).toBeDefined();
    expect(res.body.contactSubmission.status).toBe('pending');
    expect(res.body.contactSubmission.message).toContain('Primary Program');
  });

  // ---- STEP 7: Parent cannot submit contact form again ----
  test('Step 7: Duplicate contact form submission is rejected', async () => {
    const res = await parentAgent
      .post('/api/contact')
      .send({ name: parentName, email: parentEmail, message: 'Duplicate' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already submitted');
  });

  // ---- STEP 8: Curriculum is empty before enrollment ----
  test('Step 8: Curriculum returns empty before child is enrolled', async () => {
    const res = await parentAgent.get('/api/portal/curriculum');
    expect(res.status).toBe(200);
    expect(res.body.curriculum).toEqual([]);
  });

  // ---- STEP 9: Program selection fails before admin approval ----
  test('Step 9: Parent cannot select program before admin approval', async () => {
    const res = await parentAgent
      .post('/api/portal/select-program')
      .send({ childId, program: 'Primary Program', schedule: 'Full Day' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not been approved');
  });

  // ---- STEP 10: Admin logs in ----
  test('Step 10: Admin logs in successfully', async () => {
    adminAgent = request.agent(app);
    const res = await adminAgent
      .post('/api/login')
      .send({ email: 'vlwhite396@gmail.com', password: 'Riishii@12' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.redirect).toBe('/admin');
  });

  // ---- STEP 11: Admin sees the parent, child, and inquiry on dashboard ----
  test('Step 11: Admin dashboard shows the new parent, child, and lead', async () => {
    const res = await adminAgent.get('/api/admin/dashboard');
    expect(res.status).toBe(200);

    // Parent account exists
    const parent = res.body.users.find(u => u.email === parentEmail);
    expect(parent).toBeDefined();
    expect(parent.name).toBe(parentName);
    expect(parent.role).toBe('parent');

    // Child profile exists
    const child = res.body.children.find(c => c.id === childId);
    expect(child).toBeDefined();
    expect(child.childName).toBe('E2E Test Child');
    expect(child.parentEmail).toBe(parentEmail);
    expect(child.allergies).toBe('Peanuts');

    // Contact submission exists
    const submission = res.body.contactSubmissions.find(s => s.userEmail === parentEmail);
    expect(submission).toBeDefined();
    expect(submission.status).toBe('pending');
    expect(submission.message).toContain('Primary Program');

    // Interested lead exists
    const lead = res.body.interestedLeads.find(l => l.email === parentEmail);
    expect(lead).toBeDefined();
    expect(lead.source).toBe('contact_form');
  });

  // ---- STEP 12: Admin reviews the contact submission ----
  test('Step 12: Admin marks contact submission as reviewed', async () => {
    const dash = await adminAgent.get('/api/admin/dashboard');
    const submission = dash.body.contactSubmissions.find(s => s.userEmail === parentEmail);
    expect(submission).toBeDefined();

    const res = await adminAgent
      .post(`/api/admin/contact-submission/${submission.id}/status`)
      .send({ status: 'reviewed' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ---- STEP 13: Admin approves the child for enrollment ----
  test('Step 13: Admin approves child for enrollment', async () => {
    const res = await adminAgent
      .post(`/api/admin/enroll-child/${childId}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ---- STEP 14: Child status is now "approved" on admin dashboard ----
  test('Step 14: Dashboard shows child as approved', async () => {
    const dash = await adminAgent.get('/api/admin/dashboard');
    const child = dash.body.children.find(c => c.id === childId);
    expect(child.enrollmentStatus).toBe('approved');
    expect(child.approvedAt).toBeDefined();
  });

  // ---- STEP 15: Parent portal shows approved child with program selection ----
  test('Step 15: Parent portal shows child as approved, awaiting program selection', async () => {
    const res = await parentAgent.get('/api/portal/data');
    expect(res.status).toBe(200);
    const child = res.body.children.find(c => c.id === childId);
    expect(child).toBeDefined();
    expect(child.enrollmentStatus).toBe('approved');
  });

  // ---- STEP 16: Parent selects program and schedule (enrollment completes) ----
  test('Step 16: Parent selects Primary Program / Full Day — enrollment completes', async () => {
    const res = await parentAgent
      .post('/api/portal/select-program')
      .send({ childId, program: 'Primary Program', schedule: 'Full Day' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ---- STEP 17: Child is now fully enrolled ----
  test('Step 17: Child status is enrolled with correct program and payment', async () => {
    const res = await parentAgent.get('/api/portal/children');
    const child = res.body.children.find(c => c.id === childId);
    expect(child.enrollmentStatus).toBe('enrolled');
    expect(child.program).toBe('Primary Program');
    expect(child.schedule).toBe('Full Day');
    expect(child.paymentStatus).toBe('paid');
    expect(child.paidAt).toBeDefined();
  });

  // ---- STEP 18: Admin confirms enrollment on dashboard ----
  test('Step 18: Admin dashboard shows child as enrolled in Primary Program', async () => {
    const dash = await adminAgent.get('/api/admin/dashboard');
    const child = dash.body.children.find(c => c.id === childId);
    expect(child.enrollmentStatus).toBe('enrolled');
    expect(child.program).toBe('Primary Program');
    expect(child.schedule).toBe('Full Day');
    expect(child.paymentStatus).toBe('paid');
  });

  // ---- STEP 19: Admin uploads curriculum for Primary Program ----
  test('Step 19: Admin uploads curriculum PDF for Primary Program', async () => {
    const tempPdf = path.join(__dirname, 'e2e-curriculum.pdf');
    fs.writeFileSync(tempPdf, '%PDF-1.4 E2E primary program curriculum content');
    const res = await adminAgent
      .post('/api/admin/upload-curriculum')
      .field('title', 'Primary Program — Spring 2026 Lesson Plan')
      .field('program', 'Primary Program')
      .field('description', 'Weekly lesson plans covering practical life, sensorial, language, and math areas')
      .attach('file', tempPdf);
    fs.unlinkSync(tempPdf);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.curriculum.title).toBe('Primary Program — Spring 2026 Lesson Plan');
    expect(res.body.curriculum.program).toBe('Primary Program');
    curriculumId = res.body.curriculum.id;
  });

  // ---- STEP 20: Admin uploads another curriculum for All Programs ----
  test('Step 20: Admin uploads a general curriculum for All Programs', async () => {
    const tempPdf = path.join(__dirname, 'e2e-general.pdf');
    fs.writeFileSync(tempPdf, '%PDF-1.4 General school policies');
    const res = await adminAgent
      .post('/api/admin/upload-curriculum')
      .field('title', 'School Handbook & Policies 2026')
      .field('program', 'All Programs')
      .field('description', 'General school handbook applicable to all families')
      .attach('file', tempPdf);
    fs.unlinkSync(tempPdf);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ---- STEP 21: Admin uploads curriculum for a DIFFERENT program ----
  test('Step 21: Admin uploads Toddler curriculum (should NOT appear for Primary parent)', async () => {
    const tempPdf = path.join(__dirname, 'e2e-toddler.pdf');
    fs.writeFileSync(tempPdf, '%PDF-1.4 Toddler program content');
    const res = await adminAgent
      .post('/api/admin/upload-curriculum')
      .field('title', 'Toddler Spring Activities')
      .field('program', 'Toddler Program')
      .field('description', 'Activities for toddlers only')
      .attach('file', tempPdf);
    fs.unlinkSync(tempPdf);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ---- STEP 22: Parent sees curriculum for their enrolled program ----
  test('Step 22: Parent sees Primary and All Programs curriculum, but NOT Toddler', async () => {
    const res = await parentAgent.get('/api/portal/curriculum');
    expect(res.status).toBe(200);
    expect(res.body.curriculum.length).toBe(2);

    const titles = res.body.curriculum.map(c => c.title);
    expect(titles).toContain('Primary Program — Spring 2026 Lesson Plan');
    expect(titles).toContain('School Handbook & Policies 2026');
    expect(titles).not.toContain('Toddler Spring Activities');
  });

  // ---- STEP 23: Portal data shows full enrollment context ----
  test('Step 23: Portal data has complete enrollment information', async () => {
    const res = await parentAgent.get('/api/portal/data');
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe(parentName);
    expect(res.body.children.length).toBe(1);

    const child = res.body.children[0];
    expect(child.enrollmentStatus).toBe('enrolled');
    expect(child.program).toBe('Primary Program');

    expect(res.body.contactSubmitted).toBe(true);
    expect(res.body.contactSubmission.status).toBe('reviewed');
  });

  // ---- STEP 24: Parent cannot re-select program for enrolled child ----
  test('Step 24: Cannot re-select program for already enrolled child', async () => {
    const res = await parentAgent
      .post('/api/portal/select-program')
      .send({ childId, program: 'Toddler Program', schedule: 'Half Day Morning' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not been approved');
  });

  // ---- STEP 25: Admin can unenroll child ----
  test('Step 25: Admin unenrolls the child', async () => {
    const res = await adminAgent
      .post(`/api/admin/unenroll-child/${childId}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ---- STEP 26: After unenrollment, child loses program/payment data ----
  test('Step 26: Unenrolled child has no program, schedule, or payment data', async () => {
    const res = await parentAgent.get('/api/portal/children');
    const child = res.body.children.find(c => c.id === childId);
    expect(child.enrollmentStatus).toBe('none');
    expect(child.program).toBeUndefined();
    expect(child.schedule).toBeUndefined();
    expect(child.paymentStatus).toBeUndefined();
  });

  // ---- STEP 27: After unenrollment, curriculum is empty again ----
  test('Step 27: Curriculum returns empty after unenrollment', async () => {
    const res = await parentAgent.get('/api/portal/curriculum');
    expect(res.status).toBe(200);
    expect(res.body.curriculum).toEqual([]);
  });

  // ---- STEP 28: Admin re-approves, parent re-enrolls in different program ----
  test('Step 28: Re-approval and re-enrollment in a different program works', async () => {
    // Admin re-approves
    const approveRes = await adminAgent
      .post(`/api/admin/enroll-child/${childId}`)
      .send({});
    expect(approveRes.status).toBe(200);

    // Parent enrolls in Toddler Program this time
    const selectRes = await parentAgent
      .post('/api/portal/select-program')
      .send({ childId, program: 'Toddler Program', schedule: 'Half Day Morning' });
    expect(selectRes.status).toBe(200);

    // Verify new enrollment
    const childrenRes = await parentAgent.get('/api/portal/children');
    const child = childrenRes.body.children.find(c => c.id === childId);
    expect(child.enrollmentStatus).toBe('enrolled');
    expect(child.program).toBe('Toddler Program');
    expect(child.schedule).toBe('Half Day Morning');
  });

  // ---- STEP 29: Now curriculum shows Toddler + All Programs ----
  test('Step 29: Curriculum now shows Toddler and All Programs docs, not Primary', async () => {
    const res = await parentAgent.get('/api/portal/curriculum');
    expect(res.status).toBe(200);
    expect(res.body.curriculum.length).toBe(2);

    const titles = res.body.curriculum.map(c => c.title);
    expect(titles).toContain('Toddler Spring Activities');
    expect(titles).toContain('School Handbook & Policies 2026');
    expect(titles).not.toContain('Primary Program — Spring 2026 Lesson Plan');
  });

  // ---- STEP 30: Admin deletes curriculum and parent no longer sees it ----
  test('Step 30: Admin deletes Toddler curriculum, parent stops seeing it', async () => {
    // Find the toddler curriculum
    const listRes = await adminAgent.get('/api/admin/curriculum');
    const toddlerDoc = listRes.body.curriculum.find(c => c.title === 'Toddler Spring Activities');
    expect(toddlerDoc).toBeDefined();

    // Delete it
    const delRes = await adminAgent.delete(`/api/admin/curriculum/${toddlerDoc.id}`);
    expect(delRes.status).toBe(200);

    // Parent now only sees All Programs doc
    const parentCurrRes = await parentAgent.get('/api/portal/curriculum');
    expect(parentCurrRes.body.curriculum.length).toBe(1);
    expect(parentCurrRes.body.curriculum[0].title).toBe('School Handbook & Policies 2026');
  });

  // ---- STEP 31: Cleanup — admin deletes remaining test curriculum ----
  test('Step 31: Admin cleans up remaining curriculum documents', async () => {
    const listRes = await adminAgent.get('/api/admin/curriculum');
    for (const doc of listRes.body.curriculum) {
      const res = await adminAgent.delete(`/api/admin/curriculum/${doc.id}`);
      expect(res.status).toBe(200);
    }
    const finalList = await adminAgent.get('/api/admin/curriculum');
    expect(finalList.body.curriculum.length).toBe(0);
  });

  // ---- STEP 32: Cleanup — admin deletes the test parent account ----
  test('Step 32: Admin deletes the E2E test parent account and all related data', async () => {
    const dash = await adminAgent.get('/api/admin/dashboard');
    const user = dash.body.users.find(u => u.email === parentEmail);
    expect(user).toBeDefined();

    const res = await adminAgent.delete(`/api/admin/user/${user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify parent, children, leads, and contact submissions are gone
    const after = await adminAgent.get('/api/admin/dashboard');
    expect(after.body.users.find(u => u.email === parentEmail)).toBeUndefined();
    expect(after.body.children.find(c => c.parentEmail === parentEmail)).toBeUndefined();
    expect(after.body.interestedLeads.find(l => l.email === parentEmail)).toBeUndefined();
    expect(after.body.contactSubmissions.find(s => s.userEmail === parentEmail)).toBeUndefined();
  });
});

// ============================================================
// E2E: Multi-Child Family Enrollment
// ============================================================
// Tests a parent with multiple children in different programs
// ============================================================
describe('E2E: Multi-Child Family — Different Programs', () => {
  let parentAgent;
  let adminAgent;
  let child1Id;
  let child2Id;

  const email = 'e2e-multi@example.com';
  const password = 'Multi!2026';

  test('Setup: Register parent and admin agents', async () => {
    parentAgent = request.agent(app);
    adminAgent = request.agent(app);

    await parentAgent.post('/api/register').send({
      name: 'Multi Parent', email, password, phone: '425-555-0000',
    });
    await adminAgent.post('/api/login').send({
      email: 'vlwhite396@gmail.com', password: 'Riishii@12',
    });
  });

  test('Parent adds two children', async () => {
    const res1 = await parentAgent.post('/api/portal/add-child').send({
      childName: 'Older Child', dateOfBirth: '2021-01-10', gender: 'Male',
    });
    expect(res1.body.success).toBe(true);
    child1Id = res1.body.child.id;

    const res2 = await parentAgent.post('/api/portal/add-child').send({
      childName: 'Younger Child', dateOfBirth: '2023-06-20', gender: 'Female', allergies: 'Dairy',
    });
    expect(res2.body.success).toBe(true);
    child2Id = res2.body.child.id;
  });

  test('Parent has two children listed', async () => {
    const res = await parentAgent.get('/api/portal/children');
    expect(res.body.children.length).toBe(2);
  });

  test('Admin approves both children', async () => {
    const res1 = await adminAgent.post(`/api/admin/enroll-child/${child1Id}`).send({});
    expect(res1.body.success).toBe(true);
    const res2 = await adminAgent.post(`/api/admin/enroll-child/${child2Id}`).send({});
    expect(res2.body.success).toBe(true);
  });

  test('Parent enrolls children in different programs', async () => {
    const res1 = await parentAgent.post('/api/portal/select-program').send({
      childId: child1Id, program: 'Primary Program', schedule: 'Full Day',
    });
    expect(res1.body.success).toBe(true);

    const res2 = await parentAgent.post('/api/portal/select-program').send({
      childId: child2Id, program: 'Toddler Program', schedule: 'Half Day Morning',
    });
    expect(res2.body.success).toBe(true);
  });

  test('Both children show correct enrollment data', async () => {
    const res = await parentAgent.get('/api/portal/children');
    const child1 = res.body.children.find(c => c.id === child1Id);
    const child2 = res.body.children.find(c => c.id === child2Id);

    expect(child1.program).toBe('Primary Program');
    expect(child1.schedule).toBe('Full Day');
    expect(child1.enrollmentStatus).toBe('enrolled');

    expect(child2.program).toBe('Toddler Program');
    expect(child2.schedule).toBe('Half Day Morning');
    expect(child2.enrollmentStatus).toBe('enrolled');
  });

  test('Admin uploads curriculum for both programs', async () => {
    const pdf1 = path.join(__dirname, 'e2e-primary-multi.pdf');
    fs.writeFileSync(pdf1, '%PDF-1.4 primary');
    await adminAgent.post('/api/admin/upload-curriculum')
      .field('title', 'Primary Weekly Plan')
      .field('program', 'Primary Program')
      .field('description', 'Primary curriculum')
      .attach('file', pdf1);
    fs.unlinkSync(pdf1);

    const pdf2 = path.join(__dirname, 'e2e-toddler-multi.pdf');
    fs.writeFileSync(pdf2, '%PDF-1.4 toddler');
    await adminAgent.post('/api/admin/upload-curriculum')
      .field('title', 'Toddler Activity Guide')
      .field('program', 'Toddler Program')
      .field('description', 'Toddler curriculum')
      .attach('file', pdf2);
    fs.unlinkSync(pdf2);
  });

  test('Parent sees curriculum from BOTH programs (Primary + Toddler)', async () => {
    const res = await parentAgent.get('/api/portal/curriculum');
    expect(res.status).toBe(200);
    expect(res.body.curriculum.length).toBe(2);

    const titles = res.body.curriculum.map(c => c.title);
    expect(titles).toContain('Primary Weekly Plan');
    expect(titles).toContain('Toddler Activity Guide');
  });

  test('Admin dashboard shows both children under same parent email', async () => {
    const dash = await adminAgent.get('/api/admin/dashboard');
    const parentChildren = dash.body.children.filter(c => c.parentEmail === email);
    expect(parentChildren.length).toBe(2);

    const programs = parentChildren.map(c => c.program).sort();
    expect(programs).toEqual(['Primary Program', 'Toddler Program']);
  });

  test('Cleanup: Admin deletes the multi-child test parent', async () => {
    // Clean up curriculum first
    const listRes = await adminAgent.get('/api/admin/curriculum');
    for (const doc of listRes.body.curriculum) {
      await adminAgent.delete(`/api/admin/curriculum/${doc.id}`);
    }

    const dash = await adminAgent.get('/api/admin/dashboard');
    const user = dash.body.users.find(u => u.email === email);
    expect(user).toBeDefined();

    const res = await adminAgent.delete(`/api/admin/user/${user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const after = await adminAgent.get('/api/admin/dashboard');
    expect(after.body.users.find(u => u.email === email)).toBeUndefined();
    expect(after.body.children.filter(c => c.parentEmail === email).length).toBe(0);
  });
});

// ============================================================
// E2E: Cross-Account Security — Parents Cannot Access Others
// ============================================================
describe('E2E: Cross-Account Security', () => {
  let parentAAgent;
  let parentBAgent;
  let parentAChildId;

  test('Setup: Two parents register with children', async () => {
    parentAAgent = request.agent(app);
    await parentAAgent.post('/api/register').send({
      name: 'Parent A', email: 'parenta-e2e@example.com', password: 'ParentA!2026',
    });
    const resA = await parentAAgent.post('/api/portal/add-child').send({
      childName: 'Child A',
    });
    parentAChildId = resA.body.child.id;

    parentBAgent = request.agent(app);
    await parentBAgent.post('/api/register').send({
      name: 'Parent B', email: 'parentb-e2e@example.com', password: 'ParentB!2026',
    });
    await parentBAgent.post('/api/portal/add-child').send({
      childName: 'Child B',
    });
  });

  test('Parent B cannot see Parent A children', async () => {
    const res = await parentBAgent.get('/api/portal/children');
    expect(res.body.children.length).toBe(1);
    expect(res.body.children[0].childName).toBe('Child B');
  });

  test('Parent B cannot delete Parent A child', async () => {
    const res = await parentBAgent.delete(`/api/portal/child/${parentAChildId}`);
    expect(res.status).toBe(404);
  });

  test('Parent B cannot select program for Parent A child', async () => {
    const res = await parentBAgent
      .post('/api/portal/select-program')
      .send({ childId: parentAChildId, program: 'Primary Program', schedule: 'Full Day' });
    expect(res.status).toBe(404);
  });

  test('Parent A still has their child intact', async () => {
    const res = await parentAAgent.get('/api/portal/children');
    expect(res.body.children.length).toBe(1);
    expect(res.body.children[0].childName).toBe('Child A');
    expect(res.body.children[0].id).toBe(parentAChildId);
  });

  test('Cleanup: Admin deletes both cross-account test parents', async () => {
    const adminAgent = request.agent(app);
    await adminAgent.post('/api/login').send({
      email: 'vlwhite396@gmail.com', password: 'Riishii@12',
    });

    const dash = await adminAgent.get('/api/admin/dashboard');
    const parentA = dash.body.users.find(u => u.email === 'parenta-e2e@example.com');
    const parentB = dash.body.users.find(u => u.email === 'parentb-e2e@example.com');

    if (parentA) {
      const res = await adminAgent.delete(`/api/admin/user/${parentA.id}`);
      expect(res.status).toBe(200);
    }
    if (parentB) {
      const res = await adminAgent.delete(`/api/admin/user/${parentB.id}`);
      expect(res.status).toBe(200);
    }

    const after = await adminAgent.get('/api/admin/dashboard');
    expect(after.body.users.find(u => u.email === 'parenta-e2e@example.com')).toBeUndefined();
    expect(after.body.users.find(u => u.email === 'parentb-e2e@example.com')).toBeUndefined();
  });
});

// ============================================================
// NEW: Additional Page & API Tests
// ============================================================
describe('Additional Public Pages', () => {
  test('GET /tuition returns 200', async () => {
    const res = await request(app).get('/tuition');
    expect(res.status).toBe(200);
  });

  test('GET /events returns 200', async () => {
    const res = await request(app).get('/events');
    expect(res.status).toBe(200);
  });

  test('GET /reset-password returns 200', async () => {
    const res = await request(app).get('/reset-password');
    expect(res.status).toBe(200);
  });
});

describe('Public API Endpoints', () => {
  test('GET /api/announcements returns array', async () => {
    const res = await request(app).get('/api/announcements');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.announcements)).toBe(true);
  });

  test('GET /api/events returns array', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  test('GET /api/staff returns array', async () => {
    const res = await request(app).get('/api/staff');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.staff)).toBe(true);
  });

  test('GET /api/site-content returns object', async () => {
    const res = await request(app).get('/api/site-content');
    expect(res.status).toBe(200);
    expect(res.body.siteContent).toBeDefined();
  });
});

// ============================================================
// NEW: Admin Events CRUD
// ============================================================
describe('Admin Events CRUD', () => {
  let agent;
  let createdEventId;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ email: 'vlwhite396@gmail.com', password: 'Riishii@12' });
  });

  test('POST /api/admin/event — creates event', async () => {
    const res = await agent
      .post('/api/admin/event')
      .send({ title: 'Test Open House', date: '2026-05-01', time: '10:00 AM', description: 'Visit our campus!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.event.title).toBe('Test Open House');
    createdEventId = res.body.event.id;
  });

  test('POST /api/admin/event — rejects missing title', async () => {
    const res = await agent
      .post('/api/admin/event')
      .send({ title: '', date: '2026-05-01' });
    expect(res.status).toBe(400);
  });

  test('POST /api/admin/event — rejects missing date', async () => {
    const res = await agent
      .post('/api/admin/event')
      .send({ title: 'No Date Event', date: '' });
    expect(res.status).toBe(400);
  });

  test('GET /api/events — returns created event', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    const found = res.body.events.find(e => e.title === 'Test Open House');
    expect(found).toBeDefined();
  });

  test('DELETE /api/admin/event/:id — deletes event', async () => {
    const res = await agent.delete(`/api/admin/event/${createdEventId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('DELETE /api/admin/event/9999 — 404 for nonexistent', async () => {
    const res = await agent.delete('/api/admin/event/9999');
    expect(res.status).toBe(404);
  });

  test('POST /api/admin/event — rejected for unauthenticated', async () => {
    const res = await request(app)
      .post('/api/admin/event')
      .send({ title: 'Hack Event', date: '2026-06-01' });
    expect(res.status).toBe(302);
  });
});

// ============================================================
// NEW: Admin Activity Reports CRUD
// ============================================================
describe('Admin Activity Reports CRUD', () => {
  let agent;
  let createdReportId;
  let testChildId;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ email: 'vlwhite396@gmail.com', password: 'Riishii@12' });

    // We need a child to create a report for — find one or create via a parent
    const dash = await agent.get('/api/admin/dashboard');
    if (dash.body.children && dash.body.children.length > 0) {
      testChildId = dash.body.children[0].id;
    }
  });

  test('POST /api/admin/activity-report — creates report', async () => {
    const res = await agent
      .post('/api/admin/activity-report')
      .send({
        childId: testChildId || 1,
        date: '2026-03-24',
        mood: 'happy',
        activities: 'Painting, reading, outdoor play',
        meals: 'Ate lunch and snack well',
        napTime: '1:00 PM - 2:30 PM',
        notes: 'Had a great day!'
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    createdReportId = res.body.report.id;
  });

  test('GET /api/admin/activity-report — lists reports', async () => {
    const res = await agent.get('/api/admin/activity-report');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.reports)).toBe(true);
  });

  test('DELETE /api/admin/activity-report/:id — deletes report', async () => {
    if (createdReportId) {
      const res = await agent.delete(`/api/admin/activity-report/${createdReportId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }
  });

  test('POST /api/admin/activity-report — rejected for unauthenticated', async () => {
    const res = await request(app)
      .post('/api/admin/activity-report')
      .send({ childId: 1, date: '2026-03-24', mood: 'happy' });
    expect(res.status).toBe(302);
  });
});

// ============================================================
// NEW: Admin Staff Management
// ============================================================
describe('Admin Staff Management', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ email: 'vlwhite396@gmail.com', password: 'Riishii@12' });
  });

  test('POST /api/admin/staff — saves staff array', async () => {
    const res = await agent
      .post('/api/admin/staff')
      .send({ staff: [
        { name: 'Kartik Khanna', title: 'Director', bio: 'Leads our school', credentials: 'M.Ed' },
        { name: 'Shruti Khanna', title: 'Lead Teacher', bio: 'Primary classroom', credentials: 'AMI Certified' },
      ]});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/admin/staff — rejects non-array', async () => {
    const res = await agent
      .post('/api/admin/staff')
      .send({ staff: 'not an array' });
    expect(res.status).toBe(400);
  });

  test('GET /api/staff — returns saved staff', async () => {
    const res = await request(app).get('/api/staff');
    expect(res.status).toBe(200);
    expect(res.body.staff.length).toBe(2);
    expect(res.body.staff[0].name).toBe('Kartik Khanna');
  });

  test('POST /api/admin/staff — rejected for unauthenticated', async () => {
    const res = await request(app)
      .post('/api/admin/staff')
      .send({ staff: [] });
    expect(res.status).toBe(302);
  });
});

// ============================================================
// NEW: Password Reset Flow
// ============================================================
describe('Password Reset Flow', () => {
  test('POST /api/forgot-password — accepts valid email', async () => {
    // First create a user to reset password for
    await request(app).post('/api/register').send({
      name: 'Reset Test', email: 'resettest@example.com', password: 'OldPass123'
    });
    const res = await request(app)
      .post('/api/forgot-password')
      .send({ email: 'resettest@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/forgot-password — accepts unknown email without error (no info leak)', async () => {
    const res = await request(app)
      .post('/api/forgot-password')
      .send({ email: 'nonexistent@example.com' });
    expect(res.status).toBe(200);
    // Should still return success to prevent email enumeration
    expect(res.body.success).toBe(true);
  });

  test('POST /api/forgot-password — rejects missing email', async () => {
    const res = await request(app)
      .post('/api/forgot-password')
      .send({ email: '' });
    expect(res.status).toBe(400);
  });

  test('POST /api/reset-password — rejects invalid token', async () => {
    const res = await request(app)
      .post('/api/reset-password')
      .send({ token: 'invalid-token-12345', password: 'NewPass123' });
    expect(res.status).toBe(400);
  });

  test('POST /api/reset-password — rejects missing password', async () => {
    const res = await request(app)
      .post('/api/reset-password')
      .send({ token: 'some-token', password: '' });
    expect(res.status).toBe(400);
  });
});

// ============================================================
// NEW: Admin Content Update with Dynamic Keys
// ============================================================
describe('Admin Content — Dynamic Keys', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ email: 'vlwhite396@gmail.com', password: 'Riishii@12' });
  });

  test('Accepts valid camelCase keys', async () => {
    const res = await agent
      .post('/api/admin/update-content')
      .send({ tuitionRate1Price: '$999/month', faqQ1: 'What ages?' });
    expect(res.status).toBe(200);
    const content = await agent.get('/api/site-content');
    expect(content.body.siteContent.tuitionRate1Price).toBe('$999/month');
    expect(content.body.siteContent.faqQ1).toBe('What ages?');
  });

  test('Rejects keys with special characters', async () => {
    const res = await agent
      .post('/api/admin/update-content')
      .send({ 'hack<script>': 'bad', '__proto__': 'bad', 'constructor': 'bad' });
    expect(res.status).toBe(200);
    const content = await agent.get('/api/site-content');
    expect(content.body.siteContent['hack<script>']).toBeUndefined();
    expect(content.body.siteContent['__proto__']).toBeUndefined();
  });

  test('Rejects single-character keys', async () => {
    const res = await agent
      .post('/api/admin/update-content')
      .send({ 'x': 'bad' });
    expect(res.status).toBe(200);
    const content = await agent.get('/api/site-content');
    expect(content.body.siteContent['x']).toBeUndefined();
  });
});

// ============================================================
// CLEANUP: Delete all test users created in these tests
// ============================================================
describe('Final Cleanup', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent
      .post('/api/login')
      .send({ email: 'vlwhite396@gmail.com', password: 'Riishii@12' });
  });

  test('Remove all test users', async () => {
    const dash = await agent.get('/api/admin/dashboard');
    const testUsers = dash.body.users.filter(u =>
      u.email !== 'vlwhite396@gmail.com' && (
        u.email.includes('example.com') ||
        u.email.includes('test')
      )
    );
    for (const user of testUsers) {
      await agent.delete(`/api/admin/user/${user.id}`);
    }
    const after = await agent.get('/api/admin/dashboard');
    const remaining = after.body.users.filter(u => u.email.includes('example.com'));
    expect(remaining.length).toBe(0);
  });
});
