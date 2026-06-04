// Highlight active section in the howto nav as user scrolls
(function () {
  function initHowtoNav() {
    const nav = document.querySelector('.howto-nav');
    if (!nav) return;
    const links = Array.from(nav.querySelectorAll('.howto-nav-link'));
    const sections = links.map(l => document.querySelector(l.getAttribute('href')));

    nav.addEventListener('click', e => {
      const link = e.target.closest('.howto-nav-link');
      if (!link) return;
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });

    const panel = document.getElementById('panel-howto');
    if (!panel) return;
    panel.addEventListener('scroll', () => {
      let current = 0;
      sections.forEach((sec, i) => {
        if (sec && sec.getBoundingClientRect().top - panel.getBoundingClientRect().top < 80) {
          current = i;
        }
      });
      links.forEach((l, i) => l.classList.toggle('active', i === current));
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHowtoNav);
  } else {
    initHowtoNav();
  }
})();
