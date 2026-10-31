// Local development on REAL data: `npm run dev`, then open http://localhost:8080.
// Reads the production Elasticsearch through the tunnel (https://localhost:9200, or ES_HOST),
// with credentials from ES_USER/ES_PASS or ES_CREDS_FILE (user and password on the first two
// lines, as for helpers.py). Nothing is written to Elasticsearch:
// - you sign in as an in-memory user "dev-user"; its subscriptions, preferences and mutes are
//   kept in memory only
// - AAAS_DEV_USER_ID=<user id> views a real user's profile instead; saving it is refused,
//   unless AAAS_DEV_WRITE=1: then that one user's record is saved to Elasticsearch for real
// - any other write (e.g. alarms created by the heartbeat checker) is skipped and logged
// Globus login is stubbed and port 80 moves to 8080.
const fs = require('fs');
const http = require('http');
const path = require('path');
const Module = require('module');

const PORT = 8080;
const FAKE_GLOBUS_PORT = 8081;
const DEV_USER_ID = 'dev-user';
const viewAs = process.env.AAAS_DEV_USER_ID;
const writeViewed = Boolean(viewAs) && process.env.AAAS_DEV_WRITE === '1';
// shown as a badge on every page (see views/layout.pug)
process.env.AAAS_DEV_BANNER = writeViewed ? `Real data · saving user ${viewAs}` : 'Real data · read-only';

function credentials() {
  if (process.env.ES_USER && process.env.ES_PASS) return [process.env.ES_USER, process.env.ES_PASS];
  if (process.env.ES_CREDS_FILE) return fs.readFileSync(process.env.ES_CREDS_FILE, 'utf8').split('\n').map((l) => l.trim());
  console.error('npm run dev reads the real Elasticsearch through the tunnel and needs ES_USER and ES_PASS,\n'
    + 'or ES_CREDS_FILE (user and password on the first two lines), e.g.\n'
    + '  ES_CREDS_FILE=~/workspace/AlarmsAndAlerts/creds.key npm run dev\n'
    + 'For sample data without Elasticsearch: npm run dev:mock');
  process.exit(1);
}
const [esUser, esPass] = credentials();

const config = {
  ES_HOST: {
    node: process.env.ES_HOST || 'https://localhost:9200',
    auth: { username: esUser, password: esPass },
    tls: { rejectUnauthorized: false }, // the tunnel's certificate is for the real host name
  },
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

// ---- read-only Elasticsearch -----------------------------------------------

const devUser = {
  username: 'dev', affiliation: 'Local development', user: 'Dev User', email: 'dev@localhost',
  preferences: {}, subscriptions: [], acknowledgements: [],
};
const realES = require(path.join(process.cwd(), 'node_modules/@elastic/elasticsearch'));

class ReadOnlyClient extends realES.Client {
  async search(params, options) {
    const id = params.index === 'aaas_users' && params.query && params.query.match && params.query.match._id;
    if (id === DEV_USER_ID) {
      return { hits: { total: { value: 1 }, hits: [{ _id: DEV_USER_ID, _source: JSON.parse(JSON.stringify(devUser)) }] } };
    }
    return super.search(params, options);
  }

  async update(params, options) {
    if (params.index === 'aaas_users' && params.id === DEV_USER_ID) {
      Object.assign(devUser, params.body.doc);
      return { result: 'updated' };
    }
    if (params.index === 'aaas_users' && writeViewed && params.id === viewAs) {
      console.log(`[dev] writing ${Object.keys(params.body.doc).join(', ')} of user ${viewAs} to Elasticsearch`);
      return super.update(params, options);
    }
    if (params.index === 'aaas_users') throw new Error('npm run dev is read-only: not saving a real user (AAAS_DEV_WRITE=1 allows it)');
    return skipped('update', params);
  }
}

function skipped(method, params) {
  console.log(`[dev] skipped ${method} on ${params && params.index} (read-only)`);
  if (method === 'deleteByQuery') return { deleted: 0 };
  return { result: method === 'index' ? 'created' : 'updated' };
}
['index', 'create', 'delete', 'deleteByQuery', 'updateByQuery', 'bulk'].forEach((m) => {
  ReadOnlyClient.prototype[m] = async function readOnly(params) { return skipped(m, params); };
});

// ---- stubbed Globus login --------------------------------------------------

const fakeAxios = {
  async post(url) {
    if (url.startsWith(globus.TOKEN_URI)) return { status: 200, data: { access_token: 'dev' } };
    if (viewAs) return { status: 200, data: { sub: viewAs, name: 'Viewing as a real user', email: '', preferred_username: viewAs } };
    return {
      status: 200,
      data: {
        sub: DEV_USER_ID, name: devUser.user, email: devUser.email, preferred_username: devUser.username, organization: devUser.affiliation,
      },
    };
  },
  async get() { return { status: 200 }; },
};

const origLoad = Module._load;
Module._load = function patched(request, ...rest) {
  if (request === '@elastic/elasticsearch') return { ...realES, Client: ReadOnlyClient };
  if (request === 'axios') return { default: fakeAxios };
  return origLoad.call(this, request, ...rest);
};

// fake Globus authorize page: bounce straight back with a code
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.writeHead(302, { Location: `${u.searchParams.get('redirect_uri')}?code=dev&state=${u.searchParams.get('state')}` });
  res.end();
}).listen(FAKE_GLOBUS_PORT);

console.log(`[dev] reading ${config.ES_HOST.node}; signing in as ${viewAs || DEV_USER_ID}`
  + `${writeViewed ? ' (saving this user to Elasticsearch)' : ' (nothing is written to Elasticsearch)'}`);
