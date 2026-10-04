import { defineConfig } from 'vitest/config'

// Firestore security rules tests. Run via `npm run test:rules`, which starts the emulator.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
