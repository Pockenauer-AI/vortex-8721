create table public.feedback (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  game_id uuid references public.games(id) on delete set null,
  scope text not null,
  feedback_text text not null,
  created_at timestamptz not null default now(),
  constraint feedback_scope check (scope in ('hub', 'game')),
  constraint feedback_length check (char_length(feedback_text) between 5 and 1000),
  constraint feedback_scope_game check ((scope = 'hub' and game_id is null) or (scope = 'game' and game_id is not null))
);

create index feedback_created_at_idx on public.feedback (created_at desc);
create index feedback_player_id_idx on public.feedback (player_id);
create index feedback_game_id_idx on public.feedback (game_id) where game_id is not null;

alter table public.feedback enable row level security;

revoke all on table public.feedback from public, anon, authenticated;
revoke all on sequence public.feedback_id_seq from public, anon, authenticated;

create or replace function public.submit_feedback(p_session_token text, p_scope text, p_game_slug text, p_feedback text)
returns table (feedback_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid;
  v_game_id uuid;
  v_feedback text := btrim(p_feedback);
  v_feedback_id bigint;
begin
  select s.player_id into v_player_id from public.player_sessions s where s.token_hash = extensions.digest(coalesce(p_session_token, ''), 'sha256') and s.expires_at > now();
  if v_player_id is null then raise exception 'Your session expired. Please log in again.'; end if;
  if p_scope is null or p_scope not in ('hub', 'game') then raise exception 'Feedback scope is invalid.'; end if;
  if v_feedback is null or char_length(v_feedback) not between 5 and 1000 then raise exception 'Feedback must be 5-1000 characters.'; end if;

  if p_scope = 'game' then
    select g.id into v_game_id from public.games g where g.slug = p_game_slug and g.active;
    if v_game_id is null then raise exception 'Game not found.'; end if;
  elsif p_game_slug is not null then
    raise exception 'Hub feedback cannot reference a game.';
  end if;

  insert into public.feedback (player_id, game_id, scope, feedback_text) values (v_player_id, v_game_id, p_scope, v_feedback) returning id into v_feedback_id;
  update public.player_sessions set last_used_at = now() where token_hash = extensions.digest(p_session_token, 'sha256');
  return query select v_feedback_id;
end;
$$;

revoke execute on function public.submit_feedback(text, text, text, text) from public;
grant execute on function public.submit_feedback(text, text, text, text) to anon, authenticated;
