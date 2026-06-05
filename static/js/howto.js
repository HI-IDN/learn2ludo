// Toggle on heading click; sync nav pills to reflect all open sections.
function howtoToggle(id) {
  const item = document.getElementById(id);
  if (!item) return;
  const nowOpen = !item.classList.contains('open');
  item.classList.toggle('open', nowOpen);
  item.querySelector('.howto-trigger')?.setAttribute('aria-expanded', String(nowOpen));
  _howtoSyncPills();
  if (id === 'howto-ideas' && nowOpen) loadFeatureIdeas();
}

// Open a section by id (does not close others), sync nav pill, scroll to it.
function howtoOpen(id) {
  const item = document.getElementById(id);
  if (!item) return;
  item.classList.add('open');
  item.querySelector('.howto-trigger')?.setAttribute('aria-expanded', 'true');
  _howtoSyncPills();
  if (id === 'howto-ideas') loadFeatureIdeas();
  item.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function _howtoSyncPills() {
  document.querySelectorAll('.howto-nav-pill').forEach(pill => {
    const target = pill.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    const isOpen = target && document.getElementById(target)?.classList.contains('open');
    pill.classList.toggle('active', !!isOpen);
  });
}

function howtoUpdateRlVisibility() {
  const rlEnabled = typeof tabConfig !== 'undefined'
    && tabConfig.find(t => t.id === 'train')?.enabled !== false;
  document.querySelectorAll('[data-rl]').forEach(el => {
    el.style.display = rlEnabled ? '' : 'none';
  });
}

// ---- Feature request dialog -------------------------------------------------

async function _loadPlayerOptions() {
  const sel = document.getElementById('fr-user');
  if (!sel) return;
  try {
    const data = await fetch('/api/players').then(r => r.json());
    const map = data.users ?? data;
    const list = Object.values(map).filter(p => !p._is_deleted);
    list.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      const iconLabel = (p.icon ?? '').replace('fa-face-', '').replace(/-/g, ' ');
      opt.textContent = p.age_range ? `${iconLabel} · ${p.age_range}` : iconLabel;
      sel.appendChild(opt);
    });
  } catch { /* leave anonymous-only */ }
}

function openFeatureRequestDialog() {
  document.getElementById('feature-request-dialog').style.display = 'flex';
  _loadPlayerOptions();
  document.getElementById('fr-name').focus();
}

function closeFeatureRequestDialog() {
  document.getElementById('feature-request-dialog').style.display = 'none';
  document.getElementById('fr-error').style.display = 'none';
}

async function submitFeatureRequest() {
  const name   = document.getElementById('fr-name').value.trim();
  const desc   = document.getElementById('fr-desc').value.trim();
  const userId = document.getElementById('fr-user').value || null;
  const err    = document.getElementById('fr-error');

  if (!name || !desc) {
    err.textContent = 'Feature name and description are required.';
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';

  try {
    const r = await fetch('/api/feature-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc, player_id: userId }),
    });
    if (r.ok) {
      closeFeatureRequestDialog();
      ['fr-name','fr-desc'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('fr-user').value = '';
      if (typeof showToast === 'function') showToast('Feature idea submitted — thanks!');
      loadFeatureIdeas();
    } else {
      err.textContent = 'Submission failed. Please try again.';
      err.style.display = 'block';
    }
  } catch {
    err.textContent = 'Network error. Please try again.';
    err.style.display = 'block';
  }
}

async function loadFeatureIdeas() {
  const container = document.getElementById('howto-idea-cards');
  if (!container) return;
  try {
    const ideas = await fetch('/api/feature-requests').then(r => r.json());
    const visible = ideas.filter(i => !i.deleted);
    if (!visible.length) { container.innerHTML = ''; return; }

    let playerMap = {};
    try {
      const data = await fetch('/api/players').then(r => r.json());
      const map = data.users ?? data;
      Object.values(map).forEach(p => { playerMap[p.id] = p; });
    } catch {}

    container.innerHTML = visible.map(idea => {
      const p = idea.player_id && playerMap[idea.player_id];
      const byLabel = p
        ? (p.icon ?? '').replace('fa-face-', '').replace(/-/g, ' ') + (p.age_range ? ` · ${p.age_range}` : '')
        : 'Anonymous';
      const date = idea.timestamp
        ? new Date(idea.timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : '';
      return `
        <div class="howto-idea-card">
          <div class="howto-idea-header">
            <span class="howto-idea-name">${_escHtml(idea.name)}</span>
            <span class="howto-idea-meta">${_escHtml(byLabel)}${date ? ` · ${date}` : ''}</span>
          </div>
          <p class="howto-idea-desc">${_escHtml(idea.description)}</p>
        </div>`;
    }).join('');
  } catch { /* silently skip */ }
}

function _escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
