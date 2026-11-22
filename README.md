# Aakansha Ladies Shop — Digital Catalogue & Store Management Platform

**Location:** Near Maharashtra Bank, Babhaleshwar, Taluka Rahata, District Ahilyanagar, Maharashtra, India - 413737  
**Store Policy:** In-store collection only • 48-hour hold upon confirmation • No home delivery

## Project Structure
- `index.html` — Storefront, language selector, category view, reservation & login modals, and owner dashboard shell
- `css/styles.css` — Maroon & Gold editorial theme with mobile-first responsive layout
- `js/config.js` — Store phone/WhatsApp settings, public URL, and Supabase keys
- `js/i18n.js` — Translations for `English`, `मराठी`, and `हिंदी`
- `js/seed-data.js` — All 10 categories, initial products, banners, and sample reviews
- `js/app.js` — Carousel, category routing, New Arrivals highlight, Wishlist, Save For Me modal, and Owner Admin Panel
- `supabase/migrations/001_init.sql` — Database tables, Row Level Security, and `pg_cron` 48-hour reservation expiry job
- `supabase/functions/expire-reservations/index.ts` — Scheduled Edge Function for 48-hour expiry

## Quick Local Run & Deployment
1. Open a terminal in `aakansha-ladies-shop` and run `npx serve .` (or `python -m http.server 8080`).
2. Create a free Supabase project, run `supabase/migrations/001_init.sql`, create your three owner users (**Father**, **Mother**, **Me**) in Supabase Auth, insert their UUIDs into `owner_profiles`, and add your Supabase URL + Anon Key in `js/config.js`.
3. Deploy the folder to **Vercel**, **Netlify**, or **GitHub Pages**, then generate/print the shop QR code inside **Admin -> Account & QR Settings**.
