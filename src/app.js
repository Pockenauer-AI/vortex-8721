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
  shopPage: document.querySelector("#shop-page"),
  rankingsPage: document.querySelector("#rankings-page"),
  gamePage: document.querySelector("#game-page"),
  gamesGrid: document.querySelector("#games-grid"),
  gameCount: document.querySelector("#game-count"),
  preview: document.querySelector("#leaderboard-preview"),
  overall: document.querySelector("#overall-leaderboard"),
  heroRank: document.querySelector("#hero-rank"),
  diamondBalance: document.querySelector("#diamond-balance"),
  shopDiamondBalance: document.querySelector("#shop-diamond-balance"),
  shopContent: document.querySelector("#shop-content"),
  ideaForm: document.querySelector("#idea-form"),
  ideaText: document.querySelector("#idea-text"),
  ideaCount: document.querySelector("#idea-count"),
  ideaMessage: document.querySelector("#idea-message"),
  gameIntro: document.querySelector("#game-intro"),
  gameStage: document.querySelector("#game-stage"),
  gameLeaderboard: document.querySelector("#game-leaderboard"),
  gameFeedbackTitle: document.querySelector("#game-feedback-title"),
  feedbackForms: [...document.querySelectorAll(".feedback-form")],
  gameFeedbackForm: document.querySelector(".feedback-form[data-feedback-scope='game']"),
  backButton: document.querySelector("#back-button"),
  toastRegion: document.querySelector("#toast-region")
};

const state = { token: localStorage.getItem(SESSION_STORAGE_KEY), player: null, games: [], rankings: [], economy: null, shopItems: [], activeGame: null, unmountGame: null };
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
  return `<div class="leaderboard-row header"><span>Rank</span><span>Player</span><span>Wins</span><span>Avg. place</span></div>${rows.slice(0, limit).map(row => `<div class="leaderboard-row"><span class="rank-number ${Number(row.overall_position) <= 3 ? "top" : ""}">#${row.overall_position}</span><span class="player-name-cell"><span class="avatar">${escapeHtml(initials(row.player_name))}</span><span>${escapeHtml(row.player_name)}</span>${row.player_id === state.player.player_id ? `<span class="you-tag">You</span>` : ""}</span><span class="metric"><strong>${row.game_wins}</strong> win${Number(row.game_wins) === 1 ? "" : "s"}</span><span class="metric">${formatAverage(row.average_place)}</span></div>`).join("")}`;
};

const renderGameRows = (rows, slug) => {
  if (!rows.length) return `<div class="empty-state">No scores yet. The first place is waiting.</div>`;
  const formatScore = getScoreFormatter(slug);
  return `<div class="leaderboard-row header"><span>Rank</span><span>Player</span><span>Score</span></div>${rows.map(row => `<div class="leaderboard-row"><span class="rank-number ${Number(row.place) <= 3 ? "top" : ""}">#${row.place}</span><span class="player-name-cell"><span class="avatar">${escapeHtml(initials(row.player_name))}</span><span>${escapeHtml(row.player_name)}</span>${row.player_id === state.player.player_id ? `<span class="you-tag">You</span>` : ""}</span><span class="metric">${escapeHtml(formatScore(row.score))}</span></div>`).join("")}`;
};

const loadRankings = async () => {
  state.rankings = await api.getOverallLeaderboard();
  elements.preview.innerHTML = renderOverallRows(state.rankings, 5);
  elements.overall.innerHTML = renderOverallRows(state.rankings);
  const playerRow = state.rankings.find(row => row.player_id === state.player.player_id);
  elements.heroRank.textContent = playerRow ? `#${playerRow.overall_position}` : "#—";
};

const renderGames = () => {
  elements.gameCount.textContent = `${state.games.length} game${state.games.length === 1 ? "" : "s"}`;
  const cards = state.games.map((game, index) => `<article class="game-card" tabindex="0" role="button" data-game="${escapeHtml(game.slug)}" aria-label="Open ${escapeHtml(game.title)}"><div class="game-card-art"></div><div class="game-card-content"><span class="game-number">0${index + 1}</span><div class="game-card-copy"><h4>${escapeHtml(game.title)}</h4><p>${escapeHtml(game.description)}</p></div><div class="game-card-footer"><span class="play-chip">Play now →</span><span class="score-direction">${game.score_direction === "lower" ? "Lowest wins" : "Highest wins"}</span></div></div></article>`).join("");
  elements.gamesGrid.innerHTML = `${cards}<article class="game-card disabled" aria-disabled="true"><span class="more-symbol">+</span><div class="game-card-content"><span class="game-number">0${state.games.length + 1}</span><div class="game-card-copy"><h4>More to come</h4><p>New challenges are being dreamed up.</p></div><div class="game-card-footer"><span class="score-direction">Stay tuned</span></div></div></article>`;
};

const syncEconomy = economy => {
  if (!economy) return;
  const merged = { diamonds: 0, speed_boost_quantity: 0, owns_purple_cube: false, equipped_cube_color: "standard", ...(state.economy ?? {}), ...economy };
  if (economy.cube_color) merged.equipped_cube_color = economy.cube_color;
  state.economy = { diamonds: Number(merged.diamonds), speed_boost_quantity: Number(merged.speed_boost_quantity), owns_purple_cube: Boolean(merged.owns_purple_cube), equipped_cube_color: merged.equipped_cube_color };
  elements.diamondBalance.textContent = state.economy.diamonds.toLocaleString();
  elements.shopDiamondBalance.textContent = state.economy.diamonds.toLocaleString();
  if (state.shopItems.length) renderShop();
};

const loadEconomy = async () => {
  syncEconomy(await api.getPlayerEconomy(state.token));
  return state.economy;
};

const shopCard = item => {
  const helper = item.item_type === "consumable";
  const owned = Boolean(item.owned);
  const equipped = Boolean(item.equipped);
  const canAfford = state.economy.diamonds >= Number(item.price);
  const action = helper
    ? `<button class="primary-button shop-action" type="button" data-shop-buy="${escapeHtml(item.item_slug)}" ${canAfford ? "" : "disabled"}>Buy for ${item.price} diamond${Number(item.price) === 1 ? "" : "s"}</button><span class="inventory-count">${Number(item.quantity)} owned</span>`
    : owned
      ? `<button class="ghost-button shop-action" type="button" data-shop-equip="${equipped ? "standard" : "purple"}">${equipped ? "Use standard color" : "Equip purple"}</button><span class="inventory-count">${equipped ? "Equipped" : "Owned"}</span>`
      : `<button class="primary-button shop-action" type="button" data-shop-buy="${escapeHtml(item.item_slug)}" ${canAfford ? "" : "disabled"}>Unlock for ${item.price} diamonds</button><span class="inventory-count">Permanent</span>`;
  return `<article class="shop-card ${helper ? "helper" : "cosmetic"}"><div class="shop-card-art" aria-hidden="true"><span class="${helper ? "speed-art" : "cube-art"}"></span></div><div class="shop-card-copy"><p class="eyebrow">${helper ? "Helper item" : "Cosmetic"}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></div><div class="shop-card-footer">${action}</div></article>`;
};

const renderShop = () => {
  const sections = [{ key: "helper", title: "Helper Items", copy: "Single-run advantages that help you push farther." }, { key: "cosmetic", title: "Cosmetics", copy: "Permanent visual styles for your player." }];
  elements.shopContent.innerHTML = sections.map(section => `<section class="shop-section"><div class="section-heading"><div><p class="eyebrow">${escapeHtml(section.copy)}</p><h3>${section.title}</h3></div></div><div class="shop-grid">${state.shopItems.filter(item => item.category === section.key).map(shopCard).join("")}<article class="shop-card coming-soon"><span class="more-symbol">+</span><div><p class="eyebrow">Coming later</p><h3>More to be added</h3><p>New ${section.title.toLowerCase()} will arrive in a future update.</p></div></article></div></section>`).join("");
};

const loadShop = async () => {
  state.shopItems = await api.getShopState(state.token);
  if (state.shopItems[0]) syncEconomy({ diamonds: state.shopItems[0].diamonds });
  renderShop();
};

const showPage = page => {
  elements.hubPage.hidden = page !== "hub";
  elements.shopPage.hidden = page !== "shop";
  elements.rankingsPage.hidden = page !== "rankings";
  elements.gamePage.hidden = page !== "game";
  document.querySelectorAll(".nav-button").forEach(button => button.classList.toggle("active", button.dataset.route === page || (page === "game" && button.dataset.route === "hub")));
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const openGame = async slug => {
  const game = state.games.find(item => item.slug === slug);
  const module = getGameModule(slug);
  if (!game || !module) return toast("This game is not installed yet.", "error");
  if (slug === "neon-rush-3d") {
    try {
      await loadEconomy();
    } catch (error) {
      return toast(error.message, "error");
    }
  }
  state.activeGame = game;
  if (state.unmountGame) state.unmountGame();
  elements.gameIntro.innerHTML = `<p class="eyebrow">${game.score_direction === "lower" ? "Lowest score wins" : "Highest score wins"}</p><h2>${escapeHtml(game.title)}</h2><p>${escapeHtml(game.instructions)}</p>`;
  elements.gameFeedbackTitle.textContent = `How was ${game.title}?`;
  elements.gameFeedbackForm.reset();
  elements.gameFeedbackForm.querySelector("[data-feedback-count]").textContent = "0 / 1000";
  setFormMessage(elements.gameFeedbackForm.querySelector("[data-feedback-message]"));
  setLoading(elements.gameLeaderboard, "Loading scores");
  showPage("game");
  state.unmountGame = module.mount(elements.gameStage, {
    economy: state.economy,
    beginNeonRun: useSpeedBoost => api.beginNeonRun(state.token, useSpeedBoost),
    claimNeonDiamond: (runId, chunk) => api.claimNeonDiamond(state.token, runId, chunk),
    endNeonRun: runId => api.endNeonRun(state.token, runId),
    onEconomyChanged: economy => syncEconomy(economy),
    onDiamondError: error => toast(`Diamond not saved: ${error.message}`, "error"),
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
  setLoading(elements.shopContent, "Loading shop");
  showPage("hub");
  try {
    [state.games] = await Promise.all([api.listGames(), loadRankings(), loadEconomy(), loadShop()]);
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
  state.economy = null;
  state.shopItems = [];
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

elements.feedbackForms.forEach(form => {
  const textarea = form.querySelector("[data-feedback-text]");
  const count = form.querySelector("[data-feedback-count]");
  const message = form.querySelector("[data-feedback-message]");
  textarea.addEventListener("input", () => count.textContent = `${textarea.value.length} / 1000`);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const button = form.querySelector("button[type='submit']");
    const scope = form.dataset.feedbackScope;
    button.disabled = true;
    setFormMessage(message, "Sending...");
    try {
      await api.submitFeedback(state.token, scope, scope === "game" ? state.activeGame?.slug ?? null : null, textarea.value);
      form.reset();
      count.textContent = "0 / 1000";
      setFormMessage(message, "Feedback sent. Thank you!", true);
    } catch (error) {
      setFormMessage(message, error.message.replace(/^.*?: /, ""));
    } finally {
      button.disabled = false;
    }
  });
});

const purchaseItem = async button => {
  button.disabled = true;
  try {
    syncEconomy(await api.purchaseShopItem(state.token, button.dataset.shopBuy));
    await loadShop();
    toast("Purchase complete.");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
  }
};

const equipCube = async button => {
  button.disabled = true;
  try {
    const result = await api.equipCubeColor(state.token, button.dataset.shopEquip);
    syncEconomy(result);
    await loadShop();
    toast(result.equipped_cube_color === "purple" ? "Purple cube equipped." : "Standard cube equipped.");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
  }
};

document.addEventListener("click", event => {
  const routeTarget = event.target.closest("[data-route]");
  const gameTarget = event.target.closest("[data-game]");
  const buyTarget = event.target.closest("[data-shop-buy]");
  const equipTarget = event.target.closest("[data-shop-equip]");
  if (routeTarget) {
    event.preventDefault();
    showPage(routeTarget.dataset.route);
  }
  if (gameTarget) openGame(gameTarget.dataset.game);
  if (buyTarget) purchaseItem(buyTarget);
  if (equipTarget) equipCube(equipTarget);
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
