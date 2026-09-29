import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  testIgnore: ['.worktrees/**', 'node_modules/**'],
});