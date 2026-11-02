# Documentation

ATLAS Alarm & Alert Service provides a simple way to store generated alarms, handles user subscriptions and generates alerts.

## Overview

![Alarm generators post alarms to the REST API, which stores them in Elasticsearch. Users subscribe through the web frontend and receive alerts.](../static/images/AlarmAndAlert.png)

### Components

| Component | Technology |
| --- | --- |
| Database | Elasticsearch |
| REST API & web frontend | Node.js, Express, Pug |
| Deployment | Docker, Kubernetes |
| Authentication | Globus (InCommon) |
| Authorization | API key |
| Mail | Mailgun |

## Subscriptions & alerts

On the [Subscriptions](/subscriptions) page, tick the events you want to hear about.
Each subscription can be narrowed down with **tags**: usually network-site names.
The suggestions follow what the event's latest alarms are tagged with: perfSONAR netsites for most network alarms, also networks (ASNs such as `AS513`) for path alarms such as *suspected path element*, and perfSONAR host names only for the few alarms about hosts, such as *unresolvable host*.
Hosts can't be added to the other events: their alarms never carry one, so it would never match. Events that have never raised an alarm suggest sites.
The suggestions are the netsites, hosts and networks seen in perfSONAR traceroutes over the past month, plus the tags the event's alarms carried in the past week. A site or host that is missing has had no measurements for a month, so its perfSONAR toolkit is probably not working properly; the page points this out.
You are alerted only about alarms that carry at least one of your tags; leave the tags empty to receive all of them.

A tag can contain `*`, which stands for any characters: `*MWT2*` matches `MWT2_UC`, `MWT2_IU` and any other tag containing MWT2, and `*-LHCOPNE` every tag ending in -LHCOPNE.
Tags and patterns ignore upper and lower case.

Events whose alarms report a severity also let you pick the **levels** you want; by default you get all of them.

When a site has a known, ongoing problem, **Acknowledge** it in the *Ongoing issues* panel to stop emails about that site for that event.
The mute lasts a week (or 1 or 3 days if you choose), applies only to you, and ends on its own; you can unmute at any time.
For events whose alarms report a severity you can also mute only one level, e.g. *Mute only minor*: alarms of the other levels are still emailed.

Alerts are bundled into a single email, sent every few hours according to the mail interval in your [preferences](/profile).
Turn on vacation mode there to pause them.

## Publishing alarms

A new alarm can be created in three simple steps: register it using the REST API, add the alarm-generating code to your program, and run your program periodically.

### Registering an alarm

Before registering a new kind of alarm, look at the classification tree of the [current alarms](/alarm/categories) and decide whether there already is a category and subcategory where the new alarm would naturally fit.
Then describe it in a small JSON document:

```json
{
  "category": "Analytics",
  "subcategory": "Frontier",
  "event": "Failed queries",
  "description": "Code running every 1h at UC k8s cluster. Checks all servers for: Rejected queries - server is busy and doesn't respond to the query; DB disconnections - the query was processed by the Frontier server but the Oracle DB terminated the connection. The code can be found here: https://github.com/ATLAS-Analytics/AlarmAndAlertService/blob/master/frontier-failed-q.py",
  "template": "Servers with failed queries:\n%{servers}\n. Affected tasks: \n%{tasks}\n\tConsult the following link to get a table with the most relevant taskids https://atlas-kibana.mwt2.org:5601/s/frontier/goto/c72d263c3e2b86f394ab99211c99b613\n"
}
```

Write the `description` in as much detail as possible: it tells people receiving the alarm how it was generated.

The `template` defines the text that appears in the alert email. Keep it brief, but give a reader enough to judge how serious the issue is, whether to forward it, and either act on it or start digging further.
Every `%{variable}` is replaced with the value of *variable* from the alarm’s `source` field.
Only `\n` and `\t` are available for formatting.

Once the document is ready, post it to the [register endpoint](#post-alarm-category).

### Creating alarms

Once the alarm is registered, you can start creating alarms. They are simple JSON documents too:

```json
{
  "category": "network",
  "subcategory": "perfsonar",
  "event": "high packet loss",
  "tags": ["UKI-SOUTHGRID-BRIS-HEP"],
  "body": "ps_1 needs 10000ms",
  "source": {
    "src": "137.222.79.1",
    "avg_value": 1.0,
    "host_src": "dice-io-37-00.acrc.bris.ac.uk",
    "site_src": "UKI-SOUTHGRID-BRIS-HEP"
  }
}
```

In addition to the classification, an alarm contains:

- `tags`: a single keyword or a short array that users can subscribe to. It lets them limit the number of alerts they receive. Tags must not contain spaces.
- `body`: a very brief description of the event.
- `source`: an optional map whose attributes are placed into the alert template.

Send the document to the [create endpoint](#post-alarm).

### Periodic execution

Alarm-generating code is typically run on a schedule, for example as a cron job, so that new conditions are detected and posted as they happen.

### Heartbeats

Heartbeats catch services that silently stop working. Register a heartbeat with an `interval` (seconds) and `min_expected` count, then have your service post heartbeats regularly.
If fewer than `min_expected` heartbeats arrive within the interval, an alarm is raised.

```json
{
  "category": "SLATE",
  "subcategory": "Squid",
  "event": "server down",
  "template": "Squid instance: %{instance}, running at %{site}, failed to send required number of heartbeats.",
  "description": "This alarm gets generated if a squid instance does not send at least 4 heartbeats in last 60 seconds. Heartbeats are sent in 10 second intervals.",
  "interval": 60,
  "min_expected": 4
}
```

## REST API

The API has three parts: alarms, users and heartbeats. All request and response bodies are JSON.

### Alarms

#### GET /alarm/categories — List categories

Returns all currently registered alarm categories.

#### GET /alarm/tags — List tags

The tag suggestions used when subscribing.

```json
{
  "sites": ["CERN-PROD-LHCOPNE", "..."],
  "hosts": ["perfsonar.example.org", "..."],
  "asns": ["AS513", "..."],
  "labels": { "AS513": "CERN, CH" },
  "events": [
    { "category": "", "subcategory": "", "event": "", "kinds": ["site", "asn"], "tags": ["", ""] },
    ...
  ]
}
```

`sites`, `hosts` and `asns` are every `src_netsite` / `dest_netsite`, `src_host` / `dest_host` and network (`asns`, as `AS<number>`) seen in perfSONAR traceroutes (`ps_trace`) over the past month. `labels` gives the network name of each ASN.

`events` lists every event that has alarms: `tags` are the tags its alarms carried in the past week, and `kinds` the lists it suggests, by what its latest alarms are tagged with: `site` if any tag is a netsite, `host` if any is a host name, `asn` if any is an ASN.
An event suggests its own `tags` plus the lists of its `kinds`; events not listed suggest `sites`. Only events whose `kinds` include `host` take host names.

#### GET /alarm/levels — List severity levels

Returns every event whose alarms carry a `level`, with all the levels seen across alarm types: an event that has only raised `major` alarms so far still lists `minor`. Only these events offer a level choice when subscribing.

```json
[
  { "category": "", "subcategory": "", "event": "", "levels": ["", ""] },
  ...
]
```

#### POST /alarm/category — Register an alarm

```json
{
  "category": "",
  "subcategory": "",
  "event": "",
  "description": "",
  "template": ""
}
```

#### PATCH /alarm/category — Edit an alarm

```json
{
  "category": "",
  "subcategory": "",
  "event": "",
  "description": "",
  "template": ""
}
```

#### POST /alarm/ — Create an alarm

```json
{
  "category": "",
  "subcategory": "",
  "event": "",
  "tags": ["", ""],
  "body": "",
  "source": { "xxx": "", "yyy": "", ... }
}
```

#### POST /alarm/fetch — List alarms

`period` is a number of hours.

```json
{
  "category": "",
  "subcategory": "",
  "event": "",
  "period": 6
}
```

#### DELETE /alarm/ — Delete an alarm category

```json
{
  "category": "",
  "subcategory": "",
  "event": ""
}
```

> Unregisters the alarm event. Use with caution!

### Users

#### GET /user/ — List users

Returns information on all users.

#### GET /user/:userId — User information

Returns information on a specific user, including preferences and subscriptions.

#### DELETE /user/:userId — Full unsubscribe

Completely deletes a user from the system.

#### POST /user/preferences/:userId — Update preferences

```json
{
  "vacation": true
}
```

Only preferences supported by the deployed system are allowed.

#### POST /user/subscriptions/:userId — Update subscriptions

```json
[
  {
    "category": "",
    "subcategory": "",
    "event": "",
    "tags": "MWT2 AGLT2",
    "levels": "*"
  },
  ...
]
```

The body is the complete list of the user’s subscriptions; an empty array unsubscribes from everything.
`tags` and `levels` are space-separated strings, or `"*"` for all.
Tags match ignoring case, and a tag containing `*` is a pattern, e.g. `"*MWT2* CERN-PROD-LHCOPNE"`: `*` stands for any characters.
`levels` is optional; when missing, all levels are sent.

#### POST /user/acknowledgements/:userId — Update acknowledged issues

```json
[
  {
    "category": "",
    "subcategory": "",
    "event": "",
    "tag": "MWT2",
    "until": 1762790400000,
    "levels": ["minor"]
  },
  ...
]
```

The body is the complete list of the user’s muted site issues; an empty array unmutes everything.
While muted, alarms of that event carrying that tag are not emailed to the user.
`until` (epoch milliseconds) is optional and defaults to one week after `created_at` (now).
`levels` is optional: when given, only alarms of those severity levels are muted.
Expired entries are dropped. Responds with the stored list.

### Heartbeats

#### GET /heartbeat/ — List heartbeats

Returns all registered heartbeats.

#### POST /heartbeat/register — Register a heartbeat

```json
{
  "category": "",
  "subcategory": "",
  "event": "",
  "description": "",
  "template": "",
  "interval": 60,
  "min_expected": 4
}
```

#### PATCH /heartbeat/ — Edit a heartbeat

```json
{
  "category": "",
  "subcategory": "",
  "event": "",
  "description": "",
  "template": "",
  "interval": 60,
  "min_expected": 4
}
```

#### POST /heartbeat/ — Send a heartbeat

```json
{
  "category": "",
  "subcategory": "",
  "event": "",
  "source": { "site": "MWT2", "instance": "MWT2_Slate_01" }
}
```

#### POST /heartbeat/fetch — List received heartbeats

`period` is a number of hours.

```json
{
  "category": "",
  "subcategory": "",
  "event": "",
  "period": 6
}
```

#### DELETE /heartbeat/ — Delete a heartbeat

```json
{
  "category": "",
  "subcategory": "",
  "event": ""
}
```

> Unregisters the heartbeat. Use with caution!
