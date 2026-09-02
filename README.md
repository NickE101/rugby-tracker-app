# Match Stat Tracker

A rugby stat-tagging app: pick a player, tap or press a key for what they did, and watch
totals, a dashboard, metrics and a match timeline build live. Data is stored in Supabase
(Postgres, with row-level security) so it's available from any device you sign into,
and you can keep multiple matches on record.

Stack: **React 18 + Vite**, **Supabase** (Postgres + Auth + RLS), deployed on **Vercel** —
same shape as the DVDS case management tool.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and create a **new project** (separate from
   any other project you run — this app gets its own).
2. Once it's provisioned, open **SQL Editor → New query**, paste in the contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates the `matches`,
   `players`, and `events` tables with row-level security so each signed-in user only ever
   sees their own data.
3. Go to **Project Settings → API**. You'll need two values from here:
   - **Project URL**
   - **anon public** key
4. Go to **Authentication → Providers** and make sure **Email** is enabled (it is by
   default). This app signs in with a magic link — no password to manage.
   - Under **Authentication → URL Configuration**, add your local dev URL
     (`http://localhost:5173`) and your eventual Vercel URL to the allowed redirect list
     once you have it, so the magic link sends people back to the right place.

## 2. Run it locally

```bash
npm install
cp .env.example .env
# edit .env and paste in your Project URL and anon key
npm run dev
```

Open the local URL it prints, enter your email, and click the magic link that arrives
in your inbox. You'll land back in the app signed in.

## 3. Deploy to Vercel

1. Push this project to a GitHub repo.
2. In Vercel, **Add New → Project**, import that repo. Vercel auto-detects Vite —
   build command `npm run build`, output directory `dist`.
3. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Once it's live, go back to Supabase **Authentication → URL Configuration**
   and add your `*.vercel.app` URL (and any custom domain) to the allowed redirect URLs,
   so magic links work in production too.

## How the data is organised

- **matches** — one row per match you track, scoped to your account.
- **players** — the roster for a given match.
- **events** — every tagged action (player, stat, video timestamp).

Deleting a match cascades to its players and events. Deleting a player cascades to
their events. All of this is enforced by the RLS policies in `schema.sql`, so even if
someone else somehow got hold of your anon key, they couldn't read or write your rows —
Postgres checks `auth.uid()` against the row owner on every request.

## Notes

- Keyboard shortcuts: press `1`–`19` to select a player (see the number on their roster
  chip; for 10–19, tap the first digit then the second quickly), then the letter shown
  on each action button to log it.
- "Add multiple" on the roster panel accepts a pasted list, one player per line, with an
  optional jersey number anywhere in the line.
- The CSV export button pulls the full event log and per-player/team totals for the
  currently selected match.
