# Daffodils Montessori Website

Your complete guide to running and managing the Daffodils Montessori school website. This guide is written in plain language -- no technical background needed!

---

## What Is This Website?

This is the official website for Daffodils Montessori school. It serves three main purposes:

1. **Public-facing website** -- Families can learn about your school, view programs, see tuition rates, browse the gallery, check the events calendar, and apply for enrollment.
2. **Parent Portal** -- Registered parents can log in to manage their children, view curriculum documents, read daily activity reports, see upcoming events, and make tuition payments online.
3. **Admin Dashboard** -- You (the school administrators) can manage everything from one place: leads, enrollments, tour requests, parent accounts, children, curriculum uploads, announcements, daily reports, events, and contact form submissions.

---

## Features

### Public Pages
- **Home** -- Welcome page with hero section, announcements banner, trust badges (State Licensed, CPR Certified, etc.), program overview, testimonials, and calls to action
- **About** -- Your school's story and Montessori teaching philosophy
- **Programs** -- Details on the Toddler Program (ages 2-3), Primary Program (ages 3-5), and Kindergarten Program (ages 5-6)
- **Our Staff** -- Meet the Khanna family and your teaching team, with photos, titles, bios, and credentials
- **Gallery** -- Photo gallery of your school and activities
- **Tuition** -- Tuition rates for each program, plus an online payment form for logged-in parents
- **Events Calendar** -- Upcoming school events, holidays, conferences, and field trips displayed in a visual calendar
- **Contact** -- Contact form, school address, phone number, email, hours, FAQ section, and an embedded Google Map
- **Enrollment** -- Application form for new families, plus a tour booking form

### Parent Portal
When parents create an account and log in, they get access to:
- **Overview** -- Enrollment status, school hours, contact info, and location
- **Add Children** -- Register their children with name, date of birth, allergies, medical notes, and emergency contacts
- **Daily Activity Reports** -- View daily reports written by teachers (activities, meals, mood, nap time, notes)
- **Curriculum** -- Download curriculum PDF documents relevant to their child's program
- **Upcoming Events** -- See what school events are coming up
- **Announcements** -- Read the latest news and updates from the school
- **Tuition Payments** -- Make online tuition payments with a credit or debit card via Stripe, and view their full payment history

### Admin Dashboard
When you log in as admin, you get a full management dashboard with these tabs:
- **Leads** -- People who filled out the contact form or showed interest (great for follow-up calls)
- **Contact Submissions** -- Inquiries from logged-in parents; mark them as reviewed or contacted
- **Enrollments** -- Enrollment applications; change status to pending, enrolled, waitlisted, or declined
- **Tours** -- Tour request bookings; call to confirm dates and times
- **Children** -- All children in the system; approve or unenroll children
- **Accounts** -- All registered parent accounts with their details
- **Curriculum** -- Upload PDF curriculum documents per program (Toddler, Primary, Kindergarten, Before & After Care, or All Programs)
- **Daily Reports** -- Create daily activity reports for individual children (activities, meals, mood, nap, notes)
- **Events** -- Create and manage calendar events (general, holiday, conference, field trip)
- **Announcements** -- Post news and updates that appear on the homepage banner and in every parent's portal

### Inline Editing (No Coding Required!)
- A **green pen button** appears in the bottom-right corner of every page when you are logged in as admin
- Click it to enter edit mode, then click any text on the page to change it -- changes save automatically
- Click the **camera icon** on images to upload new photos
- Works on every public page: Home, About, Programs, Staff, Gallery, Tuition, Events, Contact

### Staff Management
- Edit staff names, titles, bios, credentials, and photos directly on the Staff page using the green edit button
- No need to touch any code -- just click, type, and save

### Automated Emails
- When someone fills out the contact form, **two emails are sent automatically**:
  - A notification email to the school (so you never miss an inquiry)
  - A beautiful confirmation email to the parent (so they know you received their message)
- Password reset emails are sent automatically when parents use the "Forgot Password" feature

### Stripe Payments
- Parents can pay tuition online with a credit or debit card
- Payments are processed securely through Stripe (your website never sees or stores card numbers)
- Parents can view their payment history on the Tuition page
- See the file `STRIPE-SETUP-GUIDE.txt` in this folder for detailed setup instructions

### Security
- **Helmet CSP** -- Content Security Policy headers protect against cross-site scripting attacks
- **Rate Limiting** -- Prevents abuse of login, registration, and form submission endpoints
- **Bcrypt Password Hashing** -- All passwords are securely hashed (never stored in plain text)
- **Session Authentication** -- Secure, HTTP-only session cookies with same-site protection
- **Input Sanitization** -- All user input is cleaned before being saved or displayed
- **File Upload Validation** -- Only allows specific file types (PDFs for curriculum, images for site content) with size limits

---

## How to Run the Website

If you ever need to start the website on your own computer, follow these steps:

### Step 1: Install Node.js
- Go to [https://nodejs.org](https://nodejs.org)
- Download the version that says **"LTS"** (this means Long Term Support -- it is the most stable)
- Run the installer and follow the prompts (just click Next through everything)

### Step 2: Open a Terminal
- On Windows: Press the **Windows key**, type **"Command Prompt"** or **"PowerShell"**, and open it
- Navigate to the website folder by typing:
  ```
  cd C:\Users\vlwhi\Repos\DaffodilsMontesseriWebsite
  ```

### Step 3: Install Dependencies
- Run this command (you only need to do this once, or after updates):
  ```
  npm install
  ```
- This downloads all the libraries the website needs to work

### Step 4: Set Up Your Environment File
- There is a file called `.env` in the website folder (it may be hidden -- see the Environment Variables section below)
- This file holds your private settings like email credentials and Stripe payment keys
- If the file does not exist yet, create a new text file called `.env` in the same folder as `server.js` and add the variables listed in the Environment Variables section below

### Step 5: Start the Website
- Run this command:
  ```
  npm start
  ```
- You should see a message saying the server is running

### Step 6: View the Website
- Open your web browser and go to: [http://localhost:3000](http://localhost:3000)
- That is it! Your website is running on your computer

### To Stop the Website
- Go back to the terminal and press **Ctrl + C**

---

## How to Edit the Website (No Coding Required!)

You can change almost any text or image on the website without touching a single line of code. Here is how:

### Step 1: Log In as Admin
- Go to your website and click **Login**
- Sign in with your admin email: **vlwhite396@gmail.com**

### Step 2: Go to Any Page You Want to Edit
- Navigate to the page you want to change (Home, About, Programs, Staff, etc.)

### Step 3: Click the Green Pen Button
- Look for a small **green pencil button** in the **bottom-right corner** of the screen
- Click it to enter edit mode -- the button will change to show you are in editing mode

### Step 4: Edit Text
- Click on any text you want to change
- A text box will appear -- type your new text
- Your changes **save automatically** when you click away or press Enter

### Step 5: Change Images
- When in edit mode, look for a **camera icon** on images
- Click the camera icon to upload a new photo from your computer
- Supported formats: JPG, PNG, GIF, and WEBP (max 5 MB)

### Editing Staff on the Staff Page
- Go to the Staff page and click the green pen button
- You can edit each staff member's:
  - **Name** -- Click the name to change it
  - **Title** -- Click the title to change it (e.g., "Lead Teacher", "Director")
  - **Bio** -- Click the bio paragraph to rewrite it
  - **Credentials** -- Add certifications or qualifications
  - **Photo** -- Click the camera icon to upload a new headshot

### Tips
- You can edit text on any page: Home, About, Programs, Staff, Gallery, Tuition, Events, Contact
- Changes are saved to the website immediately -- other visitors will see them right away
- If you make a mistake, just click the text again and fix it

---

## Admin Dashboard Guide

Log in as admin and click **Dashboard** in the navigation bar (or go to `/admin`). Here is what each tab does and how to use it:

### Leads
- Shows everyone who has contacted you or shown interest in the school
- Each lead shows their name, email, phone, subject, and message
- Use this list to make follow-up phone calls
- You can delete leads you have already followed up on

### Contact Submissions
- Shows inquiries from parents who are logged into their accounts
- You can mark each submission as **reviewed** so you know which ones you have handled
- Different from Leads because these are tied to registered parent accounts

### Enrollments
- Shows all enrollment applications submitted through the Enrollment page
- Each entry shows the child's name, age, parent info, requested program, and start date
- You can change the status to: **pending**, **enrolled**, **waitlisted**, or **declined**
- You can delete applications you no longer need

### Tours
- Shows all tour booking requests
- Each entry includes the parent's name, preferred date and time, child's age, and any notes
- Call or email the parent to confirm the tour
- Delete tour requests after they have been completed

### Children
- Shows all children that parents have added to the system
- Click **Approve** to approve a child for enrollment -- this lets the parent pick a program and schedule on their portal
- Click **Unenroll** to revoke enrollment if needed

### Accounts
- Lists all registered parent accounts
- Shows their name, email, phone number, and when they registered
- You can remove a parent account if needed (this also removes their children and contact submissions)

### Curriculum
- Upload PDF documents for each program (Toddler, Primary, Kindergarten, Before & After Care, or All Programs)
- Parents can only see curriculum documents that match their child's enrolled program
- Add a title, select the program, and optionally add a description for each upload
- Maximum file size: 10 MB per PDF
- Delete old curriculum files when they are no longer needed

### Daily Reports
- Create daily activity reports for individual children
- Each report includes: date, activities, meals, mood, nap time, and teacher notes
- Parents see these reports in their portal under the "Daily Reports" tab
- A wonderful way to keep parents connected to their child's day

### Events
- Create events that appear on the public Events Calendar page
- Each event has a title, description, date, end date, time, and type
- Event types: **General**, **Holiday**, **Conference**, **Field Trip**
- Parents can also see upcoming events in their portal

### Announcements
- Post news and updates that show on the homepage banner and in every parent's portal
- Great for reminders about closures, picture day, field trips, or anything parents need to know
- Each announcement has a title, text, and date
- Delete announcements when they are no longer relevant

---

## Setting Up Stripe Payments

To accept online tuition payments from parents, you need to set up a Stripe account. There is a detailed, step-by-step guide written just for you in this file:

**`STRIPE-SETUP-GUIDE.txt`** (located in the same folder as this README)

That guide covers everything in plain language:
- What Stripe is and how it works
- How to create a Stripe account
- How to get your API keys
- How to add those keys to your website
- How to test payments with a fake card number before going live
- How to switch from test mode to live mode
- Stripe fees and where to view payment records

If Stripe is not set up, parents will see a message on the Tuition page saying the payment system is not configured, along with a phone number to call instead. The rest of the website works fine without Stripe.

---

## Environment Variables (.env)

Your website uses a file called `.env` to store private settings. This file is in the root folder (same place as `server.js`). Here is what each setting does:

| Variable | What It Does | Example |
|---|---|---|
| `PORT` | The port number the website runs on. Defaults to 3000 if not set. | `3000` |
| `SESSION_SECRET` | A secret phrase used to keep user sessions secure. Can be any random text. | `my-super-secret-phrase-2026` |
| `EMAIL_USER` | The Gmail address used to send automated emails (contact confirmations, password resets). | `yourschool@gmail.com` |
| `EMAIL_PASS` | The Gmail app password (not your regular Gmail password -- see note below). | `abcd efgh ijkl mnop` |
| `CONTACT_EMAIL` | The email address where contact form notifications are sent. If not set, they go to EMAIL_USER. | `rishiekhanna@yahoo.com` |
| `STRIPE_SECRET_KEY` | Your Stripe secret API key (starts with `sk_test_` or `sk_live_`). | `sk_test_abc123...` |
| `STRIPE_PUBLISHABLE_KEY` | Your Stripe publishable API key (starts with `pk_test_` or `pk_live_`). | `pk_test_def456...` |
| `STRIPE_WEBHOOK_SECRET` | Optional. Used for advanced Stripe webhook verification. | `whsec_xyz789...` |

**Important notes about the .env file:**
- Do NOT put spaces before or after the `=` sign
- Do NOT add quotes around the values
- Do NOT share this file with anyone -- it contains private information
- This file should never be uploaded to GitHub or shared publicly

**About Gmail App Passwords:** Google requires you to use an "App Password" instead of your regular Gmail password. To get one, go to your Google Account settings, turn on 2-Step Verification, then generate an App Password for "Mail."

---

## File Structure

Here is a quick overview of what is in the website folder:

```
DaffodilsMontesseriWebsite/
|
|-- server.js              The main website application (handles all pages and features)
|-- package.json           Lists the software libraries the website depends on
|-- data.json              Stores all your data (users, leads, enrollments, children, etc.)
|-- .env                   Your private settings (email, Stripe keys, etc.)
|-- STRIPE-SETUP-GUIDE.txt Step-by-step guide for setting up online payments
|-- README.md              This file -- your guide to the website
|
|-- views/                 All the web pages:
|   |-- index.html             Home page
|   |-- about.html             About page
|   |-- programs.html          Programs page
|   |-- staff.html             Staff page
|   |-- gallery.html           Gallery page
|   |-- tuition.html           Tuition and payments page
|   |-- events.html            Events calendar page
|   |-- contact.html           Contact page
|   |-- enrollment.html        Enrollment application page
|   |-- login.html             Login page
|   |-- register.html          Parent registration page
|   |-- reset-password.html    Password reset page
|   |-- admin.html             Admin dashboard
|   |-- portal-enrolled.html   Parent portal (enrolled child)
|   |-- portal-not-enrolled.html  Parent portal (no enrolled child yet)
|
|-- public/                Static files served to browsers:
|   |-- css/styles.css         All the visual styling for the website
|   |-- js/main.js             Interactive features (menus, forms, inline editing, etc.)
|   |-- uploads/
|       |-- curriculum/        Uploaded curriculum PDF files
|       |-- images/            Uploaded site images (hero photos, staff photos, etc.)
```

---

## Troubleshooting

### "I cannot log in to the admin dashboard"
- Make sure you are using the email **vlwhite396@gmail.com**
- Make sure your password is correct (passwords are case-sensitive)
- If you forgot your password, use the "Forgot Password" link on the login page, or ask your developer to reset it

### "The website will not start"
- Make sure Node.js is installed (type `node --version` in the terminal -- you should see a version number)
- Make sure you ran `npm install` in the website folder
- Check that you are in the correct folder (`C:\Users\vlwhi\Repos\DaffodilsMontesseriWebsite`)
- Look at the error messages in the terminal -- they usually tell you what went wrong

### "Emails are not sending"
- Check that `EMAIL_USER` and `EMAIL_PASS` are set correctly in your `.env` file
- Make sure you are using a Gmail App Password, not your regular Gmail password
- Make sure 2-Step Verification is turned on in your Google Account
- The website will still work even if emails fail -- they just will not be sent automatically

### "Stripe payments are not working"
- Check that `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` are set in your `.env` file
- Make sure the keys match the mode you want (test keys for testing, live keys for real payments)
- Restart the website after changing the `.env` file
- See `STRIPE-SETUP-GUIDE.txt` for detailed help

### "I edited text on the website but it is not showing up"
- Make sure you clicked away from the text field after editing (changes save when you leave the field)
- Try refreshing the page with Ctrl + F5 to clear your browser cache
- Make sure you are logged in as admin (the green pen button only appears for admins)

### "I uploaded a curriculum file but parents cannot see it"
- Make sure you selected the correct program when uploading (parents only see files for their child's enrolled program, or files marked "All Programs")
- Make sure the child is enrolled in a program (approved and program selected)

### "Too many requests" error
- The website has rate limiting to prevent abuse. If you see this message, wait 15 minutes and try again
- For login attempts, you get 15 tries per 15-minute window
- For form submissions, you get 10 per 15-minute window

### "I need to change something not covered here"
- For anything beyond what is described in this guide, reach out to your developer for assistance

---

## Quick Reference

| What do you want to do? | How to do it |
|---|---|
| Edit text on any page | Log in as admin, click green pen button, click any text to edit |
| Change an image | Log in as admin, click green pen button, click camera icon on the image |
| Edit staff info | Go to Staff page, click green pen button, edit names/titles/bios/photos |
| See who is interested | Admin Dashboard > Leads tab |
| Approve a child | Admin Dashboard > Children tab > click Approve |
| Upload curriculum | Admin Dashboard > Curriculum tab > fill in details and upload PDF |
| Post an announcement | Admin Dashboard > Announcements tab > fill in title and text |
| Create a daily report | Admin Dashboard > Daily Reports tab > select child and fill in details |
| Add a calendar event | Admin Dashboard > Events tab > fill in event details |
| Review contact submissions | Admin Dashboard > Contact tab > mark as reviewed |
| Change tuition rates | Go to Tuition page, click green pen button, edit the rate numbers |
| Accept online payments | Set up Stripe using STRIPE-SETUP-GUIDE.txt |

---

## Need Help?

If something is not working or you need a change that is not covered in this guide, do not worry! Reach out to your developer and they will take care of it.

You are doing a wonderful job. This website is here to make your life easier and help families discover Daffodils Montessori!
