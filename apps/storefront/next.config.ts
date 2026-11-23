import path from "node:path";
import type { NextConfig } from "next";
import { APPROVED_REMOTE_IMAGE_HOSTS } from "./src/constants/image-hosts.constant";

const nextConfig: NextConfig = {
  transpilePackages: ["@greenroots/shared", "@greenroots/ui"],
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
  images: {
    remotePatterns: APPROVED_REMOTE_IMAGE_HOSTS.map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
  },
  reactCompiler: true,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    authInterrupts: true,
    optimizePackageImports: ["lucide-react", "@base-ui/react"],
  },
};

export default nextConfig;
