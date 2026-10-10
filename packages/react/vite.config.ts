import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  build: {
    emptyOutDir: true,
    lib: { entry: "src/index.tsx", formats: ["es"], fileName: () => "index.js" },
    rollupOptions: { external: ["react", "react-dom", "react/jsx-runtime", "scree-core"],
      output: { banner: "\"use client\";" },
    },
  },
});
