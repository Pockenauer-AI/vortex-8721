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
  update public.player_economy e set diamonds = e.diamonds - v_item.price, equipped_cube_color = case when v_item.slug = 'purple-cube' then 'purple' else e.equipped_cube_color end, updated_at = now() where e.player_id = v_player_id;
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
  if p_color is null or p_color not in ('standard', 'purple') then raise exception 'Cube color is invalid.'; end if;
  if p_color = 'purple' and not exists(select 1 from public.player_inventory i where i.player_id = v_player_id and i.item_slug = 'purple-cube' and i.quantity > 0) then raise exception 'You do not own this cosmetic.'; end if;
  insert into public.player_economy (player_id, equipped_cube_color) values (v_player_id, p_color)
  on conflict (player_id) do update set equipped_cube_color = excluded.equipped_cube_color, updated_at = now();
  update public.player_sessions set last_used_at = now() where token_hash = extensions.digest(p_session_token, 'sha256');
  return query select * from public.get_player_economy(p_session_token);
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
    update public.player_economy e set diamonds = e.diamonds + 1, updated_at = now() where e.player_id = v_player_id returning true into v_awarded;
  end if;
  update public.player_sessions set last_used_at = now() where token_hash = extensions.digest(p_session_token, 'sha256');
  return query select v_awarded, e.diamonds from public.player_economy e where e.player_id = v_player_id;
end;
$$;
