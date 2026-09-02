-- Match Stat Tracker — Supabase schema
-- Run this once in your project's SQL editor (Supabase Dashboard → SQL Editor → New query)

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'New match',
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  name text not null,
  jersey text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  stat text not null,
  stat_label text not null,
  clock text,
  logged_at timestamptz not null default now()
);

create index if not exists players_match_id_idx on public.players(match_id);
create index if not exists events_match_id_idx on public.events(match_id);
create index if not exists events_player_id_idx on public.events(player_id);

alter table public.matches enable row level security;
alter table public.players enable row level security;
alter table public.events enable row level security;

-- Explicit Data API grants — required regardless of whether "Default privileges
-- for new entities" was ticked at project creation. Row-level security (above)
-- still restricts *which rows* each user can see; these grants just make the
-- tables reachable through the API at all.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.matches to anon, authenticated;
grant select, insert, update, delete on public.players to anon, authenticated;
grant select, insert, update, delete on public.events to anon, authenticated;

drop policy if exists "Users manage own matches" on public.matches;
create policy "Users manage own matches" on public.matches
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage players in own matches" on public.players;
create policy "Users manage players in own matches" on public.players
  for all
  using (exists (select 1 from public.matches m where m.id = players.match_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.matches m where m.id = players.match_id and m.user_id = auth.uid()));

drop policy if exists "Users manage events in own matches" on public.events;
create policy "Users manage events in own matches" on public.events
  for all
  using (exists (select 1 from public.matches m where m.id = events.match_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.matches m where m.id = events.match_id and m.user_id = auth.uid()));
