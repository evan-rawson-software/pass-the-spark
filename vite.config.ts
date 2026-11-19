import { defineConfig } from "vite";

declare const process: { env: Record<string, string | undefined> };

// The build id is the git commit SHA in CI, and "dev" locally.
const buildId = process.env.GITHUB_SHA || "dev";

export default defineConfig({
  base: "/pass-the-spark/",
  define: { __BUILD_ID__: JSON.stringify(buildId) },
});
