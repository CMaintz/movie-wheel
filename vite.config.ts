import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts', 'api/**/*.ts'],
      exclude: ['src/main.tsx', 'src/test/**', '**/*.test.{ts,tsx}', 'src/types.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { statements: 88, branches: 72, functions: 88, lines: 88 },
    },
  },
})
