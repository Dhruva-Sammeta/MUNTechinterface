/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow mobile devices on the same LAN to access the dev server
  allowedDevOrigins: [
    "192.168.0.192",
    "192.168.1.*",
    "192.168.0.*",
    "10.0.0.*",
    "172.16.*.*",
  ],
  experimental: {},
};

export default nextConfig;

