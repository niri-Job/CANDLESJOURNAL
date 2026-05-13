-- Trade Reflections table — stores post-trade reflection notes + AI coaching
create table if not exists trade_reflections (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  trade_id      uuid        not null references trades(id) on delete cascade,
  plan          text,
  what_happened text,
  what_different text,
  ai_feedback   text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (user_id, trade_id)
);

create index if not exists trade_reflections_user_id_idx  on trade_reflections (user_id);
create index if not exists trade_reflections_trade_id_idx on trade_reflections (trade_id);

-- RLS
alter table trade_reflections enable row level security;

create policy "users can manage own reflections" on trade_reflections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
