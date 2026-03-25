/**
 * End-to-end tests for Daffodils Montessori Website
 *
 * Covers: public pages, public APIs, auth flow, admin CRUD,
 * parent portal, enrollment, tour booking, password reset, and security.
 *
 * Uses Jest + supertest with agent() for cookie/session persistence.
 * NODE_ENV=test raises rate-limit ceilings so tests are not throttled.
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Force test environment before requiring app (rate limits are relaxed)
process.env.NODE_ENV = 'test';

const app = require('../server');

// ---------------------------------------------------------------------------
// Helpers & constants
// ---------------------------------------------------------------------------

const TEST_USER_EMAIL = 'test-e2e-user@example.com';
const TEST_USER_PASSWORD = 'TestPass123!';
const TEST_USER_NAME = 'E2E Test User';

const ADMIN_EMAIL = 'vlwhite396@gmail.com';
const ADMIN_PASSWORD = 'Riishii@12';

const DATA_FILE = path.join(__dirname, '..', 'data.json');

/** Read data.json directly (bypasses the running app cache). */
function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

/** Write data.json directly. */
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/** Snapshot of data.json taken before the entire suite runs. */
let dataSnapshot;

// ---------------------------------------------------------------------------
// Suite setup / teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  // Snapshot data so we can restore after suite
  dataSnapshot = fs.readFileSync(DATA_FILE, 'utf8');
});

afterAll(() => {
  // Restore the original data.json so tests leave no trace
  fs.writeFileSync(DATA_FILE, dataSnapshot);
});

// ---------------------------------------------------------------------------
// 1. Public Pages
// ---------------------------------------------------------------------------

describe('Public Pages', () => {
  const pages = [
    '/',
    '/about',
    '/programs',
    '/staff',
    '/gallery',
    '/contact',
    '/enrollment',
    '/tuition',
    '/events',
    '/login',
    '/register',
    '/reset-password',
  ];

  test.each(pages)('GET %s returns 200', async (route) => {
    const res = await request(app).get(route);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

// ---------------------------------------------------------------------------
// 2. Public APIs
// ---------------------------------------------------------------------------

describe('Public APIs', () => {
  test('GET /api/announcements returns valid JSON', async () => {
    const res = await request(app).get('/api/announcements');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('announcements');
    expect(Array.isArray(res.body.announcements)).toBe(true);
  });

  test('GET /api/events returns valid JSON', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('events');
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  test('GET /api/staff returns valid JSON', async () => {
    const res = await request(app).get('/api/staff');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('staff');
    expect(Array.isArray(res.body.staff)).toBe(true);
  });

  test('GET /api/site-content returns valid JSON', async () => {
    const res = await request(app).get('/api/site-content');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('siteContent');
    expect(typeof res.body.siteContent).toBe('object');
  });

  test('GET /api/stripe-config returns JSON', async () => {
    const res = await request(app).get('/api/stripe-config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('publishableKey');
  });
});

// ---------------------------------------------------------------------------
// 3. Auth Flow (register, login, me, logout)
// ---------------------------------------------------------------------------

describe('Auth Flow', () => {
  const agent = request.agent(app);

  test('Register a new user', async () => {
    const res = await agent
      .post('/api/register')
      .send({
        name: TEST_USER_NAME,
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        phone: '555-0100',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.redirect).toBe('/portal');
  });

  test('GET /api/auth/me returns user after register', async () => {
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(TEST_USER_EMAIL);
    expect(res.body.user.role).toBe('parent');
  });

  test('Logout via GET /logout', async () => {
    const res = await agent.get('/logout');
    // Express redirects to /
    expect(res.status).toBe(302);
  });

  test('GET /api/auth/me returns 401 after logout', async () => {
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('Login with newly created user', async () => {
    const res = await agent
      .post('/api/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.redirect).toBe('/portal');
  });

  test('Duplicate registration is rejected', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({
        name: 'Dup User',
        email: TEST_USER_EMAIL,
        password: 'AnotherPass1!',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test('Login with wrong password is rejected', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: TEST_USER_EMAIL, password: 'WrongPassword' });
    expect(res.status).toBe(401);
  });

  test('Register with missing fields is rejected', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
  });

  test('Register with short password is rejected', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({ name: 'Short', email: 'short@test.com', password: '12' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 characters/);
  });

  test('Login with invalid email format is rejected', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'not-an-email', password: 'whatever' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 4. Admin Login
// ---------------------------------------------------------------------------

describe('Admin Login', () => {
  const adminAgent = request.agent(app);

  test('Login as admin', async () => {
    const res = await adminAgent
      .post('/api/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.redirect).toBe('/admin');
  });

  test('GET /api/auth/me shows admin role', async () => {
    const res = await adminAgent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  test('GET /admin page returns 200 for admin', async () => {
    const res = await adminAgent.get('/admin');
    expect(res.status).toBe(200);
  });

  test('GET /api/admin/dashboard returns data', async () => {
    const res = await adminAgent.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(res.body).toHaveProperty('enrollments');
    expect(res.body).toHaveProperty('announcements');
    expect(res.body).toHaveProperty('events');
    expect(res.body).toHaveProperty('staff');
  });
});

// ---------------------------------------------------------------------------
// 5. Admin CRUD
// ---------------------------------------------------------------------------

describe('Admin CRUD', () => {
  const adminAgent = request.agent(app);

  beforeAll(async () => {
    await adminAgent
      .post('/api/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  });

  // --- Announcements ---
  describe('Announcements', () => {
    let announcementId;

    test('Create announcement', async () => {
      const res = await adminAgent
        .post('/api/admin/announcement')
        .send({ title: 'E2E Test Announcement', text: 'Test body text', date: '2026-03-24' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      announcementId = res.body.announcement.id;
    });

    test('Announcement appears in public API', async () => {
      const res = await request(app).get('/api/announcements');
      const found = res.body.announcements.find(a => a.id === announcementId);
      expect(found).toBeDefined();
      expect(found.title).toBe('E2E Test Announcement');
    });

    test('Delete announcement', async () => {
      const res = await adminAgent.delete(`/api/admin/announcement/${announcementId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Deleted announcement no longer in public API', async () => {
      const res = await request(app).get('/api/announcements');
      const found = res.body.announcements.find(a => a.id === announcementId);
      expect(found).toBeUndefined();
    });

    test('Create announcement without title fails', async () => {
      const res = await adminAgent
        .post('/api/admin/announcement')
        .send({ text: 'No title' });
      expect(res.status).toBe(400);
    });
  });

  // --- Events ---
  describe('Events', () => {
    let eventId;

    test('Create event', async () => {
      const res = await adminAgent
        .post('/api/admin/event')
        .send({
          title: 'E2E Test Event',
          description: 'Test event description',
          date: '2026-04-15',
          time: '10:00 AM',
          type: 'general',
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      eventId = res.body.event.id;
    });

    test('Event appears in public API', async () => {
      const res = await request(app).get('/api/events');
      const found = res.body.events.find(e => e.id === eventId);
      expect(found).toBeDefined();
      expect(found.title).toBe('E2E Test Event');
    });

    test('Delete event', async () => {
      const res = await adminAgent.delete(`/api/admin/event/${eventId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Deleted event no longer in public API', async () => {
      const res = await request(app).get('/api/events');
      const found = res.body.events.find(e => e.id === eventId);
      expect(found).toBeUndefined();
    });

    test('Create event without title fails', async () => {
      const res = await adminAgent
        .post('/api/admin/event')
        .send({ description: 'Missing title' });
      expect(res.status).toBe(400);
    });
  });

  // --- Contact Submissions ---
  describe('Contact Submissions', () => {
    let submissionId;

    test('Create a contact submission (via direct data manipulation for admin test)', async () => {
      // We need a logged-in parent with a child to create a contact submission through the API.
      // For a simpler admin-focused test, insert directly and test admin operations.
      const data = readData();
      if (!data.contactSubmissions) data.contactSubmissions = [];
      submissionId = data.contactSubmissions.length > 0
        ? Math.max(...data.contactSubmissions.map(s => s.id)) + 1
        : 1;
      data.contactSubmissions.push({
        id: submissionId,
        userId: 999,
        userName: 'E2E Contact Test',
        userEmail: 'e2e-contact@test.com',
        subject: 'E2E Test Subject',
        message: 'E2E contact message',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      writeData(data);

      // Verify it shows in admin dashboard
      const res = await adminAgent.get('/api/admin/dashboard');
      const found = res.body.contactSubmissions.find(s => s.id === submissionId);
      expect(found).toBeDefined();
    });

    test('Mark contact submission as reviewed', async () => {
      const res = await adminAgent
        .post(`/api/admin/contact-submission/${submissionId}/status`)
        .send({ status: 'reviewed' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Delete contact submission', async () => {
      const res = await adminAgent.delete(`/api/admin/contact-submission/${submissionId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // --- Curriculum Upload (mock file) ---
  describe('Curriculum Upload', () => {
    let curriculumId;
    const testPdfPath = path.join(__dirname, 'test-curriculum.pdf');

    beforeAll(() => {
      // Create a minimal valid PDF for upload testing
      fs.writeFileSync(testPdfPath, '%PDF-1.4 test content');
    });

    afterAll(() => {
      // Remove test PDF
      if (fs.existsSync(testPdfPath)) fs.unlinkSync(testPdfPath);
    });

    test('Upload curriculum file', async () => {
      const res = await adminAgent
        .post('/api/admin/upload-curriculum')
        .field('title', 'E2E Test Curriculum')
        .field('program', 'All Programs')
        .field('description', 'Test curriculum file')
        .attach('file', testPdfPath, { contentType: 'application/pdf' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      curriculumId = res.body.curriculum.id;
    });

    test('Curriculum appears in admin listing', async () => {
      const res = await adminAgent.get('/api/admin/curriculum');
      expect(res.status).toBe(200);
      const found = res.body.curriculum.find(c => c.id === curriculumId);
      expect(found).toBeDefined();
      expect(found.title).toBe('E2E Test Curriculum');
    });

    test('Delete curriculum', async () => {
      const res = await adminAgent.delete(`/api/admin/curriculum/${curriculumId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Upload without title fails', async () => {
      const res = await adminAgent
        .post('/api/admin/upload-curriculum')
        .field('program', 'All Programs')
        .attach('file', testPdfPath, { contentType: 'application/pdf' });
      expect(res.status).toBe(400);
    });

    test('Upload with invalid program fails', async () => {
      const res = await adminAgent
        .post('/api/admin/upload-curriculum')
        .field('title', 'Bad Program')
        .field('program', 'Nonexistent Program')
        .attach('file', testPdfPath, { contentType: 'application/pdf' });
      expect(res.status).toBe(400);
    });
  });

  // --- Site Content ---
  describe('Site Content', () => {
    let originalContent;

    test('Get site content', async () => {
      const res = await adminAgent.get('/api/admin/site-content');
      expect(res.status).toBe(200);
      originalContent = res.body.siteContent;
    });

    test('Update site content', async () => {
      const res = await adminAgent
        .post('/api/admin/update-content')
        .send({ heroTitle: 'E2E Test Title', heroSubtitle: 'E2E Test Subtitle' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.siteContent.heroTitle).toBe('E2E Test Title');
    });

    test('Updated content appears in public API', async () => {
      const res = await request(app).get('/api/site-content');
      expect(res.body.siteContent.heroTitle).toBe('E2E Test Title');
    });

    test('Reset site content', async () => {
      const res = await adminAgent
        .post('/api/admin/update-content')
        .send(originalContent || {});
      expect(res.status).toBe(200);
    });
  });

  // --- Staff ---
  describe('Staff', () => {
    let originalStaff;

    test('Get current staff', async () => {
      const res = await request(app).get('/api/staff');
      expect(res.status).toBe(200);
      originalStaff = res.body.staff;
    });

    test('Update staff', async () => {
      const res = await adminAgent
        .post('/api/admin/staff')
        .send({
          staff: [
            { name: 'E2E Teacher', title: 'Lead Teacher', bio: 'Test bio', credentials: 'MA Education' },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.staff[0].name).toBe('E2E Teacher');
    });

    test('Updated staff appears in public API', async () => {
      const res = await request(app).get('/api/staff');
      expect(res.body.staff[0].name).toBe('E2E Teacher');
    });

    test('Reset staff to original', async () => {
      const res = await adminAgent
        .post('/api/admin/staff')
        .send({ staff: originalStaff || [] });
      expect(res.status).toBe(200);
    });

    test('Staff update with non-array fails', async () => {
      const res = await adminAgent
        .post('/api/admin/staff')
        .send({ staff: 'not-an-array' });
      expect(res.status).toBe(400);
    });
  });

  // --- Activity Reports ---
  describe('Activity Reports', () => {
    let reportId;
    let testChildId;

    beforeAll(async () => {
      // Insert a temporary child for the report
      const data = readData();
      if (!data.children) data.children = [];
      testChildId = data.children.length > 0
        ? Math.max(...data.children.map(c => c.id)) + 1
        : 1;
      data.children.push({
        id: testChildId,
        parentId: 999,
        parentEmail: 'e2e-report-parent@test.com',
        childName: 'E2E Report Child',
        dateOfBirth: '2022-01-01',
        gender: '',
        allergies: '',
        medicalNotes: '',
        emergencyContact: '',
        emergencyPhone: '',
        notes: '',
        createdAt: new Date().toISOString(),
      });
      writeData(data);
    });

    afterAll(async () => {
      // Remove the temp child
      const data = readData();
      data.children = (data.children || []).filter(c => c.id !== testChildId);
      writeData(data);
    });

    test('Create activity report', async () => {
      const res = await adminAgent
        .post('/api/admin/activity-report')
        .send({
          childId: testChildId,
          date: '2026-03-24',
          activities: 'Painting, Reading',
          meals: 'Lunch',
          mood: 'Happy',
          nap: '1 hour',
          notes: 'Great day!',
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      reportId = res.body.report.id;
    });

    test('Report appears in admin listing', async () => {
      const res = await adminAgent.get('/api/admin/activity-reports');
      expect(res.status).toBe(200);
      const found = res.body.activityReports.find(r => r.id === reportId);
      expect(found).toBeDefined();
    });

    test('Delete activity report', async () => {
      const res = await adminAgent.delete(`/api/admin/activity-report/${reportId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Create report without child fails', async () => {
      const res = await adminAgent
        .post('/api/admin/activity-report')
        .send({ date: '2026-03-24' });
      expect(res.status).toBe(400);
    });

    test('Create report for nonexistent child fails', async () => {
      const res = await adminAgent
        .post('/api/admin/activity-report')
        .send({ childId: 999999, date: '2026-03-24' });
      expect(res.status).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Parent Portal Flow
// ---------------------------------------------------------------------------

describe('Parent Portal Flow', () => {
  const parentAgent = request.agent(app);
  let childId;

  beforeAll(async () => {
    // Login as the test user created in Auth Flow
    await parentAgent
      .post('/api/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  });

  test('GET /portal returns 200 for logged-in parent', async () => {
    const res = await parentAgent.get('/portal');
    expect(res.status).toBe(200);
  });

  test('Add a child', async () => {
    const res = await parentAgent
      .post('/api/portal/add-child')
      .send({
        childName: 'E2E Test Child',
        dateOfBirth: '2022-06-15',
        gender: 'Female',
        allergies: 'None',
        medicalNotes: '',
        emergencyContact: 'Test Parent',
        emergencyPhone: '555-0101',
        notes: 'Test child',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.child).toBeDefined();
    childId = res.body.child.id;
  });

  test('Child appears in portal children list', async () => {
    const res = await parentAgent.get('/api/portal/children');
    expect(res.status).toBe(200);
    const found = res.body.children.find(c => c.id === childId);
    expect(found).toBeDefined();
    expect(found.childName).toBe('E2E Test Child');
  });

  test('Child appears in portal data', async () => {
    const res = await parentAgent.get('/api/portal/data');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    const found = res.body.children.find(c => c.id === childId);
    expect(found).toBeDefined();
  });

  test('Submit contact form as logged-in parent', async () => {
    const res = await parentAgent
      .post('/api/contact')
      .send({
        name: TEST_USER_NAME,
        email: TEST_USER_EMAIL,
        phone: '555-0100',
        subject: 'E2E Test Inquiry',
        message: 'This is a test message from E2E tests.',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Contact submission is recorded', async () => {
    const data = readData();
    const found = data.contactSubmissions.find(
      s => s.userEmail === TEST_USER_EMAIL
    );
    expect(found).toBeDefined();
    expect(found.subject).toBe('E2E Test Inquiry');
  });

  test('Duplicate contact form submission is rejected', async () => {
    const res = await parentAgent
      .post('/api/contact')
      .send({
        name: TEST_USER_NAME,
        email: TEST_USER_EMAIL,
        message: 'Duplicate submission',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already submitted/i);
  });

  test('View curriculum (may be empty)', async () => {
    const res = await parentAgent.get('/api/portal/curriculum');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('curriculum');
    expect(Array.isArray(res.body.curriculum)).toBe(true);
  });

  test('View activity reports (may be empty)', async () => {
    const res = await parentAgent.get('/api/portal/activity-reports');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('activityReports');
    expect(Array.isArray(res.body.activityReports)).toBe(true);
  });

  test('View events from public API', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  test('Add child without name fails', async () => {
    const res = await parentAgent
      .post('/api/portal/add-child')
      .send({ dateOfBirth: '2022-01-01' });
    expect(res.status).toBe(400);
  });

  test('Delete child', async () => {
    const res = await parentAgent.delete(`/api/portal/child/${childId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Child is gone after deletion', async () => {
    const res = await parentAgent.get('/api/portal/children');
    const found = res.body.children.find(c => c.id === childId);
    expect(found).toBeUndefined();
  });

  test('Delete nonexistent child returns 404', async () => {
    const res = await parentAgent.delete('/api/portal/child/999999');
    expect(res.status).toBe(404);
  });

  test('View payment history (may be empty)', async () => {
    const res = await parentAgent.get('/api/portal/payments');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('payments');
  });
});

// ---------------------------------------------------------------------------
// 7. Enrollment Flow
// ---------------------------------------------------------------------------

describe('Enrollment Flow', () => {
  const adminAgent = request.agent(app);
  let enrollmentId;

  beforeAll(async () => {
    await adminAgent
      .post('/api/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  });

  test('Submit enrollment application', async () => {
    const res = await request(app)
      .post('/api/enroll')
      .send({
        childName: 'E2E Enrollment Child',
        childAge: '3',
        parentName: 'E2E Enrollment Parent',
        email: 'e2e-enroll@test.com',
        phone: '555-0200',
        program: 'Primary Program',
        startDate: '2026-09-01',
        notes: 'E2E test enrollment',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Enrollment appears in admin dashboard', async () => {
    const res = await adminAgent.get('/api/admin/dashboard');
    const found = res.body.enrollments.find(
      e => e.email === 'e2e-enroll@test.com'
    );
    expect(found).toBeDefined();
    expect(found.status).toBe('pending');
    enrollmentId = found.id;
  });

  test('Admin can update enrollment status', async () => {
    const res = await adminAgent
      .post(`/api/admin/enrollment/${enrollmentId}/status`)
      .send({ status: 'enrolled' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Delete enrollment', async () => {
    const res = await adminAgent.delete(`/api/admin/enrollment/${enrollmentId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Enrollment with missing fields fails', async () => {
    const res = await request(app)
      .post('/api/enroll')
      .send({ childName: 'NoParent' });
    expect(res.status).toBe(400);
  });

  // Cleanup: remove the interested lead created by enrollment
  afterAll(() => {
    const data = readData();
    data.interestedLeads = data.interestedLeads.filter(
      l => l.email !== 'e2e-enroll@test.com'
    );
    writeData(data);
  });
});

// ---------------------------------------------------------------------------
// 8. Tour Booking
// ---------------------------------------------------------------------------

describe('Tour Booking', () => {
  const adminAgent = request.agent(app);
  let tourId;

  beforeAll(async () => {
    await adminAgent
      .post('/api/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  });

  test('Submit tour request', async () => {
    const res = await request(app)
      .post('/api/book-tour')
      .send({
        parentName: 'E2E Tour Parent',
        email: 'e2e-tour@test.com',
        phone: '555-0300',
        tourDate: '2026-05-01',
        tourTime: '10:00 AM',
        childAge: '2',
        notes: 'E2E test tour',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Tour request appears in admin dashboard', async () => {
    const res = await adminAgent.get('/api/admin/dashboard');
    const found = res.body.tourRequests.find(
      t => t.email === 'e2e-tour@test.com'
    );
    expect(found).toBeDefined();
    tourId = found.id;
  });

  test('Delete tour request', async () => {
    const res = await adminAgent.delete(`/api/admin/tour/${tourId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Tour request with missing fields fails', async () => {
    const res = await request(app)
      .post('/api/book-tour')
      .send({ parentName: 'Incomplete' });
    expect(res.status).toBe(400);
  });

  // Cleanup: remove the interested lead
  afterAll(() => {
    const data = readData();
    data.interestedLeads = data.interestedLeads.filter(
      l => l.email !== 'e2e-tour@test.com'
    );
    writeData(data);
  });
});

// ---------------------------------------------------------------------------
// 9. Password Reset
// ---------------------------------------------------------------------------

describe('Password Reset', () => {
  test('Request password reset generates token', async () => {
    const res = await request(app)
      .post('/api/forgot-password')
      .send({ email: TEST_USER_EMAIL });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify token was saved to data
    const data = readData();
    const user = data.users.find(u => u.email === TEST_USER_EMAIL);
    expect(user.resetToken).toBeDefined();
    expect(user.resetTokenExpiry).toBeGreaterThan(Date.now());
  });

  test('Reset password with valid token', async () => {
    const data = readData();
    const user = data.users.find(u => u.email === TEST_USER_EMAIL);
    const token = user.resetToken;

    const res = await request(app)
      .post('/api/reset-password')
      .send({ token, password: 'NewPassword123!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify token is cleared
    const dataAfter = readData();
    const userAfter = dataAfter.users.find(u => u.email === TEST_USER_EMAIL);
    expect(userAfter.resetToken).toBeUndefined();
  });

  test('Can login with new password', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: TEST_USER_EMAIL, password: 'NewPassword123!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Old password no longer works', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
    expect(res.status).toBe(401);
  });

  test('Reset with invalid token fails', async () => {
    const res = await request(app)
      .post('/api/reset-password')
      .send({ token: 'invalid-token-abc', password: 'SomePass123!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid|expired/i);
  });

  test('Reset with short password fails', async () => {
    const res = await request(app)
      .post('/api/reset-password')
      .send({ token: 'anything', password: '12' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 characters/);
  });

  test('Reset without token or password fails', async () => {
    const res = await request(app)
      .post('/api/reset-password')
      .send({});
    expect(res.status).toBe(400);
  });

  test('Forgot password for nonexistent email still returns success (anti-enumeration)', async () => {
    const res = await request(app)
      .post('/api/forgot-password')
      .send({ email: 'nobody@nowhere.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Forgot password with invalid email fails', async () => {
    const res = await request(app)
      .post('/api/forgot-password')
      .send({ email: 'not-valid' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 10. Security Tests
// ---------------------------------------------------------------------------

describe('Security Tests', () => {
  // --- Admin endpoints reject unauthenticated requests ---
  describe('Admin endpoints reject unauthenticated requests', () => {
    test('GET /admin redirects unauthenticated users', async () => {
      const res = await request(app).get('/admin');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    });

    test('GET /api/admin/dashboard rejects unauthenticated users', async () => {
      const res = await request(app).get('/api/admin/dashboard');
      expect(res.status).toBe(403);
    });

    test('POST /api/admin/announcement rejects unauthenticated users', async () => {
      const res = await request(app)
        .post('/api/admin/announcement')
        .send({ title: 'Hack', text: 'Should fail' });
      expect(res.status).toBe(403);
    });

    test('POST /api/admin/event rejects unauthenticated users', async () => {
      const res = await request(app)
        .post('/api/admin/event')
        .send({ title: 'Hack Event', date: '2026-01-01' });
      expect(res.status).toBe(403);
    });

    test('POST /api/admin/staff rejects unauthenticated users', async () => {
      const res = await request(app)
        .post('/api/admin/staff')
        .send({ staff: [] });
      expect(res.status).toBe(403);
    });

    test('POST /api/admin/update-content rejects unauthenticated users', async () => {
      const res = await request(app)
        .post('/api/admin/update-content')
        .send({ heroTitle: 'Hack' });
      expect(res.status).toBe(403);
    });

    test('DELETE /api/admin/announcement/1 rejects unauthenticated', async () => {
      const res = await request(app).delete('/api/admin/announcement/1');
      expect(res.status).toBe(403);
    });

    test('GET /api/admin/payments rejects unauthenticated with 403', async () => {
      const res = await request(app).get('/api/admin/payments');
      expect(res.status).toBe(403);
    });
  });

  // --- Admin endpoints reject non-admin users ---
  describe('Admin endpoints reject non-admin users', () => {
    const parentAgent = request.agent(app);

    beforeAll(async () => {
      // Login as regular parent
      await parentAgent
        .post('/api/login')
        .send({ email: TEST_USER_EMAIL, password: 'NewPassword123!' });
    });

    test('GET /admin redirects non-admin to /login', async () => {
      const res = await parentAgent.get('/admin');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    });

    test('GET /api/admin/dashboard rejects non-admin', async () => {
      const res = await parentAgent.get('/api/admin/dashboard');
      expect(res.status).toBe(403);
    });

    test('POST /api/admin/announcement rejects non-admin', async () => {
      const res = await parentAgent
        .post('/api/admin/announcement')
        .send({ title: 'Sneaky', text: 'Nope' });
      expect(res.status).toBe(403);
    });

    test('DELETE /api/admin/event/1 rejects non-admin', async () => {
      const res = await parentAgent.delete('/api/admin/event/1');
      expect(res.status).toBe(403);
    });

    test('GET /api/admin/payments rejects non-admin with 403', async () => {
      const res = await parentAgent.get('/api/admin/payments');
      expect(res.status).toBe(403);
    });
  });

  // --- Auth-required portal endpoints reject unauthenticated ---
  describe('Portal endpoints reject unauthenticated requests', () => {
    test('GET /portal redirects to login', async () => {
      const res = await request(app).get('/portal');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login');
    });

    test('GET /api/portal/data rejects unauthenticated', async () => {
      const res = await request(app).get('/api/portal/data');
      expect(res.status).toBe(401);
    });

    test('POST /api/portal/add-child rejects unauthenticated', async () => {
      const res = await request(app)
        .post('/api/portal/add-child')
        .send({ childName: 'Hacked Child' });
      expect(res.status).toBe(401);
    });

    test('GET /api/portal/children rejects unauthenticated', async () => {
      const res = await request(app).get('/api/portal/children');
      expect(res.status).toBe(401);
    });

    test('DELETE /api/portal/child/1 rejects unauthenticated', async () => {
      const res = await request(app).delete('/api/portal/child/1');
      expect(res.status).toBe(401);
    });

    test('GET /api/portal/curriculum rejects unauthenticated', async () => {
      const res = await request(app).get('/api/portal/curriculum');
      expect(res.status).toBe(401);
    });

    test('GET /api/portal/activity-reports rejects unauthenticated', async () => {
      const res = await request(app).get('/api/portal/activity-reports');
      expect(res.status).toBe(401);
    });

    test('GET /api/auth/me returns 401 unauthenticated', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    test('POST /api/create-payment-intent returns 401 unauthenticated', async () => {
      const res = await request(app)
        .post('/api/create-payment-intent')
        .send({ amount: 100 });
      expect(res.status).toBe(401);
    });

    test('GET /api/portal/payments returns 401 unauthenticated', async () => {
      const res = await request(app).get('/api/portal/payments');
      expect(res.status).toBe(401);
    });
  });

  // --- XSS sanitization ---
  describe('XSS sanitization', () => {
    const adminAgent = request.agent(app);

    beforeAll(async () => {
      await adminAgent
        .post('/api/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    });

    test('Script tags are stripped from announcement title', async () => {
      const res = await adminAgent
        .post('/api/admin/announcement')
        .send({
          title: '<script>alert("xss")</script>Test',
          text: 'Clean text',
        });
      expect(res.status).toBe(200);
      expect(res.body.announcement.title).not.toContain('<script>');
      expect(res.body.announcement.title).not.toContain('</script>');

      // Cleanup
      await adminAgent.delete(`/api/admin/announcement/${res.body.announcement.id}`);
    });

    test('Script tags are stripped from event description', async () => {
      const res = await adminAgent
        .post('/api/admin/event')
        .send({
          title: 'Safe Title',
          description: '<img onerror=alert(1) src=x>Bad',
          date: '2026-04-01',
        });
      expect(res.status).toBe(200);
      expect(res.body.event.description).not.toContain('<');
      expect(res.body.event.description).not.toContain('>');

      // Cleanup
      await adminAgent.delete(`/api/admin/event/${res.body.event.id}`);
    });

    test('Script tags are stripped from site content updates', async () => {
      const res = await adminAgent
        .post('/api/admin/update-content')
        .send({ testXssField: '<script>document.cookie</script>Payload' });
      expect(res.status).toBe(200);
      expect(res.body.siteContent.testXssField).not.toContain('<script>');

      // Cleanup: remove the test field
      const data = readData();
      delete data.siteContent.testXssField;
      writeData(data);
    });

    test('Script tags are stripped from staff bios', async () => {
      const res = await adminAgent
        .post('/api/admin/staff')
        .send({
          staff: [{ name: '<b>Bold</b>', title: 'Test', bio: '<script>xss</script>', credentials: '' }],
        });
      expect(res.status).toBe(200);
      expect(res.body.staff[0].name).not.toContain('<');
      expect(res.body.staff[0].bio).not.toContain('<script>');

      // Reset staff
      await adminAgent.post('/api/admin/staff').send({ staff: [] });
    });
  });

  // --- SQL injection-like strings don't break anything ---
  describe('SQL injection-like strings are handled safely', () => {
    test('Login with SQL injection attempt', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({ email: "' OR 1=1 --", password: "' OR 1=1 --" });
      expect(res.status).toBe(400); // invalid email format
    });

    test('Contact form with SQL injection attempt', async () => {
      const res = await request(app)
        .post('/api/contact')
        .send({
          name: "Robert'; DROP TABLE users;--",
          email: 'bobby@tables.com',
          message: "'; DELETE FROM data;--",
        });
      // Should succeed without breaking the server (it stores in JSON, not SQL)
      expect([200, 400]).toContain(res.status);
    });

    test('Enrollment with SQL injection attempt', async () => {
      const res = await request(app)
        .post('/api/enroll')
        .send({
          childName: "'; DROP TABLE students;--",
          parentName: 'Bobby Tables',
          email: 'bobby@tables.com',
          program: "' UNION SELECT * FROM users;--",
        });
      expect(res.status).toBe(200);

      // Cleanup
      const data = readData();
      data.enrollments = data.enrollments.filter(e => e.email !== 'bobby@tables.com');
      data.interestedLeads = data.interestedLeads.filter(l => l.email !== 'bobby@tables.com');
      writeData(data);
    });

    test('Server still responds after injection attempts', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
    });
  });

  // --- Helmet security headers ---
  describe('Security headers', () => {
    test('Response includes security headers from Helmet', async () => {
      const res = await request(app).get('/');
      // Helmet sets various headers
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// 11. Cleanup - Delete ALL test data
// ---------------------------------------------------------------------------

describe('Cleanup', () => {
  test('Remove test user and all associated data', async () => {
    const data = readData();

    // Remove test user
    data.users = data.users.filter(u => u.email !== TEST_USER_EMAIL);

    // Remove any children for test user
    data.children = (data.children || []).filter(
      c => c.parentEmail !== TEST_USER_EMAIL
    );

    // Remove contact submissions for test user
    data.contactSubmissions = (data.contactSubmissions || []).filter(
      s => s.userEmail !== TEST_USER_EMAIL
    );

    // Remove interested leads from test
    data.interestedLeads = data.interestedLeads.filter(
      l => l.email !== TEST_USER_EMAIL && l.email !== 'e2e-enroll@test.com' && l.email !== 'e2e-tour@test.com'
    );

    // Remove test enrollments
    data.enrollments = data.enrollments.filter(
      e => e.email !== 'e2e-enroll@test.com'
    );

    // Remove test tour requests
    data.tourRequests = data.tourRequests.filter(
      t => t.email !== 'e2e-tour@test.com'
    );

    // Remove test contact submissions
    data.contactSubmissions = (data.contactSubmissions || []).filter(
      s => s.userEmail !== 'e2e-contact@test.com'
    );

    // Remove any leftover test children
    data.children = (data.children || []).filter(
      c => c.parentEmail !== 'e2e-report-parent@test.com'
    );

    writeData(data);

    // Verify test user is gone
    const dataAfter = readData();
    const testUser = dataAfter.users.find(u => u.email === TEST_USER_EMAIL);
    expect(testUser).toBeUndefined();
  });

  test('Admin user still exists after cleanup', () => {
    const data = readData();
    const admin = data.users.find(u => u.email === ADMIN_EMAIL);
    expect(admin).toBeDefined();
    expect(admin.role).toBe('admin');
  });
});
