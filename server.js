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

usr.init(config);
alarms.init(config);
heartbeats.init(config);

app.use('/user', usr.router);
app.use('/alarm', alarms.router);
app.use('/heartbeat', heartbeats.router);

// Kibana dashboards embedded on the Alarms and Heartbeats pages
const KIBANA_DASHBOARDS = 'https://atlas-kibana.mwt2.org:5601/s/aaas/app/dashboards?auth_provider_hint=anonymous1#/view/';
const KIBANA_TIME = '_g=(filters%3A!()%2CrefreshInterval%3A(pause%3A!t%2Cvalue%3A0)%2Ctime%3A(from%3Anow-7d%2Cto%3Anow))';

function kibanaDashboard(title, description, id) {
  return {
    title,
    description,
    embedUrl: `${KIBANA_DASHBOARDS}${id}?embed=true&${KIBANA_TIME}&show-time-filter=true&hide-filter-bar=true`,
    kibanaUrl: `${KIBANA_DASHBOARDS}${id}?${KIBANA_TIME}`,
  };
}

const dashboards = {
  alarms: kibanaDashboard('Alarms', 'Alarms raised across all categories.', 'f3055010-2af1-11ed-afcf-d91dad577662'),
  heartbeats: kibanaDashboard('Heartbeats', 'Heartbeats received from monitored services.', 'cf438520-2afb-11ed-afcf-d91dad577662'),
};

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
  const [userInfo, alarmTopology, heartbeatTopology] = await Promise.all([
    usr.loadUser(req.session.user.id),
    alarms.loadAlarmTopology(),
    heartbeats.loadHeartbeatTopology(),
  ]);
  if (!userInfo) {
    renderError(res, 500, 'Couldn’t load your subscriptions', 'Please try again in a moment.');
    return;
  }
  res.render('subscriptions', {
    pageData: {
      userId: req.session.user.id,
      subscriptions: userInfo.subscriptions || [],
      alarms: topologyForPage(alarmTopology),
      heartbeats: topologyForPage(heartbeatTopology),
    },
  });
});

app.get('/viewer', requiresLogin, (req, res) => {
  res.render('dashboard', { dashboard: dashboards.alarms });
});

app.get('/heartbeats_viewer', requiresLogin, (req, res) => {
  res.render('dashboard', { dashboard: dashboards.heartbeats });
});

app.get('/docs', (req, res) => {
  res.render('docs');
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
