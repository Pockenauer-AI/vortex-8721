create extension if not exists pgcrypto with schema extensions;

create table public.players (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  constraint players_name_length check (char_length(name) between 2 and 20)
);

create unique index players_name_lower_unique on public.players (lower(name));

create table public.player_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);

create index player_sessions_player_id_idx on public.player_sessions (player_id);
create index player_sessions_expires_at_idx on public.player_sessions (expires_at);

create table public.games (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  instructions text not null,
  score_unit text not null,
  score_direction text not null,
  score_decimals smallint not null default 0,
  min_score numeric not null,
  max_score numeric not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint games_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint games_score_direction check (score_direction in ('lower', 'higher')),
  constraint games_score_decimals check (score_decimals between 0 and 3),
  constraint games_score_bounds check (min_score <= max_score)
);

create table public.scores (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  score numeric(14, 3) not null,
  submitted_at timestamptz not null default now()
);

create index scores_game_player_score_idx on public.scores (game_id, player_id, score);
create index scores_player_id_idx on public.scores (player_id);

create table public.game_ideas (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  idea_text text not null,
  created_at timestamptz not null default now(),
  constraint game_ideas_length check (char_length(idea_text) between 5 and 500)
);

create index game_ideas_created_at_idx on public.game_ideas (created_at desc);
create index game_ideas_player_id_idx on public.game_ideas (player_id);

alter table public.players enable row level security;
alter table public.player_sessions enable row level security;
alter table public.games enable row level security;
alter table public.scores enable row level security;
alter table public.game_ideas enable row level security;

revoke all on table public.players, public.player_sessions, public.games, public.scores, public.game_ideas from public, anon, authenticated;
revoke all on sequence public.scores_id_seq, public.game_ideas_id_seq from public, anon, authenticated;

create or replace function public.login_or_register_player(p_name text, p_pin text)
returns table (session_token text, player_id uuid, player_name text, is_new boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_player public.players%rowtype;
  v_token text;
  v_is_new boolean := false;
begin
  if v_name is null or char_length(v_name) not between 2 and 20 or v_name !~ '^[A-Za-z0-9][A-Za-z0-9 _-]{0,18}[A-Za-z0-9]$' then
    raise exception 'Name must be 2-20 characters and use letters, numbers, spaces, underscores, or hyphens.';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,12}$' then
    raise exception 'PIN must contain 4-12 digits.';
  end if;

  select * into v_player from public.players where lower(name) = lower(v_name) for update;
  if not found then
    begin
      insert into public.players (name, pin_hash) values (v_name, extensions.crypt(p_pin, extensions.gen_salt('bf', 10))) returning * into v_player;
      v_is_new := true;
    exception when unique_violation then
      select * into v_player from public.players where lower(name) = lower(v_name) for update;
    end;
  end if;

  if not v_is_new and extensions.crypt(p_pin, v_player.pin_hash) <> v_player.pin_hash then
    raise exception 'Incorrect PIN for this player name.';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.player_sessions (player_id, token_hash) values (v_player.id, extensions.digest(v_token, 'sha256'));
  return query select v_token, v_player.id, v_player.name, v_is_new;
end;
$$;

create or replace function public.get_session_player(p_session_token text)
returns table (player_id uuid, player_name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_session_token is null or char_length(p_session_token) <> 64 then return; end if;
  update public.player_sessions set last_used_at = now() where token_hash = extensions.digest(p_session_token, 'sha256') and expires_at > now();
  return query
    select p.id, p.name
    from public.player_sessions s
    join public.players p on p.id = s.player_id
    where s.token_hash = extensions.digest(p_session_token, 'sha256') and s.expires_at > now();
end;
$$;

create or replace function public.list_games()
returns table (slug text, title text, description text, instructions text, score_unit text, score_direction text, score_decimals smallint, min_score numeric, max_score numeric)
language sql
security definer
set search_path = ''
stable
as $$
  select g.slug, g.title, g.description, g.instructions, g.score_unit, g.score_direction, g.score_decimals, g.min_score, g.max_score
  from public.games g
  where g.active
  order by g.sort_order, g.title;
$$;

create or replace function public.get_game_leaderboard(p_game_slug text, p_limit integer default 50)
returns table (place bigint, player_id uuid, player_name text, score numeric)
language sql
security definer
set search_path = ''
stable
as $$
  with game_info as (
    select id, score_direction from public.games where slug = p_game_slug and active
  ),
  best_scores as (
    select s.player_id, case when gi.score_direction = 'lower' then min(s.score) else max(s.score) end as score, gi.score_direction
    from public.scores s
    join game_info gi on gi.id = s.game_id
    group by s.player_id, gi.score_direction
  ),
  ranked as (
    select dense_rank() over (order by case when b.score_direction = 'lower' then b.score end asc, case when b.score_direction = 'higher' then b.score end desc) as place, b.player_id, p.name as player_name, b.score
    from best_scores b
    join public.players p on p.id = b.player_id
  )
  select r.place, r.player_id, r.player_name, r.score
  from ranked r
  order by r.place, lower(r.player_name)
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

create or replace function public.get_overall_leaderboard(p_limit integer default 100)
returns table (overall_position bigint, player_id uuid, player_name text, game_wins bigint, average_place numeric, games_played bigint)
language sql
security definer
set search_path = ''
stable
as $$
  with best_scores as (
    select s.player_id, s.game_id, case when g.score_direction = 'lower' then min(s.score) else max(s.score) end as score, g.score_direction
    from public.scores s
    join public.games g on g.id = s.game_id and g.active
    group by s.player_id, s.game_id, g.score_direction
  ),
  game_places as (
    select b.player_id, b.game_id, dense_rank() over (partition by b.game_id order by case when b.score_direction = 'lower' then b.score end asc, case when b.score_direction = 'higher' then b.score end desc) as place
    from best_scores b
  ),
  totals as (
    select gp.player_id, count(*) filter (where gp.place = 1) as game_wins, avg(gp.place)::numeric as average_place, count(*) as games_played
    from game_places gp
    group by gp.player_id
  ),
  ranked as (
    select row_number() over (order by t.game_wins desc, t.average_place asc, t.games_played desc, lower(p.name)) as overall_position, t.player_id, p.name as player_name, t.game_wins, round(t.average_place, 2) as average_place, t.games_played
    from totals t
    join public.players p on p.id = t.player_id
  )
  select r.overall_position, r.player_id, r.player_name, r.game_wins, r.average_place, r.games_played
  from ranked r
  order by r.overall_position
  limit greatest(1, least(coalesce(p_limit, 100), 250));
$$;

create or replace function public.submit_score(p_session_token text, p_game_slug text, p_score numeric)
returns table (score_id bigint, personal_best numeric, is_personal_best boolean, current_place bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_game public.games%rowtype;
  v_score_id bigint;
  v_previous_best numeric;
  v_personal_best numeric;
  v_place bigint;
begin
  select s.player_id into v_player_id from public.player_sessions s where s.token_hash = extensions.digest(coalesce(p_session_token, ''), 'sha256') and s.expires_at > now();
  if v_player_id is null then raise exception 'Your session expired. Please log in again.'; end if;

  select * into v_game from public.games where slug = p_game_slug and active;
  if not found then raise exception 'Game not found.'; end if;
  if p_score is null or p_score::text in ('NaN', 'Infinity', '-Infinity') or p_score < v_game.min_score or p_score > v_game.max_score then
    raise exception 'Score is outside the valid range for this game.';
  end if;
  if round(p_score, v_game.score_decimals) <> p_score then raise exception 'Score has too many decimal places.'; end if;

  select case when v_game.score_direction = 'lower' then min(s.score) else max(s.score) end into v_previous_best from public.scores s where s.player_id = v_player_id and s.game_id = v_game.id;
  insert into public.scores (player_id, game_id, score) values (v_player_id, v_game.id, p_score) returning id into v_score_id;
  select case when v_game.score_direction = 'lower' then min(s.score) else max(s.score) end into v_personal_best from public.scores s where s.player_id = v_player_id and s.game_id = v_game.id;

  with best_scores as (
    select s.player_id, case when v_game.score_direction = 'lower' then min(s.score) else max(s.score) end as score
    from public.scores s where s.game_id = v_game.id group by s.player_id
  ),
  ranked as (
    select b.player_id, dense_rank() over (order by case when v_game.score_direction = 'lower' then b.score end asc, case when v_game.score_direction = 'higher' then b.score end desc) as place from best_scores b
  )
  select r.place into v_place from ranked r where r.player_id = v_player_id;

  update public.player_sessions set last_used_at = now() where token_hash = extensions.digest(p_session_token, 'sha256');
  return query select v_score_id, v_personal_best, v_previous_best is null or (v_game.score_direction = 'lower' and p_score < v_previous_best) or (v_game.score_direction = 'higher' and p_score > v_previous_best), v_place;
end;
$$;

create or replace function public.submit_game_idea(p_session_token text, p_idea text)
returns table (idea_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_idea text := btrim(p_idea);
  v_idea_id bigint;
begin
  select s.player_id into v_player_id from public.player_sessions s where s.token_hash = extensions.digest(coalesce(p_session_token, ''), 'sha256') and s.expires_at > now();
  if v_player_id is null then raise exception 'Your session expired. Please log in again.'; end if;
  if v_idea is null or char_length(v_idea) not between 5 and 500 then raise exception 'Idea must be 5-500 characters.'; end if;
  insert into public.game_ideas (player_id, idea_text) values (v_player_id, v_idea) returning id into v_idea_id;
  update public.player_sessions set last_used_at = now() where token_hash = extensions.digest(p_session_token, 'sha256');
  return query select v_idea_id;
end;
$$;

revoke execute on function public.login_or_register_player(text, text), public.get_session_player(text), public.list_games(), public.get_game_leaderboard(text, integer), public.get_overall_leaderboard(integer), public.submit_score(text, text, numeric), public.submit_game_idea(text, text) from public;
grant execute on function public.login_or_register_player(text, text), public.get_session_player(text), public.list_games(), public.get_game_leaderboard(text, integer), public.get_overall_leaderboard(integer), public.submit_score(text, text, numeric), public.submit_game_idea(text, text) to anon, authenticated;

insert into public.games (slug, title, description, instructions, score_unit, score_direction, score_decimals, min_score, max_score, sort_order)
values ('reaction-test', 'Reaction Test', 'Wait for the signal, then click before your friends can blink.', 'Press start, wait until the panel turns green, then click as quickly as possible. Clicking early causes a false start. Your lowest reaction time is your leaderboard score.', 'ms', 'lower', 0, 50, 5000, 10);
