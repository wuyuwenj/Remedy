-- ============================================================
-- Remedy — Supabase Setup
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Create the reports table
create table if not exists reports (
  id text primary key default gen_random_uuid(),
  url text not null,
  status text not null default 'queued',
  baseline jsonb,
  suggestions jsonb,
  optimizations jsonb,
  total_improvement text,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Index for faster lookups
create index if not exists idx_reports_created_at on reports (created_at desc);
create index if not exists idx_reports_url on reports (url);

-- 3. Enable Row Level Security (required by Supabase)
alter table reports enable row level security;

-- 4. Allow anonymous read/write (hackathon mode — no auth)
--    For production, replace these with proper auth policies
create policy "Allow anonymous read"
  on reports for select
  to anon
  using (true);

create policy "Allow anonymous insert"
  on reports for insert
  to anon
  with check (true);

create policy "Allow anonymous update"
  on reports for update
  to anon
  using (true)
  with check (true);

-- 5. Auto-update the updated_at timestamp
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger reports_updated_at
  before update on reports
  for each row
  execute function update_updated_at();
