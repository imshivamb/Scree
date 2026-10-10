import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: ".",
  publicDir: "public",
  plugins: [react()],
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: {
        site: resolve(import.meta.dirname, "index.html"),
        studio: resolve(import.meta.dirname, "studio/index.html"),
        lab: resolve(import.meta.dirname, "lab/index.html"),
        labReact: resolve(import.meta.dirname, "lab/react/index.html"),
        labDom: resolve(import.meta.dirname, "lab/dom/index.html"),
      },
    },
  },
  resolve: {
    // The React package imports the engine by its published name; here it is the source.
    alias: { "scree-core": resolve(import.meta.dirname, "src/engine/index.ts") },
  },
  worker: {
    format: "es",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
