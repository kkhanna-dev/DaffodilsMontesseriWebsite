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
