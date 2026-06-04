window.learn2ludoComponentsReady = (async function loadComponents() {
  const componentVersion = (() => {
    try {
      return new URL(document.currentScript?.src || '', window.location.href).searchParams.get('v') || '5';
    } catch {
      return '5';
    }
  })();
  const versionedComponentUrl = url => {
    if (!url || !url.startsWith('/static/components/')) return url;
    return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(componentVersion)}`;
  };
  const nodes = Array.from(document.querySelectorAll('[data-component]'));
  await Promise.all(nodes.map(async node => {
    const url = node.getAttribute('data-component');
    try {
      const response = await fetch(versionedComponentUrl(url));
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      node.outerHTML = await response.text();
    } catch (err) {
      console.error('[Learn2Ludo] Failed to load component:', url, err);
      node.innerHTML = `<div class="component-load-error">Could not load ${url}</div>`;
    }
  }));
})();
