// Docs page: highlight the table-of-contents entry for the section in view.
(function () {
  'use strict';

  const links = [...document.querySelectorAll('.docs-toc a')];
  const targets = links.map((a) => document.getElementById(a.getAttribute('href').slice(1)));
  let queued = false;

  function update() {
    queued = false;
    let current = 0;
    targets.forEach((t, i) => {
      if (t && t.getBoundingClientRect().top < 140) current = i;
    });
    links.forEach((a, i) => a.classList.toggle('active', i === current));
  }

  window.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
}());
