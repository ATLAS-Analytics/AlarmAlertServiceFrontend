import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // REST clients POST to e.g. /alarm/ and /heartbeat/ — don't 308-redirect them.
  skipTrailingSlashRedirect: true,
  images: { unoptimized: true },
  serverExternalPackages: ['@elastic/elasticsearch'],
};

export default nextConfig;
