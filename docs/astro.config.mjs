import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "KeyPears Docs",
      logo: {
        dark: "./src/assets/logo-dark.webp",
        light: "./src/assets/logo-light.webp",
      },
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/keypears/keypears",
        },
      ],
      sidebar: [
        { slug: "index", label: "Welcome" },
        {
          label: "Protocol",
          items: [
            { slug: "protocol/addressing" },
            { slug: "protocol/key-derivation" },
            { slug: "protocol/encryption" },
            { slug: "protocol/proof-of-work" },
          ],
        },
        { slug: "federation" },
        { slug: "self-hosting" },
        { slug: "security" },
      ],
    }),
  ],
});
