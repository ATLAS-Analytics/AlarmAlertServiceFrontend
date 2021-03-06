/* eslint-disable no-multi-assign */
const express = require('express');
const session = require('express-session');
const mrequest = require('request');

console.log('Alarm & Alert Service server starting ... ');

const TEST = false;

let config;
let globConf;

if (!TEST) {
  config = require('/etc/aaasf/config.json');
  globConf = require('/etc/aaasf/globus-config.json');
} else {
  config = require('./kube/secrets/config.json');
  globConf = require('./kube/secrets/globus-config.json');
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

const usr = require('./routes/user');
const alarms = require('./routes/alarms');

usr.init(config);
alarms.init(config);

app.use('/user', usr.router);
app.use('/alarm', alarms.router);

// GLOBUS STUFF
const bup = Buffer.from(`${globConf.CLIENT_ID}:${globConf.CLIENT_SECRET}`).toString('base64');
const auth = `Basic ${bup}`;

// const jupyterCreator = async (req, res, next) => {
//   if (
//     typeof req.body.name !== undefined && req.body.name
//     && typeof req.body.password !== undefined && req.body.password
//     && typeof req.body.gpus !== undefined && req.body.gpus
//     && typeof req.body.time !== undefined && req.body.time
//   ) {
//     console.log('Creating a private JupyterLab.');
//     try {
//       req.body.time = parseInt(req.body.time, 10);
//       req.body.gpus = parseInt(req.body.gpus, 10);
//     } catch (error) {
//       res.sendStatus(400).send('unparseable parameters.');
//       return;
//     }
//     next();
// };

const requiresLogin = async (req, _res, next) => {
  // to be used as middleware

  if (req.session.loggedIn !== true) {
    console.log('NOT logged in!');
    const error = new Error('You must be logged in to view this page.');
    error.status = 403;
    return next(error);
  }

  return next();
};

// =============   routes ========================== //

// app.get('/delete/:jservice', requiresLogin, (request, response) => {
//   const { jservice } = request.params;
//   response.redirect('/');
// });

app.get('/login', async (req, res) => {
  console.log('Logging in');
  const red = `${globConf.AUTHORIZE_URI}?scope=urn%3Aglobus%3Aauth%3Ascope%3Aauth.globus.org%3Aview_identities+openid+email+profile&state=garbageString&redirect_uri=${globConf.redirect_link}&response_type=code&client_id=${globConf.CLIENT_ID}`;
  // console.log('redirecting to:', red);
  res.redirect(red);
});

app.get('/logout', (req, res) => { // , next
  if (req.session.loggedIn) {
    // logout from Globus
    const requestOptions = {
      uri: `https://auth.globus.org/v2/web/logout?client_id=${globConf.CLIENT_ID}`,
      headers: {
        Authorization: `Bearer ${req.session.token}`,
      },
      json: true,
    };

    mrequest.get(requestOptions, (error) => { // , response, body
      if (error) {
        console.log('logout failure...', error);
      }
      console.log('globus logout success.\n');
    });
  }
  req.session.destroy();

  res.redirect('/');
});

app.get('/authcallback', (req, res) => {
  console.log('AUTH CALLBACK query:', req.query);
  let { code } = req.query;
  if (code) {
    console.log('there is a code. first time around.');
    code = req.query.code;
    const { state } = req.query;
    console.log('AUTH CALLBACK code:', code, '\tstate:', state);
  } else {
    console.log('NO CODE call...');
  }

  const red = `${globConf.TOKEN_URI}?grant_type=authorization_code&redirect_uri=${globConf.redirect_link}&code=${code}`;

  const requestOptions = {
    uri: red, method: 'POST', headers: { Authorization: auth }, json: true,
  };

  // console.log(requestOptions);

  mrequest.post(requestOptions, (error, _response, body) => {
    if (error) {
      console.log('failure...', error);
      res.redirect('/');
    }
    console.log('success');// , body);

    req.session.loggedIn = true;

    console.log('==========================\n getting name.');
    const idRed = 'https://auth.globus.org/v2/oauth2/userinfo';
    const idrequestOptions = {
      uri: idRed,
      method: 'POST',
      json: true,
      headers: { Authorization: `Bearer ${body.access_token}` },
    };

    mrequest.post(idrequestOptions, async (error1, response1, body1) => {
      if (error1) {
        console.log('error on geting username:\t', error1);
      } else {
        console.log('body:\t', body1);
        const u = {
          id: body1.sub,
          name: body1.name,
          email: body1.email,
          username: body1.preferred_username,
          affiliation: body1.organization,
        };
        usr.addIfNeeded(u);
        req.session.user = u;
      }
      res.render('index', req.session);
    });
  });
});

app.get('/all_alarms', async (req, res) => {
  console.log(`showing all alarms to user: ${req.session.user_id}`);
  const userInfo = await usr.loadUser(req.session.user.id);
  const categories = await alarms.loadCategories();
  // console.log('userINFO', userInfo);
  // TODO logic if returned info is false
  userInfo.loggedIn = true;
  userInfo.userId = req.session.user.id;
  userInfo.categories = categories;
  res.render('all_alarms', userInfo);
});

app.get('/my_subscriptions', async (req, res) => {
  console.log(`showing subscriptions of user: ${req.session.user_id}`);
  const userInfo = await usr.loadUser(req.session.user.id);
  // console.log('userINFO', userInfo);
  // TODO logic if returned info is false
  userInfo.loggedIn = true;
  userInfo.userId = req.session.user.id;
  res.render('my_subs', userInfo);
});

app.get('/profile', async (req, res) => {
  console.log('profile called!');
  const userInfo = await usr.loadUser(req.session.user.id);
  // console.log('userINFO', userInfo);
  // TODO logic if returned info is false
  userInfo.loggedIn = true;
  userInfo.userId = req.session.user.id;
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

app.get('/', async (req, res) => {
  console.log('===========> / CALL');
  if (req.session.loggedIn === undefined) {
    console.log('Defining...');
    req.session.loggedIn = false;
    req.session.Title = config.TITLE;
  }
  console.log(req.session);
  res.render('index', req.session);
});

app.use((req, res) => {
  console.error('Unexisting page requested:', req.path);
  console.error('Parameters:', req.params);
  res.status(404);
  res.render('error', { error: 'Not Found' });
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
