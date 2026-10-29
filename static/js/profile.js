// Profile page: notification preferences.
(function () {
  'use strict';

  const { toast, pageData } = window.AAAS;
  const { userId } = pageData();
  const form = document.getElementById('prefs-form');
  const saveBtn = document.getElementById('save-prefs');
  const inputs = [...form.querySelectorAll('.prefs')];

  function isValidEmail(email) {
    const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
  }

  function values() {
    const data = {};
    inputs.forEach((input) => {
      if (input.type === 'checkbox') data[input.id] = input.checked;
      if (input.type === 'number') data[input.id] = Number(input.value);
      if (input.type === 'email') data[input.id] = input.value.trim();
    });
    return data;
  }

  let saved = JSON.stringify(values());
  const refresh = () => {
    saveBtn.disabled = JSON.stringify(values()) === saved;
  };
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const badEmail = inputs.find((i) => i.type === 'email' && i.value.trim() !== '' && !isValidEmail(i.value.trim()));
    if (badEmail) {
      toast('Please enter a valid email address.', 'error');
      badEmail.focus();
      return;
    }

    const data = values();
    saveBtn.disabled = true;
    try {
      const res = await fetch(`/user/preferences/${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      saved = JSON.stringify(data);
      toast('Preferences saved');
    } catch (err) {
      console.error('saving preferences failed:', err);
      toast('Couldn’t save your preferences. Please try again.', 'error');
    }
    refresh();
  });
}());
