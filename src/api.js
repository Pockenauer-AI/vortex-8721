import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const rpc = async (name, params = {}) => {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message);
  return data;
};

export const api = {
  login: async (name, pin) => (await rpc("login_or_register_player", { p_name: name, p_pin: pin }))[0],
  getSessionPlayer: async token => (await rpc("get_session_player", { p_session_token: token }))[0] ?? null,
  listGames: () => rpc("list_games"),
  getGameLeaderboard: (slug, limit = 50) => rpc("get_game_leaderboard", { p_game_slug: slug, p_limit: limit }),
  getOverallLeaderboard: (limit = 100) => rpc("get_overall_leaderboard", { p_limit: limit }),
  submitScore: async (token, slug, score) => (await rpc("submit_score", { p_session_token: token, p_game_slug: slug, p_score: score }))[0],
  submitIdea: async (token, idea) => (await rpc("submit_game_idea", { p_session_token: token, p_idea: idea }))[0],
  submitFeedback: async (token, scope, gameSlug, feedback) => (await rpc("submit_feedback", { p_session_token: token, p_scope: scope, p_game_slug: gameSlug, p_feedback: feedback }))[0]
};
