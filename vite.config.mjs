import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/shiplog/",
  server: {
    host: "127.0.0.1", port: 5318, strictPort: true,
    proxy: { "/api": "http://127.0.0.1:5300" },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
