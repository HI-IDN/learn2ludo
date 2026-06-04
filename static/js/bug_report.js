function openBugReport() {
  document.getElementById('bug-modal-overlay').style.display = 'flex';
  document.getElementById('bug-modal-body').style.display = 'block';
  document.getElementById('bug-modal-footer') && (document.querySelector('.bug-modal-footer').style.display = 'flex');
  document.getElementById('bug-success').style.display = 'none';
  document.getElementById('bug-doing').value = '';
  document.getElementById('bug-wrong').value = '';
  document.getElementById('bug-submit-btn').disabled = false;
  document.getElementById('bug-submit-btn').innerHTML = '<i class="ti ti-send"></i> Send report';
  document.getElementById('bug-doing').focus();
}

function closeBugReport() {
  document.getElementById('bug-modal-overlay').style.display = 'none';
}

async function submitBugReport() {
  const btn = document.getElementById('bug-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Capturing…';

  const activeTab = document.querySelector('.tab-btn.active')?.id?.replace('tab-btn-', '') || null;
  const pageState = {
    active_tab: activeTab,
    game_state: typeof gameState !== 'undefined' ? gameState : null,
    settings: typeof settings !== 'undefined' ? settings : null,
  };

  // Hide modal, take screenshot of the page behind it, then restore
  const overlay = document.getElementById('bug-modal-overlay');
  overlay.style.display = 'none';
  let screenshotB64 = '';
  try {
    if (typeof html2canvas !== 'undefined') {
      const canvas = await html2canvas(document.body, { useCORS: true, logging: false, scale: 0.75 });
      screenshotB64 = canvas.toDataURL('image/png');
    }
  } catch (_) {
    // screenshot is best-effort — continue without it
  }
  overlay.style.display = 'flex';

  try {
    const r = await fetch('/api/bugs/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        what_doing: document.getElementById('bug-doing').value.trim(),
        what_wrong: document.getElementById('bug-wrong').value.trim(),
        page_state: pageState,
        screenshot_b64: screenshotB64,
      }),
    });
    const data = await r.json();
    document.getElementById('bug-modal-body').style.display = 'none';
    document.querySelector('.bug-modal-footer').style.display = 'none';
    document.getElementById('bug-success-id').textContent = `Reference: ${data.id}`;
    document.getElementById('bug-success').style.display = 'flex';
  } catch (_) {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-send"></i> Send report';
    alert('Could not save report — please try again.');
  }
}
