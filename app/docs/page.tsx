export const metadata = { title: 'Documentation | Alarm And Alert Service' };

const SERVICE = 'https://aaas.atlas-ml.org';

const TOC: [string, string, [string, string][]][] = [
  ['#api_alarm', 'Alarm', [
    ['#api_alarm_categories', 'Categories'],
    ['#api_alarm_register', 'Register'],
    ['#api_alarm_edit', 'Edit'],
    ['#api_alarm_create', 'Create'],
    ['#api_alarm_list', 'List'],
    ['#api_alarm_del_event', 'Delete Alarm Category'],
  ]],
  ['#api_user', 'User', [
    ['#api_user_view_all', 'List Users'],
    ['#api_user_view', 'Info'],
    ['#api_user_delete', 'Full unsubscribe'],
    ['#api_user_update_preferences', 'Update preferences'],
    ['#api_user_update_subscriptions', 'Update subscriptions'],
  ]],
  ['#api_heartbeat', 'Heartbeats', [
    ['#api_heartbeat_categories', 'Categories'],
    ['#api_heartbeat_register', 'Register'],
    ['#api_heartbeat_edit', 'Edit'],
    ['#api_heartbeat_create', 'Create'],
    ['#api_heartbeat_list', 'List'],
    ['#api_heartbeat_del_event', 'Delete Heartbeat Category'],
  ]],
];

function Endpoint({ id, title, method, path, body, children }: {
  id: string;
  title: string;
  method: string;
  path: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="endpoint">
      <h4 id={id}>{title}</h4>
      <p><span className="method">{method}</span><code>{path}</code></p>
      {body && <pre><code>{body}</code></pre>}
      {children && <p>{children}</p>}
    </section>
  );
}

const TOPOLOGY = `{
    "category": "",
    "subcategory": "",
    "event": ""
}`;

const FETCH = `{
    "category": "",
    "subcategory": "",
    "event": "",
    "period": 6
}`;

const ALARM_CATEGORY = `{
    "category": "",
    "subcategory": "",
    "event": "",
    "description": "",
    "template": ""
}`;

const HEARTBEAT_CATEGORY = `{
    "category": "",
    "subcategory": "",
    "event": "",
    "description": "",
    "template": "",
    "interval": 60,
    "min_expected": 4
}`;

function Contents() {
  return (
    <ul>
      <li>
        <a href="#user">User Documentation</a>
        <ul>
          <li><a href="#registering">Registering Alarm</a></li>
          <li><a href="#creation">Creating Alarm</a></li>
          <li><a href="#examples">Examples</a></li>
        </ul>
      </li>
      <li>
        <a href="#rest">REST API</a>
        <ul>
          {TOC.map(([href, label, items]) => (
            <li key={href}>
              <a href={href}>{label}</a>
              <ul>
                {items.map(([h, l]) => <li key={h}><a href={h}>{l}</a></li>)}
              </ul>
            </li>
          ))}
        </ul>
      </li>
    </ul>
  );
}

export default function Docs() {
  return (
    <div className="page wide docs">
      <aside className="docs-toc">
        <details className="mobile-only">
          <summary>Contents</summary>
          <Contents />
        </details>
        <nav className="desktop-only" aria-label="Contents"><Contents /></nav>
      </aside>

      <article>
        <h1>Documentation</h1>

        <h2 id="user">User Documentation</h2>
        <p>
          New alarm can be created in three simple steps. First register it using REST API,
          add the alarm generating code to your program, create a cron that executes your program periodically.
        </p>

        <h3 id="registering">Registering Alarm</h3>
        <p>
          Before registering a new kind of alarm, look at the classification tree of
          the <a href="/alarm/categories"><strong>current alarms</strong></a> and decide if there is already a
          category and subcategory where the new alarm would naturally fit.
          Once you have decided on category and subcategory, you should create a small json document in this form:
        </p>
        <pre><code>{`{
  "category": "Analytics",
  "subcategory": "Frontier",
  "event": "Failed queries",
  "description": "Code running every 1h at UC k8s cluster. Checks all servers for: Rejected queries - server is busy and doesn't respond to the query; DB disconnections - the query was processed by the Frontier server but the Oracle DB terminated the connection. The code can be found here: https://github.com/ATLAS-Analytics/AlarmAndAlertService/blob/master/frontier-failed-q.py",
  "template": "Servers with failed queries:\\n%{servers}\\n. Affected tasks: \\n%{tasks}\\n\\tConsult the following link to get a table with the most relevant taskids https://atlas-kibana.mwt2.org:5601/s/frontier/goto/c72d263c3e2b86f394ab99211c99b613\\n"
}`}</code></pre>
        <p>
          It is really important to write the description field as detailed as possible as that will help people
          getting alarm know how it got generated. The template field defines text that will appear in the alert email.
          So it should be brief, but give all the information that a person receiving it could judge how serious the
          issue is, should they forward it, and have enough information to either act on it, or start digging further
          into the issue. All the instances of %{'{'}<strong>variable</strong>{'}'} will be changed with values
          of <em>variable</em> field given in alarms &quot;source&quot; field. At this moment only
          simple <em>\n</em> and <em>\t</em> are available for formatting. Once you have the json alarm description
          ready, you can simply post it to the Alarm And Alert Service <a href="#api_alarm_register">REST endpoint</a>.
        </p>

        <h3 id="creation">Creating Alarm</h3>
        <p>
          Once Alarm has been configured, you may start creating them.
          Alarms are again simple JSON documents, and follow this form:
        </p>
        <pre><code>{`{
  "category": "network",
  "subcategory": "perfsonar",
  "event": "high packet loss",
  "tag": "ps.sl",
  "body": "ps_1 needs 10000ms",
  "source": {
      "src": "137.222.79.1",
      "avg_value": 1.0,
      "host_src": "dice-io-37-00.acrc.bris.ac.uk",
      "site_src": "UKI-SOUTHGRID-BRIS-HEP"
  }
}`}</code></pre>
        <p>In addition to alarm classification, it contains fields:</p>
        <ul>
          <li><em>tag</em> - a single keyword or a short array that a user can subscribe to. This helps limit number of alerts that a user will receive.</li>
          <li><em>body</em> - a very brief description of the event.</li>
          <li><em>source</em> - this optional field is a short map whose attributes will be placed in the alert template.</li>
        </ul>
        <p>The document should be sent to this <a href="#api_alarm_create">REST endpoint</a>.</p>
        <p>
          Every alarm has its own page at <em>/alarms/&lt;id&gt;</em>, where <em>id</em> is the alarm&apos;s
          Elasticsearch document id. It shows the alarm, links to Kibana, and lets logged-in users add annotations.
        </p>

        <h3 id="examples">Examples</h3>
        <p>Registering an alarm category and sending an alarm with <em>curl</em>:</p>
        <pre><code>{`AAAS=${SERVICE}

curl -X POST $AAAS/alarm/category -H 'Content-Type: application/json' -d '{
"category": "Analytics", "subcategory": "Frontier", "event": "Failed queries",
"description": "What generates this alarm and how.",
"template": "Servers with failed queries:\\n%{servers}\\n"
}'

curl -X POST $AAAS/alarm/ -H 'Content-Type: application/json' -d '{
"category": "Analytics", "subcategory": "Frontier", "event": "Failed queries",
"tag": "MWT2", "body": "3 servers with failed queries",
"source": {"servers": "frontier01, frontier02, frontier03"}
}'`}</code></pre>
        <p>The same with <em>python</em> (requests):</p>
        <pre><code>{`import requests

AAAS = "${SERVICE}"

alarm = {
  "category": "Analytics",
  "subcategory": "Frontier",
  "event": "Failed queries",
  "tag": "MWT2",
  "body": "3 servers with failed queries",
  "source": {"servers": "frontier01, frontier02, frontier03"},
}
r = requests.post(f"{AAAS}/alarm/", json=alarm, timeout=30)
r.raise_for_status()

# heartbeats: register once, then send one every few seconds from each instance
requests.post(f"{AAAS}/heartbeat/register", json={
  "category": "SLATE", "subcategory": "Squid", "event": "server down",
  "description": "Squid instance stopped sending heartbeats.",
  "template": "Squid instance %{instance} at %{site} stopped sending heartbeats.",
  "interval": 60, "min_expected": 4,
}, timeout=30)
requests.post(f"{AAAS}/heartbeat/", json={
  "category": "SLATE", "subcategory": "Squid", "event": "server down",
  "source": {"site": "MWT2", "instance": "MWT2_Slate_01"},
}, timeout=30)`}</code></pre>

        <h2 id="rest">REST API</h2>
        <p>There are three parts of the API: alarms, users and heartbeats.</p>

        <h3 id="api_alarm">Alarm</h3>
        <Endpoint id="api_alarm_categories" title="List categories" method="GET" path="/alarm/categories">
          Returns JSON formatted information on all currently registered alarm categories.
        </Endpoint>
        <Endpoint id="api_alarm_register" title="Registering Alarm" method="POST" path="/alarm/category" body={ALARM_CATEGORY} />
        <Endpoint id="api_alarm_edit" title="Editing Alarm" method="PATCH" path="/alarm/category" body={ALARM_CATEGORY} />
        <Endpoint id="api_alarm_create" title="Creating Alarm" method="POST" path="/alarm/" body={`{
  "category": "",
  "subcategory": "",
  "event": "",
  "tag": "",
  "body": "",
  "source": {"xxx": "", "yyy": "", ...}
}`} />
        <Endpoint id="api_alarm_list" title="List Alarms" method="POST" path="/alarm/fetch" body={FETCH}>
          Returns alarms created in the last <em>period</em> hours.
        </Endpoint>
        <Endpoint id="api_alarm_del_event" title="Delete Alarm Category" method="DELETE" path="/alarm/" body={TOPOLOGY}>
          Unregisters alarm event. Use with caution!
        </Endpoint>

        <h3 id="api_user">User</h3>
        <Endpoint id="api_user_view_all" title="All Users Information" method="GET" path="/user/">
          Returns JSON formatted information on all users.
        </Endpoint>
        <Endpoint id="api_user_view" title="User Information" method="GET" path="/user/:userId">
          Returns JSON formatted information on a specific user, preferences and subscriptions.
        </Endpoint>
        <Endpoint id="api_user_delete" title="Full Unsubscribe" method="DELETE" path="/user/:userId">
          Completely deletes a user from system.
        </Endpoint>
        <Endpoint id="api_user_update_preferences" title="Update User preferences" method="POST" path="/user/preferences/:userId" body={`{
  "vacation": true
}`}>
          Updates user preferences. Only preferences supported by the deployed system are allowed.
        </Endpoint>
        <Endpoint id="api_user_update_subscriptions" title="Update subscriptions" method="POST" path="/user/subscriptions/:userId" body={`[
  {
      "category": "",
      "subcategory": "",
      "event": "",
      "tags": ["xxx", "yyy"]
  },
  ...
]`}>
          Replaces user subscriptions. Body has JSON array of all alarms user will be subscribed to.
        </Endpoint>

        <h3 id="api_heartbeat">Heartbeat</h3>
        <Endpoint id="api_heartbeat_categories" title="List Categories" method="GET" path="/heartbeat/">
          Returns JSON formatted information on all currently registered heartbeat categories.
        </Endpoint>
        <Endpoint id="api_heartbeat_register" title="Registering heartbeat" method="POST" path="/heartbeat/register" body={HEARTBEAT_CATEGORY}>
          If a source that sent at least <em>min_expected</em> heartbeats in one <em>interval</em> (seconds)
          fails to do so in the next one, an alarm is created.
        </Endpoint>
        <Endpoint id="api_heartbeat_edit" title="Editing heartbeat" method="PATCH" path="/heartbeat/" body={HEARTBEAT_CATEGORY} />
        <Endpoint id="api_heartbeat_create" title="Sending heartbeat" method="POST" path="/heartbeat/" body={`{
  "category": "",
  "subcategory": "",
  "event": "",
  "source": {"xxx": "", "yyy": "", ...}
}`} />
        <Endpoint id="api_heartbeat_list" title="List heartbeats" method="POST" path="/heartbeat/fetch" body={FETCH}>
          Returns heartbeats received in the last <em>period</em> hours.
        </Endpoint>
        <Endpoint id="api_heartbeat_del_event" title="Delete heartbeat Category" method="DELETE" path="/heartbeat/" body={TOPOLOGY}>
          Unregisters heartbeat event. Use with caution!
        </Endpoint>
      </article>
    </div>
  );
}
