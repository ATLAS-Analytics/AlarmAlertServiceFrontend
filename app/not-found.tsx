import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="page">
      <h1>Not found</h1>
      <p className="muted">There is nothing at this address. <Link href="/">Go home</Link>.</p>
    </div>
  );
}
