import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/hooks/on-stop.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  bundle: true,
});
