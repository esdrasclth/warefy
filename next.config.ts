import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-6dc5b013645441d6b83003c87391b12d.r2.dev',
      },
    ],
  },
};

export default nextConfig;
