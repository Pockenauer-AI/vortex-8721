# Minigames Hub

A build-free HTML, CSS, and JavaScript minigames hub backed by Supabase.

## Run locally

Serve the repository over HTTP so browser modules can load:

```powershell
node scripts/dev-server.mjs
```

Then open `http://127.0.0.1:8000`.

## Add a game

1. Add a game module in `src/games/` implementing `slug`, `formatScore`, and `mount(container, context)`.
2. Register it in `src/games/index.js`.
3. Add a matching row to `public.games` with score direction, decimal precision, and valid score bounds.

The browser sends completed scores through `context.submitScore(score)`. Supabase stores every valid attempt while leaderboards use only each player's best score.

## Security model

The publishable Supabase key is intentionally public. Player PINs are hashed in PostgreSQL, sessions are stored as SHA-256 hashes, direct table access is denied, and all public operations pass through validated RPC functions.

Scores are generated client-side and are therefore trust-based, which is appropriate for a private friends-only arcade.
