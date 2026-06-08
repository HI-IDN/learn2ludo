// Share/join games by code — turns the single-board app into many independent
// concurrent games, each reachable via /game/<CODE>.

let currentGameId = null;

function parseGameCodeFromUrl() {
  const m = window.location.pathname.match(/^\/game\/([A-Z0-9]{4})$/i);
  return m ? m[1].toUpperCase() : null;
}

function setGameCodeInUrl(code) {
  history.replaceState(null, '', `/game/${code}`);
}

function renderGameCodeBadge(code) {
  const row = document.getElementById('game-link-row');
  if (!row) return;
  const shareUrl = `${location.origin}/game/${code}`;
  row.hidden = false;
  row.innerHTML = `
    <span class="badge badge-purple">Code: ${code}</span>
    <button class="btn btn-sm" onclick="copyGameLink('${shareUrl}')" title="Copy share link">
      <i class="fa-solid fa-link"></i> Share
    </button>
  `;
}

async function copyGameLink(url) {
  try { await navigator.clipboard.writeText(url); } catch { /* clipboard unavailable */ }
}

async function joinGameByCode(rawCode) {
  const code = (rawCode || '').trim().toUpperCase();
  const errEl = document.getElementById('lobby-join-error');
  if (errEl) errEl.innerHTML = '';
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    if (errEl) errEl.innerHTML = `<div class="alert alert-error show">Enter a 4-character game code.</div>`;
    return;
  }
  try {
    const r = await fetch(`/api/game/${code}/state`);
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    currentGameId = code;
    gameState = normalizeEngineState(data);
    setGameCodeInUrl(code);
    renderGameCodeBadge(code);
    switchTab('play');
    drawBoard();
    renderGame();
  } catch {
    if (errEl) errEl.innerHTML = `<div class="alert alert-error show">No game found for code ${code}.</div>`;
  }
}
