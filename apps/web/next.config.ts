import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@flowfuel/core", "@flowfuel/db", "@flowfuel/broker"],
};

export default nextConfig;
