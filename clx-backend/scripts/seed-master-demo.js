#!/usr/bin/env node
/**
 * CLX Master Demo Dataset seed — Campus Life Express STAGING ONLY.
 *
 * SAFETY:
 *  - Aborts unless the resolved DB host contains the staging project ref.
 *  - Idempotent: every demo row is keyed by a stable legacy_key ('demo:*')
 *    or natural unique constraint, so re-running never duplicates data.
 *  - Never deletes or truncates anything; existing staging rows are preserved.
 *  - Never prints secrets.
 *
 * Usage: node scripts/seed-master-demo.js [--dry-run]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

const STAGING_REF = 'bdjfkuddpupqaswzkrth';
const DRY_RUN = process.argv.includes('--dry-run');

function assertStaging(url) {
  const u = new URL(url);
  const isPooler = u.hostname.includes('pooler');
  const ref = isPooler ? decodeURIComponent(u.username).split('.')[1] : u.hostname.split('.')[0].replace(/^db\./, '');
  if (ref !== STAGING_REF) {
    console.error(`ABORT: DATABASE_URL resolves to project ref "${ref}", expected staging ${STAGING_REF}.`);
    process.exit(1);
  }
  return u;
}

const naira = (n) => Math.round(n * 100); // kobo
const demoUuid = (n) => `dc100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Demo-only password for staging demo accounts (never used in production).
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'ClxDemo2026!';

// ---------------------------------------------------------------- vendors
const VENDORS = [
  { slug: 'campus-bites', name: 'Campus Bites', cat: 'food', subcat: 'food-restaurants', campuses: ['unimaid'], location: 'Acada Complex, UNIMAID', owner: 101, desc: 'Demo food vendor serving hot Nigerian meals to UNIMAID students. (Fictional demo business for CLX staging.)' },
  { slug: 'arewa-kitchen', name: 'Arewa Kitchen', cat: 'food', subcat: 'food-restaurants', campuses: ['unimaid'], location: 'Commercial Center, UNIMAID', owner: 102, desc: 'Demo restaurant specialising in northern Nigerian dishes. (Fictional demo business for CLX staging.)' },
  { slug: 'scholars-cafe', name: "Scholar's Café", cat: 'food', subcat: 'food-campus-vendors', campuses: ['unimaid'], location: 'Science Complex, UNIMAID', owner: 103, desc: 'Demo campus café for coffee, snacks and quick bites between lectures. (Fictional demo business for CLX staging.)' },
  { slug: 'campus-threads', name: 'Campus Threads', cat: 'shopping', subcat: 'shopping-fashion', campuses: ['unimaid', 'kiu'], location: 'Main Campus, UNIMAID', owner: 104, desc: 'Demo fashion and clothing store for students. (Fictional demo business for CLX staging.)' },
  { slug: 'student-tech-hub', name: 'Student Tech Hub', cat: 'shopping', subcat: 'shopping-phones-accessories', campuses: ['unimaid', 'kiu'], location: 'Acada Complex, UNIMAID', owner: 105, desc: 'Demo phone accessories shop and repair point. (Fictional demo business for CLX staging.)' },
  { slug: 'printpoint-campus', name: 'PrintPoint Campus', cat: 'services', subcat: 'services-printing', campuses: ['unimaid'], location: 'Faculty of Law, UNIMAID', owner: 106, desc: 'Demo printing and stationery business. (Fictional demo business for CLX staging.)' },
  { slug: 'freshcut-barbers', name: 'FreshCut Barbers', cat: 'services', subcat: 'services-barbing', campuses: ['unimaid'], location: 'Hostel A-D, UNIMAID', owner: 107, desc: 'Demo campus barbing salon. (Fictional demo business for CLX staging.)' },
  { slug: 'quickwash-laundry', name: 'QuickWash Laundry', cat: 'services', subcat: 'services-laundry', campuses: ['unimaid'], location: 'Student Village, UNIMAID', owner: 108, desc: 'Demo laundry service for hostel students. (Fictional demo business for CLX staging.)' },
  { slug: 'pixelcraft-studio', name: 'PixelCraft Studio', cat: 'services', subcat: 'services-graphics', campuses: ['unimaid'], location: 'Admin Block, UNIMAID', owner: 109, desc: 'Demo graphics and photography studio. (Fictional demo business for CLX staging.)' },
  { slug: 'campus-gadgets', name: 'Campus Gadgets', cat: 'shopping', subcat: 'shopping-phones-accessories', campuses: ['unimaid', 'kiu'], location: 'Main Campus, UNIMAID', owner: 110, desc: 'Demo gadgets and accessories store. (Fictional demo business for CLX staging.)' },
  { slug: 'booknest', name: 'BookNest', cat: 'shopping', subcat: 'shopping-books', campuses: ['unimaid'], location: 'Library Area, UNIMAID', owner: 111, desc: 'Demo bookstore for textbooks and study materials. (Fictional demo business for CLX staging.)' },
  { slug: 'clx-demo-logistics', name: 'CLX Demo Logistics', cat: 'delivery', subcat: 'delivery-campus', campuses: ['unimaid', 'kiu', 'buk'], location: 'Campus-wide', owner: 112, desc: 'Demo delivery and errand runner for all CLX campuses. (Fictional demo business for CLX staging.)' },
];

const OWNERS = VENDORS.map(v => ({
  id: demoUuid(v.owner),
  email: `${v.slug}-owner@demo.campuslife.express`,
  full_name: `Demo Owner — ${v.name}`,
}));

const SELLERS = [
  { id: demoUuid(201), email: 'demo.seller.amina@demo.campuslife.express', full_name: 'Demo Student — Amina S.', campus: 'unimaid', dept: 'Biological Sciences' },
  { id: demoUuid(202), email: 'demo.seller.emeka@demo.campuslife.express', full_name: 'Demo Student — Emeka O.', campus: 'unimaid', dept: 'Engineering' },
  { id: demoUuid(203), email: 'demo.seller.fatima@demo.campuslife.express', full_name: 'Demo Student — Fatima B.', campus: 'kiu', dept: 'Management Studies' },
];

// ---------------------------------------------------------------- products
// vendor slug → array of { name, subcat (category slug), price (naira), desc, stock }
const PRODUCTS = {
  'campus-bites': [
    { name: 'Jollof Rice', subcat: 'food-restaurants', price: 1200, desc: 'Demo plate of party-style jollof rice with chicken garnish.' },
    { name: 'Fried Rice', subcat: 'food-restaurants', price: 1200, desc: 'Demo vegetable fried rice served hot.' },
    { name: 'Chicken & Chips', subcat: 'food-restaurants', price: 2500, desc: 'Demo grilled chicken portion with hand-cut chips.' },
    { name: 'Beef Shawarma', subcat: 'food-restaurants', price: 1500, desc: 'Demo beef shawarma wrap with garlic sauce.' },
    { name: 'Meat Pie', subcat: 'food-restaurants', price: 500, desc: 'Demo baked meat pie.' },
    { name: 'Egg Roll', subcat: 'food-restaurants', price: 400, desc: 'Demo egg roll snack.' },
  ],
  'arewa-kitchen': [
    { name: 'Tuwo Shinkafa', subcat: 'food-restaurants', price: 1000, desc: 'Demo northern staple with miyan kuka.' },
    { name: 'Miyan Kuka', subcat: 'food-restaurants', price: 900, desc: 'Demo baobab leaf soup.' },
    { name: 'Grilled Fish', subcat: 'food-restaurants', price: 3000, desc: 'Demo grilled tilapia with spice rub.' },
    { name: 'Masa', subcat: 'food-restaurants', price: 500, desc: 'Demo rice cakes, four pieces.' },
  ],
  'scholars-cafe': [
    { name: 'Cappuccino', subcat: 'food-campus-vendors', price: 800, desc: 'Demo cappuccino, medium.' },
    { name: 'Espresso', subcat: 'food-campus-vendors', price: 500, desc: 'Demo single-shot espresso.' },
    { name: 'Croissant', subcat: 'food-campus-vendors', price: 900, desc: 'Demo butter croissant.' },
    { name: 'Club Sandwich', subcat: 'food-campus-vendors', price: 1200, desc: 'Demo triple-decker sandwich.' },
    { name: 'Bottled Water', subcat: 'food-drinks', price: 200, desc: 'Demo 75cl bottled water.' },
  ],
  'campus-threads': [
    { name: 'Plain T-Shirt', subcat: 'shopping-fashion', price: 3500, desc: 'Demo cotton t-shirt, multiple sizes.' },
    { name: 'Campus Hoodie', subcat: 'shopping-fashion', price: 8500, desc: 'Demo fleece hoodie with CLX print.' },
    { name: 'Ankara Shirt', subcat: 'shopping-fashion', price: 6000, desc: 'Demo tailored ankara shirt.' },
    { name: 'Baseball Cap', subcat: 'shopping-fashion', price: 2500, desc: 'Demo adjustable cap.' },
  ],
  'student-tech-hub': [
    { name: 'USB-C Cable', subcat: 'shopping-phones-accessories', price: 3000, desc: 'Demo 1m braided USB-C cable.' },
    { name: 'Phone Charger', subcat: 'shopping-phones-accessories', price: 4500, desc: 'Demo 20W fast charger.' },
    { name: 'Earphones', subcat: 'shopping-phones-accessories', price: 5500, desc: 'Demo wired earphones with mic.' },
    { name: 'Power Bank', subcat: 'shopping-phones-accessories', price: 12000, desc: 'Demo 10,000mAh power bank.' },
  ],
  'printpoint-campus': [
    { name: 'Notebook (Hard Cover)', subcat: 'shopping-stationery', price: 4000, desc: 'Demo hard-cover notebook, 80 leaves.' },
    { name: 'Scientific Calculator', subcat: 'shopping-stationery', price: 5500, desc: 'Demo fx-series scientific calculator.' },
    { name: 'A4 Paper Ream', subcat: 'shopping-stationery', price: 4500, desc: 'Demo 500-sheet A4 paper ream.' },
  ],
  'campus-gadgets': [
    { name: 'Phone Case', subcat: 'shopping-phones-accessories', price: 2500, desc: 'Demo shockproof phone case.' },
    { name: 'Screen Protector', subcat: 'shopping-phones-accessories', price: 1500, desc: 'Demo tempered glass protector.' },
    { name: 'Bluetooth Speaker', subcat: 'shopping-phones-accessories', price: 9000, desc: 'Demo portable Bluetooth speaker.' },
  ],
  'booknest': [
    { name: 'Textbook: General Biology', subcat: 'shopping-books', price: 4000, desc: 'Demo semester biology textbook.' },
    { name: 'Past Questions Pack', subcat: 'shopping-books', price: 1000, desc: 'Demo compiled departmental past questions.' },
  ],
};

// ---------------------------------------------------------------- services
// vendor slug → array of { name, subcat, price(naira|null), priceType, turnaround, desc }
const SERVICES = [
  { vendor: 'printpoint-campus', name: 'Black & White Printing', subcat: 'services-printing', price: 20, priceType: 'FIXED', turnaround: 'Same day', desc: 'Demo B&W printing at ₦20 per page. (Fictional demo service.)' },
  { vendor: 'printpoint-campus', name: 'Colour Printing', subcat: 'services-printing', price: 50, priceType: 'FIXED', turnaround: 'Same day', desc: 'Demo colour printing at ₦50 per page. (Fictional demo service.)' },
  { vendor: 'printpoint-campus', name: 'Document Binding', subcat: 'services-printing', price: 150, priceType: 'FIXED', turnaround: 'Under 1 hour', desc: 'Demo spiral or hard binding for projects. (Fictional demo service.)' },
  { vendor: 'pixelcraft-studio', name: 'Flyer Design', subcat: 'services-graphics', price: 8000, priceType: 'FIXED', turnaround: '2 days', desc: 'Demo event flyer design. (Fictional demo service.)' },
  { vendor: 'pixelcraft-studio', name: 'Logo Design', subcat: 'services-graphics', price: 25000, priceType: 'STARTING_FROM', turnaround: '4 days', desc: 'Demo brand logo design with revisions. (Fictional demo service.)' },
  { vendor: 'pixelcraft-studio', name: 'Social Media Design', subcat: 'services-graphics', price: 15000, priceType: 'STARTING_FROM', turnaround: '2 days', desc: 'Demo branded social media post designs. (Fictional demo service.)' },
  { vendor: 'pixelcraft-studio', name: 'Passport Photography', subcat: 'services-photography', price: 2000, priceType: 'FIXED', turnaround: 'Same day', desc: 'Demo passport photo session with prints. (Fictional demo service.)' },
  { vendor: 'pixelcraft-studio', name: 'Event Photography', subcat: 'services-photography', price: 30000, priceType: 'STARTING_FROM', turnaround: 'Booking based', desc: 'Demo departmental and event photography coverage. (Fictional demo service.)' },
  { vendor: 'quickwash-laundry', name: 'Standard Laundry', subcat: 'services-laundry', price: 1500, priceType: 'FIXED', turnaround: '2 days', desc: 'Demo wash-and-fold per load. (Fictional demo service.)' },
  { vendor: 'quickwash-laundry', name: 'Express Laundry', subcat: 'services-laundry', price: 3000, priceType: 'FIXED', turnaround: '6 hours', desc: 'Demo same-day express wash. (Fictional demo service.)' },
  { vendor: 'freshcut-barbers', name: 'Haircut', subcat: 'services-barbing', price: 800, priceType: 'FIXED', turnaround: '30 mins', desc: 'Demo standard haircut. (Fictional demo service.)' },
  { vendor: 'freshcut-barbers', name: 'Haircut + Beard', subcat: 'services-barbing', price: 1200, priceType: 'FIXED', turnaround: '45 mins', desc: 'Demo haircut with beard shaping. (Fictional demo service.)' },
  { vendor: 'campus-threads', name: 'Clothing Adjustment', subcat: 'services-tailoring', price: 2000, priceType: 'FIXED', turnaround: '2 days', desc: 'Demo trousers/shirt adjustment. (Fictional demo service.)' },
  { vendor: 'campus-threads', name: 'Simple Custom Sewing', subcat: 'services-tailoring', price: 8000, priceType: 'STARTING_FROM', turnaround: '5 days', desc: 'Demo custom outfit sewing from your fabric. (Fictional demo service.)' },
  { vendor: 'student-tech-hub', name: 'Screen Replacement', subcat: 'services-phone-repair', price: 15000, priceType: 'STARTING_FROM', turnaround: '1-3 days', desc: 'Demo phone screen replacement, parts extra. (Fictional demo service.)' },
  { vendor: 'student-tech-hub', name: 'Charging Port Repair', subcat: 'services-phone-repair', price: 5000, priceType: 'FIXED', turnaround: 'Same day', desc: 'Demo charging port cleaning/replacement. (Fictional demo service.)' },
  { vendor: 'student-tech-hub', name: 'Software Troubleshooting', subcat: 'services-phone-repair', price: 3000, priceType: 'FIXED', turnaround: 'Same day', desc: 'Demo OS reset and malware clean-up. (Fictional demo service.)' },
];

// ---------------------------------------------------------------- marketplace listings
// { seller (index), campus, subcat, title, price (naira), condition, status, desc }
const LISTINGS = [
  { s: 0, campus: 'unimaid', subcat: 'marketplace-used-textbooks', title: 'Essential Clinical Anatomy — 7th Edition', price: 6500, condition: 'GOOD', status: 'PUBLISHED', desc: 'DEMO LISTING. Clean copy, minor highlighting in first two chapters.' },
  { s: 0, campus: 'unimaid', subcat: 'marketplace-used-textbooks', title: 'General Biology Practical Manual', price: 1500, condition: 'FAIR', status: 'PUBLISHED', desc: 'DEMO LISTING. Cover creased, all pages intact.' },
  { s: 0, campus: 'unimaid', subcat: 'marketplace-used-electronics', title: 'Mini Bluetooth Speaker (Used)', price: 5500, condition: 'GOOD', status: 'PENDING_REVIEW', desc: 'DEMO LISTING. Battery holds charge about 4 hours.' },
  { s: 1, campus: 'unimaid', subcat: 'marketplace-used-electronics', title: '10000mAh Power Bank', price: 7000, condition: 'LIKE_NEW', status: 'PUBLISHED', desc: 'DEMO LISTING. Barely used, comes with cable.' },
  { s: 1, campus: 'unimaid', subcat: 'marketplace-furniture', title: 'Study Table (Wooden)', price: 12000, condition: 'GOOD', status: 'PUBLISHED', desc: 'DEMO LISTING. Sturdy study table, pickup from hostel.' },
  { s: 1, campus: 'unimaid', subcat: 'marketplace-furniture', title: 'Plastic Reading Chair', price: 3500, condition: 'FAIR', status: 'PENDING_REVIEW', desc: 'DEMO LISTING. Slight wobble but solid.' },
  { s: 1, campus: 'unimaid', subcat: 'marketplace-hostel-items', title: 'Electric Kettle 1.5L', price: 6000, condition: 'GOOD', status: 'PUBLISHED', desc: 'DEMO LISTING. Working perfectly, quick boil.' },
  { s: 1, campus: 'unimaid', subcat: 'marketplace-hostel-items', title: 'Hotplate (Single Burner)', price: 5500, condition: 'GOOD', status: 'PUBLISHED', desc: 'DEMO LISTING. Ideal for hostel cooking.' },
  { s: 0, campus: 'unimaid', subcat: 'marketplace-used-electronics', title: 'HP Pavilion Laptop (4GB RAM)', price: 85000, condition: 'FAIR', status: 'PENDING_REVIEW', desc: 'DEMO LISTING. Boots fine, battery replaced last year.' },
  { s: 0, campus: 'unimaid', subcat: 'marketplace-hostel-items', title: 'Standing Fan 16-inch', price: 9000, condition: 'GOOD', status: 'PUBLISHED', desc: 'DEMO LISTING. Three speed settings, all working.' },
  { s: 2, campus: 'kiu', subcat: 'marketplace-used-textbooks', title: 'Principles of Accounting — 10th Edition', price: 5000, condition: 'GOOD', status: 'PUBLISHED', desc: 'DEMO LISTING. No torn pages, minimal notes.' },
  { s: 2, campus: 'kiu', subcat: 'marketplace-used-electronics', title: 'Android Phone 64GB (Used)', price: 45000, condition: 'GOOD', status: 'PUBLISHED', desc: 'DEMO LISTING. Screen flawless, includes charger.' },
  { s: 2, campus: 'kiu', subcat: 'marketplace-furniture', title: 'Mini Study Lamp', price: 2500, condition: 'LIKE_NEW', status: 'PENDING_REVIEW', desc: 'DEMO LISTING. LED lamp with USB power.' },
  { s: 2, campus: 'kiu', subcat: 'marketplace-hostel-items', title: 'Water Dispenser (Tabletop)', price: 14000, condition: 'GOOD', status: 'PUBLISHED', desc: 'DEMO LISTING. Hot and cold nozzles working.' },
  { s: 2, campus: 'kiu', subcat: 'marketplace-hostel-items', title: 'Mattress Topper (Single)', price: 7000, condition: 'FAIR', status: 'PUBLISHED', desc: 'DEMO LISTING. Foam topper, cleaned and aired.' },
  { s: 1, campus: 'unimaid', subcat: 'marketplace-used-electronics', title: 'Wireless Mouse + Keyboard Combo', price: 11000, condition: 'LIKE_NEW', status: 'PUBLISHED', desc: 'DEMO LISTING. Silent keys, USB receiver included.' },
  { s: 0, campus: 'unimaid', subcat: 'marketplace-used-textbooks', title: 'Organic Chemistry Textbook', price: 7500, condition: 'GOOD', status: 'PUBLISHED', desc: 'DEMO LISTING. Recommended 300L text, hard cover.' },
  { s: 2, campus: 'kiu', subcat: 'marketplace-used-electronics', title: 'USB Desk Fan', price: 4000, condition: 'GOOD', status: 'PUBLISHED', desc: 'DEMO LISTING. Quiet, two speeds, USB powered.' },
  { s: 1, campus: 'unimaid', subcat: 'marketplace-hostel-items', title: 'Fabric Wardrobe (Portable)', price: 10000, condition: 'GOOD', status: 'PUBLISHED', desc: 'DEMO LISTING. Zip-up fabric wardrobe with shelves.' },
  { s: 2, campus: 'kiu', subcat: 'marketplace-furniture', title: 'Folding Bed Chair', price: 18000, condition: 'FAIR', status: 'PENDING_REVIEW', desc: 'DEMO LISTING. Folds flat for storage, fabric worn at edge.' },
];

// ---------------------------------------------------------------- operating hours
// day: 0=Sunday ... 6=Saturday
function standardHours(weekOpen, weekClose, satOpen, satClose, sunOpen, sunClose) {
  return [
    { day: 0, open: sunOpen, close: sunClose },
    { day: 1, open: weekOpen, close: weekClose }, { day: 2, open: weekOpen, close: weekClose },
    { day: 3, open: weekOpen, close: weekClose }, { day: 4, open: weekOpen, close: weekClose },
    { day: 5, open: weekOpen, close: weekClose },
    { day: 6, open: satOpen, close: satClose },
  ];
}
const HOURS = {
  'campus-bites': standardHours('08:00', '20:00', '09:00', '18:00', '10:00', '16:00'),
  'arewa-kitchen': standardHours('10:00', '21:00', '10:00', '21:00', '12:00', '18:00'),
  'scholars-cafe': standardHours('07:00', '19:00', '08:00', '17:00', null, null),
  'campus-threads': standardHours('09:00', '18:00', '09:00', '18:00', null, null),
  'student-tech-hub': standardHours('08:00', '20:00', '09:00', '18:00', '12:00', '16:00'),
  'printpoint-campus': standardHours('08:00', '20:00', '09:00', '18:00', '12:00', '16:00'),
  'freshcut-barbers': standardHours('08:00', '20:00', '08:00', '20:00', '10:00', '16:00'),
  'quickwash-laundry': standardHours('08:00', '18:00', '09:00', '16:00', null, null),
  'pixelcraft-studio': standardHours('09:00', '18:00', '10:00', '16:00', null, null),
  'campus-gadgets': standardHours('09:00', '19:00', '09:00', '18:00', '12:00', '17:00'),
  'booknest': standardHours('08:00', '18:00', '09:00', '14:00', null, null),
  'clx-demo-logistics': standardHours('08:00', '20:00', '08:00', '20:00', '10:00', '18:00'),
};

// ================================================================ main
async function main() {
  if (!process.env.DATABASE_URL) { console.error('ABORT: DATABASE_URL not set'); process.exit(1); }
  const u = assertStaging(process.env.DATABASE_URL);
  const db = new Client({
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    host: u.hostname, port: +(u.port || 5432), database: u.pathname.replace('/', ''),
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();
  console.log(`[identity] verified staging ref ${STAGING_REF}`);

  const counts = {};
  const stat = (t) => { counts[t] = (counts[t] || { inserted: 0, updated: 0 }); };
  const TRACK = ['profiles', 'user_roles', 'vendors', 'vendor_campuses', 'vendor_operating_hours', 'products', 'product_images', 'services', 'marketplace_listings', 'listing_images'];
  TRACK.forEach(stat);

  const q = async (sql, params) => {
    if (DRY_RUN && !/^\s*(select|with)/i.test(sql)) return { rows: [{ id: 'dry-run', inserted: true }], rowCount: 1 };
    return db.query(sql, params);
  };

  try {
    await q('BEGIN');

    // ---- 1. lookups ----
    const campusRows = (await q(`select id, slug from campuses`)).rows;
    const campusId = Object.fromEntries(campusRows.map(r => [r.slug, r.id]));
    const catRows = (await q(`select id, slug, parent_id from categories`)).rows;
    const catId = Object.fromEntries(catRows.map(r => [r.slug, r.id]));

    // ---- 2. demo profiles (vendor owners + student sellers) ----
    // profiles.id -> auth.users(id). The project's own auth architecture
    // (userRepository.createUserAccount) inserts directly into auth.users, so
    // the seed follows the same pattern for demo accounts (bcrypt-crypt hash).
    for (const p of [...OWNERS, ...SELLERS]) {
      await q(
        `insert into auth.users (
           id, aud, role, email, encrypted_password, email_confirmed_at,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at
         ) values (
           $1, 'authenticated', 'authenticated', $2,
           crypt($3, gen_salt('bf')), now(),
           '{"provider":"email","providers":["email"]}'::jsonb,
           jsonb_build_object('full_name', $4::text), now(), now()
         )
         on conflict (id) do update set email = excluded.email, updated_at = now()`,
        [p.id, p.email, DEMO_PASSWORD, p.full_name]
      );
      const campus = SELLERS.find(s => s.id === p.id);
      const r = await q(
        `insert into profiles (id, email, full_name, default_campus_id, is_active, deleted_at)
         values ($1, $2, $3, $4, true, null)
         on conflict (id) do update
           set email = excluded.email, full_name = excluded.full_name
         returning xmax = 0 as inserted`,
        [p.id, p.email, p.full_name, campusId[campus ? campus.campus : 'unimaid']]
      );
      if (r.rows.length) counts.profiles[r.rows[0].inserted ? 'inserted' : 'updated']++;
    }

    // ---- 3. demo roles ----
    for (const o of OWNERS) {
      const r = await q(
        `insert into user_roles (user_id, role) values ($1, 'VENDOR')
         on conflict do nothing returning ctid`,
        [o.id]
      );
      if (r.rowCount) counts.user_roles.inserted++;
    }
    for (const s of SELLERS) {
      const r = await q(
        `insert into user_roles (user_id, role) values ($1, 'CUSTOMER')
         on conflict do nothing returning ctid`,
        [s.id]
      );
      if (r.rowCount) counts.user_roles.inserted++;
    }

    // ---- 4. vendors ----
    const vendorId = {};
    for (const v of VENDORS) {
      const r = await q(
        `insert into vendors (legacy_key, owner_user_id, name, slug, category_id, location, phone_number, email, description, status, is_verified)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', true)
         on conflict (slug) do update set
           name = excluded.name, category_id = excluded.category_id, location = excluded.location,
           description = excluded.description, status = 'ACTIVE', updated_at = now()
         returning id, xmax = 0 as inserted`,
        [`demo:vendor:${v.slug}`, demoUuid(v.owner), v.name, v.slug, catId[v.cat], v.location,
         `080${String(v.owner).padStart(8, '0')}`, `${v.slug}@demo.campuslife.express`, v.desc]
      );
      vendorId[v.slug] = r.rows[0].id;
      counts.vendors[r.rows[0].inserted ? 'inserted' : 'updated']++;
    }

    // ---- 5. vendor campuses ----
    for (const v of VENDORS) {
      for (const cs of v.campuses) {
        const r = await q(
          `insert into vendor_campuses (vendor_id, campus_id, location, is_active)
           values ($1, $2, $3, true)
           on conflict (vendor_id, campus_id) do update set is_active = true, location = excluded.location
           returning (xmax = 0) as inserted`,
          [vendorId[v.slug], campusId[cs], v.location]
        );
        if (r.rows[0]?.inserted) counts.vendor_campuses.inserted++; else if (r.rowCount) counts.vendor_campuses.updated++;
      }
    }

    // ---- 6. operating hours (per vendor x its first campus, deterministic) ----
    for (const v of VENDORS) {
      const campus = v.campuses[0];
      for (const h of HOURS[v.slug]) {
        if (!h.open) {
          // closed day: still upsert so re-runs are stable
          const r = await q(
            `insert into vendor_operating_hours (vendor_id, campus_id, day_of_week, opens_at, closes_at, is_closed)
             values ($1,$2,$3,null,null,true)
             on conflict (vendor_id, campus_id, day_of_week) do update set is_closed = true, opens_at = null, closes_at = null
             returning (xmax = 0) as inserted`,
            [vendorId[v.slug], campusId[campus], h.day]
          );
          if (r.rows[0]?.inserted) counts.vendor_operating_hours.inserted++; else if (r.rowCount) counts.vendor_operating_hours.updated++;
          continue;
        }
        const r = await q(
          `insert into vendor_operating_hours (vendor_id, campus_id, day_of_week, opens_at, closes_at, is_closed)
           values ($1,$2,$3,$4,$5,false)
           on conflict (vendor_id, campus_id, day_of_week) do update set opens_at = excluded.opens_at, closes_at = excluded.closes_at, is_closed = false
           returning (xmax = 0) as inserted`,
          [vendorId[v.slug], campusId[campus], h.day, h.open, h.close]
        );
        if (r.rows[0]?.inserted) counts.vendor_operating_hours.inserted++; else if (r.rowCount) counts.vendor_operating_hours.updated++;
      }
    }

    // ---- 7. products (per vendor, replicated to each of the vendor's campuses) ----
    for (const v of VENDORS) {
      const list = PRODUCTS[v.slug] || [];
      for (const p of list) {
        const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        for (const cs of v.campuses) {
          const legacy = `demo:product:${v.slug}:${slug}:${cs}`;
          const r = await q(
            `insert into products (legacy_key, slug, vendor_id, campus_id, category_id, subcategory_id, name, description,
               price_kobo, is_in_stock, stock_quantity, is_popular)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,false)
             on conflict (legacy_key) do update set
               name = excluded.name, description = excluded.description, price_kobo = excluded.price_kobo,
               subcategory_id = excluded.subcategory_id, is_in_stock = true, updated_at = now()
             returning id, xmax = 0 as inserted`,
            [legacy, `${v.slug}-${slug}`, vendorId[v.slug], campusId[cs], catId[v.cat], catId[p.subcat] || null,
             p.name, p.desc, naira(p.price), 25 + (p.name.length % 30)]
          );
          counts.products[r.rows[0].inserted ? 'inserted' : 'updated']++;
        }
      }
    }

    // ---- 8. services (per vendor x campuses) ----
    for (const s of SERVICES) {
      const v = VENDORS.find(x => x.slug === s.vendor);
      for (const cs of v.campuses) {
        const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const legacy = `demo:service:${s.vendor}:${slug}:${cs}`;
        const r = await q(
          `insert into services (legacy_key, slug, provider_user_id, vendor_id, campus_id, category_id, subcategory_id,
             name, description, starting_price_kobo, price_type, turnaround_time, is_active)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)
           on conflict (legacy_key) do update set
             name = excluded.name, description = excluded.description, starting_price_kobo = excluded.starting_price_kobo,
             price_type = excluded.price_type, turnaround_time = excluded.turnaround_time, is_active = true, updated_at = now()
           returning id, xmax = 0 as inserted`,
          [legacy, `${s.vendor}-${slug}`, demoUuid(v.owner), vendorId[s.vendor], campusId[cs],
           catId[v.cat], catId[s.subcat] || null, s.name, s.desc,
           s.price != null ? naira(s.price) : null, s.priceType, s.turnaround]
        );
        counts.services[r.rows[0].inserted ? 'inserted' : 'updated']++;
      }
    }

    // ---- 9. marketplace listings ----
    const ADMIN_ID = SELLERS[0].id; // demo moderator marker is fine for staging; real admins unchanged
    for (const [i, l] of LISTINGS.entries()) {
      const seller = SELLERS[l.s];
      const slug = l.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const legacy = `demo:listing:${String(i + 1).padStart(2, '0')}`;
      const r = await q(
        `insert into marketplace_listings (legacy_key, slug, seller_user_id, campus_id, category_id, subcategory_id,
           title, description, price_kobo, condition, status, seller_department, seller_contact_phone,
           moderated_by, rejection_reason)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,null)
         on conflict (legacy_key) do update set
           title = excluded.title, description = excluded.description, price_kobo = excluded.price_kobo,
           condition = excluded.condition, updated_at = now()
         returning id, xmax = 0 as inserted`,
        [legacy, slug, seller.id, campusId[l.campus], catId['marketplace'], catId[l.subcat] || null,
         l.title, l.desc, naira(l.price), l.condition, l.status, seller.dept,
         `080${String(300 + l.s).padStart(8, '0')}`,
         l.status === 'PUBLISHED' ? ADMIN_ID : null]
      );
      counts.marketplace_listings[r.rows[0].inserted ? 'inserted' : 'updated']++;
    }

    await q('COMMIT');
  } catch (e) {
    try { await db.query('ROLLBACK'); } catch (_) { /* noop */ }
    console.error('SEED FAILED (rolled back):', e.message);
    process.exit(1);
  }

  console.log('[seed summary]', JSON.stringify(counts, null, 2));
  console.log(DRY_RUN ? '[DRY RUN] no changes were committed.' : '[done] master demo seed complete.');
  await db.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
