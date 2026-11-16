import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Authenticated pages read the session on every request, so they stay dynamic.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
