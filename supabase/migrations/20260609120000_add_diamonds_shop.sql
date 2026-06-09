create table public.shop_items (
  slug text primary key,
  category text not null,
  title text not null,
  description text not null,
  price integer not null,
  item_type text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  constraint shop_items_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint shop_items_category check (category in ('helper', 'cosmetic')),
  constraint shop_items_price check (price > 0),
  constraint shop_items_type check (item_type in ('consumable', 'cosmetic'))
);

create table public.player_economy (
  player_id uuid primary key references public.players(id) on delete cascade,
  diamonds integer not null default 0,
  equipped_cube_color text not null default 'standard',
  updated_at timestamptz not null default now(),
  constraint player_economy_diamonds check (diamonds >= 0),
  constraint player_economy_cube_color check (equipped_cube_color in ('standard', 'purple'))
);

create table public.player_inventory (
  player_id uuid not null references public.players(id) on delete cascade,
  item_slug text not null references public.shop_items(slug) on delete cascade,
  quantity integer not null default 0,
  purchased_at timestamptz not null default now(),
  primary key (player_id, item_slug),
  constraint player_inventory_quantity check (quantity >= 0)
);

create table public.neon_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  seed integer not null,
  speed_boost boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint neon_runs_seed check (seed between 1 and 2147483646)
);

create index neon_runs_player_id_idx on public.neon_runs (player_id, started_at desc);

create table public.diamond_claims (
  run_id uuid not null references public.neon_runs(id) on delete cascade,
  chunk integer not null,
  player_id uuid not null references public.players(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (run_id, chunk),
  constraint diamond_claims_chunk check (chunk >= 0)
);

create index diamond_claims_player_id_idx on public.diamond_claims (player_id, claimed_at desc);

insert into public.shop_items (slug, category, title, description, price, item_type, sort_order)
values
  ('neon-2x-start', 'helper', '2x Speed Start', 'Start one Neon Rush run at 2x speed until the normal speed curve catches up.', 1, 'consumable', 10),
  ('purple-cube', 'cosmetic', 'Purple Player Cube', 'Unlock a permanent purple color for your Neon Rush player cube.', 3, 'cosmetic', 20)
on conflict (slug) do update set
  category = excluded.category,
  title = excluded.title,
  description = excluded.description,
  price = excluded.price,
  item_type = excluded.item_type,
  sort_order = excluded.sort_order,
  active = true;

insert into public.player_economy (player_id)
select p.id from public.players p
on conflict (player_id) do nothing;

alter table public.shop_items enable row level security;
alter table public.player_economy enable row level security;
alter table public.player_inventory enable row level security;
alter table public.neon_runs enable row level security;
alter table public.diamond_claims enable row level security;

revoke all on table public.shop_items, public.player_economy, public.player_inventory, public.neon_runs, public.diamond_claims from public, anon, authenticated;

create or replace function public.get_player_economy(p_session_token text)
returns table (diamonds integer, speed_boost_quantity integer, owns_purple_cube boolean, equipped_cube_color text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
begin
  select s.player_id into v_player_id from public.player_sessions s where s.token_hash = extensions.digest(coalesce(p_session_token, ''), 'sha256') and s.expires_at > now();
  if v_player_id is null then raise exception 'Your session expired. Please log in again.'; end if;
  insert into public.player_economy (player_id) values (v_player_id) on conflict (player_id) do nothing;
  update public.player_sessions set last_used_at = now() where token_hash = extensions.digest(p_session_token, 'sha256');
  return query
    select e.diamonds,
      coalesce((select i.quantity from public.player_inventory i where i.player_id = v_player_id and i.item_slug = 'neon-2x-start'), 0),
      exists(select 1 from public.player_inventory i where i.player_id = v_player_id and i.item_slug = 'purple-cube' and i.quantity > 0),
      e.equipped_cube_color
    from public.player_economy e
    where e.player_id = v_player_id;
end;
$$;

create or replace function public.get_shop_state(p_session_token text)
returns table (diamonds integer, item_slug text, category text, title text, description text, price integer, item_type text, quantity integer, owned boolean, equipped boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
begin
  select s.player_id into v_player_id from public.player_sessions s where s.token_hash = extensions.digest(coalesce(p_session_token, ''), 'sha256') and s.expires_at > now();
  if v_player_id is null then raise exception 'Your session expired. Please log in again.'; end if;
  insert into public.player_economy (player_id) values (v_player_id) on conflict (player_id) do nothing;
  return query
    select e.diamonds, si.slug, si.category, si.title, si.description, si.price, si.item_type, coalesce(i.quantity, 0),
      coalesce(i.quantity, 0) > 0,
      si.slug = 'purple-cube' and e.equipped_cube_color = 'purple'
    from public.shop_items si
    cross join public.player_economy e
    left join public.player_inventory i on i.player_id = v_player_id and i.item_slug = si.slug
    where si.active and e.player_id = v_player_id
    order by si.category, si.sort_order, si.title;
end;
$$;

create or replace function public.purchase_shop_item(p_session_token text, p_item_slug text)
returns table (diamonds integer, speed_boost_quantity integer, owns_purple_cube boolean, equipped_cube_color text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_item public.shop_items%rowtype;
  v_balance integer;
begin
  select s.player_id into v_player_id from public.player_sessions s where s.token_hash = extensions.digest(coalesce(p_session_token, ''), 'sha256') and s.expires_at > now();
  if v_player_id is null then raise exception 'Your session expired. Please log in again.'; end if;
  select * into v_item from public.shop_items si where si.slug = p_item_slug and si.active;
  if not found then raise exception 'Shop item not found.'; end if;
  insert into public.player_economy (player_id) values (v_player_id) on conflict (player_id) do nothing;
  select e.diamonds into v_balance from public.player_economy e where e.player_id = v_player_id for update;
  if v_item.item_type = 'cosmetic' and exists(select 1 from public.player_inventory i where i.player_id = v_player_id and i.item_slug = v_item.slug and i.quantity > 0) then raise exception 'You already own this cosmetic.'; end if;
  if v_balance < v_item.price then raise exception 'Not enough diamonds.'; end if;
  update public.player_economy set diamonds = diamonds - v_item.price, equipped_cube_color = case when v_item.slug = 'purple-cube' then 'purple' else equipped_cube_color end, updated_at = now() where player_id = v_player_id;
  insert into public.player_inventory (player_id, item_slug, quantity) values (v_player_id, v_item.slug, 1)
  on conflict (player_id, item_slug) do update set quantity = case when v_item.item_type = 'consumable' then public.player_inventory.quantity + 1 else 1 end, purchased_at = now();
  update public.player_sessions set last_used_at = now() where token_hash = extensions.digest(p_session_token, 'sha256');
  return query select * from public.get_player_economy(p_session_token);
end;
$$;

create or replace function public.equip_cube_color(p_session_token text, p_color text)
returns table (diamonds integer, speed_boost_quantity integer, owns_purple_cube boolean, equipped_cube_color text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
begin
  select s.player_id into v_player_id from public.player_sessions s where s.token_hash = extensions.digest(coalesce(p_session_token, ''), 'sha256') and s.expires_at > now();
  if v_player_id is null then raise exception 'Your session expired. Please log in again.'; end if;
  if p_color not in ('standard', 'purple') then raise exception 'Cube color is invalid.'; end if;
  if p_color = 'purple' and not exists(select 1 from public.player_inventory i where i.player_id = v_player_id and i.item_slug = 'purple-cube' and i.quantity > 0) then raise exception 'You do not own this cosmetic.'; end if;
  insert into public.player_economy (player_id, equipped_cube_color) values (v_player_id, p_color)
  on conflict (player_id) do update set equipped_cube_color = excluded.equipped_cube_color, updated_at = now();
  update public.player_sessions set last_used_at = now() where token_hash = extensions.digest(p_session_token, 'sha256');
  return query select * from public.get_player_economy(p_session_token);
end;
$$;

create or replace function public.begin_neon_run(p_session_token text, p_use_speed_boost boolean default false)
returns table (run_id uuid, run_seed integer, speed_boost boolean, diamonds integer, speed_boost_quantity integer, cube_color text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_run_id uuid;
  v_seed integer := floor(random() * 2147483646)::integer + 1;
  v_quantity integer;
begin
  select s.player_id into v_player_id from public.player_sessions s where s.token_hash = extensions.digest(coalesce(p_session_token, ''), 'sha256') and s.expires_at > now();
  if v_player_id is null then raise exception 'Your session expired. Please log in again.'; end if;
  insert into public.player_economy (player_id) values (v_player_id) on conflict (player_id) do nothing;
  if coalesce(p_use_speed_boost, false) then
    select i.quantity into v_quantity from public.player_inventory i where i.player_id = v_player_id and i.item_slug = 'neon-2x-start' for update;
    if coalesce(v_quantity, 0) < 1 then raise exception 'You do not have a 2x Speed Start.'; end if;
    update public.player_inventory set quantity = quantity - 1 where player_id = v_player_id and item_slug = 'neon-2x-start';
  end if;
  insert into public.neon_runs (player_id, seed, speed_boost) values (v_player_id, v_seed, coalesce(p_use_speed_boost, false)) returning id into v_run_id;
  update public.player_sessions set last_used_at = now() where token_hash = extensions.digest(p_session_token, 'sha256');
  return query
    select v_run_id, v_seed, coalesce(p_use_speed_boost, false), e.diamonds,
      coalesce((select i.quantity from public.player_inventory i where i.player_id = v_player_id and i.item_slug = 'neon-2x-start'), 0),
      e.equipped_cube_color
    from public.player_economy e where e.player_id = v_player_id;
end;
$$;

create or replace function public.claim_neon_diamond(p_session_token text, p_run_id uuid, p_chunk integer)
returns table (awarded boolean, diamonds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_seed integer;
  v_awarded boolean := false;
begin
  select s.player_id into v_player_id from public.player_sessions s where s.token_hash = extensions.digest(coalesce(p_session_token, ''), 'sha256') and s.expires_at > now();
  if v_player_id is null then raise exception 'Your session expired. Please log in again.'; end if;
  select r.seed into v_seed from public.neon_runs r where r.id = p_run_id and r.player_id = v_player_id and r.ended_at is null and r.started_at > now() - interval '6 hours';
  if v_seed is null then raise exception 'Neon run not found or already ended.'; end if;
  if p_chunk is null or p_chunk < 0 or 30 + p_chunk::bigint * 22 + 18 < 2500 then raise exception 'Diamond is not available in this chunk.'; end if;
  if (((p_chunk::bigint * 48271 + v_seed::bigint * 69621) % 2147483647) % 100) <> 0 then raise exception 'Diamond is not available in this chunk.'; end if;
  insert into public.diamond_claims (run_id, chunk, player_id) values (p_run_id, p_chunk, v_player_id) on conflict (run_id, chunk) do nothing;
  if found then
    update public.player_economy set diamonds = diamonds + 1, updated_at = now() where player_id = v_player_id returning true into v_awarded;
  end if;
  update public.player_sessions set last_used_at = now() where token_hash = extensions.digest(p_session_token, 'sha256');
  return query select v_awarded, e.diamonds from public.player_economy e where e.player_id = v_player_id;
end;
$$;

create or replace function public.end_neon_run(p_session_token text, p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
begin
  select s.player_id into v_player_id from public.player_sessions s where s.token_hash = extensions.digest(coalesce(p_session_token, ''), 'sha256') and s.expires_at > now();
  if v_player_id is null then raise exception 'Your session expired. Please log in again.'; end if;
  update public.neon_runs set ended_at = coalesce(ended_at, now()) where id = p_run_id and player_id = v_player_id;
end;
$$;

revoke execute on function public.get_player_economy(text), public.get_shop_state(text), public.purchase_shop_item(text, text), public.equip_cube_color(text, text), public.begin_neon_run(text, boolean), public.claim_neon_diamond(text, uuid, integer), public.end_neon_run(text, uuid) from public;
grant execute on function public.get_player_economy(text), public.get_shop_state(text), public.purchase_shop_item(text, text), public.equip_cube_color(text, text), public.begin_neon_run(text, boolean), public.claim_neon_diamond(text, uuid, integer), public.end_neon_run(text, uuid) to anon, authenticated;
