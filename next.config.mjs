/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Default "/" → English landing is handled by middleware.ts (rewrite to /index.html).
};

export default nextConfig;
