import { defineConfig } from 'vitest/config';

// Pure modules run in node; a test that needs the DOM says so with `// @vitest-environment jsdom`.
// The root `npm test` (node --test) is a separate suite and does not run these.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    restoreMocks: true,
  },
});
