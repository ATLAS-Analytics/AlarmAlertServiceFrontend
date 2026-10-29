import Image from 'next/image';

export default function Home() {
  return (
    <div className="container">
      <div className="row">
        <div className="col-lg-6 mx-auto">
          <h1>ATLAS Alarm And Alert</h1>
          <p className="lead">
            This platform provides a simple way to store generated alarms, handles users subscriptions and generates alerts.
          </p>
          <h2>Components</h2>
          <dl>
            <dt>Database</dt>
            <dd>Elasticsearch</dd>
            <dt>REST API and Web frontend</dt>
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
          <iframe
            title="Alarms in the last day"
            height={300}
            src="https://atlas-kibana.mwt2.org:5601/s/aaas/app/visualize?auth_provider_hint=anonymous1#/edit/609abeb6-6bea-549a-a729-c95dcfa84e87?embed=true&_g=(time%3A(from%3Anow-1d%2Cto%3Anow))"
          />
        </div>
        <div className="col-lg-6 mx-auto">
          <Image
            className="img-fluid"
            src="/images/AlarmAndAlert.png"
            width={800}
            height={600}
            style={{ maxWidth: '80%', height: 'auto' }}
            alt="Alarm and Alert schema"
          />
        </div>
      </div>
    </div>
  );
}
