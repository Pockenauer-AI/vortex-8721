insert into public.games (slug, title, description, instructions, score_unit, score_direction, score_decimals, min_score, max_score, sort_order)
values (
  'neon-rush-3d',
  'Neon Rush 3D',
  'Switch lanes, jump hazards, and survive an endless accelerating neon course.',
  'Use A/Left and D/Right to change between three lanes. Press Space or Up to jump. Collect revive, slowdown, and shield items automatically. The fixed course gets faster as you travel, and your final distance is your score.',
  'm',
  'higher',
  0,
  0,
  100000000,
  20
)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  instructions = excluded.instructions,
  score_unit = excluded.score_unit,
  score_direction = excluded.score_direction,
  score_decimals = excluded.score_decimals,
  min_score = excluded.min_score,
  max_score = excluded.max_score,
  sort_order = excluded.sort_order,
  active = true;
