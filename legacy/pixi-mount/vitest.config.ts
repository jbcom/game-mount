import { configDefaults, defineConfig } from 'vitest/config';

// jsdom unit tests against a Pixi mock that mirrors the exact mount surface, plus the repository
// contract. Everything under tests/ runs here except tests/browser, which needs a real WebGL
// context and runs from vitest.browser.config.ts.
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: [...configDefaults.exclude, 'tests/browser/**'],
    passWithNoTests: false,
  },
});
