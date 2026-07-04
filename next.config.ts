import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Preview uploads the raw .xlsx; commit sends ~300-row JSON chunks.
      // A ~5,000-row tracker workbook is typically 1–3 MB — 8 MB gives headroom.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
