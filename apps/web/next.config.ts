import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@degommix/game-core", "@degommix/db"],
};

export default nextConfig;
