// Local development on SAMPLE data, without Elasticsearch or Globus: `npm run dev:mock`, then
// open http://localhost:8080. For the real data use `npm run dev` (dev/real-backends.js).
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
  {
    category: 'Networking', subcategory: 'Network', event: 'suspected path element', description: 'A network element suspected of degrading several paths.', template: 'x',
  },
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
const psNetsites = ['BNL-ATLAS-LHCOPN', 'CERN-PROD-LHCONE', 'FZK-LCG2-LHCOPN', 'IN2P3-CC-LHCONE', 'INFN-T1-LHCOPN', 'NDGF-T1-LHCONE',
  'RAL-LCG2-LHCOPN', 'SARA-MATRIX-LHCOPN', 'TRIUMF-LCG2-LHCOPN', 'pic-LHCOPN', 'KIT-LHCONE', 'JINR-T1-LHCOPN', 'IHEP-LHCONE',
  'NCBJ-CIS', 'UKI-SCOTGRID-GLASGOW', 'UKI-NORTHGRID-LANCS-HEP', 'IFCA-LCG2', 'CYFRONET-LCG2', 'GoeGrid', 'INFN-LNF', 'INFN-ROMA1'];
const aggValues = {
  'tags.keyword': [...sites, ...netsites, 'AS2200', 'AS513', 'University of Nowhere', '*'],
  'source.src_site.keyword': sites.slice(0, 20),
  'source.dest_netsite': netsites,
  'source.site': ['MWT2', 'AGLT2', 'SiteOnlyInSource'],
  src_netsite: psNetsites,
  dest_netsite: psNetsites.slice(5),
  src_site: sites.slice(10),
  // networks on traceroute paths; 0 marks an unknown hop
  asns: [513, 2200, 39590, 786, 3, 0],
};
// ps_asns_1: network owner by ASN
const asnOwners = {
  513: 'CERN, CH', 2200: 'FR-RENATER Reseau National de telecommunications pour la Tec', 39590: 'NDGF High energy physicists community in the nordics., SE', 786: 'JANET Jisc Services Limited, GB', 3: 'MIT-GATEWAYS, US',
};
// events whose alarms carry a severity `level` (one with words, one with numbers)
const levelData = [
  { category: 'Networking', subcategory: 'Sites', event: 'high packet loss', levels: ['warning', 'critical'] },
  { category: 'Networking', subcategory: 'RENs', event: 'path changed', levels: [3, 1, 2] },
];
// recent alarms for the "Ongoing issues" panel, covering each filtering rule
const minutesAgo = (m) => Date.now() - m * 60000;
const netAlarm = (subcategory, event, tags, level, m) => ({
  category: 'Networking', subcategory, event, tags, level, created_at: minutesAgo(m),
});
const recentAlarms = [
  ...[20, 80, 140, 300, 600].map((m) => netAlarm('Sites', 'high packet loss', ['MWT2', 'BNL-ATLAS'], 'critical', m)),
  // the test user only wants 'critical' for this event, so these are left out
  ...[30, 90].map((m) => netAlarm('Sites', 'high packet loss', ['AGLT2'], 'warning', m)),
  ...[45, 200, 400].map((m) => netAlarm('RENs', 'path changed', ['MWT2', 'AGLT2'], 2, m)),
  netAlarm('RENs', 'path changed', ['CERN-PROD'], 1, 50),
  // comma-separated subscription tags never match in alerts.py, so this is left out too
  netAlarm('Sites', 'bandwidth decreased', ['BNL-ATLAS'], undefined, 70),
  // heartbeat alarms have no tags and can't be muted per site
  {
    category: 'SLATE', subcategory: 'Squid', event: 'server down', created_at: minutesAgo(15), source: { site: 'MWT2' },
  },
];
const users = {
  'user-1': {
    username: 'test-user',
    affiliation: 'University of Chicago',
    user: 'Test User',
    email: 'test.user@example.org',
    preferences: { vacation: false, mail_interval: 6 },
    subscriptions: [
      {
        category: 'Networking', subcategory: 'Sites', event: 'high packet loss', tags: 'MWT2 AGLT2', levels: 'critical',
      },
      { category: 'Networking', subcategory: 'Sites', event: 'bandwidth decreased', tags: 'BNL-ATLAS,SWT2_CPB' },
      { category: 'Networking', subcategory: 'RENs', event: 'path changed', tags: '*' },
      { category: 'SLATE', subcategory: 'Squid', event: 'server down', tags: '*' },
      { category: 'Old', subcategory: 'Gone', event: 'deleted event', tags: '*' },
    ],
    acknowledgements: [
      {
        category: 'Networking', subcategory: 'RENs', event: 'path changed', tag: 'CERN-PROD', created_at: minutesAgo(60), until: minutesAgo(-2 * 24 * 60),
      },
      // muted, but no matching alarms in the last 24 h
      {
        category: 'Networking', subcategory: 'Sites', event: 'high packet loss', tag: 'AGLT2', created_at: minutesAgo(600), until: minutesAgo(-5 * 24 * 60),
      },
      // already expired: must not be shown
      {
        category: 'Networking', subcategory: 'RENs', event: 'path changed', tag: 'MWT2', created_at: minutesAgo(9000), until: minutesAgo(30),
      },
    ],
  },
};
global.FAKE = { users, writes: [] };
// shown as a badge on every page (see views/layout.pug)
process.env.AAAS_DEV_BANNER = 'Sample data · npm run dev:mock';

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
    if (p.index === 'aaas_alarms' && p.aggs && p.aggs.category) {
      // nested category > subcategory > event > level aggregation (loadAlarmLevels)
      const group = (items, field) => [...new Set(items.map((i) => i[field]))].map((key) => ({ key, items: items.filter((i) => i[field] === key) }));
      const aggregations = {
        category: {
          buckets: group(levelData, 'category').map((c) => ({
            key: c.key,
            subcategory: {
              buckets: group(c.items, 'subcategory').map((s) => ({
                key: s.key,
                event: {
                  buckets: s.items.map((e) => ({ key: e.event, level: { buckets: e.levels.map((key) => ({ key, doc_count: 1 })) } })),
                },
              })),
            },
          })),
        },
      };
      return { hits: { total: { value: 0 }, hits: [] }, aggregations };
    }
    if (p.index === 'aaas_alarms' && !p.aggs) return hits(recentAlarms);
    if ((p.index === 'aaas_alarms' || p.index.startsWith('ps_trace')) && p.aggs) {
      await delay(400);
      global.FAKE.lastQuery = global.FAKE.lastQuery || {};
      global.FAKE.lastQuery[p.index] = p.query;
      const aggregations = {};
      Object.entries(p.aggs).forEach(([name, a]) => {
        aggregations[name] = { buckets: (aggValues[a.terms.field] || []).map((key) => ({ key, doc_count: 1 })) };
      });
      global.FAKE.aggFields = Object.values(p.aggs).map((a) => a.terms.field);
      return { hits: { total: { value: 0 }, hits: [] }, aggregations };
    }
    return hits([]);
  }

  async fieldCaps(p) {
    const kw = { keyword: { type: 'keyword', aggregatable: true } };
    const text = { text: { type: 'text', aggregatable: false } };
    if (p.index.startsWith('ps_trace')) {
      return {
        indices: ['ps_trace'],
        fields: {
          src_netsite: kw, dest_netsite: kw, src_site: kw, dest_site: text, timestamp: { date: { type: 'date', aggregatable: true } },
        },
      };
    }
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
        category: kw,
        subcategory: kw,
        event: kw,
        level: kw,
      },
    };
  }

  async mget(p) {
    return { docs: p.ids.map((id) => (asnOwners[id] ? { _id: id, found: true, _source: { owner: asnOwners[id] } } : { _id: id, found: false })) };
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
