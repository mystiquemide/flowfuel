import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@flowfuel/core", "@flowfuel/db", "@flowfuel/broker"],
  allowedDevOrigins: [
    "159.69.241.122",
    "ubuntu-8gb-fsn1-2.tailb78ed9.ts.net",
    "*.ngrok-free.dev",
    "*.trycloudflare.com",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
