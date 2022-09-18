import tailwind from "@astrojs/tailwind";

import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://sudeepg95.github.io",
  base: '/who-i-am',
  integrations: [
    tailwind(),
  ],
  vite: {
    ssr: {
      external: ["@11ty/eleventy-img", "svgo"],
    },
  },
});
