// Subscriptions page: event catalog, the user's subscriptions and tag autocomplete.
(function () {
  'use strict';

  const { toast, pageData } = window.AAAS;
  const data = pageData();
  const sources = { alarms: data.alarms, heartbeats: data.heartbeats };

  const ICON_X = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  const ICON_CHEVRON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  const ICON_CHEVRON_DOWN = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const MAX_SUGGESTIONS = 100;
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

  const tree = document.getElementById('catalog-tree');
  const search = document.getElementById('catalog-search');
  const expandAll = document.getElementById('expand-all');
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
  // severity levels seen per event; only these events get a level picker
  const levelsByKey = new Map((data.levels || []).map((e) => [keyOf(e), e.levels]));
  // only these events suggest networks (ASNs) as tags; elsewhere an ASN would never match
  // path events are tagged with perfSONAR path elements (netsites and ASNs), all other events with sites
  const pathEventKeys = new Set((data.pathEvents || []).map(keyOf));
  const ASN_RE = /^AS\d+$/;

  // alerts.py splits subscription tags and levels on spaces and treats '*' (or a
  // missing value) as "all"; older entries may hold arrays or comma-separated strings.
  function parseList(value) {
    const raw = Array.isArray(value) ? value : [value];
    const out = [];
    raw.forEach((t) => {
      String(t === undefined || t === null ? '' : t).split(/[\s,]+/).forEach((v) => {
        if (v && v !== '*' && !out.includes(v)) out.push(v);
      });
    });
    return out;
  }

  const serializeList = (values) => (values.length ? values.join(' ') : '*');
  const clone = (items) => items.map((s) => ({ ...s, tags: [...s.tags], levels: [...s.levels] }));

  // ---- state -------------------------------------------------------------

  let subs = [];
  const seen = new Set();
  data.subscriptions.forEach((s) => {
    if (seen.has(keyOf(s))) return;
    seen.add(keyOf(s));
    subs.push({
      ...s, tags: parseList(s.tags), levels: parseList(s.levels), hadLevels: 'levels' in s,
    });
  });

  const snapshot = () => JSON.stringify(subs.map((s) => [keyOf(s), s.tags, s.levels]).sort());
  let saved = { subs: clone(subs), snapshot: snapshot() };

  let source = 'alarms';
  const expanded = new Set();
  let flashKeys = [];

  let allTags = [];
  let knownTags = new Map(); // lower case -> canonical
  let pathTags = [];
  let knownPathTags = new Map();
  let tagLabels = {}; // network names of ASN tags, e.g. { AS513: 'CERN, CH' }
  let tagsState = 'loading';

  // network alarms tag ASNs as 'AS<number>' and alerts.py matches exactly, so 'as513' becomes 'AS513'
  function normalizeTag(value) {
    const v = String(value).trim();
    const asn = v.match(/^as(\d+)$/i);
    return asn ? `AS${asn[1]}` : v;
  }
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
      updateExpandAll();
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

  // every category and subcategory of the shown source
  function groupKeys() {
    const keys = new Set();
    sources[source].forEach((e) => {
      keys.add(JSON.stringify([source, e.category]));
      keys.add(JSON.stringify([source, e.category, e.subcategory]));
    });
    return [...keys];
  }

  function updateExpandAll() {
    const keys = groupKeys();
    const allOpen = keys.length > 0 && keys.every((k) => expanded.has(k));
    expandAll.textContent = allOpen ? 'Collapse all' : 'Expand all';
    expandAll.hidden = keys.length === 0;
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
      updateExpandAll();
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
      // keyed per tab: alarms and heartbeats can share category names
      const catKey = JSON.stringify([source, category]);
      const catEvents = [].concat(...subcategories.values());
      const cat = groupNode('tree-cat', category, catKey, catEvents, Boolean(q) || expanded.has(catKey));
      subcategories.forEach((subEvents, subcategory) => {
        const subKey = JSON.stringify([source, category, subcategory]);
        const sub = groupNode('tree-sub', subcategory, subKey, subEvents, Boolean(q) || expanded.has(subKey));
        subEvents.forEach((e) => sub.children.append(leafNode(e)));
        cat.children.append(sub.root);
      });
      tree.append(cat.root);
    });
    syncTree();
    updateExpandAll();
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
          category: e.category, subcategory: e.subcategory, event: e.event, tags: [], levels: [],
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
    const pathOk = pathEventKeys.has(keyOf(sub));
    const suggestions = () => (pathOk ? pathTags : allTags);
    const known = () => (pathOk ? knownPathTags : knownTags);
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
        const custom = tagsState === 'ready' && !known().has(tag.toLowerCase());
        const chip = el('span', custom ? 'chip chip-custom' : 'chip', tag);
        if (custom) chip.title = 'Not found in any alarm so far';
        else if (tagLabels[tag]) chip.title = tagLabels[tag];
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
      if (pathOk) input.placeholder = sub.tags.length ? 'Add site or ASN…' : 'All sites · type a site or ASN';
      else input.placeholder = sub.tags.length ? 'Add site…' : 'All sites · type to narrow down';
    }

    function addTag(raw) {
      const value = normalizeTag(raw);
      if (!value || value === '*') return;
      const tag = known().get(value.toLowerCase()) || value;
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
        const byName = []; // ASNs whose network name matches, e.g. 'cern' -> AS513
        suggestions().forEach((t) => {
          if (chosen.has(t) || (!pathOk && ASN_RE.test(t))) return;
          const l = t.toLowerCase();
          if (!q || l.startsWith(q)) prefix.push(t);
          else if (l.includes(q)) inner.push(t);
          else if (pathOk && tagLabels[t] && tagLabels[t].toLowerCase().includes(q)) byName.push(t);
        });
        const matches = prefix.concat(inner, byName);
        options = matches.slice(0, MAX_SUGGESTIONS).map((value) => ({ value }));
        const typedTag = normalizeTag(typed);
        // a network name typed as a tag would never match, so don't offer it when names matched
        const onlyNames = byName.length > 0 && prefix.length === 0 && inner.length === 0;
        if (q && !onlyNames && !known().has(typedTag.toLowerCase()) && !chosen.has(typedTag)) options.push({ value: typedTag, custom: true });

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
            if (tagLabels[opt.value]) li.append(el('span', 'suggestion-hint', tagLabels[opt.value]));
          }
          li.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
          li.addEventListener('click', () => choose(i));
          listbox.append(li);
        });
        if (matches.length > MAX_SUGGESTIONS) info(`${matches.length - MAX_SUGGESTIONS} more · keep typing to narrow down`);
        if (suggestions().length === 0 && !q) info('No sites found yet. Type a tag and press Enter.');
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

  // ---- severity levels -------------------------------------------------------

  // toggle pills for the levels `available` for this event; none chosen means all
  function levelPicker(sub, available) {
    const group = el('div', 'levels');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `Levels for ${sub.event}`);
    group.append(el('span', 'levels-label', 'Levels'));

    const selected = () => (sub.levels.length ? available.filter((v) => sub.levels.includes(v)) : [...available]);
    const pills = available.map((value) => {
      const pill = el('button', 'level-pill', value);
      pill.type = 'button';
      pill.addEventListener('click', () => {
        const current = selected();
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : available.filter((v) => v === value || current.includes(v));
        // every level is stored as "all" ('*'); no level at all would silently mute the subscription
        sub.levels = next.length === 0 || next.length === available.length ? [] : next;
        render();
        updateSavebar();
      });
      group.append(pill);
      return pill;
    });

    function render() {
      const current = selected();
      pills.forEach((pill, i) => pill.setAttribute('aria-pressed', String(current.includes(available[i]))));
    }

    render();
    return group;
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
    // a choice needs at least two levels
    if (alarmKeys.has(key) && levelsByKey.has(key) && levelsByKey.get(key).length > 1) {
      body = el('div', 'sub-body');
      body.append(tagField(sub), levelPicker(sub, levelsByKey.get(key)));
    } else if (alarmKeys.has(key)) {
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
    const body = subs.map(({
      tags, levels, hadLevels, ...rest
    }) => {
      const out = { ...rest, tags: serializeList(tags) };
      // only events that report a severity get `levels`; other subscriptions are saved as before
      if (hadLevels || levelsByKey.has(keyOf(rest))) out.levels = serializeList(levels);
      return out;
    });
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

  // ---- ongoing issues: acknowledging mutes a site for one event, for this user ---

  const DAY_MS = 24 * 3600 * 1000;
  const ACK_DAYS = 7; // one click mutes for a week; the menu offers shorter mutes
  const ISSUES_SHOWN = 6; // events listed before "Show all"
  const GROUP_OPEN_MAX = 3; // events with this many sites or fewer start expanded
  const issuesList = document.getElementById('issues-list');
  const issuesCount = document.getElementById('issues-count');
  const ackKey = (o) => JSON.stringify([o.category, o.subcategory, o.event, o.tag]);
  let acks = data.acknowledgements || [];
  let issueOrder = null;
  let showAllIssues = false;
  let expandedGroups = null;

  function timeAgo(ms) {
    const minutes = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (minutes < 60) return minutes <= 1 ? 'just now' : `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
  }

  const formatUntil = (ms) => new Date(ms).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  // optimistic: show the change at once, roll back if the server refuses it
  async function saveAcks(next, message, focusKey) {
    const previous = acks;
    acks = next;
    renderIssues(focusKey);
    try {
      const res = await fetch(`/user/acknowledgements/${encodeURIComponent(data.userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      acks = await res.json();
      renderIssues(focusKey);
      toast(message);
    } catch (err) {
      console.error('saving acknowledgements failed:', err);
      acks = previous;
      renderIssues(focusKey);
      toast('Couldn’t save that. Please try again.', 'error');
    }
  }

  function acknowledge(issue, days) {
    const now = Date.now();
    const until = now + days * DAY_MS;
    const ack = {
      category: issue.category, subcategory: issue.subcategory, event: issue.event, tag: issue.tag, created_at: now, until,
    };
    const next = acks.filter((a) => ackKey(a) !== ackKey(issue)).concat(ack);
    saveAcks(next, `Muted ${issue.tag} · ${issue.event} until ${formatUntil(until)}`, ackKey(issue));
  }

  function unmute(issue) {
    saveAcks(acks.filter((a) => ackKey(a) !== ackKey(issue)), `Unmuted ${issue.tag} · ${issue.event}`, ackKey(issue));
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // inside an event group the event name is in the group header, so a row is just the site
  function issueRow(issue, inGroup) {
    const row = el('div', issue.ack ? 'issue-row is-muted' : 'issue-row');
    row.dataset.key = ackKey(issue);

    const main = el('div', 'issue-main');
    const activity = issue.count
      ? `${plural(issue.count, 'alarm')} · latest ${timeAgo(issue.last)}`
      : `no alarms in the last ${data.ongoingHours} h`;
    const title = el('div', 'issue-title');
    const chip = el('span', 'chip chip-plain', issue.tag);
    title.append(chip);
    if (tagLabels[issue.tag]) title.append(el('span', 'issue-label', tagLabels[issue.tag]));
    if (!inGroup) title.append(el('span', 'issue-event', issue.event));
    main.append(title, el('span', 'issue-meta', inGroup ? activity : `${issue.category} › ${issue.subcategory} · ${activity}`));

    const actions = el('div', 'issue-actions');
    if (issue.ack) {
      const unmuteBtn = el('button', 'btn btn-ghost btn-sm issue-primary', 'Unmute');
      unmuteBtn.type = 'button';
      unmuteBtn.setAttribute('aria-label', `Unmute ${issue.tag} for ${issue.event}`);
      unmuteBtn.addEventListener('click', () => unmute(issue));
      actions.append(el('span', 'issue-muted', `Muted until ${formatUntil(issue.ack.until)}`), unmuteBtn);
    } else {
      const ackBtn = el('button', 'btn btn-secondary btn-sm issue-primary', 'Acknowledge');
      ackBtn.type = 'button';
      ackBtn.title = `Stop emails about ${issue.tag} for this event for ${ACK_DAYS} days`;
      ackBtn.setAttribute('aria-label', `Acknowledge ${issue.tag} for ${issue.event}: mute for ${ACK_DAYS} days`);
      ackBtn.addEventListener('click', () => acknowledge(issue, ACK_DAYS));

      const more = el('details', 'menu issue-more');
      const summary = el('summary', 'icon-btn');
      summary.innerHTML = ICON_CHEVRON_DOWN;
      summary.setAttribute('aria-label', `Shorter mute for ${issue.tag}`);
      const panel = el('div', 'menu-panel');
      panel.setAttribute('role', 'menu');
      [1, 3].forEach((days) => {
        const item = el('button', 'menu-item', `Mute for ${days} day${days === 1 ? '' : 's'}`);
        item.type = 'button';
        item.setAttribute('role', 'menuitem');
        item.addEventListener('click', () => {
          more.removeAttribute('open');
          acknowledge(issue, days);
        });
        panel.append(item);
      });
      more.append(summary, panel);
      actions.append(ackBtn, more);
    }

    row.append(main, actions);
    return row;
  }

  // one event with several sites: a header with totals that expands to the per-site rows
  function issueGroup(group) {
    const box = el('div', 'issue-group');
    const open = expandedGroups.has(group.key);
    const sites = group.rows.length;
    const alarmCount = group.rows.reduce((n, r) => n + r.count, 0);
    const muted = group.rows.filter((r) => r.ack).length;
    const latest = Math.max(...group.rows.map((r) => r.last));

    const head = el('button', 'issue-group-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(open));
    head.innerHTML = ICON_CHEVRON;
    const main = el('span', 'issue-main');
    const facts = [`${group.category} › ${group.subcategory}`, plural(sites, 'tag'), plural(alarmCount, 'alarm')];
    if (latest) facts.push(`latest ${timeAgo(latest)}`);
    if (muted) facts.push(`${muted} muted`);
    main.append(el('span', 'issue-event', group.event), el('span', 'issue-meta', facts.join(' · ')));
    head.append(main);
    head.addEventListener('click', () => {
      if (expandedGroups.has(group.key)) expandedGroups.delete(group.key);
      else expandedGroups.add(group.key);
      renderIssues();
    });

    box.append(head);
    if (open) {
      const body = el('div', 'issue-group-body');
      group.rows.forEach((r) => body.append(issueRow(r, true)));
      box.append(body);
    }
    return box;
  }

  function renderIssues(focusKey) {
    const now = Date.now();
    acks = acks.filter((a) => a.until > now);
    const ackByKey = new Map(acks.map((a) => [ackKey(a), a]));
    const rows = (data.ongoing || []).map((i) => ({ ...i, ack: ackByKey.get(ackKey(i)) }));
    const listed = new Set(rows.map(ackKey));
    // mutes without recent alarms still get a row, so they can be unmuted
    acks.forEach((a) => {
      if (!listed.has(ackKey(a))) rows.push({ ...a, count: 0, last: 0, ack: a });
    });

    if (!issueOrder) {
      // issues still sending emails first, newest first; muted ones after
      rows.sort((a, b) => Number(Boolean(a.ack)) - Number(Boolean(b.ack)) || b.last - a.last);
      issueOrder = rows.map(ackKey);
    } else {
      // keep rows where they are after (un)muting, so they don't jump away
      const pos = (r) => (issueOrder.includes(ackKey(r)) ? issueOrder.indexOf(ackKey(r)) : issueOrder.length);
      rows.sort((a, b) => pos(a) - pos(b));
    }

    // one entry per event, in the order of its first row
    const groups = new Map();
    rows.forEach((r) => {
      const key = JSON.stringify([r.category, r.subcategory, r.event]);
      if (!groups.has(key)) {
        groups.set(key, {
          key, category: r.category, subcategory: r.subcategory, event: r.event, rows: [],
        });
      }
      groups.get(key).rows.push(r);
    });
    const entries = [...groups.values()];
    if (!expandedGroups) expandedGroups = new Set(entries.filter((g) => g.rows.length <= GROUP_OPEN_MAX).map((g) => g.key));

    // badge: events that still send emails (not every site of them muted)
    const open = entries.filter((g) => g.rows.some((r) => !r.ack)).length;
    issuesCount.textContent = open;
    issuesCount.hidden = open === 0;
    issuesList.textContent = '';
    if (data.ongoing === null) {
      issuesList.append(el('p', 'issues-empty', 'Couldn’t load recent alarms right now.'));
    } else if (rows.length === 0) {
      issuesList.append(el('p', 'issues-empty', `No alarms for your subscriptions in the last ${data.ongoingHours} hours.`));
    }

    (showAllIssues ? entries : entries.slice(0, ISSUES_SHOWN))
      .forEach((g) => issuesList.append(g.rows.length === 1 ? issueRow(g.rows[0], false) : issueGroup(g)));
    if (entries.length > ISSUES_SHOWN) {
      const footer = el('div', 'issues-footer');
      const toggle = el('button', 'btn btn-ghost btn-sm', showAllIssues ? 'Show fewer' : `Show all ${entries.length} events`);
      toggle.type = 'button';
      toggle.addEventListener('click', () => {
        showAllIssues = !showAllIssues;
        renderIssues();
      });
      footer.append(toggle);
      issuesList.append(footer);
    }

    if (focusKey) {
      const row = [...issuesList.querySelectorAll('.issue-row')].find((r) => r.dataset.key === focusKey);
      if (row) row.querySelector('.issue-primary').focus();
    }
  }

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
  expandAll.addEventListener('click', () => {
    const keys = groupKeys();
    if (keys.every((k) => expanded.has(k))) keys.forEach((k) => expanded.delete(k));
    else keys.forEach((k) => expanded.add(k));
    renderTree();
  });

  // ---- tag suggestions -----------------------------------------------------

  fetch('/alarm/tags?labels=1')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.status))))
    .then(({ tags, pathTags: path, labels }) => {
      allTags = tags;
      knownTags = new Map(tags.map((t) => [t.toLowerCase(), t]));
      pathTags = path || [];
      knownPathTags = new Map(pathTags.map((t) => [t.toLowerCase(), t]));
      tagLabels = labels || {};
      tagsState = 'ready';
      // ongoing issues may list ASNs that now have a network name
      if (Object.keys(tagLabels).length) renderIssues();
    })
    .catch((err) => {
      console.error('loading tags failed:', err);
      tagsState = 'failed';
    })
    .then(() => tagFields.forEach((refresh) => refresh()));

  renderTree();
  renderSubs();
  renderIssues();
}());
