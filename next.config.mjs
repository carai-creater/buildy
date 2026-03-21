/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // "/" → English static landing (public/index.html). Avoid Edge middleware rewrite — fails on Vercel (MIDDLEWARE_INVOCATION_FAILED).
  async redirects() {
    return [{ source: "/", destination: "/index.html", permanent: false }];
  },
};

export default nextConfig;
