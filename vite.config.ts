import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/tripsplit-web/",
  server: {
    port: 5173
  }
});
