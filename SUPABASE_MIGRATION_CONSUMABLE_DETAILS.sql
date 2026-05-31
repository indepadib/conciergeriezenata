-- Détail des consommables par bien / mois
-- À lancer dans Supabase > SQL Editor > Run

create extension if not exists "pgcrypto";

create table if not exists public.consumable_lines (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null,
  period_start date not null,
  period_end date not null,
  category text not null default 'Consommables',
  description text not null,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists consumable_lines_unique_month_item
on public.consumable_lines (property_id, period_start, period_end, description);

create index if not exists consumable_lines_property_period_idx
on public.consumable_lines (property_id, period_start, period_end);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_consumable_lines_updated_at on public.consumable_lines;

create trigger trg_consumable_lines_updated_at
before update on public.consumable_lines
for each row
execute function public.set_updated_at();

alter table public.consumable_lines enable row level security;

drop policy if exists "consumable_lines_select_authenticated" on public.consumable_lines;
drop policy if exists "consumable_lines_insert_authenticated" on public.consumable_lines;
drop policy if exists "consumable_lines_update_authenticated" on public.consumable_lines;
drop policy if exists "consumable_lines_delete_authenticated" on public.consumable_lines;

create policy "consumable_lines_select_authenticated"
on public.consumable_lines
for select
to authenticated
using (true);

create policy "consumable_lines_insert_authenticated"
on public.consumable_lines
for insert
to authenticated
with check (true);

create policy "consumable_lines_update_authenticated"
on public.consumable_lines
for update
to authenticated
using (true)
with check (true);

create policy "consumable_lines_delete_authenticated"
on public.consumable_lines
for delete
to authenticated
using (true);

notify pgrst, 'reload schema';
