const backendUrl = (
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000'
).replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/.well-known/:path*',
        destination: `${backendUrl}/.well-known/:path*`,
      },
      {
        source: '/oauth/:path*',
        destination: `${backendUrl}/oauth/:path*`,
      },
    ];
  },
};

export default nextConfig;
