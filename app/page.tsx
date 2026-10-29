import Image from 'next/image';

export default function Home() {
  return (
    <div className="page">
      <h1>ATLAS Alarm &amp; Alert</h1>
      <p className="muted">
        A simple way to store generated alarms, manage subscriptions and send alerts.
      </p>
      <div className="columns">
        <div>
          <h2>Last 24 hours</h2>
          <iframe
            title="Alarms in the last day"
            height={300}
            src="https://atlas-kibana.mwt2.org:5601/s/aaas/app/visualize?auth_provider_hint=anonymous1#/edit/609abeb6-6bea-549a-a729-c95dcfa84e87?embed=true&_g=(time%3A(from%3Anow-1d%2Cto%3Anow))"
          />
          <h2>Components</h2>
          <dl className="meta">
            <dt>Database</dt>
            <dd>Elasticsearch</dd>
            <dt>API &amp; web</dt>
            <dd>Next.js + TypeScript</dd>
            <dt>Deployment</dt>
            <dd>Docker, K8s, FluxCD</dd>
            <dt>Authentication</dt>
            <dd>Globus InCommon</dd>
            <dt>Authorization</dt>
            <dd>API key</dd>
            <dt>Mail</dt>
            <dd>Mailgun</dd>
          </dl>
        </div>
        <div className="home-figure">
          <Image src="/images/AlarmAndAlert.png" width={800} height={600} alt="Alarm and Alert schema" priority />
        </div>
      </div>
    </div>
  );
}
