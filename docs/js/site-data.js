/* ==========================================================
   DAFFODILS MONTESSORI - BACKUP CONTENT + CONTACT SETTINGS
   ----------------------------------------------------------
   Once Supabase is connected (js/config.js), programs,
   tuition, events, announcements, staff, and photos are
   managed from the Admin dashboard instead, and the lists
   below are only a backup the site falls back to if the
   database cannot be reached.

   Still used either way: contact info, social links, and
   the form email address below.

   Tips
   - Keep the commas and quotes exactly as shown.
   - Dates use the format "YYYY-MM-DD".
   - Photos: put the file in the /images folder, then add
     its path under "images" below.
   ========================================================== */

window.SITE_DATA = {

  // ---- Contact info and form delivery -------------------
  contact: {
    email: "rishiekhanna@yahoo.com",
    phone: "(425) 623-2684",
    address: "5051 86th Ave NE, Marysville, WA 98270",
    hours: "Mon-Fri: 9:00 AM - 5:00 PM",
    // Shown in the footer once filled in, e.g. "WA DCYF Licensed Child Care, License #123456"
    license: ""
  },

  // Link to your Google reviews (Google Business Profile > "Get more reviews").
  // Leave "" to hide the button on the home page.
  googleReviewsUrl: "",

  // Social pages. Paste a full link to show that button on the
  // Contact page; leave "" to hide it.
  social: {
    facebook: "",
    instagram: "",
    youtube: ""
  },

  // Contact, tour, and application forms are delivered to this
  // address by FormSubmit (free, no server needed). The very first
  // submission sends a one-time "Activate form" email to this inbox;
  // click it once and every submission after that arrives normally.
  forms: {
    endpoint: "https://formsubmit.co/ajax/rishiekhanna@yahoo.com"
  },

  // ---- Programs and tuition ------------------------------
  // Drives the Tuition page, the Programs page prices,
  // and the program list on the Enrollment form.
  programs: [
    {
      id: "toddler",
      name: "Toddler Program",
      ages: "Ages 2-3",
      icon: "fa-baby",
      rates: [
        { label: "Half-day", price: "$850" },
        { label: "Full-day", price: "$1,200" }
      ]
    },
    {
      id: "primary",
      name: "Primary Program",
      ages: "Ages 3-5",
      icon: "fa-star",
      featured: true,
      rates: [
        { label: "Half-day", price: "$950" },
        { label: "Full-day", price: "$1,400" },
        { label: "Extended", price: "$1,650" }
      ]
    },
    {
      id: "kindergarten",
      name: "Kindergarten",
      ages: "Ages 5-6",
      icon: "fa-graduation-cap",
      rates: [
        { label: "Full-day", price: "$1,400" },
        { label: "Extended", price: "$1,650" }
      ]
    }
  ],

  // ---- Announcements (homepage banner) -------------------
  // Newest first. Leave the list empty [] to hide the banner.
  // Example:
  // { title: "Now enrolling for fall", text: "Tours available weekdays.", date: "2026-10-01" }
  announcements: [],

  // ---- Events calendar -----------------------------------
  // type: "general", "holiday", "conference", or "field-trip"
  // Example:
  // { title: "Harvest Festival", date: "2026-10-24", time: "10:00 AM", type: "general", description: "Pumpkins, crafts, and cider." }
  events: [],

  // ---- Staff ---------------------------------------------
  // image is optional, e.g. "images/staff-rishi.jpg"
  staff: [
    { name: "Kartik Khanna", title: "", bio: "", credentials: "", image: "" },
    { name: "Shruti Khanna", title: "", bio: "", credentials: "", image: "" },
    { name: "Rishi Khanna",  title: "", bio: "", credentials: "", image: "" }
  ],

  // ---- Photos --------------------------------------------
  // Each key matches a photo spot on the site. Add a path to
  // show a real photo there; leave it out to keep the placeholder.
  // Spots: welcomeImage (home), aboutImg1 (about),
  // programImg1-programImg4 (programs), galleryImg1-galleryImg17 (gallery)
  // Example:  welcomeImage: "images/classroom.jpg",
  images: {
  }
};
