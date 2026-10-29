const elasticsearch = require('@elastic/elasticsearch');
const express = require('express');
const bodyParser = require('body-parser');
// const { truncate } = require('lodash');

const esAlarmsIndex = 'aaas_alarms';
const esAlarmTopologyIndex = 'aaas_categories';
let config;
let es;
const categories = [];

// tag suggestions for the subscriptions page: every value of alarm `tags`
// and of `source.*site` / `source.*netsite` fields, refreshed hourly.
const TAGS_TTL = 3600 * 1000;
const SITE_FIELD = /sites?(_(src|dest))?$/i;
let tagsCache = { loadedAt: 0, tags: [] };

const router = express.Router();
const jsonParser = bodyParser.json();

function hasTopology(obj) {
  let found = false;
  categories.forEach((c) => {
    let m = true;
    config.TOPOLOGY_FIELDS.forEach((v) => {
      m = m && c[v] === obj[v];
    });
    found = found || m;
  });
  return found;
}

async function loadAlarmTopology() {
  console.log('loading categories...');
  try {
    const response = await es.search({
      index: esAlarmTopologyIndex,
      size: 1000,
      query: {
        match_all: {}
      },
    }, );
    if (response.hits.total.value === 0) {
      console.log('No categories found.');
      return false;
    }
    const {
      hits
    } = response.hits;
    categories.length = 0;
    hits.forEach((hit) => {
      const s = hit._source;
      // console.log(s);
      categories.push(s);
    });
    // console.debug(categories);
    return categories;
  } catch (err) {
    console.error(err);
    return false;
  }
}

async function loadAlarmTags() {
  if (Date.now() - tagsCache.loadedAt < TAGS_TTL) return tagsCache.tags;
  console.log('loading alarm tags...');
  try {
    // only keyword fields can be aggregated; with dynamic mappings that is the .keyword subfield
    const caps = await es.fieldCaps({ index: esAlarmsIndex, fields: ['tags', 'tags.*', 'source.*'] });
    const fields = Object.entries(caps.fields)
      .filter(([name, types]) => {
        const base = name.replace(/\.keyword$/, '');
        const isTagField = base === 'tags' || (base.startsWith('source.') && SITE_FIELD.test(base));
        return isTagField && types.keyword !== undefined && types.keyword.aggregatable;
      })
      .map(([name]) => name);
    if (fields.length === 0) {
      console.log('No tag fields found.');
      return tagsCache.tags;
    }

    const aggs = {};
    fields.forEach((field, i) => {
      aggs[`f${i}`] = { terms: { field, size: 10000 } };
    });
    const response = await es.search({ index: esAlarmsIndex, size: 0, aggs });

    const tags = new Set();
    Object.values(response.aggregations).forEach((agg) => {
      agg.buckets.forEach((b) => tags.add(String(b.key).trim()));
    });
    // alerts.py splits subscription tags on spaces, so tags containing one can never match
    tagsCache = {
      loadedAt: Date.now(),
      tags: [...tags]
        .filter((t) => t && t !== '*' && !/\s/.test(t))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    };
    console.log(`loaded ${tagsCache.tags.length} tags from fields:`, fields);
  } catch (err) {
    console.error(err);
  }
  return tagsCache.tags;
}

function init(configuration) {
  config = configuration;
  config.REQUIRED_ALARM_FIELDS = config.REQUIRED_ALARM_FIELDS.concat(config.TOPOLOGY_FIELDS);
  config.REQUIRED_ALARM_TOPOLOGY_FIELDS = config.REQUIRED_ALARM_TOPOLOGY_FIELDS.concat(config.TOPOLOGY_FIELDS);
  es = new elasticsearch.Client(config.ES_HOST);
  loadAlarmTopology();
  loadAlarmTags();
}

router.post('/', jsonParser, async (req, res) => {
  const b = req.body;
  // console.debug('body:', b);
  if (b === undefined || b === null || Object.keys(b).length === 0) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }
  config.REQUIRED_ALARM_FIELDS.forEach((v) => {
    if (b[v] === undefined || b[v] === null) {
      res.status(400).send(`${v} is required.\n`);
    }
  });

  console.log('Check that only allowed things are in.');
  Object.entries(b).forEach(([key]) => {
    // console.log(`${key}: ${value}`);
    if (!(config.REQUIRED_ALARM_FIELDS.includes(key) ||
        config.OPTIONAL_ALARM_FIELDS.includes(key))) {
      console.log(`key: >${key}< not allowed.\n`);
      delete b[key];
    }
  });

  // console.log('Check that the category was registered');
  if (hasTopology(b)) {
    // console.debug('category registered');
  } else {
    res.status(400).send('no such category, subcategory or event allowed.');
    return;
  }

  b.created_at = new Date().getTime();

  try {
    const response = await es.index({
      index: esAlarmsIndex,
      body: b
    });
    // console.log('Alarm added.');
    // console.debug(response);
    res.status(200).send('OK');
    return;
  } catch (err) {
    console.error(err);
    res.status(500).send(err.body);
  }
});

router.get('/categories', async (req, res) => {
  await loadAlarmTopology();
  res.json(categories);
});

router.get('/tags', async (req, res) => {
  res.json(await loadAlarmTags());
});

router.post('/fetch', jsonParser, async (req, res) => {
  const b = req.body;
  // console.log('body:', b);
  if (b === undefined || b === null || Object.keys(b).length === 0) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }
  if (b.category === undefined || b.category === null) {
    res.status(400).send('category is required.\n');
    return;
  }
  if (b.subcategory === undefined || b.subcategory === null) {
    res.status(400).send('subcategory is required.\n');
    return;
  }
  if (b.event === undefined || b.event === null) {
    res.status(400).send('event is required.\n');
    return;
  }
  if (b.period === undefined || b.period === null) {
    res.status(400).send('period is required. Just number of hours.\n');
    return;
  }
  const {
    category,
    subcategory,
    event,
    period,
  } = b;

  console.log('Getting alarms in:', category, '/', subcategory, '/', event, '/', period);
  const alarms = [];
  try {
    const response = await es.search({
      index: esAlarmsIndex,
      size: 1000,
      query: {
        bool: {
          must: [{
              term: {
                category
              }
            },
            {
              term: {
                subcategory
              }
            },
            {
              term: {
                event
              }
            },
            {
              range: {
                created_at: {
                  gte: `now-${period}h/h`
                }
              }
            },
          ],
        },
      },
    }, );
    if (response.hits.total.value === 0) {
      console.log('No alarms found.');
    } else {
      const {
        hits
      } = response.hits;
      hits.forEach((hit) => {
        const s = hit._source;
        // console.log(s);
        alarms.push(s);
      });
    }
  } catch (err) {
    console.error(err);
  }
  res.json(alarms);
});

router.post('/category', jsonParser, async (req, res) => {
  const b = req.body;
  console.log('Adding category with body:\n', b);
  if (b === undefined || b === null) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }

  config.REQUIRED_ALARM_TOPOLOGY_FIELDS.forEach((v) => {
    if (b[v] === undefined || b[v] === null) {
      res.status(400).send(`${v} is required.\n`);
    }
  });

  Object.entries(b).forEach(([key]) => {
    // console.log(`${key}: ${value}`);
    if (!(config.REQUIRED_ALARM_TOPOLOGY_FIELDS.includes(key))) {
      console.log(`${key} not allowed.\n`);
      delete b[key];
    }
  });

  try {
    const response = await es.index({
      index: esAlarmTopologyIndex,
      body: b,
      refresh: true,
    });
    console.log(`Category adding result: ${response.result}`);
    if (response.result === 'created') {
      await loadAlarmTopology();
      res.status(200).send('OK');
    } else {
      res.status(500).send(response.result);
    }
    return;
  } catch (err) {
    console.error(err);
    res.status(500).send(err.body);
  }
});

router.patch('/category', jsonParser, async (req, res) => {
  const b = req.body;
  console.log('Patching category with body:\n', b);
  if (b === undefined || b === null) {
    res.status(400).send('nothing PATCHEDed.\n');
    return;
  }
  config.TOPOLOGY_FIELDS.forEach((v) => {
    if (b[v] === undefined || b[v] === null) {
      res.status(400).send(`${v} is required.\n`);
    }
  });

  // add only allowed things to edit source.
  let source = '';
  Object.entries(b).forEach(([key, value]) => {
    // console.log(`${key}: ${value}`);
    if (config.REQUIRED_ALARM_TOPOLOGY_FIELDS.includes(key)) {
      source += `ctx._source["${key}"] = "${value}";`;
    } else {
      console.log(`${key} not allowed.\n`);
    }
  });

  await loadAlarmTopology();

  // console.log('Check that the category was registered');
  if (hasTopology(b)) {
    console.debug('category registered, lets update');
    const updateBody = {
      script: {
        lang: 'painless',
        source,
      },
      query: {
        bool: {
          must: [{
              term: {
                category: b.category
              }
            },
            {
              term: {
                subcategory: b.subcategory
              }
            },
            {
              term: {
                event: b.event
              }
            },
          ],
        },
      },
    };

    try {
      const response = await es.updateByQuery({
        index: esAlarmTopologyIndex,
        body: updateBody,
        refresh: true,
      });
      console.log('Category patched.');
      console.debug(response.body);
      await loadAlarmTopology();
      res.status(200).send('OK');
      return;
    } catch (err) {
      console.error(err);
      res.status(500).send(err.body);
    }
  } else {
    res.status(400).send('no such category, subcategory or event allowed.');
  }
});

router.delete('/', async (req, res) => {
  const b = req.body;
  // console.debug('body:', b);
  if (b === undefined || b === null || Object.keys(b).length === 0) {
    res.status(400).send('nothing POSTed.\n');
    return;
  }
  const selector = [];
  config.TOPOLOGY_FIELDS.forEach((v) => {
    if (b[v] === undefined || b[v] === null) {
      res.status(400).send(`${v} is required.\n`);
    } else {
      const obj = {
        match: {}
      };
      obj.match[v] = b[v];
      selector.push(obj);
    }
  });
  console.log('Deleting alarm category:', selector);
  try {
    const response = await es.deleteByQuery({
      index: esAlarmTopologyIndex,
      body: {
        query: {
          bool: {
            must: selector,
          },
        },
      },
      refresh: true,
    });
    console.log('deleted docs', response.deleted);
    if (response.deleted > 0) {
      await loadAlarmTopology();
      res.status(200).send('OK');
    } else {
      res.status(500).send('No alarms in that category.');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Error in deleting alarm category.');
  }
});

exports.router = router;
exports.init = init;
exports.loadAlarmTopology = loadAlarmTopology;