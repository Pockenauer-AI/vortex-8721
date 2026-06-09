update public.games
set instructions = 'Reveal every safe cell in the 5 x 5 x 5 volume as quickly as possible. Each number counts mines in all surrounding cells, including cells on neighboring layers. Drag to rotate the volume, use the mouse wheel or Q/E to change the active layer, and press R or the axis button to switch between front-to-back Depth layers and left-to-right Side layers. Right-click to place flags. On touch devices, switch between Reveal and Flag. The first revealed cell and all of its neighbors are always safe. Your lowest completed time wins.'
where slug = 'minesweeper-3d';
