import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:4000" } },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "index.html",
        list: "list.html",   // standalone public list page (no login)
      },
    },
  },
});
