const elasticsearch = require('@elastic/elasticsearch');
const express = require('express');
const bodyParser = require('body-parser');

const esUsersIndex = 'aaas_users';
let config;
let es;

const router = express.Router();
const jsonParser = bodyParser.json();

function init(configuration) {
  config = configuration;
  es = new elasticsearch.Client(config.ES_HOST);
}

async function loadUser(userId) {
  console.log("loading user's info...", userId);
  try {
    const response = await es.search(
      { index: esUsersIndex, body: { query: { match: { _id: userId } } } },
    );
    if (response.body.hits.total.value === 0) {
      console.log('User not found.');
      return false;
    }
    console.log('User found.');
    const obj = response.body.hits.hits[0]._source;
    console.log(obj);
    return obj;
  } catch (err) {
    console.error(err);
    return false;
  }
}

async function writeUser(u) {
  console.log('writing new user');
  const defPref = {};
  Object.entries(config.PREFERENCES).forEach(([key, value]) => {
    // console.log(`${key}: ${value}`);
    defPref[key] = value[1];
  });

  try {
    const response = await es.index({
      index: esUsersIndex,
      id: u.id,
      refresh: true,
      body: {
        username: u.username,
        affiliation: u.affiliation,
        user: u.name,
        email: u.email,
        preferences: defPref,
        subscriptions: [],
        created_at: new Date().getTime(),
      },
    });
    console.log('response', response.body);
    if (response.body.result === 'created') {
      console.log('New user indexed.');
      return true;
    }
    console.log('New user NOT indexed.');
    return false;
  } catch (err) {
    console.error(err);
    return false;
  }
}

async function addIfNeeded(u) {
  console.log('adding if needed:', u);
  const res1 = await loadUser(u.id);
  // console.log('res1', res1);
  if (res1 === false) {
    const res2 = await writeUser(u);
    // console.log('res2', res2);
  }
}

router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  res.json(await loadUser(userId));
});

router.delete('/:userId', (req, res) => {
  const { userId } = req.params;
  console.log('Deleting user with id:', userId);
  es.deleteByQuery({
    index: esUsersIndex,
    refresh: true,
    body: { query: { match: { _id: userId } } },
  },
  (err, response) => {
    if (err) {
      console.error(err);
      res.status(500).send('Error in deleting user.');
      return;
    }
    if (response.body.deleted === 1) {
      res.status(200).send('OK');
      return;
    }
    console.log(response.body);
    res.status(500).send('No user with that ID.');
  });
});

router.post('/preferences/:userId', jsonParser, async (req, res) => {
  const { userId } = req.params;
  const b = req.body;
  console.log(`Updating preferences for user ${userId} with body:\n`, b);
  if (b === undefined || b === null || Object.keys(b).length === 0) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }
  // console.log('Check that only allowed things are in.');
  let disallowed = '';
  Object.entries(b).forEach(([key, value]) => {
    // console.log(`${key}: ${value}`);
    if (config.PREFERENCES[key] === undefined || config.PREFERENCES[key] === null) {
      console.log(`${key} not allowed.\n`);
      disallowed += `${key} not allowed.\n`;
    }
    if (typeof value !== config.PREFERENCES[key]) {
      console.log(`Warning! ${key} has wrong type. It should be ${config.PREFERENCES[key]}\n`);
    }
  });
  if (disallowed.length > 0) {
    res.status(400).send(disallowed);
    return;
  }
  es.update({
    index: esUsersIndex,
    id: userId,
    refresh: true,
    body: {
      doc: {
        preferences: b,
      },
    },
  }, (err, response) => {
    if (err) {
      console.error('cant update user preferences:\n', err);
      res.status(500).send(`something went wrong:\n${err}`);
      return;
    }
    console.log('User preferences updated.');
    console.debug(response.body);
    res.status(200).send('OK');
  });
});

router.post('/subscriptions/:userId', jsonParser, async (req, res) => {
  const { userId } = req.params;
  const b = req.body;
  console.log(`Updating subscriptions for user ${userId} with body:\n`, b);
  if (b === undefined || b === null || Object.keys(b).length === 0) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }
  // TODO console.log('Check that only allowed things are in.');
  // TODO check subscription not already there.
  es.update({
    index: esUsersIndex,
    id: userId,
    refresh: true,
    body: {
      doc: {
        subscriptions: b,
      },
    },
  }, (err, response) => {
    if (err) {
      console.error('cant update user subscriptions:\n', err);
      res.status(500).send(`something went wrong:\n${err}`);
      return;
    }
    console.log('User subscriptions updated.');
    console.debug(response.body);
    res.status(200).send('OK');
  });
});

exports.router = router;
exports.addIfNeeded = addIfNeeded;
exports.loadUser = loadUser;
exports.init = init;
