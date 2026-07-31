import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      // Vite reserves BASE_URL and otherwise exposes "/", which is invalid for the API config.
      BASE_URL: 'https://api.deepseek.com',
    },
  },
});
