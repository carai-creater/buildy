async function runHeroAgent() {
  const button = document.querySelector(".hero-run-btn");
  const resultContainer = document.querySelector(".hero-result");
  const statusEl = document.querySelector(".hero-result-status");
  const titleEl = document.querySelector(".hero-result-title");
  const overviewEl = document.querySelector(".hero-result-overview");
  const sectionsEl = document.querySelector(".hero-result-sections");
   const agentSelect = document.querySelector("#agent-select");
   const queryInput = document.querySelector("#hero-query");

  if (!button || !resultContainer) return;

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "エージェント実行中…";

  statusEl.textContent = "市場調査エージェントがダミー実行中です。数秒お待ちください。";
  resultContainer.classList.add("is-loading");

  try {
    const selectedAgent = agentSelect ? agentSelect.value : "market-research";
    const query =
      queryInput && queryInput.value.trim().length > 0
        ? queryInput.value.trim()
        : "日本のD2Cコスメ市場の主要プレイヤー";

    var body = { query: query };
    try {
      var uid = localStorage.getItem("buildy_user_id");
      if (uid) body.user_id = uid;
    } catch (_) {}
    const res = await fetch(`/api/agents/${selectedAgent}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error("failed");
    }

    const data = await res.json();
    const report = data.report || {};

    titleEl.textContent = report.title || "市場調査レポート（ダミー）";
    overviewEl.textContent = report.overview || "";

    sectionsEl.innerHTML = "";
    if (Array.isArray(report.sections)) {
      report.sections.forEach((section) => {
        const item = document.createElement("div");
        item.className = "hero-result-section";

        const h = document.createElement("div");
        h.className = "hero-result-section-heading";
        h.textContent = section.heading;

        const b = document.createElement("div");
        b.className = "hero-result-section-body";
        b.textContent = section.body;

        item.appendChild(h);
        item.appendChild(b);
        sectionsEl.appendChild(item);
      });
    }

    statusEl.textContent =
      "これはデモ用の結果ですが、実際にはここにAIエージェントが生成したレポートが表示されます。";
    resultContainer.classList.add("is-visible");
    resultContainer.classList.remove("is-loading");
  } catch (e) {
    console.error(e);
    statusEl.textContent = "デモ実行に失敗しました。サーバーが起動しているか確認してください。";
    resultContainer.classList.remove("is-loading");
    resultContainer.classList.add("is-visible");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  // いまはトップは「探す画面」だけにしているので、
  // 追加の挙動が必要になったらここに書き足します。
});

