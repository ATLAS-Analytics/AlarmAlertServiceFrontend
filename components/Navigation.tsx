import Image from 'next/image';
import Link from 'next/link';

export default function Navigation({ loggedIn }: { loggedIn: boolean }) {
  return (
    <nav id="mainNav" className="navbar navbar-dark bg-dark sticky-top px-2">
      <a className="navbar-brand" href="https://github.com/ATLAS-Analytics">
        <Image className="d-inline-block align-top" src="/images/a%26a.png" width={125} height={65} alt="Alarm & Alert" priority />
      </a>
      <div className="nav me-auto">
        <Link className="nav-link" href="/">Home</Link>
        <Link className="nav-link" href="/docs">Docs</Link>
        {loggedIn && (
          <>
            <Link className="nav-link" href="/viewer">Alarms</Link>
            <Link className="nav-link" href="/heartbeats_viewer">Heartbeats</Link>
            <Link className="nav-link" href="/subscriptions">Subscriptions</Link>
          </>
        )}
      </div>
      <div className="nav">
        {loggedIn
          ? <Link className="nav-link" href="/profile">Profile</Link>
          // route handlers, not pages: plain anchors so the browser does a full request.
          : <a className="nav-link" href="/login">Login</a>}
      </div>
    </nav>
  );
}
