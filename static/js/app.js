// Shared UI helpers for every page.
(function () {
  'use strict';

  function toast(message, type) {
    let host = document.querySelector('.toasts');
    if (!host) {
      host = document.createElement('div');
      host.className = 'toasts';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = type === 'error' ? 'toast toast-error' : 'toast';
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 200);
    }, type === 'error' ? 6000 : 3000);
  }

  // server data rendered into <script type="application/json" id="page-data">
  function pageData() {
    const el = document.getElementById('page-data');
    return el ? JSON.parse(el.textContent) : {};
  }

  // the account menu is a <details>; close it on outside click or Escape
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.menu[open]').forEach((menu) => {
      if (!menu.contains(e.target)) menu.removeAttribute('open');
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('details.menu[open]').forEach((menu) => {
      menu.removeAttribute('open');
      menu.querySelector('summary').focus();
    });
  });

  window.AAAS = { toast, pageData };
}());
