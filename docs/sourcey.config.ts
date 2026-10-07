import { defineConfig, markdown } from "sourcey";

export default defineConfig({
  name: "game-mount",
  siteUrl: "https://jonbogaty.com",
  baseUrl: "/game-mount",
  theme: {
    preset: "default",
    colors: {
      primary: "#334155",
      light: "#64748b",
      dark: "#1e293b",
    },
    fonts: {
      sans: "system-ui, sans-serif",
      mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    layout: {
      sidebar: "17rem",
      toc: "18rem",
      content: "46rem",
    },
    css: ["./brand.css"],
  },
  logo: { light: "./assets/favicon.svg", href: "/game-mount/" },
  favicon: "./assets/favicon.svg",
  repo: "https://github.com/jbcom/game-mount",
  editBranch: "main",
  editBasePath: "docs",
  prettyUrls: "slash",
  navbar: {
    links: [
      { type: "github", href: "https://github.com/jbcom/game-mount" },
      { type: "npm", href: "https://www.npmjs.com/package/game-mount" },
    ],
  },
  footer: {
    links: [
      {
        type: "link",
        label: "MIT License",
        href: "https://github.com/jbcom/game-mount/blob/main/LICENSE",
      },
      {
        type: "link",
        label: "Security",
        href: "https://github.com/jbcom/game-mount/security/policy",
      },
    ],
  },
  navigation: {
    tabs: [
      {
        tab: "Documentation",
        slug: "",
        source: markdown({
          groups: [
            {
              group: "Getting Started",
              pages: ["introduction", "getting-started"],
            },
            {
              group: "Reference",
              pages: ["API", "ARCHITECTURE", "decisions"],
            },
            {
              group: "Project",
              pages: ["contributing", "release-history"],
            },
          ],
        }),
      },
    ],
  },
});
