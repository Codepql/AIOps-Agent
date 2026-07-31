import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/health', destination: 'http://127.0.0.1:3001/health' },
      { source: '/api/:path*', destination: 'http://127.0.0.1:3001/api/:path*' },
    ];
  },
};

export default nextConfig;
