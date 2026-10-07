import { defineConfig } from 'vitest/config';

// jsdom unit tests against a Pixi mock that mirrors the exact mount surface, plus the repository
// contract. The real-Chromium StrictMode gate in tests/browser runs from vitest.browser.config.ts.
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/*.test.ts', 'tests/*.test.tsx'],
    passWithNoTests: false,
  },
});
