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
