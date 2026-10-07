import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// Unit tests in jsdom. Renderers that need WebGL are mocked at their boundary (pixi.js, @pixi/react,
// @react-three/fiber); Babylon runs for real on its NullEngine. tests/browser needs a real WebGL
// context and runs from vitest.browser.config.ts.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: [...configDefaults.exclude, "tests/browser/**"],
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      // Barrels only re-export; the smoke test proves every name they list resolves.
      exclude: ["src/**/index.ts", "tests/**"],
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
