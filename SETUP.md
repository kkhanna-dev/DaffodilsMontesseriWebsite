# Turning on logins, the parent portal, and online payments

The website itself runs on GitHub Pages. Everything that needs to remember things (accounts, children, daily reports, files, payments) lives in **Supabase**, a free hosted database with built-in logins. You set it up once; after that, everything is managed from the Admin dashboard on the site.

Plan on about 20 minutes for steps 1-5, and another 20 for Stripe (step 7) whenever you are ready to take card payments.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com>, sign up (GitHub login works), and click **New project**.
2. Name it `daffodils`, create a strong database password (save it in a password manager), and pick the region **West US (Oregon)**.
3. Wait a minute or two for it to finish setting up.

## 2. Create the database

1. In the left sidebar open **SQL Editor** and click **New query**.
2. Open `supabase/schema.sql` from this repo, copy the whole file, paste it in, and click **Run**.
3. You should see "Success. No rows returned." This created every table, the security rules, the file storage buckets, and starter data: programs, tuition, staff, and a list of 36 common Montessori lessons.

Run it only once. If you ever need to start over, create a fresh project instead.

## 3. Connect the website

1. In Supabase open **Project Settings > API Keys** (on some projects it is **Project Settings > API**).
2. Copy the **Project URL** and the **anon public** key (newer projects call it the **publishable** key, starting with `sb_publishable_`).
3. Open `docs/js/config.js` in this repo and paste them in:

   ```js
   supabaseUrl: "https://abcdefghijkl.supabase.co",
   supabaseAnonKey: "eyJhbGciOi...",
   ```

   Both are safe to publish. **Never** paste the `service_role` or `secret` key into any file in `docs/`.

4. Commit and push.

## 4. Tell Supabase where the site lives

In **Authentication > URL Configuration**:

- **Site URL:** `https://daffodilsmontessori.com/`
- **Redirect URLs:** `https://daffodilsmontessori.com/**` and `https://www.daffodilsmontessori.com/**` (keep `https://kkhanna-dev.github.io/DaffodilsMontesseriWebsite/**` too while the domain switches over)

This is what lets the "confirm your email" and "reset password" links land back on your site.

## 5. Set up email (required for real parents)

Supabase's built-in email sender only delivers to people on your Supabase team and is limited to a couple of emails an hour. Parents would never get their confirmation or password-reset links. Connect a real sender:

**Easiest: the school's existing email account**

1. For Yahoo: Account Security > **Generate app password**. For Gmail: turn on 2-Step Verification, then create an **App password**.
2. In Supabase open **Authentication > Emails > SMTP Settings**, turn on **Enable custom SMTP**, and enter:

   | Field | Yahoo | Gmail |
   |---|---|---|
   | Host | `smtp.mail.yahoo.com` | `smtp.gmail.com` |
   | Port | `465` | `465` |
   | Username | the full email address | the full email address |
   | Password | the app password | the app password |
   | Sender email | the same address | the same address |
   | Sender name | `Daffodils Montessori` | `Daffodils Montessori` |

3. Under **Authentication > Rate Limits**, raise "emails sent per hour" to something like 30.

**Better long term:** a service like Resend or Postmark with your own domain (for example `hello@daffodilsmontessori.com`). Their setup pages walk you through it.

Optional polish: **Authentication > Emails > Templates** lets you reword the confirmation and reset emails.

## 6. Make yourself an admin

1. Open the live site, click **Parent Login > Create a family account**, and sign up with the email the school uses.
2. Click the confirmation link in your inbox.
3. Back in Supabase **SQL Editor**, run (with your email):

   ```sql
   update public.profiles set role = 'admin' where email = 'rishiekhanna@yahoo.com';
   ```

4. Log in again. You now land on the **Admin dashboard**, and every public page shows an **Edit this page** button at the bottom for you.

To add more admins later, use **Admin > Family accounts > Make admin**. No SQL needed.

## 7. Card payments with Stripe (optional)

Parents pay on Stripe's secure checkout page; the payment then shows up automatically in both the parent's portal and your Payments tab.

1. **Create a Stripe account** at <https://stripe.com> and finish the business verification. Leave **Test mode** on while you try it out.
2. **Install the Supabase command line tool** (needs Node.js). In a terminal inside this repo:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

   The project ref is the random part of your Project URL (`https://YOUR_PROJECT_REF.supabase.co`).

3. **Add the secrets** (Stripe > Developers > API keys > Secret key):

   ```bash
   npx supabase secrets set STRIPE_SECRET_KEY=sk_test_...
   npx supabase secrets set SITE_URL=https://daffodilsmontessori.com/
   ```

4. **Deploy the two functions:**

   ```bash
   npx supabase functions deploy create-checkout
   npx supabase functions deploy stripe-webhook --no-verify-jwt
   ```

   `--no-verify-jwt` matters: Stripe calls the webhook directly and cannot send a Supabase login. The webhook checks Stripe's signature instead.

5. **Point Stripe at the webhook.** Stripe > Developers > Webhooks > **Add endpoint**:
   - URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`

   Then copy its **Signing secret** and save it:

   ```bash
   npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   ```

6. **Switch it on in the site:** set `stripeEnabled: true` in `docs/js/config.js`, commit, and push.
7. **Test:** log in as a parent with an enrolled child, go to **Payments**, and pay with card `4242 4242 4242 4242`, any future date, any CVC. The payment should appear as **Paid** within a few seconds.
8. **Go live:** repeat steps 3 and 5 with your **live** keys (`sk_live_...` and the live webhook's secret).

Refunds are issued from the Stripe dashboard; the portal updates itself when Stripe reports a full refund.

## 8. Keep the free project awake (optional)

Free Supabase projects pause after 7 days with no activity, which can happen over summer break. A paused project shows the site's backup content and turns logins off until you click **Restore** in Supabase.

This repo includes a small GitHub Action that pings the database twice a week so that does not happen:

1. On GitHub, open **Settings > Secrets and variables > Actions > New repository secret** and add:
   - `SUPABASE_URL`: your Project URL
   - `SUPABASE_ANON_KEY`: the same anon/publishable key from `config.js`
2. That's it. You can run it by hand under **Actions > Keep Supabase awake > Run workflow**.

## 9. Publish on GitHub Pages

1. Push this repo to GitHub.
2. **Settings > Pages > Deploy from a branch**, branch **main**, folder **/docs**, then **Save**.
3. In about a minute the site is live. The custom domain `daffodilsmontessori.com` comes from the `docs/CNAME` file; its DNS lives in Wix (four A records for `@` pointing to GitHub, and `www` as a CNAME to `kkhanna-dev.github.io`).

Private repos need GitHub Pro (free with the Student Developer Pack) to use Pages. A public repo is fine too: `docs/` contains nothing secret, and family data lives only in Supabase behind the security rules.

---

## 10. Fill in the school-specific details

These are yours to supply; the site is built to show them as soon as they exist.

- **Photos:** Admin > Photos. Use "Public" only for children with a signed photo release, "Families only" for everyday moments. Individual photo spots on each page are changed with **Edit this page**.
- **Blank forms:** upload the enrollment agreement, emergency and medical consent, and photo release under Admin > Curriculum & forms > "All families". Families download them, sign, and upload the signed copies under Documents.
- **License line:** add your DCYF license number to `contact.license` in `docs/js/site-data.js`; it appears in every footer.
- **Google reviews:** paste your review link into `googleReviewsUrl` in the same file.
- **Staff bios and photos:** Admin > Staff.
- **Testimonials:** Admin > Testimonials, only with the family's permission.
- **Policies and privacy:** read the Handbook & Policies and Privacy Policy pages and adjust anything that does not match how the school runs (log in as admin and use **Edit this page**). They are sensible defaults, not legal advice.
- **Summer camp dates and rates:** edit the yellow box on the Summer Camp page each spring.
- **Hours:** the footer hours and the Programs page schedules should agree.
- **Domain:** the site address `https://daffodilsmontessori.com/` is written into `docs/sitemap.xml`, `docs/robots.txt`, `docs/CNAME`, and the page headers. If it ever changes, search the repo for it.

## How the pieces fit

| Where | What |
|---|---|
| `docs/` | The website, served by GitHub Pages |
| `docs/js/config.js` | Supabase address + public key, Stripe on/off |
| `docs/js/site-data.js` | Contact info, social links, form email, and backup content |
| `supabase/schema.sql` | Tables, security rules, storage buckets, starter data (programs, staff, Montessori lesson list) |
| `supabase/functions/` | Stripe checkout + webhook (run on Supabase) |
| Supabase | Logins, family records, files, payments |
| Stripe | Card processing |

**Security in one paragraph:** every table has row level security. Parents can only see and change their own family's records, and cannot enroll children, post reports, or record payments themselves. Visitors can only submit the public forms (contact, tour, application, summer camp, and job applications). Only admins can read inboxes, edit content, upload files, or see other families. Curriculum files, family documents, and families-only photos are private and handed out through short-lived download links. Payments are only written by the Stripe webhook after Stripe confirms them.

## Troubleshooting

- **"Family accounts are not switched on yet"** on the login page: `config.js` still has blank values, or the site has not redeployed yet.
- **Confirmation or reset emails never arrive:** step 5 (custom SMTP) is not set up, or check spam.
- **Confirmation link opens the wrong site or says "invalid redirect":** fix the URLs in step 4.
- **Pay button says checkout could not start:** check the function logs under Supabase > Edge Functions > create-checkout > Logs. Usually a missing `STRIPE_SECRET_KEY`.
- **Paid on Stripe but not showing in the portal:** check Stripe > Webhooks > your endpoint for failed deliveries, and that `STRIPE_WEBHOOK_SECRET` matches. If your project only has the newer `sb_secret_...` keys, also run `npx supabase secrets set SERVICE_ROLE_KEY=sb_secret_...`.
- **Site shows old prices or no logins after a week:** the project paused. Supabase dashboard > **Restore project**, then set up step 8.
- **Delete a family's login entirely:** Supabase > Authentication > Users > the user > Delete. Their children and reports are removed with it; payment records stay for your books.
