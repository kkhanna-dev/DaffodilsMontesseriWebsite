/* ==========================================================
   DAFFODILS MONTESSORI - BACKEND CONNECTION
   ----------------------------------------------------------
   Paste the two values from Supabase > Project Settings > API.
   Both are safe to publish: the anon key only allows what the
   database security rules (supabase/schema.sql) permit.
   NEVER paste the "service_role" key here.

   While these are blank, the public site still works using
   js/site-data.js, but logins and the portals stay offline.
   ========================================================== */

window.DAFFODILS_CONFIG = {
  supabaseUrl: "",        // e.g. "https://abcdefghijkl.supabase.co"
  supabaseAnonKey: "",    // the long "anon public" key

  // Turn on after deploying the Stripe functions (see SETUP.md, step 6)
  stripeEnabled: false
};
