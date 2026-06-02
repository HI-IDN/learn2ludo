const EXPLORER_DEFAULT_DATA = {
  timeline_start: 500,
  timeline_end: 2026,
  variants: [],
};

const explorerState = {
  data: EXPLORER_DEFAULT_DATA,
  selectedId: null,
  map: null,
  markers: {},
  loaded: false,
};

function _explorerTimelinePosition(year, minYear, maxYear) {
  if (year == null || Number.isNaN(Number(year))) return 1;
  const earlyStart = minYear;
  const earlyEnd = 1800;
  const clamped = Math.max(minYear, Math.min(maxYear, Number(year)));
  if (clamped <= earlyEnd) {
    const span = Math.max(1, earlyEnd - earlyStart);
    return ((clamped - earlyStart) / span) * 0.3;
  }
  const span = Math.max(1, maxYear - earlyEnd);
  return 0.3 + ((clamped - earlyEnd) / span) * 0.7;
}

async function loadExplorerData() {
  if (explorerState.loaded) return explorerState.data;
  try {
    const response = await fetch('/api/variants/history');
    if (!response.ok) throw new Error('history fetch failed');
    explorerState.data = await response.json();
  } catch (_) {
    explorerState.data = EXPLORER_DEFAULT_DATA;
  }
  explorerState.loaded = true;
  const firstVariant = explorerState.data.variants?.[0];
  explorerState.selectedId = firstVariant ? firstVariant.id : null;
  return explorerState.data;
}

function _findExplorerVariant(id) {
  return (explorerState.data.variants || []).find(v => v.id === id) || null;
}

function _setExplorerSelected(id) {
  if (!_findExplorerVariant(id)) return;
  explorerState.selectedId = id;
  renderExplorerTimeline();
  renderExplorerDetails();
  renderExplorerMapSelection();
}

function renderExplorerMapSelection() {
  const selectedId = explorerState.selectedId;
  Object.entries(explorerState.markers).forEach(([id, marker]) => {
    const isSelected = id === selectedId;
    marker.setZIndexOffset(isSelected ? 1000 : 0);
    marker.setOpacity(isSelected ? 1 : 0.7);
  });
}

function renderExplorerMap() {
  const mapEl = document.getElementById('history-map');
  if (!mapEl) return;
  const variants = explorerState.data.variants || [];
  if (!window.L) {
    mapEl.innerHTML = '<p class="explorer-empty">Map library unavailable. Timeline and details are still available.</p>';
    return;
  }
  if (!explorerState.map) {
    explorerState.map = L.map(mapEl, {
      zoomControl: true,
      scrollWheelZoom: false,
      worldCopyJump: true,
    }).setView([20, 15], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 6,
      minZoom: 2,
    }).addTo(explorerState.map);
  }
  Object.values(explorerState.markers).forEach(marker => marker.remove());
  explorerState.markers = {};
  variants.forEach(variant => {
    const coords = variant.coordinates;
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return;
    const marker = L.marker([coords.lat, coords.lng]).addTo(explorerState.map);
    marker.bindPopup(`<strong>${variant.name}</strong><br>${variant.origin}`);
    marker.on('click', () => _setExplorerSelected(variant.id));
    explorerState.markers[variant.id] = marker;
  });
  renderExplorerMapSelection();
}

function renderExplorerTimeline() {
  const timelineEl = document.getElementById('history-timeline');
  if (!timelineEl) return;
  const variants = explorerState.data.variants || [];
  if (!variants.length) {
    timelineEl.innerHTML = '<p class="explorer-empty">No variant history data available.</p>';
    return;
  }
  const minYear = Number(explorerState.data.timeline_start || 500);
  const maxYear = Number(explorerState.data.timeline_end || new Date().getFullYear());
  const sorted = [...variants].sort((a, b) => {
    const ay = a.year == null ? Number.MAX_SAFE_INTEGER : Number(a.year);
    const by = b.year == null ? Number.MAX_SAFE_INTEGER : Number(b.year);
    return ay - by;
  });
  timelineEl.innerHTML = `
    <div class="explorer-axis">
      <span>${minYear}</span>
      <span>1800</span>
      <span>${maxYear}</span>
    </div>
    <div class="explorer-timeline-track">
      ${sorted.map((v, idx) => {
        const left = _explorerTimelinePosition(v.year, minYear, maxYear) * 100;
        const top = 10 + idx * 38;
        const selected = v.id === explorerState.selectedId ? ' selected' : '';
        return `
          <button class="explorer-timeline-item${selected}" style="left:${left}%;top:${top}px;" data-variant-id="${v.id}" type="button">
            <span class="explorer-timeline-dot"></span>
            <span class="explorer-timeline-label">${v.period_label || (v.year ?? 'Date uncertain')} · ${v.name}</span>
          </button>`;
      }).join('')}
    </div>`;
  timelineEl.querySelectorAll('[data-variant-id]').forEach(btn => {
    btn.addEventListener('click', () => _setExplorerSelected(btn.getAttribute('data-variant-id')));
  });
}

function renderExplorerDetails() {
  const detailEl = document.getElementById('history-variant-detail');
  const playBtn = document.getElementById('explorer-play-variant-btn');
  if (!detailEl) return;
  const variant = _findExplorerVariant(explorerState.selectedId);
  if (!variant) {
    detailEl.innerHTML = '<p>Select a map pin or timeline entry to view details.</p>';
    if (playBtn) playBtn.disabled = true;
    return;
  }
  detailEl.innerHTML = `
    <h4>${variant.name}</h4>
    <p><strong>Origin:</strong> ${variant.origin || 'Unknown'}</p>
    <p><strong>Period:</strong> ${variant.period_label || (variant.year ?? 'Date uncertain')}</p>
    <p>${variant.description || 'No historical summary available.'}</p>
    <ul>${(variant.distinctive_rules || []).map(rule => `<li>${rule}</li>`).join('')}</ul>
  `;
  if (playBtn) {
    playBtn.disabled = false;
    playBtn.onclick = () => playExplorerVariant(variant.id);
  }
}

function playExplorerVariant(variantId) {
  const variant = _findExplorerVariant(variantId);
  if (!variant || !variant.rule_overrides || typeof settings !== 'object') return;
  settings = { ...settings, ...variant.rule_overrides };
  if (typeof applySettingsToControls === 'function') applySettingsToControls();
  if (typeof saveSettings === 'function') saveSettings();
  if (typeof switchTab === 'function') switchTab('lobby');
}

async function renderHistoryExplorer(force = false) {
  const panel = document.getElementById('panel-explorer');
  if (!panel) return;
  if (!force && panel.dataset.rendered === 'true') return;
  await loadExplorerData();
  renderExplorerMap();
  renderExplorerTimeline();
  renderExplorerDetails();
  panel.dataset.rendered = 'true';
  setTimeout(() => explorerState.map?.invalidateSize(), 0);
}
