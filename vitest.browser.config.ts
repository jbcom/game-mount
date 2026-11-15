import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Real-WebGL gates for PixiReactMount and owned R3F retirement. Acceptance is silent, headed
// Chromium (Linux CI uses Xvfb). The render pool's explicit headless override is diagnostic only.
// Install the full browser with `pnpm exec playwright install --no-shell chromium`.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/browser/**/*.test.tsx"],
    passWithNoTests: false,
    browser: {
      enabled: true,
      headless: process.env.HEAVY_RENDER_HEADLESS === "1",
      provider: playwright({
        launchOptions: {
          args: [
            "--mute-audio",
            "--enable-automation",
            ...(process.env.HEAVY_RENDER_HOST
              ? ["--use-angle=metal", "--ignore-gpu-blocklist"]
              : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
          ],
        },
      }),
      commands: {
        async browserArguments({ context, page }) {
          const session = await context.newCDPSession(page);
          try {
            return {
              args: (await session.send("Browser.getBrowserCommandLine")).arguments,
              headedRequired: process.env.HEAVY_RENDER_HEADLESS !== "1",
            };
          } finally {
            await session.detach();
          }
        },
      },
      instances: [{ browser: "chromium" }],
    },
  },
});
