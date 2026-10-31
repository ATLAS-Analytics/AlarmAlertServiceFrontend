const elasticsearch = require('@elastic/elasticsearch');
const express = require('express');
const bodyParser = require('body-parser');
// const { truncate } = require('lodash');

const esAlarmsIndex = 'aaas_alarms';
const esAlarmTopologyIndex = 'aaas_categories';
let config;
let es;
const categories = [];

// tag suggestions for the subscriptions page: every value of alarm `tags` and of the
// site / netsite fields in alarms' `source` and in recent perfSONAR traces, refreshed hourly.
const TAGS_TTL = 3600 * 1000;
const SITE_FIELD = /(^|[._])(net)?sites?(_(src|dest))?$/i;
const TRACE_INDEX = 'ps_trace';
const TAG_SOURCES = [
  { index: 'aaas_alarms', fields: ['tags', 'tags.*', 'source.*'], isTagField: (f) => f === 'tags' || (f.startsWith('source.') && SITE_FIELD.test(f)) },
  { index: TRACE_INDEX, fields: ['*site*', 'timestamp', '@timestamp'], isTagField: (f) => SITE_FIELD.test(f), recent: '30d' },
];
// "path" events (e.g. suspected path element) are tagged with elements of perfSONAR paths
// instead: every src/dest netsite and every network (ASN) ever seen in ps_trace. That
// aggregation runs over all of ps_trace (~20 s), so it is refreshed daily.
const PATH_TAGS_TTL = 24 * 3600 * 1000;
// network alarms tag ASNs as 'AS<number>'; ps_asns_1 holds each ASN's owner, keyed by the number
const ASN_TAG = /^AS(\d+)$/;
const ASN_OWNERS_INDEX = 'ps_asns_1';
const byTagName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

// severity levels for the subscriptions page: which events' alarms carry a
// `level`, and the values seen, refreshed hourly.
const AGGREGATABLE_TYPES = ['keyword', 'long', 'integer', 'short', 'byte', 'double', 'float'];
let levelsCache = { loadedAt: 0, levels: [] };

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

// distinct values of every aggregatable field in `index` that `isTagField` accepts
async function collectTerms({
  index, fields, isTagField, recent,
}) {
  // only keyword fields can be aggregated; with dynamic mappings that is the .keyword subfield
  const caps = await es.fieldCaps({ index, fields, ignore_unavailable: true });
  const tagFields = [];
  let dateField;
  Object.entries(caps.fields).forEach(([name, types]) => {
    if (types.date !== undefined) dateField = dateField || name;
    const base = name.replace(/\.keyword$/, '');
    if (isTagField(base) && types.keyword !== undefined && types.keyword.aggregatable) tagFields.push(name);
  });
  if (tagFields.length === 0) {
    console.log(`No tag fields found in ${index}.`);
    return [];
  }

  const aggs = {};
  tagFields.forEach((field, i) => {
    aggs[`f${i}`] = { terms: { field, size: 10000 } };
  });
  const query = recent && dateField ? { range: { [dateField]: { gte: `now-${recent}` } } } : undefined;
  const response = await es.search({
    index, size: 0, query, aggs, ignore_unavailable: true,
  });

  const values = [];
  Object.values(response.aggregations || {}).forEach((agg) => {
    agg.buckets.forEach((b) => values.push(String(b.key).trim()));
  });
  console.log(`loaded ${values.length} tag values from ${index} fields:`, tagFields);
  return values;
}

// { 'AS513': 'CERN, CH', ... } for the given ASN tags
async function asnOwners(asnTags) {
  if (asnTags.length === 0) return {};
  const ids = asnTags.map((t) => t.match(ASN_TAG)[1]);
  const response = await es.mget({ index: ASN_OWNERS_INDEX, ids, _source: ['owner'] });
  const labels = {};
  response.docs.forEach((d) => {
    if (d.found && d._source.owner) labels[`AS${d._id}`] = String(d._source.owner).trim();
  });
  return labels;
}

async function namedAsns(tags) {
  try {
    return await asnOwners(tags.filter((t) => ASN_TAG.test(t)));
  } catch (err) {
    console.error(`loading ASN owners from ${ASN_OWNERS_INDEX} failed:`, err.message);
    return {};
  }
}

// Keeps the last result of `load`. Once older than `ttl` it is refreshed in the background
// while the previous result is still served, so a slow aggregation never holds up a page;
// only the very first call waits. `load` returns null when it found nothing.
function cached(ttl, load, empty) {
  let value = null;
  let loadedAt = 0;
  let pending = null;
  const refresh = () => {
    if (!pending) {
      pending = load()
        .then((v) => {
          if (v) {
            value = v;
            loadedAt = Date.now();
          }
        })
        .catch((err) => console.error(err))
        .then(() => {
          pending = null;
        });
    }
    return pending;
  };
  return async () => {
    if (value === null) await refresh();
    else if (Date.now() - loadedAt > ttl) refresh();
    return value || empty;
  };
}

// { tags, labels } for every event but the path events
const loadAlarmTags = cached(TAGS_TTL, async () => {
  console.log('loading alarm tags...');
  const tags = new Set();
  // sources are independent: one failing (missing index, no permission) must not lose the others
  const results = await Promise.allSettled(TAG_SOURCES.map(collectTerms));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') r.value.forEach((v) => tags.add(v));
    else console.error(`loading tags from ${TAG_SOURCES[i].index} failed:`, r.reason.message || r.reason);
  });
  if (tags.size === 0) return null;
  // alerts.py splits subscription tags on spaces, so tags containing one can never match
  const list = [...tags].filter((t) => t && t !== '*' && !/\s/.test(t)).sort(byTagName);
  const labels = await namedAsns(list);
  console.log(`${list.length} tags available for suggestions.`);
  return { tags: list, labels };
}, { tags: [], labels: {} });

// { tags, labels } for the path events: all netsites and ASNs of ps_trace
const loadPathTags = cached(PATH_TAGS_TTL, async () => {
  console.log('loading path tags (all of ps_trace)...');
  const response = await es.search({
    index: TRACE_INDEX,
    size: 0,
    aggs: {
      src: { terms: { field: 'src_netsite', size: 20000 } },
      dest: { terms: { field: 'dest_netsite', size: 20000 } },
      asns: { terms: { field: 'asns', size: 20000 } },
    },
  }, { requestTimeout: 300000 });
  const netsites = new Set([...response.aggregations.src.buckets, ...response.aggregations.dest.buckets]
    .map((b) => String(b.key).trim())
    .filter((t) => t && !/\s/.test(t)));
  const asns = response.aggregations.asns.buckets
    .map((b) => Number(b.key))
    .filter((n) => Number.isInteger(n) && n > 0) // 0 marks an unknown hop
    .map((n) => `AS${n}`);
  if (netsites.size + asns.length === 0) return null;
  const labels = await namedAsns(asns);
  console.log(`path tags: ${netsites.size} netsites, ${asns.length} ASNs (${Object.keys(labels).length} named).`);
  return { tags: [...netsites, ...asns].sort(byTagName), labels };
}, { tags: [], labels: {} });

// `name` itself if it can be aggregated, else its .keyword subfield (dynamic mappings)
function aggregatableField(caps, name) {
  return [name, `${name}.keyword`].find((f) => {
    const types = caps.fields[f] || {};
    return AGGREGATABLE_TYPES.some((t) => types[t] !== undefined && types[t].aggregatable);
  });
}

function sortLevels(values) {
  if (values.every((v) => v !== '' && !Number.isNaN(Number(v)))) return values.sort((a, b) => Number(a) - Number(b));
  return values.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

// [{ category, subcategory, event, levels }] for every event whose alarms have a `level`
async function loadAlarmLevels() {
  if (Date.now() - levelsCache.loadedAt < TAGS_TTL) return levelsCache.levels;
  console.log('loading alarm levels...');
  try {
    const caps = await es.fieldCaps({
      index: esAlarmsIndex, fields: ['level', 'level.*', 'category', 'category.*', 'subcategory', 'subcategory.*', 'event', 'event.*'],
    });
    const [level, category, subcategory, event] = ['level', 'category', 'subcategory', 'event'].map((f) => aggregatableField(caps, f));
    if (!level || !category || !subcategory || !event) {
      console.log('No level field found in alarms.');
      levelsCache = { loadedAt: Date.now(), levels: [] };
      return levelsCache.levels;
    }

    const terms = (field, aggs) => ({ terms: { field, size: 1000 }, aggs });
    const response = await es.search({
      index: esAlarmsIndex,
      size: 0,
      query: { exists: { field: level } },
      aggs: {
        category: terms(category, { subcategory: terms(subcategory, { event: terms(event, { level: terms(level) }) }) }),
      },
    });

    const levels = [];
    response.aggregations.category.buckets.forEach((c) => {
      c.subcategory.buckets.forEach((s) => {
        s.event.buckets.forEach((e) => {
          // alerts.py splits subscription levels on spaces, like tags
          const values = e.level.buckets.map((b) => String(b.key).trim()).filter((v) => v && v !== '*' && !/\s/.test(v));
          if (values.length) {
            levels.push({
              category: String(c.key), subcategory: String(s.key), event: String(e.key), levels: sortLevels(values),
            });
          }
        });
      });
    });
    levelsCache = { loadedAt: Date.now(), levels };
    console.log(`loaded levels for ${levels.length} events from field ${level}.`);
  } catch (err) {
    console.error(err);
  }
  return levelsCache.levels;
}

// same rules as level_ok() in alerts.py
function levelMatches(sub, alarm) {
  const levels = sub.levels === undefined ? '*' : sub.levels;
  if (levels === '*' || alarm.level === undefined) return true;
  return String(levels).split(' ').includes(String(alarm.level));
}

// Alarms of the last `hours` that the user's email would contain, one entry per
// (event, site tag): [{ category, subcategory, event, tag, count, last, levels }], newest first;
// `levels` counts the alarms per severity level, e.g. { minor: 4, major: 1 }.
// Tag and level matching mirror alerts.py; alarms without tags (e.g. heartbeats) can't
// be muted per site and are left out. Returns null if the alarms can't be read.
async function loadOngoingIssues(subscriptions, hours) {
  const subs = (subscriptions || []).filter((s) => s && s.category && s.subcategory && s.event);
  if (subs.length === 0) return [];
  const keyOf = (o) => JSON.stringify([o.category, o.subcategory, o.event]);
  const subByKey = new Map(subs.map((s) => [keyOf(s), s]));
  try {
    const response = await es.search({
      index: esAlarmsIndex,
      size: 10000,
      _source: ['category', 'subcategory', 'event', 'tags', 'level', 'created_at'],
      sort: [{ created_at: 'desc' }],
      query: {
        bool: {
          filter: [{ range: { created_at: { gte: `now-${hours}h` } } }],
          should: subs.map((s) => ({
            bool: { must: [{ term: { category: s.category } }, { term: { subcategory: s.subcategory } }, { term: { event: s.event } }] },
          })),
          minimum_should_match: 1,
        },
      },
    });

    const issues = new Map();
    response.hits.hits.forEach(({ _source: al }) => {
      const sub = subByKey.get(keyOf(al));
      if (!sub || al.tags === undefined || al.tags === null || !levelMatches(sub, al)) return;
      const wanted = sub.tags === undefined || sub.tags === '*' ? null : String(sub.tags).split(' ');
      (Array.isArray(al.tags) ? al.tags : [al.tags]).forEach((tag) => {
        if (!tag || (wanted && !wanted.includes(tag))) return;
        const key = JSON.stringify([al.category, al.subcategory, al.event, tag]);
        const issue = issues.get(key) || {
          category: al.category, subcategory: al.subcategory, event: al.event, tag, count: 0, last: 0, levels: {},
        };
        issue.count += 1;
        issue.last = Math.max(issue.last, al.created_at);
        if (al.level !== undefined && al.level !== null) issue.levels[al.level] = (issue.levels[al.level] || 0) + 1;
        issues.set(key, issue);
      });
    });
    return [...issues.values()].sort((a, b) => b.last - a.last);
  } catch (err) {
    console.error('loading ongoing issues failed:', err);
    return null;
  }
}

function init(configuration) {
  config = configuration;
  config.REQUIRED_ALARM_FIELDS = config.REQUIRED_ALARM_FIELDS.concat(config.TOPOLOGY_FIELDS);
  config.REQUIRED_ALARM_TOPOLOGY_FIELDS = config.REQUIRED_ALARM_TOPOLOGY_FIELDS.concat(config.TOPOLOGY_FIELDS);
  es = new elasticsearch.Client(config.ES_HOST);
  loadAlarmTopology();
  loadAlarmTags();
  loadPathTags();
  loadAlarmLevels();
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

// a plain array of tags; with ?labels=1 { tags, pathTags, labels }: also the tags of the
// path events and the network names of ASN tags
router.get('/tags', async (req, res) => {
  const general = await loadAlarmTags();
  if (!req.query.labels) {
    res.json(general.tags);
    return;
  }
  const paths = await loadPathTags();
  res.json({ tags: general.tags, pathTags: paths.tags, labels: { ...general.labels, ...paths.labels } });
});

router.get('/levels', async (req, res) => {
  res.json(await loadAlarmLevels());
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
exports.loadAlarmLevels = loadAlarmLevels;
exports.loadOngoingIssues = loadOngoingIssues;