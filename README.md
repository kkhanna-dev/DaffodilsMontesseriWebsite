# Daffodils Montessori Website

> **Live Site:** [https://daffodilsmontessori.com](https://daffodilsmontessori.com) *(update this link after deployment)*

The official website for Daffodils Montessori school located at 5051 86th Ave NE, Marysville, WA 98270.

---

## What This Website Does

The website serves three audiences:

1. **Families** -- Browse the school, view programs and tuition, check events, book a tour, and apply for enrollment.
2. **Parents** -- Log in to a portal to manage children, view daily activity reports, download curriculum, and pay tuition online.
3. **Admins** -- Manage everything from a dashboard: leads, enrollments, tours, programs, curriculum, events, announcements, and daily reports.

---

## Public Pages

| Page | Description |
|------|-------------|
| Home | Hero section, announcements banner, trust badges, program overview, testimonials |
| About | School story and Montessori philosophy |
| Programs | Toddler (2-3), Primary (3-5), and Kindergarten (5-6) program details |
| Our Staff | Team bios, photos, and credentials |
| Gallery | Photo gallery of the school and activities |
| Tuition | Tuition rates pulled from admin-created programs, plus online payment for logged-in parents |
| Events | School calendar with holidays, conferences, and field trips |
| Contact | Contact form, tour booking, FAQ, Google Map, and school info |
| Enrollment | Application form with program dropdown populated from admin-created programs |

---

## Parent Portal

When parents register and log in they can:

- Add children with DOB, allergies, medical notes, and emergency contacts
- View daily activity reports from teachers
- Download curriculum PDFs for their child's program
- See upcoming events and announcements
- Pay tuition online via Stripe and view payment history

---

## Admin Dashboard

Accessible at `/admin` after logging in as an admin. Tabs include:

| Tab | What It Does |
|-----|-------------|
| Leads | Contact form submissions and interested families |
| Contact | Inquiries from logged-in parents -- mark as reviewed or contacted |
| Enrollments | Manage applications -- approve, waitlist, or decline |
| Tours | Tour booking requests from the contact page |
| Children | Approve or unenroll children |
| Accounts | View and manage parent accounts |
| Programs | Create programs with name, age range, schedule, and tuition rate. These drive the Tuition page, Enrollment form, and Curriculum uploads. |
| Curriculum | Upload PDF documents per program |
| Daily Reports | Post daily activity reports for enrolled children |
| Events | Create calendar events (general, holiday, conference, field trip) |
| Announcements | Post news that appears on the homepage and parent portals |

### Inline Editing

Admins see a green pen button on every public page. Click it to enter edit mode -- then click any text to change it or click camera icons to upload new images. Changes save automatically.

---

## Tech Stack

- **Backend:** Node.js + Express 5
- **Data:** JSON file-based storage (`data.json`)
- **Auth:** Session-based with bcrypt password hashing
- **Payments:** Stripe integration
- **Email:** Nodemailer with Gmail
- **Security:** Helmet CSP, rate limiting, input sanitization, file upload validation
- **Tests:** Jest + Supertest (130 E2E tests)
