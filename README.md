# Alarm and Alert Service Frontend

[![Build ATLAS Alarm and Alert Frontend image](https://github.com/ATLAS-Analytics/AlarmAlertServiceFrontend/actions/workflows/main.yaml/badge.svg)](https://github.com/ATLAS-Analytics/AlarmAlertServiceFrontend/actions/workflows/main.yaml)

REST interface and frontend. Next.js (App Router) + TypeScript.

## Development

```sh
npm install
# config.json and globus-config.json are read from /etc/aaasf by default
AAASF_CONFIG_DIR=./kube/secrets npm run dev
npm run lint && npm run typecheck && npm run build
```

* `app/` - pages, and REST endpoints as route handlers (`route.ts`)
* `lib/` - Elasticsearch access, config, session, heartbeat monitor
* `instrumentation.ts` - starts heartbeat monitoring when the server starts

Login sessions are kept in an encrypted cookie. Its key comes from `SESSION_SECRET` (env or config.json),
falling back to a value derived from the Globus client secret.

## Elasticsearch

Documents are stored in following indices:

| type | index |
|---|---|
| alarm type | *aaas_topology* |
| alarms | *aaas_alarms*|
| heartbeats type | *aaas_heartbeats_topology* |
| heartbeats | *aaas_heartbeats* |

Content:

### *aaas_users*

* affiliation
* created_at
* email
* user
* username
* subscriptions - nested?
    .category
    .subcategory
    .event
    .tags
* preferences - flattened
    .vacation ....

### *aaas_alerts*

* created_at
* sent_to
* reason

## REST API

### alarm

* POST **alarm/** - it enforce category and subcategory, make sure there are event, source and body

    ```json
    {}
    ```

* POST **fetch/**
* GET **alarm/categories** - returns dictionary tree of category, subcategory, event
* POST **alarm/:category**

    ```json
    {}
    ```

* PATCH **alarm/:category**

    ```json
    {}
    ```

* DEL **alarm/** - deletes a category of alarm

    ```json
    {
        "category":"SLATE", 
        "subcategory": "Squid", 
        "event": "server down"
    }
    ```

### user

* GET **user/** - returns json document with info on all users
* GET **user/:userId** - returns json document with info on a specific user
* DEL **user/:userId** - deletes specific user profile
* POST **user/preferences/:userId** - sets user's preferences

    ```json
    {
        "vaccation": "True",
        ...
    }```

* POST **user/subscriptions/:userId** - adds a subscription

    ```json
    {
        [
            {
                category, subcategory, event, tags
            },
        ]
    }

### heartbeats

* POST **heartbeat/register/** - used to register a new heartbeat:

    ```json
    {
        "category":"SLATE", 
        "subcategory": "Squid", 
        "event": "server down", 
        "tags":["site", "instance"], 
        "template":"Squid instance: %{instance}, running at %{site}, failed to send required number of heartbeats.",
        "description": "This alarm gets generated if a squid instance does not send at least 4 heartbeats in last 60 seconds. Heartbeats are sent in 10 second intervals.",
        "interval": 60, 
        "min_expected":4
    }
    ```

* PATCH **heartbeat/** - used to edit an existing heartbeat:

    ```json
    {
        "category":"SLATE", 
        "subcategory": "Squid", 
        "event": "server down", 
        "tags":["site", "instance"], 
        "template":"Squid instance: %instance, running at %site, failed to send required number of heartbeats.",
        "description": "This alarm gets generated if a squid instance does not send at least 4 heartbeats in last 60 seconds. Heartbeats are sent in 10 second intervals.",
        "interval": 60, 
        "min_expected":4
    }
    ```

* GET **heartbeat/** - used to get list of registered heartbeats

* DELETE **heartbeat/** - used to unregister a heartbeat:

    ```json
    {
        "category":"SLATE", 
        "subcategory": "Squid", 
        "event": "server down"
    }
    ```

* POST **heartbeat/** - used to accept a heartbeat:

    ```json
    {
        "category":"SLATE", 
        "subcategory": "Squid", 
        "event": "server down", 
        "source": {
            "site": "MWT2",
            "instance" : "MWT2_Slate_01"
        }
    }
    ```
