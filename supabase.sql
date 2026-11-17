-- À coller dans Supabase > SQL Editor > Run (une seule fois).
create table if not exists public.progression (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.progression enable row level security;
create policy "lecture proprietaire" on public.progression for select using (auth.uid() = user_id);
create policy "insertion proprietaire" on public.progression for insert with check (auth.uid() = user_id);
create policy "mise a jour proprietaire" on public.progression for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
