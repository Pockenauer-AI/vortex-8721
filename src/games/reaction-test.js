const formatScore = score => `${Math.round(Number(score))} ms`;

export const reactionTest = {
  slug: "reaction-test",
  accent: "purple",
  formatScore,
  mount(container, context) {
    let timer = null;
    let startedAt = 0;
    let state = "idle";

    const clearTimer = () => {
      if (timer) window.clearTimeout(timer);
      timer = null;
    };

    const render = (mode, title, copy, extra = "") => {
      container.innerHTML = `<div class="reaction-game ${mode}"><div><div class="reaction-symbol">${mode === "ready" ? "●" : "◎"}</div><h3>${title}</h3><p>${copy}</p>${extra}</div></div>`;
    };

    const begin = () => {
      clearTimer();
      state = "waiting";
      render("waiting", "Wait for green", "Click anywhere in this panel when it turns green. Too early is a false start.");
      timer = window.setTimeout(() => {
        state = "ready";
        startedAt = performance.now();
        render("ready", "Click now!", "Go, go, go!");
      }, 1800 + Math.random() * 3000);
    };

    const showIdle = () => {
      state = "idle";
      render("idle", "Test your reflexes", "One click starts the round. Wait for green, then react as fast as you can.", `<div class="reaction-actions"><button class="primary-button" type="button" data-action="start">Start round</button></div>`);
    };

    const showFalseStart = () => {
      clearTimer();
      state = "false-start";
      render("false-start", "Too soon!", "The best reactions are patient. Reset and wait for the green signal.", `<div class="reaction-actions"><button class="primary-button" type="button" data-action="retry">Try again</button></div>`);
    };

    const finish = async () => {
      const score = Math.max(1, Math.round(performance.now() - startedAt));
      state = "result";
      render("result", "Nice reaction", "Saving your attempt...", `<div class="result-score">${formatScore(score)}</div>`);
      try {
        const result = await context.submitScore(score);
        const bestCopy = result.is_personal_best ? "That is your new personal best." : `Your personal best is ${formatScore(result.personal_best)}.`;
        render("result", "Round complete", bestCopy, `<div class="result-score">${formatScore(score)}</div><div class="reaction-actions"><button class="primary-button" type="button" data-action="retry">Play again</button></div>`);
        context.onScoreSaved(result);
      } catch (error) {
        render("result", "Score not saved", error.message, `<div class="result-score">${formatScore(score)}</div><div class="reaction-actions"><button class="primary-button" type="button" data-action="retry">Try again</button></div>`);
      }
    };

    const onClick = event => {
      if (event.target.closest("[data-action='start'], [data-action='retry']")) return begin();
      if (state === "waiting") return showFalseStart();
      if (state === "ready") return finish();
    };

    container.addEventListener("click", onClick);
    showIdle();
    return () => {
      clearTimer();
      container.removeEventListener("click", onClick);
    };
  }
};
