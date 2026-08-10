import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/app/",
  plugins: [react()],
  server: { port: 4174, strictPort: true },
  preview: { port: 4174, strictPort: true },
  test: { environment: "jsdom", setupFiles: ["./test/setup.ts"], include: ["test/**/*.test.{ts,tsx}"] },
});
