// The Documentation page: docs/documentation.md rendered to HTML, with a table of contents.
// Conventions in the Markdown:
// - ## and ### headings make up the table of contents
// - a heading like "#### GET /alarm/categories — List categories" becomes an API endpoint card
// - images are written as ../static/... so they also show on GitHub; the app serves them from /
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const DOCS_FILE = path.join(__dirname, '..', 'docs', 'documentation.md');
const ENDPOINT = /^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)\s*(?:[—–-]\s*(.*))?$/;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
// plain text of rendered inline HTML, for the table of contents (Pug escapes it again)
const plainText = (html) => html.replace(/<[^>]+>/g, '')
  .replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({
    amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'",
  }[e]));
const slug = (text) => text.toLowerCase().replace(/&[a-z0-9#]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const renderer = new marked.Renderer();
renderer.image = ({ href, title, text }) => {
  const src = href.replace(/^(\.\.\/)+static\//, '/');
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ''}>`;
};

function render(markdown) {
  const tokens = marked.lexer(markdown);
  const parse = (list) => marked.parser(Object.assign(list, { links: tokens.links }), { renderer });
  const toc = [];
  const html = [];
  let inEndpoint = false;
  // repeated headings (e.g. two "Heartbeats") get -2, -3, ... like on GitHub
  const used = new Map();
  const uniqueId = (base) => {
    const n = (used.get(base) || 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };

  tokens.forEach((token) => {
    if (token.type !== 'heading') {
      html.push(parse([token]));
      return;
    }
    if (inEndpoint && token.depth <= 4) {
      html.push('</article>');
      inEndpoint = false;
    }
    const endpoint = token.depth === 4 && token.text.match(ENDPOINT);
    if (endpoint) {
      const [, method, route, title] = endpoint;
      html.push(`<article class="endpoint" id="${uniqueId(slug(`${method} ${route}`))}">`
        + `<div class="endpoint-head"><span class="method method-${method.toLowerCase()}">${method}</span>`
        + `<code class="endpoint-path">${escapeHtml(route)}</code></div>`
        + `${title ? `<h4>${marked.parseInline(title)}</h4>` : ''}`);
      inEndpoint = true;
      return;
    }
    const inner = marked.parseInline(token.text);
    const text = plainText(inner);
    const id = uniqueId(slug(text));
    if (token.depth === 2) toc.push({ id, text, children: [] });
    else if (token.depth === 3 && toc.length) toc[toc.length - 1].children.push({ id, text });
    html.push(`<h${token.depth} id="${id}">${inner}</h${token.depth}>`);
  });
  if (inEndpoint) html.push('</article>');
  return { html: html.join('\n'), toc };
}

// re-rendered whenever the file changes, so edits show up without a restart
let cache = { mtimeMs: 0, page: null };

function loadDocs() {
  const { mtimeMs } = fs.statSync(DOCS_FILE);
  if (!cache.page || mtimeMs !== cache.mtimeMs) {
    cache = { mtimeMs, page: render(fs.readFileSync(DOCS_FILE, 'utf8')) };
  }
  return cache.page;
}

exports.loadDocs = loadDocs;
