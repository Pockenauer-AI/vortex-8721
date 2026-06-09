insert into public.games (slug, title, description, instructions, score_unit, score_direction, score_decimals, min_score, max_score, sort_order)
values (
  'minesweeper-3d',
  'Minesweeper 3D',
  'Clear a 5 x 5 x 5 minefield where every clue reaches through all three dimensions.',
  'Reveal every safe cell in the 5 x 5 x 5 volume as quickly as possible. Each number counts mines in all surrounding cells, including cells on the layers in front and behind it. Drag to rotate the volume, use the mouse wheel or Q/E to change the active layer, and right-click to place flags. On touch devices, switch between Reveal and Flag. The first revealed cell and all of its neighbors are always safe. Your lowest completed time wins.',
  'ms',
  'lower',
  0,
  1,
  86400000,
  30
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
