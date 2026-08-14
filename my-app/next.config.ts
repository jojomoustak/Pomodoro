import type { NextConfig } from "next";

const isAndroidOfflineBuild =
  process.env.ANDROID_OFFLINE_BUILD === "true";

const nextConfig: NextConfig = isAndroidOfflineBuild
  ? {
      output: "export",
      trailingSlash: true,
      // Android serves the exported bundle through WebViewAssetLoader.
      // The HTTPS origin avoids file:// CORS and subresource-loading issues.
      assetPrefix: "/assets/web",
    }
  : {};

export default nextConfig;
