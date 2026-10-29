'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const current = usePathname() === href ? 'page' : undefined;
  return <Link href={href} aria-current={current}>{children}</Link>;
}

export default function Navigation({ loggedIn }: { loggedIn: boolean }) {
  return (
    <header className="site-header">
      <div className="page wide">
        <Link className="brand" href="/">Alarm &amp; Alert</Link>
        <nav className="nav" aria-label="Main">
          <NavLink href="/docs">Docs</NavLink>
          {loggedIn && (
            <>
              <NavLink href="/viewer">Alarms</NavLink>
              <NavLink href="/heartbeats_viewer">Heartbeats</NavLink>
              <NavLink href="/subscriptions">Subscriptions</NavLink>
            </>
          )}
        </nav>
        <div className="nav account">
          {loggedIn
            ? <NavLink href="/profile">Profile</NavLink>
            // route handler, not a page: plain anchor so the browser does a full request.
            : <a href="/login">Log in</a>}
        </div>
      </div>
    </header>
  );
}
