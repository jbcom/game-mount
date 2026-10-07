import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Real-Chromium gate for the @pixi/react adapter: a real Application on a real WebGL context under
// React StrictMode, which jsdom cannot provide. Real Chromium comes from @vitest/browser-playwright;
// install it with `pnpm exec playwright install chromium`. CI runners have no GPU, so Chromium is
// allowed its software (SwiftShader) WebGL fallback; the gate asserts a live context, not a GPU.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/browser/**/*.test.tsx'],
    passWithNoTests: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
