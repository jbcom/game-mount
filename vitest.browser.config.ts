import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Real-Chromium gate for the @pixi/react adapter: a real Application on a real WebGL context under
// React StrictMode, which jsdom cannot provide. Install the browser with
// `pnpm exec playwright install chromium`. CI runners have no GPU, so Chromium may fall back to
// SwiftShader; the gate asserts a live context, not GPU hardware.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/browser/**/*.test.tsx"],
    passWithNoTests: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
