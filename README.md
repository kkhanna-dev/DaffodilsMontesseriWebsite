# Daffodils Montessori Website

The public website for Daffodils Montessori, 5051 86th Ave NE, Marysville, WA 98270.

The site is hosted free on GitHub Pages. Logins, family records, files, and payments live in **Supabase** (a free hosted database with built-in accounts), and card payments go through **Stripe**. There is no server to run.

**First time? Follow [SETUP.md](SETUP.md)** to connect Supabase, make yourself an admin, and (optionally) switch on Stripe.

## What it does

**Public website:** Home, About, Staff, Programs, Summer Camp, Tuition, Gallery, Events calendar, Lunch Menu, Handbook & Policies, Careers, Contact with tour booking, an online application, and a Privacy Policy. Prices, events, staff, photos, the menu, job openings, and testimonials come live from the database. Pages include search and link-preview tags, a sitemap, and Google Maps business details.

**Family portal** (`portal.html`), for parents with an account:

- Children: allergies, medical notes, emergency contacts, pickup list
- Documents: upload immunization records and signed forms, with a checklist of what is still needed
- Daily reports, check-in/check-out history, and absence reporting
- Lesson progress by Montessori area (introduced, practicing, mastered)
- Book parent-teacher conferences
- Classroom photos, including families-only photos
- Curriculum, handbook, and blank forms to download
- Pay tuition by card and see payment history
- Today's menu, announcements, events, and messages to the office

**Admin dashboard** (`admin.html`), for school staff:

- Today: check children in and out (with the pickup list and allergies on screen), daily reports, absences
- Inbox: applications, tour requests, messages, job applications
- Families: children and enrollment, family accounts, document review, payments
- Learning: lesson progress, conference time slots, curriculum files
- School: programs and tuition, events, announcements, lunch menu, photos, staff, testimonials, job postings
- **Edit this page**: change any text or photo directly on the public pages

## Where things live

```
docs/                     the website (GitHub Pages serves this folder)
  index.html ...          public pages (about, programs, summer-camp, tuition,
                          gallery, events, menu, policies, careers, privacy, ...)
  login.html              parent/admin login
  register.html           create a family account
  reset-password.html     forgot password
  portal.html             family portal
  admin.html              admin dashboard
  js/config.js            << Supabase keys + Stripe switch
  js/site-data.js         contact info, social links, form email, backup content
  js/api.js               shared login/database helpers
  js/main.js              public pages
  js/auth.js, portal.js, admin.js, menu.js, careers.js
  sitemap.xml, robots.txt search engine files (update the address if you move domains)
  css/styles.css          site styling
  css/app.css             portal, admin, and login styling
  vendor/                 self-hosted icons and the Supabase library
supabase/
  schema.sql              database tables + security rules (run once)
  functions/              Stripe checkout + webhook
.github/workflows/        keeps the free Supabase project from pausing
SETUP.md                  step-by-step setup
```

## Everyday updates

Log in, open the **Admin dashboard**, and use its tabs. For wording and photos on the public pages, open the page while logged in as an admin and click **Edit this page** at the bottom.

Contact details, social links, and the address that receives form emails are in `docs/js/site-data.js` (edit on GitHub with the pencil icon).

## Forms

Contact, tour, and application forms are saved to the Admin dashboard inbox. A copy is also emailed through [FormSubmit](https://formsubmit.co) to the address in `forms.endpoint` in `site-data.js`. The first submission sends a one-time **"Activate Form"** email to that inbox; click it once. To turn email copies off, set `endpoint: ""`.

## Publishing on GitHub Pages (one-time setup)

1. Push this repo to GitHub.
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/docs**, and click **Save**.
4. After a minute the site is live at `https://<your-username>.github.io/DaffodilsMontesseriWebsite/`.

Private repos need GitHub Pro (free with the GitHub Student Developer Pack) to use Pages. A public repo works on any plan; nothing secret lives in `docs/`.

### Custom domain (optional)

To use a domain like `daffodilsmontessori.com`, enter it under **Settings > Pages > Custom domain**, then add the DNS records GitHub shows you at your domain registrar. Tick **Enforce HTTPS** once it is available.

## Previewing locally

Open `docs/index.html` in a browser, or run a tiny local server from the repo folder:

```
npx serve docs
```

## What changed from the old version

The earlier version ran a Node/Express server on Render with a JSON file for data. It now runs on GitHub Pages + Supabase with the same features (parent logins, admin dashboard, daily reports, curriculum files, Stripe payments, inline editing) plus absences, pickup lists, family messages, and waitlists. Every table is protected by row level security, so parents only ever see their own family's records. The old server code is still in the git history.
