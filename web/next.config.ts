import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  outputFileTracingIncludes: {
    "/api/pacotes/[packageId]/pdf": ["./public/branding/ifnmg-horizontal.png"],
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    useTypeScriptCli: false,
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
