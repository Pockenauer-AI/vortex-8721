import { api } from "./api.js";
import { SESSION_STORAGE_KEY } from "./config.js";
import { gameModules } from "./games/index.js";

const elements = {
  loginView: document.querySelector("#login-view"),
  hubView: document.querySelector("#hub-view"),
  loginForm: document.querySelector("#login-form"),
  loginMessage: document.querySelector("#login-message"),
  playerBadge: document.querySelector("#player-badge"),
  logoutButton: document.querySelector("#logout-button"),
  hubPage: document.querySelector("#hub-page"),
  rankingsPage: document.querySelector("#rankings-page"),
  gamePage: document.querySelector("#game-page"),
  gamesGrid: document.querySelector("#games-grid"),
  gameCount: document.querySelector("#game-count"),
  preview: document.querySelector("#leaderboard-preview"),
  overall: document.querySelector("#overall-leaderboard"),
  heroRank: document.querySelector("#hero-rank"),
  ideaForm: document.querySelector("#idea-form"),
  ideaText: document.querySelector("#idea-text"),
  ideaCount: document.querySelector("#idea-count"),
  ideaMessage: document.querySelector("#idea-message"),
  gameIntro: document.querySelector("#game-intro"),
  gameStage: document.querySelector("#game-stage"),
  gameLeaderboard: document.querySelector("#game-leaderboard"),
  backButton: document.querySelector("#back-button"),
  toastRegion: document.querySelector("#toast-region")
};

const state = { token: localStorage.getItem(SESSION_STORAGE_KEY), player: null, games: [], rankings: [], activeGame: null, unmountGame: null };
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
const initials = name => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
const formatAverage = value => Number(value).toFixed(2).replace(/\.?0+$/, "");
const getGameModule = slug => gameModules.get(slug);
const getScoreFormatter = slug => getGameModule(slug)?.formatScore ?? (score => String(score));

const toast = (message, type = "success") => {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  elements.toastRegion.append(node);
  window.setTimeout(() => node.remove(), 3500);
};

const setFormMessage = (element, message = "", success = false) => {
  element.textContent = message;
  element.classList.toggle("success", success);
};

const setLoading = (element, message = "Loading") => {
  element.innerHTML = `<div class="loading-state">${escapeHtml(message)}</div>`;
};

const renderEmpty = (element, message) => {
  element.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
};

const renderOverallRows = (rows, limit = rows.length) => {
  if (!rows.length) return `<div class="empty-state">No scores yet. Play the first round and take the throne.</div>`;
  return `<div class="leaderboard-row header"><span>Rank</span><span>Player</span><span>Wins</span><span>Avg. place</span></div>${rows.slice(0, limit).map(row => `<div class="leaderboard-row"><span class="rank-number ${Number(row.overall_position) <= 3 ? "top" : ""}">#${row.overall_position}</span><span class="player-name-cell"><span class="avatar">${escapeHtml(initials(row.player_name))}</span><span>${escapeHtml(row.player_name)}</span>${row.player_id === state.player.id ? `<span class="you-tag">You</span>` : ""}</span><span class="metric"><strong>${row.game_wins}</strong> win${Number(row.game_wins) === 1 ? "" : "s"}</span><span class="metric">${formatAverage(row.average_place)}</span></div>`).join("")}`;
};

const renderGameRows = (rows, slug) => {
  if (!rows.length) return `<div class="empty-state">No scores yet. The first place is waiting.</div>`;
  const formatScore = getScoreFormatter(slug);
  return `<div class="leaderboard-row header"><span>Rank</span><span>Player</span><span>Score</span></div>${rows.map(row => `<div class="leaderboard-row"><span class="rank-number ${Number(row.place) <= 3 ? "top" : ""}">#${row.place}</span><span class="player-name-cell"><span class="avatar">${escapeHtml(initials(row.player_name))}</span><span>${escapeHtml(row.player_name)}</span>${row.player_id === state.player.id ? `<span class="you-tag">You</span>` : ""}</span><span class="metric">${escapeHtml(formatScore(row.score))}</span></div>`).join("")}`;
};

const loadRankings = async () => {
  state.rankings = await api.getOverallLeaderboard();
  elements.preview.innerHTML = renderOverallRows(state.rankings, 5);
  elements.overall.innerHTML = renderOverallRows(state.rankings);
  const playerRow = state.rankings.find(row => row.player_id === state.player.id);
  elements.heroRank.textContent = playerRow ? `#${playerRow.overall_position}` : "#—";
};

const renderGames = () => {
  elements.gameCount.textContent = `${state.games.length} game${state.games.length === 1 ? "" : "s"}`;
  const cards = state.games.map((game, index) => `<article class="game-card" tabindex="0" role="button" data-game="${escapeHtml(game.slug)}" aria-label="Open ${escapeHtml(game.title)}"><div class="game-card-art"></div><div class="game-card-content"><span class="game-number">0${index + 1}</span><div class="game-card-copy"><h4>${escapeHtml(game.title)}</h4><p>${escapeHtml(game.description)}</p></div><div class="game-card-footer"><span class="play-chip">Play now →</span><span class="score-direction">${game.score_direction === "lower" ? "Lowest wins" : "Highest wins"}</span></div></div></article>`).join("");
  elements.gamesGrid.innerHTML = `${cards}<article class="game-card disabled" aria-disabled="true"><span class="more-symbol">+</span><div class="game-card-content"><span class="game-number">0${state.games.length + 1}</span><div class="game-card-copy"><h4>More to come</h4><p>New challenges are being dreamed up.</p></div><div class="game-card-footer"><span class="score-direction">Stay tuned</span></div></div></article>`;
};

const showPage = page => {
  elements.hubPage.hidden = page !== "hub";
  elements.rankingsPage.hidden = page !== "rankings";
  elements.gamePage.hidden = page !== "game";
  document.querySelectorAll(".nav-button").forEach(button => button.classList.toggle("active", button.dataset.route === page || (page === "game" && button.dataset.route === "hub")));
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const openGame = async slug => {
  const game = state.games.find(item => item.slug === slug);
  const module = getGameModule(slug);
  if (!game || !module) return toast("This game is not installed yet.", "error");
  state.activeGame = game;
  if (state.unmountGame) state.unmountGame();
  elements.gameIntro.innerHTML = `<p class="eyebrow">${game.score_direction === "lower" ? "Lowest score wins" : "Highest score wins"}</p><h2>${escapeHtml(game.title)}</h2><p>${escapeHtml(game.instructions)}</p>`;
  setLoading(elements.gameLeaderboard, "Loading scores");
  showPage("game");
  state.unmountGame = module.mount(elements.gameStage, {
    submitScore: score => api.submitScore(state.token, slug, score),
    onScoreSaved: async result => {
      toast(result.is_personal_best ? "New personal best saved." : "Score saved.");
      await Promise.all([loadGameLeaderboard(slug), loadRankings()]);
    }
  });
  await loadGameLeaderboard(slug);
};

const loadGameLeaderboard = async slug => {
  try {
    elements.gameLeaderboard.innerHTML = renderGameRows(await api.getGameLeaderboard(slug), slug);
  } catch (error) {
    renderEmpty(elements.gameLeaderboard, error.message);
  }
};

const enterHub = async () => {
  elements.loginView.hidden = true;
  elements.hubView.hidden = false;
  elements.playerBadge.textContent = state.player.player_name;
  setLoading(elements.gamesGrid, "Loading games");
  setLoading(elements.preview, "Loading rankings");
  setLoading(elements.overall, "Loading rankings");
  showPage("hub");
  try {
    [state.games] = await Promise.all([api.listGames(), loadRankings()]);
    renderGames();
  } catch (error) {
    renderEmpty(elements.gamesGrid, "The arcade could not load.");
    toast(error.message, "error");
  }
};

const logout = () => {
  if (state.unmountGame) state.unmountGame();
  state.token = null;
  state.player = null;
  localStorage.removeItem(SESSION_STORAGE_KEY);
  elements.hubView.hidden = true;
  elements.loginView.hidden = false;
  elements.loginForm.reset();
  setFormMessage(elements.loginMessage);
};

elements.loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type='submit']");
  const data = new FormData(event.currentTarget);
  button.disabled = true;
  setFormMessage(elements.loginMessage, "Entering the arcade...");
  try {
    const result = await api.login(data.get("name"), data.get("pin"));
    state.token = result.session_token;
    state.player = { player_id: result.player_id, player_name: result.player_name };
    localStorage.setItem(SESSION_STORAGE_KEY, state.token);
    await enterHub();
    if (result.is_new) toast("Player created. Welcome to the arcade.");
  } catch (error) {
    setFormMessage(elements.loginMessage, error.message.replace(/^.*?: /, ""));
  } finally {
    button.disabled = false;
  }
});

elements.logoutButton.addEventListener("click", logout);
elements.backButton.addEventListener("click", () => showPage("hub"));
elements.ideaText.addEventListener("input", () => elements.ideaCount.textContent = `${elements.ideaText.value.length} / 500`);
elements.ideaForm.addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type='submit']");
  button.disabled = true;
  setFormMessage(elements.ideaMessage, "Sending...");
  try {
    await api.submitIdea(state.token, elements.ideaText.value);
    elements.ideaForm.reset();
    elements.ideaCount.textContent = "0 / 500";
    setFormMessage(elements.ideaMessage, "Idea sent. Thank you!", true);
  } catch (error) {
    setFormMessage(elements.ideaMessage, error.message.replace(/^.*?: /, ""));
  } finally {
    button.disabled = false;
  }
});

document.addEventListener("click", event => {
  const routeTarget = event.target.closest("[data-route]");
  const gameTarget = event.target.closest("[data-game]");
  if (routeTarget) {
    event.preventDefault();
    showPage(routeTarget.dataset.route);
  }
  if (gameTarget) openGame(gameTarget.dataset.game);
});

elements.gamesGrid.addEventListener("keydown", event => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-game]")) {
    event.preventDefault();
    openGame(event.target.dataset.game);
  }
});

const restoreSession = async () => {
  if (!state.token) return;
  try {
    state.player = await api.getSessionPlayer(state.token);
    if (!state.player) throw new Error("Session expired");
    await enterHub();
  } catch {
    logout();
  }
};

restoreSession();
