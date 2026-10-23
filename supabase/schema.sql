-- Kegel Coach · schema Supabase
-- Incolla tutto nello SQL Editor di Supabase ed esegui (una sola volta).

-- 1) Esercizi personalizzati dell'utente
create table if not exists public.custom_exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  description  text not null default '' check (char_length(description) <= 300),
  contract_sec int  not null check (contract_sec between 1 and 30),
  rest_sec     int  not null check (rest_sec between 1 and 30),
  reps         int  not null check (reps between 1 and 50),
  sets         int  not null check (sets between 1 and 10),
  set_rest_sec int  not null default 30 check (set_rest_sec between 0 and 120),
  created_at   timestamptz not null default now()
);

-- 2) Sessioni completate (ognuna con il suo score 0-100)
create table if not exists public.sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercise_id     text not null,              -- 'd-lente' (default) oppure uuid di custom_exercises
  exercise_name   text not null,
  score           int  not null check (score between 0 and 100),
  completed_reps  int  not null check (completed_reps >= 0),
  total_reps      int  not null check (total_reps > 0),
  quality         int  not null check (quality between 1 and 5),
  duration_sec    int  not null check (duration_sec >= 0),
  day             date not null,              -- giorno locale dell'utente (serve per la streak)
  created_at      timestamptz not null default now()
);
create index if not exists sessions_user_day_idx on public.sessions (user_id, day);

-- 3) Trofei sbloccati
create table if not exists public.user_trophies (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trophy_id   text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, trophy_id)
);

-- 4) Row Level Security: ogni utente vede e modifica SOLO i propri dati
alter table public.custom_exercises enable row level security;
alter table public.sessions         enable row level security;
alter table public.user_trophies    enable row level security;

drop policy if exists "own custom_exercises" on public.custom_exercises;
create policy "own custom_exercises" on public.custom_exercises
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own sessions" on public.sessions;
create policy "own sessions" on public.sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own user_trophies" on public.user_trophies;
create policy "own user_trophies" on public.user_trophies
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 5) Permessi API (necessari se "Automatically expose new tables" è DISATTIVATO alla creazione del progetto)
--    Solo gli utenti loggati (ruolo authenticated) possono usare le tabelle; "anon" non ha accesso.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.custom_exercises to authenticated;
grant select, insert, update, delete on public.sessions         to authenticated;
grant select, insert, update, delete on public.user_trophies    to authenticated;
