function howtoToggle(id) {
  const items = document.querySelectorAll('.howto-item');
  items.forEach(item => {
    const isTarget = item.id === id;
    const wasOpen = item.classList.contains('open');
    const nowOpen = isTarget && !wasOpen;
    item.classList.toggle('open', nowOpen);
    const btn = item.querySelector('.howto-trigger');
    if (btn) btn.setAttribute('aria-expanded', nowOpen);
  });
}

function howtoUpdateRlVisibility() {
  const rlEnabled = typeof tabConfig !== 'undefined'
    && tabConfig.find(t => t.id === 'train')?.enabled !== false;
  document.querySelectorAll('[data-rl]').forEach(el => {
    el.style.display = rlEnabled ? '' : 'none';
  });
}

function openFeatureRequestDialog() {
  document.getElementById('feature-request-dialog').style.display = 'flex';
  document.getElementById('fr-name').focus();
}

function closeFeatureRequestDialog() {
  document.getElementById('feature-request-dialog').style.display = 'none';
  document.getElementById('fr-error').style.display = 'none';
}

async function submitFeatureRequest() {
  const name = document.getElementById('fr-name').value.trim();
  const desc = document.getElementById('fr-desc').value.trim();
  const user = document.getElementById('fr-user').value.trim();
  const err  = document.getElementById('fr-error');

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
      body: JSON.stringify({ name, description: desc, username: user || null }),
    });
    if (r.ok) {
      closeFeatureRequestDialog();
      document.getElementById('fr-name').value = '';
      document.getElementById('fr-desc').value = '';
      document.getElementById('fr-user').value = '';
      if (typeof showToast === 'function') showToast('Feature idea submitted — thanks!');
    } else {
      err.textContent = 'Submission failed. Please try again.';
      err.style.display = 'block';
    }
  } catch {
    err.textContent = 'Network error. Please try again.';
    err.style.display = 'block';
  }
}
