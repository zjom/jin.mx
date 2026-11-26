import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [cloudflare()],
  // Two pages: the questionnaire itself, and /admin
  environments: {
    client: { build: { rollupOptions: { input: ["index.html", "admin.html"] } } },
  },
});
