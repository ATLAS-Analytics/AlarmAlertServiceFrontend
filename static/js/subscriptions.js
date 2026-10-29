// Subscriptions page: event catalog, the user's subscriptions and tag autocomplete.
(function () {
  'use strict';

  const { toast, pageData } = window.AAAS;
  const data = pageData();
  const sources = { alarms: data.alarms, heartbeats: data.heartbeats };

  const ICON_X = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  const ICON_CHEVRON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  const MAX_SUGGESTIONS = 100;
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

  const tree = document.getElementById('catalog-tree');
  const search = document.getElementById('catalog-search');
  const list = document.getElementById('subs-list');
  const empty = document.getElementById('subs-empty');
  const count = document.getElementById('subs-count');
  const savebar = document.getElementById('savebar');
  const saveBtn = document.getElementById('save');

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const keyOf = (s) => JSON.stringify([s.category, s.subcategory, s.event]);
  const byPath = (a, b) => collator.compare(a.category, b.category)
    || collator.compare(a.subcategory, b.subcategory)
    || collator.compare(a.event, b.event);

  const alarmKeys = new Set(data.alarms.map(keyOf));
  const heartbeatKeys = new Set(data.heartbeats.map(keyOf));
  const descriptions = new Map();
  data.alarms.concat(data.heartbeats).forEach((e) => descriptions.set(keyOf(e), e.description));

  // alerts.py splits subscription tags on spaces and treats '*' as "all";
  // older entries may hold arrays or comma-separated strings.
  function parseTags(tags) {
    const raw = Array.isArray(tags) ? tags : [tags];
    const out = [];
    raw.forEach((t) => {
      String(t === undefined || t === null ? '' : t).split(/[\s,]+/).forEach((v) => {
        if (v && v !== '*' && !out.includes(v)) out.push(v);
      });
    });
    return out;
  }

  const serializeTags = (tags) => (tags.length ? tags.join(' ') : '*');
  const clone = (items) => items.map((s) => ({ ...s, tags: [...s.tags] }));

  // ---- state -------------------------------------------------------------

  let subs = [];
  const seen = new Set();
  data.subscriptions.forEach((s) => {
    if (seen.has(keyOf(s))) return;
    seen.add(keyOf(s));
    subs.push({ ...s, tags: parseTags(s.tags) });
  });

  const snapshot = () => JSON.stringify(subs.map((s) => [keyOf(s), s.tags]).sort());
  let saved = { subs: clone(subs), snapshot: snapshot() };

  let source = 'alarms';
  const expanded = new Set();
  let flashKeys = [];

  let allTags = [];
  let knownTags = new Map(); // lower case -> canonical
  let tagsState = 'loading';
  const tagFields = new Set();

  // ---- catalog tree ------------------------------------------------------

  let leafBoxes = [];
  let groupBoxes = [];

  function groupNode(className, label, key, events, open) {
    const root = el('div', `tree-group ${className}`);
    const row = el('div', 'tree-row');
    const children = el('div', 'tree-children');
    children.hidden = !open;

    const twisty = el('button', 'twisty');
    twisty.type = 'button';
    twisty.innerHTML = ICON_CHEVRON;
    twisty.setAttribute('aria-expanded', String(open));
    twisty.setAttribute('aria-label', `Expand ${label}`);

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.setAttribute('aria-label', `Subscribe to everything in ${label}`);
    box.addEventListener('change', () => setSubscribed(events, box.checked));

    const name = el('button', 'tree-name', label);
    name.type = 'button';
    name.title = label;

    const meta = el('span', 'tree-meta');
    meta.hidden = true;

    const toggle = () => {
      const isOpen = children.hidden;
      children.hidden = !isOpen;
      twisty.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) expanded.add(key); else expanded.delete(key);
    };
    twisty.addEventListener('click', toggle);
    name.addEventListener('click', toggle);

    row.append(twisty, box, name, meta);
    root.append(row, children);
    groupBoxes.push({ box, meta, keys: events.map(keyOf) });
    return { root, children };
  }

  function leafNode(e) {
    const label = el('label', 'tree-leaf');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.addEventListener('change', () => setSubscribed([e], box.checked));
    const text = el('span', 'leaf-text');
    text.append(el('span', 'leaf-title', e.event));
    if (e.description) {
      text.append(el('span', 'leaf-desc', e.description));
      label.title = e.description;
    }
    label.append(box, text);
    leafBoxes.push({ box, key: keyOf(e) });
    return label;
  }

  function renderTree() {
    const q = search.value.trim().toLowerCase();
    const events = sources[source]
      .filter((e) => !q || [e.category, e.subcategory, e.event, e.description]
        .some((v) => v && String(v).toLowerCase().includes(q)))
      .sort(byPath);

    tree.textContent = '';
    leafBoxes = [];
    groupBoxes = [];
    if (events.length === 0) {
      tree.append(el('p', 'tree-empty', q ? `No events match “${search.value.trim()}”.` : 'Nothing registered yet.'));
      return;
    }

    const categories = new Map();
    events.forEach((e) => {
      if (!categories.has(e.category)) categories.set(e.category, new Map());
      const subcategories = categories.get(e.category);
      if (!subcategories.has(e.subcategory)) subcategories.set(e.subcategory, []);
      subcategories.get(e.subcategory).push(e);
    });

    categories.forEach((subcategories, category) => {
      const catKey = JSON.stringify([category]);
      const catEvents = [].concat(...subcategories.values());
      const cat = groupNode('tree-cat', category, catKey, catEvents, Boolean(q) || expanded.has(catKey));
      subcategories.forEach((subEvents, subcategory) => {
        const subKey = JSON.stringify([category, subcategory]);
        const sub = groupNode('tree-sub', subcategory, subKey, subEvents, Boolean(q) || expanded.has(subKey));
        subEvents.forEach((e) => sub.children.append(leafNode(e)));
        cat.children.append(sub.root);
      });
      tree.append(cat.root);
    });
    syncTree();
  }

  function syncTree() {
    const subscribed = new Set(subs.map(keyOf));
    leafBoxes.forEach(({ box, key }) => {
      box.checked = subscribed.has(key);
    });
    groupBoxes.forEach(({ box, meta, keys }) => {
      const n = keys.filter((k) => subscribed.has(k)).length;
      box.checked = n > 0 && n === keys.length;
      box.indeterminate = n > 0 && n < keys.length;
      meta.textContent = `${n}/${keys.length}`;
      meta.hidden = n === 0;
    });
  }

  function setSubscribed(events, on) {
    if (on) {
      const have = new Set(subs.map(keyOf));
      flashKeys = [];
      events.forEach((e) => {
        if (have.has(keyOf(e))) return;
        subs.push({
          category: e.category, subcategory: e.subcategory, event: e.event, tags: [],
        });
        flashKeys.push(keyOf(e));
      });
    } else {
      const remove = new Set(events.map(keyOf));
      subs = subs.filter((s) => !remove.has(keyOf(s)));
    }
    changed();
  }

  // ---- tag input with autocomplete -----------------------------------------

  let fieldId = 0;

  function tagField(sub) {
    const field = el('div', 'tag-field');
    const input = document.createElement('input');
    const listbox = el('ul', 'suggestions');
    const listId = `tag-suggestions-${fieldId++}`;
    let options = [];
    let active = -1;

    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-label', `Sites for ${sub.event}`);
    listbox.id = listId;
    listbox.setAttribute('role', 'listbox');
    listbox.hidden = true;

    function renderChips() {
      field.querySelectorAll('.chip').forEach((c) => c.remove());
      sub.tags.forEach((tag) => {
        const custom = tagsState === 'ready' && !knownTags.has(tag.toLowerCase());
        const chip = el('span', custom ? 'chip chip-custom' : 'chip', tag);
        if (custom) chip.title = 'Not found in any alarm so far';
        const x = el('button');
        x.type = 'button';
        x.innerHTML = ICON_X;
        x.setAttribute('aria-label', `Remove ${tag}`);
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          removeTag(tag);
          input.focus();
        });
        chip.append(x);
        field.insertBefore(chip, input);
      });
      input.placeholder = sub.tags.length ? 'Add site…' : 'All sites · type to narrow down';
    }

    function addTag(raw) {
      const value = String(raw).trim();
      if (!value || value === '*') return;
      const tag = knownTags.get(value.toLowerCase()) || value;
      if (sub.tags.includes(tag)) return;
      sub.tags.push(tag);
      renderChips();
      updateSavebar();
    }

    function removeTag(tag) {
      sub.tags = sub.tags.filter((t) => t !== tag);
      renderChips();
      updateSavebar();
    }

    function close() {
      listbox.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }

    function setActive(i) {
      active = i;
      [...listbox.querySelectorAll('.suggestion')].forEach((li, j) => {
        li.setAttribute('aria-selected', String(j === i));
        if (j === i) li.scrollIntoView({ block: 'nearest' });
      });
      if (i >= 0) input.setAttribute('aria-activedescendant', `${listId}-${i}`);
      else input.removeAttribute('aria-activedescendant');
    }

    function choose(i) {
      addTag(options[i].value);
      input.value = '';
      update();
    }

    function info(text) {
      listbox.append(el('li', 'suggestion-info', text));
    }

    function update() {
      const typed = input.value.trim();
      const q = typed.toLowerCase();
      listbox.textContent = '';
      options = [];

      if (tagsState === 'ready') {
        const chosen = new Set(sub.tags);
        const prefix = [];
        const inner = [];
        allTags.forEach((t) => {
          if (chosen.has(t)) return;
          const l = t.toLowerCase();
          if (!q || l.startsWith(q)) prefix.push(t);
          else if (l.includes(q)) inner.push(t);
        });
        const matches = prefix.concat(inner);
        options = matches.slice(0, MAX_SUGGESTIONS).map((value) => ({ value }));
        if (q && !knownTags.has(q) && !chosen.has(typed)) options.push({ value: typed, custom: true });

        options.forEach((opt, i) => {
          const li = el('li', 'suggestion');
          li.id = `${listId}-${i}`;
          li.setAttribute('role', 'option');
          if (opt.custom) {
            li.append(el('span', '', `Add “${opt.value}”`), el('span', 'suggestion-hint', 'not seen in alarms'));
          } else {
            const at = opt.value.toLowerCase().indexOf(q);
            const label = el('span');
            if (q && at >= 0) {
              label.append(opt.value.slice(0, at), el('mark', '', opt.value.slice(at, at + q.length)), opt.value.slice(at + q.length));
            } else {
              label.textContent = opt.value;
            }
            li.append(label);
          }
          li.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
          li.addEventListener('click', () => choose(i));
          listbox.append(li);
        });
        if (matches.length > MAX_SUGGESTIONS) info(`${matches.length - MAX_SUGGESTIONS} more · keep typing to narrow down`);
        if (allTags.length === 0 && !q) info('No sites found yet. Type a tag and press Enter.');
      } else if (tagsState === 'loading') {
        info('Loading sites…');
      } else {
        info('Couldn’t load sites. Type a tag and press Enter.');
      }

      listbox.hidden = listbox.childElementCount === 0;
      input.setAttribute('aria-expanded', String(!listbox.hidden));
      setActive(q && options.length ? 0 : -1);
    }

    input.addEventListener('focus', update);
    input.addEventListener('blur', close);
    input.addEventListener('input', () => {
      // spaces and commas separate tags; this also handles pasted lists
      const parts = input.value.split(/[\s,]+/);
      if (parts.length > 1) {
        input.value = parts.pop();
        parts.forEach(addTag);
      }
      update();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (listbox.hidden) update();
        setActive(Math.min(active + 1, options.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(Math.max(active - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!listbox.hidden && active >= 0) choose(active);
        else if (input.value.trim()) {
          addTag(input.value);
          input.value = '';
          update();
        }
      } else if (e.key === 'Escape' && !listbox.hidden) {
        e.preventDefault();
        close();
      } else if (e.key === 'Backspace' && input.value === '' && sub.tags.length) {
        removeTag(sub.tags[sub.tags.length - 1]);
        update();
      }
    });
    field.addEventListener('click', (e) => {
      if (e.target === field) input.focus();
    });

    field.append(input, listbox);
    renderChips();
    tagFields.add(() => {
      renderChips();
      if (document.activeElement === input) update();
    });
    return field;
  }

  // ---- subscription list ---------------------------------------------------

  function subRow(sub) {
    const key = keyOf(sub);
    const row = el('div', 'sub-row');
    row.dataset.key = key;

    const info = el('div', 'sub-event');
    const name = el('span', 'sub-event-name', sub.event);
    if (descriptions.get(key)) name.title = descriptions.get(key);
    info.append(name);

    let body;
    if (alarmKeys.has(key)) {
      body = tagField(sub);
    } else if (heartbeatKeys.has(key)) {
      info.append(el('span', 'sub-badge', 'Heartbeat'));
      body = el('p', 'sub-note', 'Heartbeat alarms aren’t tagged, so you’ll get all of them.');
    } else {
      info.append(el('span', 'sub-badge sub-badge-warn', 'No longer available'));
      body = el('p', 'sub-note', 'This event was removed or renamed and won’t send alerts.');
    }

    const remove = el('button', 'remove-btn');
    remove.type = 'button';
    remove.innerHTML = ICON_X;
    remove.title = 'Unsubscribe';
    remove.setAttribute('aria-label', `Unsubscribe from ${sub.event}`);
    remove.addEventListener('click', () => {
      const rows = [...list.querySelectorAll('.sub-row')];
      const index = rows.indexOf(row);
      subs = subs.filter((s) => s !== sub);
      changed();
      // keep keyboard focus in the list
      const next = list.querySelectorAll('.remove-btn');
      if (next.length) next[Math.min(index, next.length - 1)].focus();
    });

    row.append(info, body, remove);
    return row;
  }

  function renderSubs() {
    list.textContent = '';
    tagFields.clear();
    count.textContent = subs.length;
    empty.hidden = subs.length > 0;

    let group = null;
    let groupPath = null;
    [...subs].sort(byPath).forEach((sub) => {
      const path = JSON.stringify([sub.category, sub.subcategory]);
      if (path !== groupPath) {
        groupPath = path;
        group = el('div', 'subs-group');
        group.append(el('div', 'subs-group-title', `${sub.category} › ${sub.subcategory}`));
        list.append(group);
      }
      group.append(subRow(sub));
    });

    if (flashKeys.length) {
      const rows = flashKeys
        .map((k) => [...list.querySelectorAll('.sub-row')].find((r) => r.dataset.key === k))
        .filter(Boolean);
      rows.forEach((r) => r.classList.add('flash'));
      if (rows.length) rows[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      requestAnimationFrame(() => requestAnimationFrame(() => rows.forEach((r) => r.classList.remove('flash'))));
      flashKeys = [];
    }
  }

  // ---- saving --------------------------------------------------------------

  const isDirty = () => snapshot() !== saved.snapshot;

  function updateSavebar() {
    savebar.hidden = !isDirty();
  }

  function changed() {
    syncTree();
    renderSubs();
    updateSavebar();
  }

  async function save() {
    if (!isDirty() || saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    const body = subs.map(({ tags, ...rest }) => ({ ...rest, tags: serializeTags(tags) }));
    try {
      const res = await fetch(`/user/subscriptions/${encodeURIComponent(data.userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      saved = { subs: clone(subs), snapshot: snapshot() };
      updateSavebar();
      toast('Subscriptions saved');
    } catch (err) {
      console.error('saving subscriptions failed:', err);
      toast('Couldn’t save your subscriptions. Please try again.', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save changes';
    }
  }

  saveBtn.addEventListener('click', save);
  document.getElementById('discard').addEventListener('click', () => {
    subs = clone(saved.subs);
    changed();
  });

  window.addEventListener('beforeunload', (e) => {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue = '';
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    } else if (e.key === '/' && !e.target.closest('input, textarea')) {
      e.preventDefault();
      search.focus();
    }
  });

  // ---- catalog controls ----------------------------------------------------

  document.querySelectorAll('.seg').forEach((btn) => {
    btn.addEventListener('click', () => {
      source = btn.dataset.source;
      document.querySelectorAll('.seg').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      renderTree();
    });
  });
  document.querySelectorAll('[data-count]').forEach((c) => {
    c.textContent = sources[c.dataset.count].length;
  });
  search.addEventListener('input', renderTree);

  // ---- tag suggestions -----------------------------------------------------

  fetch('/alarm/tags')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.status))))
    .then((tags) => {
      allTags = tags;
      knownTags = new Map(tags.map((t) => [t.toLowerCase(), t]));
      tagsState = 'ready';
    })
    .catch((err) => {
      console.error('loading tags failed:', err);
      tagsState = 'failed';
    })
    .then(() => tagFields.forEach((refresh) => refresh()));

  renderTree();
  renderSubs();
}());
