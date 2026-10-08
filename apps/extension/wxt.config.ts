import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/guide/essentials/config/manifest.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  outDir: ".output",
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "Stasher",
    description: "Capture page metadata and hand it off to the Stasher desktop app.",
    browser_specific_settings: {
      gecko: {
        id: "stasher@schw.ar",
        strict_min_version: "115.0",
      },
    },
    permissions: ["nativeMessaging", "activeTab", "storage"],
    host_permissions: ["*://*.fansly.com/*", "*://*.redgifs.com/*", "*://onlyfans.com/*"],
  },
});
