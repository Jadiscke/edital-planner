import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  output: "static",
  site: process.env.PUBLIC_SITE_URL ?? "https://planejadordeeditais.com.br",
  integrations: [sitemap()],
  server: { host: "127.0.0.1", port: 4173 },
  vite: {
    server: {
      proxy: {
        "/app": { target: "http://127.0.0.1:4174", ws: true },
      },
    },
  },
});
