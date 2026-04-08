import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envDir: "..",
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/_preview": {
        target: "http://localhost:3000",
        ws: true,
      },
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
});
