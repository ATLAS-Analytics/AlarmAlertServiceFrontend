const fs = require('fs');
const express = require('express');
const session = require('express-session');
const axios = require('axios').default;

console.log('Alarm & Alert Service server starting ... ');

const TEST = false;

let config;
let globConf;

if (!TEST) {
  config = JSON.parse(fs.readFileSync('/etc/aaasf/config.json', 'utf8'));
  globConf = JSON.parse(fs.readFileSync('/etc/aaasf/globus-config.json', 'utf8'));
} else {
  config = JSON.parse(fs.readFileSync('./kube/secrets/config.json', 'utf8'));
  globConf = JSON.parse(fs.readFileSync('./kube/secrets/globus-config.json', 'utf8'));
}

console.log(config);

// App
const app = express();

app.use(express.static('./static'));

app.set('view engine', 'pug');
app.set('views', 'views');

app.use(express.json()); // to support JSON-encoded bodies
app.use(session({
  secret: 'mamicu mu njegovu',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 3600000 },
}));

// set only by the local dev modes (dev/*.js): which data the page shows
app.locals.devBanner = process.env.AAAS_DEV_BANNER;

// lets templates hand data to page scripts via <script type="application/json">
app.locals.json = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

app.use((req, res, next) => {
  res.locals.loggedIn = req.session.loggedIn === true;
  res.locals.currentUser = req.session.user;
  res.locals.path = req.path;
  next();
});

const usr = require('./routes/user');
const alarms = require('./routes/alarms');
const heartbeats = require('./routes/heartbeats');
const { loadDocs } = require('./routes/docs');

usr.init(config);
alarms.init(config);
heartbeats.init(config);

app.use('/user', usr.router);
app.use('/alarm', alarms.router);
app.use('/heartbeat', heartbeats.router);

// Kibana dashboards embedded on the Alarms and Heartbeats pages
const KIBANA_DASHBOARDS = 'https://atlas-kibana.mwt2.org:5601/s/aaas/app/dashboards?auth_provider_hint=anonymous1#/view/';
const KIBANA_TIME = '_g=(filters%3A!()%2CrefreshInterval%3A(pause%3A!t%2Cvalue%3A0)%2Ctime%3A(from%3Anow-7d%2Cto%3Anow))';

const ALARMS_DASHBOARD = 'f3055010-2af1-11ed-afcf-d91dad577662';
const HEARTBEATS_DASHBOARD = 'cf438520-2afb-11ed-afcf-d91dad577662';

// a string in rison, the notation of Kibana's URL state
const risonString = (s) => `'${s.replace(/!/g, '!!').replace(/'/g, "!'")}'`;

// `kql`, if given, becomes the dashboard's query (Kibana app state `_a`)
function kibanaDashboard(title, description, id, kql) {
  const appState = kql ? `&_a=${encodeURIComponent(`(query:(language:kuery,query:${risonString(kql)}))`)}` : '';
  return {
    title,
    description,
    embedUrl: `${KIBANA_DASHBOARDS}${id}?embed=true&${KIBANA_TIME}${appState}&show-time-filter=true&hide-filter-bar=true`,
    kibanaUrl: `${KIBANA_DASHBOARDS}${id}?${KIBANA_TIME}${appState}`,
  };
}

// KQL matching the alarms of the subscribed events, grouped per category/subcategory;
// returns the query and the number of distinct events in it
function subscriptionsQuery(subscriptions) {
  const quote = (v) => `"${String(v).replace(/[\\"]/g, '\\$&')}"`;
  const groups = new Map();
  (subscriptions || []).forEach((s) => {
    if (!s || !s.category || !s.subcategory || !s.event) return;
    const key = JSON.stringify([s.category, s.subcategory]);
    if (!groups.has(key)) groups.set(key, { category: s.category, subcategory: s.subcategory, events: new Set() });
    groups.get(key).events.add(s.event);
  });
  const clauses = [...groups.values()].map((g) => `(category:${quote(g.category)} and subcategory:${quote(g.subcategory)}`
    + ` and event:(${[...g.events].map(quote).join(' or ')}))`);
  return { kql: clauses.join(' or '), events: [...groups.values()].reduce((n, g) => n + g.events.size, 0) };
}

// the "Ongoing issues" panel on the subscriptions page looks this far back
const ONGOING_HOURS = 24;

// events whose tags are elements of perfSONAR paths: their suggestions are the netsites
// and networks (ASNs) of ps_trace instead of the general site list
const PATH_TAG_EVENTS = [
  { category: 'Networking', subcategory: 'Network', event: 'suspected path element' },
];

// only same-site paths are allowed as post-login destinations
function safeReturnPath(p) {
  if (typeof p !== 'string' || !p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\')) return null;
  return p;
}

function topologyForPage(topology) {
  return (topology || []).map(({
    category, subcategory, event, description,
  }) => ({
    category, subcategory, event, description,
  }));
}

function renderError(res, status, title, message) {
  res.status(status);
  res.render('error', { code: status, title, message });
}

// GLOBUS STUFF
const bup = Buffer.from(`${globConf.CLIENT_ID}:${globConf.CLIENT_SECRET}`).toString('base64');
const auth = `Basic ${bup}`;

const requiresLogin = async (req, res, next) => {
  // to be used as middleware
  if (req.session.loggedIn !== true) {
    console.log('NOT logged in!');
    res.redirect(`/?next=${encodeURIComponent(req.originalUrl)}`);
  } else {
    next();
  }
};

app.get('/login', async (req, res) => {
  console.log('Logging in');
  req.session.returnTo = safeReturnPath(req.query.next);
  const params = new URLSearchParams({
    scope: 'openid email profile urn:globus:auth:scope:auth.globus.org:view_identities',
    state: 'garbageString',
    response_type: 'code',
    redirect_uri: globConf.REDIRECT_LINK,
    client_id: globConf.CLIENT_ID,
    client_secret: globConf.CLIENT_SECRET,
  });
  const red = `${globConf.AUTHORIZE_URI}?${params.toString()}`;
  console.log('redirecting to:', red);
  res.redirect(red);
});

app.get('/logout', (req, res) => {
  if (!req.session.loggedIn) {
    res.redirect('/');
    return;
  }
  axios.get(globConf.LOGOUT_URI, {
    params: {
      client_id: globConf.CLIENT_ID,
    },
    headers: {
      Authorization: `Bearer ${req.session.token}`,
    },
  })
    .then((response) => {
      console.log(`logout status: ${response.status} globus logout success.`);
    })
    .catch((error) => {
      console.log('logout failure...', error.message);
    })
    .then(() => {
      req.session.destroy();
      res.redirect('/');
    });
});

app.get('/authcallback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    console.log('AUTH CALLBACK without code:', req.query);
    res.redirect('/?error=login');
    return;
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: globConf.REDIRECT_LINK,
  });
  try {
    const res1 = await axios.post(
      `${globConf.TOKEN_URI}?${params.toString()}`,
      null,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: auth,
        },
      },
    );
    console.log(`statusCode1: ${res1.status}`);

    const res2 = await axios.post(
      'https://auth.globus.org/v2/oauth2/userinfo',
      null,
      {
        headers: {
          Authorization: `Bearer ${res1.data.access_token}`,
        },
      },
    );
    console.log(`statusCode2: ${res2.status}`);
    const u = {
      id: res2.data.sub,
      name: res2.data.name,
      email: res2.data.email,
      username: res2.data.preferred_username,
      affiliation: res2.data.organization,
    };
    // first-time users must exist in ES before the pages below load them
    await usr.addIfNeeded(u);
    req.session.user = u;
    req.session.loggedIn = true;
  } catch (err) {
    console.log('login failed:', err.message);
    res.redirect('/?error=login');
    return;
  }

  const returnTo = req.session.returnTo || '/subscriptions';
  delete req.session.returnTo;
  res.redirect(returnTo);
});

app.get('/subscriptions', requiresLogin, async (req, res) => {
  console.log(`showing all subscriptions to user: ${req.session.user.id}`);
  const [userInfo, alarmTopology, heartbeatTopology, alarmLevels] = await Promise.all([
    usr.loadUser(req.session.user.id),
    alarms.loadAlarmTopology(),
    heartbeats.loadHeartbeatTopology(),
    alarms.loadAlarmLevels(),
  ]);
  if (!userInfo) {
    renderError(res, 500, 'Couldn’t load your subscriptions', 'Please try again in a moment.');
    return;
  }
  const ongoing = await alarms.loadOngoingIssues(userInfo.subscriptions, ONGOING_HOURS);
  const now = Date.now();
  res.render('subscriptions', {
    pageData: {
      userId: req.session.user.id,
      subscriptions: userInfo.subscriptions || [],
      alarms: topologyForPage(alarmTopology),
      heartbeats: topologyForPage(heartbeatTopology),
      levels: alarmLevels,
      ongoing,
      ongoingHours: ONGOING_HOURS,
      pathEvents: PATH_TAG_EVENTS,
      acknowledgements: userInfo.acknowledgements.filter((a) => a.until > now),
    },
  });
});

// the user's subscribed events by default; everything with ?show=all, without
// subscriptions, or when subscribed to every event (a filter would change nothing)
app.get('/viewer', requiresLogin, async (req, res) => {
  const [userInfo, alarmTopology, heartbeatTopology] = await Promise.all([
    usr.loadUser(req.session.user.id),
    alarms.loadAlarmTopology(),
    heartbeats.loadHeartbeatTopology(),
  ]);
  const subscriptions = (userInfo && userInfo.subscriptions) || [];
  const { kql, events } = subscriptionsQuery(subscriptions);
  const keyOf = (o) => JSON.stringify([o.category, o.subcategory, o.event]);
  const subscribed = new Set(subscriptions.map(keyOf));
  const catalog = (alarmTopology || []).concat(heartbeatTopology || []);
  const everything = catalog.length > 0 && catalog.every((c) => subscribed.has(keyOf(c)));
  const filtered = Boolean(kql) && !everything;
  const showAll = req.query.show === 'all' || !filtered;

  let description = `Alarms for the ${events} event${events === 1 ? '' : 's'} you’re subscribed to.`;
  if (!kql) description = 'You haven’t subscribed to any events yet, so this shows all alarms.';
  else if (everything) description = 'You’re subscribed to every event, so this shows all alarms.';
  else if (showAll) description = 'All alarms, across every category.';
  res.render('dashboard', {
    dashboard: kibanaDashboard('Alarms', description, ALARMS_DASHBOARD, showAll ? null : kql),
    scope: filtered ? { showAll } : null,
    noSubscriptions: !kql,
  });
});

app.get('/heartbeats_viewer', requiresLogin, (req, res) => {
  res.render('dashboard', {
    dashboard: kibanaDashboard('Heartbeats', 'Heartbeats received from monitored services.', HEARTBEATS_DASHBOARD),
  });
});

app.get('/docs', (req, res) => {
  res.render('docs', loadDocs());
});

app.get('/profile', requiresLogin, async (req, res) => {
  console.log('profile called!');
  const userInfo = await usr.loadUser(req.session.user.id);
  if (!userInfo) {
    renderError(res, 500, 'Couldn’t load your profile', 'Please try again in a moment.');
    return;
  }
  userInfo.userId = req.session.user.id;
  userInfo.config = config.PREFERENCES;
  res.render('profile', userInfo);
});

app.get('/healthz', (_req, res) => {
  // console.log('Checking health and if some private pod/service needs deletion.');
  try {
    res.status(200).send('OK');
  } catch (err) {
    console.log('not OK.', err);
  }
});

app.get('/', (req, res) => {
  if (req.session.loggedIn === true) {
    res.redirect('/subscriptions');
    return;
  }
  res.render('login', {
    next: safeReturnPath(req.query.next),
    error: req.query.error !== undefined,
  });
});

app.use((req, res) => {
  console.error('Unexisting page requested:', req.path, 'params:', req.params);
  renderError(res, 404, 'Page not found', 'The page you’re looking for doesn’t exist or has moved.');
});

app.listen(80, () => {
  console.log('Listening on port 80.');
});

async function main() {
  try {
    console.log('main.');
  } catch (err) {
    console.error('Error: ', err);
  }
}

main();
