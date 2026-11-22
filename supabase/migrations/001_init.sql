-- Aakansha Ladies Shop Supabase Schema, RLS & 48-Hour Reservation Expiry
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";

create table if not exists public.owner_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  owner_role text not null check (owner_role in ('Father', 'Mother', 'Me')),
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id text primary key,
  slug text unique not null,
  name_en text not null,
  name_mr text not null,
  name_hi text not null,
  image text not null,
  sort_order int not null default 1
);

create table if not exists public.products (
  id text primary key,
  category_id text not null references public.categories(id) on delete cascade,
  name_en text not null,
  name_mr text not null,
  name_hi text not null,
  price numeric(10,2) not null check (price >= 0),
  stock int not null default 0 check (stock >= 0),
  image text not null,
  is_new_arrival boolean not null default false,
  is_popular boolean not null default false,
  sort_order int not null default 1
);

create table if not exists public.banners (
  id text primary key,
  title_en text not null,
  title_mr text not null,
  title_hi text not null,
  subtitle_en text default '',
  subtitle_mr text default '',
  subtitle_hi text default '',
  image text not null,
  target_type text default 'category',
  target_id text default '',
  product_id text references public.products(id) on delete set null,
  sort_order int not null default 1
);

create table if not exists public.reservations (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  product_name_en text not null,
  product_image text not null,
  customer_name text not null,
  customer_phone text not null,
  quantity int not null check (quantity > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'collected', 'cancelled', 'expired')),
  confirmed_at timestamptz,
  expires_at timestamptz,
  expired_notified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id text primary key,
  customer_name text not null,
  rating int not null check (rating between 1 and 5),
  comment text not null,
  created_at timestamptz not null default now()
);

-- Scheduled database function to expire confirmed 48-hour reservations & restore stock
create or replace function public.expire_overdue_reservations()
returns void
language plpgsql
security definer
as $$
declare
  rec record;
begin
  for rec in
    select id, product_id, quantity
    from public.reservations
    where status = 'confirmed'
      and expires_at is not null
      and expires_at <= now()
  loop
    update public.products
    set stock = stock + rec.quantity
    where id = rec.product_id;

    update public.reservations
    set status = 'expired',
        expired_notified = true
    where id = rec.id;
  end loop;
end;
$$;

-- Schedule every 15 minutes via pg_cron
select cron.schedule(
  'aakansha_expire_reservations_job',
  '*/15 * * * *',
  $$select public.expire_overdue_reservations();$$
);

-- Enable Row Level Security
alter table public.owner_profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.banners enable row level security;
alter table public.reservations enable row level security;
alter table public.feedback enable row level security;

create or replace function public.is_shop_owner()
returns boolean
language sql
stable
as $$
  select exists (select 1 from public.owner_profiles where id = auth.uid());
$$;

-- Public read policies for catalogue & reviews
create policy "Public read categories" on public.categories for select using (true);
create policy "Public read products" on public.products for select using (true);
create policy "Public read banners" on public.banners for select using (true);
create policy "Public read feedback" on public.feedback for select using (true);
create policy "Public insert feedback" on public.feedback for insert with check (true);
create policy "Public insert reservation" on public.reservations for insert with check (status = 'pending');

-- Owner-only write & full management policies
create policy "Owner manage profiles" on public.owner_profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "Owner manage categories" on public.categories for all using (public.is_shop_owner()) with check (public.is_shop_owner());
create policy "Owner manage products" on public.products for all using (public.is_shop_owner()) with check (public.is_shop_owner());
create policy "Owner manage banners" on public.banners for all using (public.is_shop_owner()) with check (public.is_shop_owner());
create policy "Owner manage reservations" on public.reservations for all using (public.is_shop_owner()) with check (public.is_shop_owner());
create policy "Owner manage feedback" on public.feedback for all using (public.is_shop_owner()) with check (public.is_shop_owner());
