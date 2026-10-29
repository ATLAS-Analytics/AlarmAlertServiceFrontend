// Local development without Elasticsearch or Globus: `npm run dev`, then open http://localhost:8080.
// Preloaded before server.js; stubs the config files, Elasticsearch (in-memory data below),
// the Globus login (signs you in as "Test User") and moves port 80 to 8080.
// http://localhost:8082 shows the in-memory data, e.g. what the subscriptions page saved.
const fs = require('fs');
const http = require('http');
const Module = require('module');

const PORT = 8080;
const FAKE_GLOBUS_PORT = 8081;

const config = {
  TITLE: 'AAAS',
  ES_HOST: { node: 'http://fake-es' },
  PREFERENCES: {
    vacation: { name: 'Vacation mode', type: 'boolean', default_value: false },
    mail_interval: { name: 'Mail interval (hours)', type: 'number', default_value: 6 },
    prefered_mail: { name: 'Preferred email', type: 'email', default_value: '' },
  },
  TOPOLOGY_FIELDS: ['category', 'subcategory', 'event'],
  REQUIRED_ALARM_FIELDS: ['body'],
  OPTIONAL_ALARM_FIELDS: ['tags', 'source', 'level'],
  REQUIRED_ALARM_TOPOLOGY_FIELDS: ['description', 'template'],
  REQUIRED_HEARTBEAT_FIELDS: [],
  OPTIONAL_HEARTBEAT_FIELDS: ['source', 'tags'],
  REQUIRED_HEARTBEAT_TOPOLOGY_FIELDS: ['description', 'template', 'interval', 'min_expected'],
};
const globus = {
  CLIENT_ID: 'cid',
  CLIENT_SECRET: 'secret',
  REDIRECT_LINK: `http://localhost:${PORT}/authcallback`,
  AUTHORIZE_URI: `http://localhost:${FAKE_GLOBUS_PORT}/authorize`,
  TOKEN_URI: 'https://auth.globus.org/v2/oauth2/token',
  LOGOUT_URI: 'https://auth.globus.org/v2/web/logout',
};

const origRead = fs.readFileSync;
fs.readFileSync = function patched(p, ...rest) {
  if (p === '/etc/aaasf/config.json') return JSON.stringify(config);
  if (p === '/etc/aaasf/globus-config.json') return JSON.stringify(globus);
  return origRead.call(this, p, ...rest);
};

const origListen = http.Server.prototype.listen;
http.Server.prototype.listen = function patched(port, ...rest) {
  return origListen.call(this, port === 80 ? PORT : port, ...rest);
};

// ---- fake data -----------------------------------------------------------
const net = (subcategory, event, description) => ({ category: 'Networking', subcategory, event, description, template: 'x' });
const categories = [
  net('Sites', 'bandwidth decreased', 'Bandwidth decreased for a site compared to the past 21 days, measured with perfSONAR throughput tests.'),
  net('Sites', 'bandwidth decreased from/to multiple sites', 'Bandwidth decreased between a site and several other sites at the same time.'),
  net('Sites', 'high packet loss', 'Packet loss above 2% for a source-destination pair over the past 24 hours.'),
  net('Sites', 'high packet loss on multiple links', 'Packet loss above 2% on several links involving the same site.'),
  net('Sites', 'firewall issue', 'Throughput tests succeed but latency tests fail, which points to a firewall.'),
  net('Infrastructure', 'complete packet loss', '100% packet loss on a link.'),
  net('Infrastructure', 'large clock correction', 'perfSONAR host clock drifted by more than 100 ms.'),
  net('Infrastructure', 'hosts not found', 'perfSONAR hosts registered in CRIC that do not report measurements.'),
  net('RENs', 'path changed', 'The route between two sites changed compared to its usual path.'),
  net('RENs', 'ASN path anomalies', 'An unusual autonomous system appears on a path.'),
  { category: 'Analytics', subcategory: 'Frontier', event: 'Failed queries', description: 'Code running every 1h at UC k8s cluster. Checks all servers for rejected queries and DB disconnections.', template: 'x' },
  { category: 'Analytics', subcategory: 'Frontier', event: 'Bad SQL queries', description: 'Queries that took too long or returned too much data.', template: 'x' },
  { category: 'Analytics', subcategory: 'Elasticsearch', event: 'cluster status', description: 'Elasticsearch cluster is not green.', template: 'x' },
  { category: 'Virtual Placement', subcategory: 'XCache', event: 'dead server', description: 'An XCache server stopped responding.', template: 'x' },
];
const hbTopology = [
  { category: 'SLATE', subcategory: 'Squid', event: 'server down', description: 'This alarm gets generated if a squid instance does not send at least 4 heartbeats in last 60 seconds.', template: 'x', interval: 3600, min_expected: 4 },
  { category: 'Virtual Placement', subcategory: 'XCache', event: 'heartbeat missing', description: 'XCache node stopped sending heartbeats.', template: 'x', interval: 3600, min_expected: 2 },
];
const sites = ['AGLT2', 'MWT2', 'BNL-ATLAS', 'SWT2_CPB', 'NET2', 'CERN-PROD', 'UKI-SOUTHGRID-BRIS-HEP', 'UKI-NORTHGRID-MAN-HEP',
  'UKI-LT2-QMUL', 'IN2P3-CC', 'FZK-LCG2', 'INFN-T1', 'TRIUMF-LCG2', 'NDGF-T1', 'RAL-LCG2', 'pic', 'SARA-MATRIX', 'Taiwan-LCG2',
  'TOKYO-LCG2', 'praguelcg2', 'DESY-HH', 'LRZ-LMU', 'IFIC-LCG2', 'GRIF', 'BEIJING-LCG2', 'Australia-ATLAS', 'CA-SFU-T2', 'WT2',
  'MPPMU', 'IL-TAU-HEP', 'RO-07-NIPNE', 'UNI-FREIBURG', 'wuppertalprod', 'CSCS-LCG2', 'UAM-LCG2', 'INFN-NAPOLI-ATLAS'];
const netsites = ['MWT2-UC', 'MWT2-IU', 'MWT2-UIUC', 'AGLT2-UM', 'AGLT2-MSU', 'BNL-ATLAS-LHCONE', 'CERN-PROD-LHCOPN', 'UC-AF'];
const aggValues = {
  'tags.keyword': [...sites, ...netsites, 'University of Nowhere', '*'],
  'source.src_site.keyword': sites.slice(0, 20),
  'source.dest_netsite': netsites,
  'source.site': ['MWT2', 'AGLT2', 'SiteOnlyInSource'],
};
const users = {
  'user-1': {
    username: 'test-user',
    affiliation: 'University of Chicago',
    user: 'Test User',
    email: 'test.user@example.org',
    preferences: { vacation: false, mail_interval: 6 },
    subscriptions: [
      { category: 'Networking', subcategory: 'Sites', event: 'high packet loss', tags: 'MWT2 AGLT2' },
      { category: 'Networking', subcategory: 'Sites', event: 'bandwidth decreased', tags: 'BNL-ATLAS,SWT2_CPB' },
      { category: 'Networking', subcategory: 'RENs', event: 'path changed', tags: '*' },
      { category: 'SLATE', subcategory: 'Squid', event: 'server down', tags: '*' },
      { category: 'Old', subcategory: 'Gone', event: 'deleted event', tags: '*' },
    ],
  },
};
global.FAKE = { users, writes: [] };

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const hits = (arr) => ({ hits: { total: { value: arr.length }, hits: arr.map((s, i) => ({ _id: String(i), _source: s })) } });

class FakeES {
  async search(p) {
    if (p.index === 'aaas_users') {
      if (p.query.match && p.query.match._id) {
        const u = users[p.query.match._id];
        return u ? { hits: { total: { value: 1 }, hits: [{ _id: p.query.match._id, _source: JSON.parse(JSON.stringify(u)) }] } } : hits([]);
      }
      return { hits: { total: { value: Object.keys(users).length }, hits: Object.entries(users).map(([id, s]) => ({ _id: id, _source: s })) } };
    }
    if (p.index === 'aaas_categories') return hits(categories);
    if (p.index === 'aaas_heartbeats_topology') return hits(hbTopology);
    if (p.index === 'aaas_alarms' && p.aggs) {
      await delay(400);
      const aggregations = {};
      Object.entries(p.aggs).forEach(([name, a]) => {
        aggregations[name] = { buckets: (aggValues[a.terms.field] || []).map((key) => ({ key, doc_count: 1 })) };
      });
      global.FAKE.aggFields = Object.values(p.aggs).map((a) => a.terms.field);
      return { hits: { total: { value: 0 }, hits: [] }, aggregations };
    }
    return hits([]);
  }

  async fieldCaps() {
    const kw = { keyword: { type: 'keyword', aggregatable: true } };
    const text = { text: { type: 'text', aggregatable: false } };
    return {
      indices: ['aaas_alarms'],
      fields: {
        tags: text,
        'tags.keyword': kw,
        'source.src_site': text,
        'source.src_site.keyword': kw,
        'source.dest_netsite': kw,
        'source.site': kw,
        'source.avg_value': { float: { type: 'float', aggregatable: true } },
        'source.host_src': kw,
      },
    };
  }

  async index(p) {
    if (p.index === 'aaas_users') users[p.id] = p.body;
    return { result: 'created' };
  }

  async update(p) {
    global.FAKE.writes.push({ id: p.id, doc: p.body.doc });
    Object.assign(users[p.id], p.body.doc);
    return { result: 'updated' };
  }

  async deleteByQuery() { return { deleted: 0 }; }

  async updateByQuery() { return {}; }
}

const fakeAxios = {
  async post(url) {
    if (url.startsWith(globus.TOKEN_URI)) return { status: 200, data: { access_token: 'tok' } };
    if (url.includes('userinfo')) {
      return {
        status: 200,
        data: {
          sub: 'user-1', name: 'Test User', email: 'test.user@example.org', preferred_username: 'test-user', organization: 'University of Chicago',
        },
      };
    }
    throw new Error(`unexpected POST ${url}`);
  },
  async get() { return { status: 200 }; },
};

const origLoad = Module._load;
Module._load = function patched(request, ...rest) {
  if (request === '@elastic/elasticsearch') return { Client: FakeES };
  if (request === 'axios') return { default: fakeAxios };
  return origLoad.call(this, request, ...rest);
};

// fake Globus authorize page: bounce straight back with a code
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.writeHead(302, { Location: `${u.searchParams.get('redirect_uri')}?code=abc&state=${u.searchParams.get('state')}` });
  res.end();
}).listen(FAKE_GLOBUS_PORT);

// expose the in-memory data for inspection
http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(global.FAKE));
}).listen(8082);
