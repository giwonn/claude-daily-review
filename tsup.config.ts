import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "on-stop": "src/hooks/on-stop.ts",
    "on-session-start-check": "src/hooks/on-session-start-check.ts",
    "storage-cli": "src/cli/storage-cli.ts",
  },
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  bundle: true,
});
