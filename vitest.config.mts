import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Agent worktrees under .claude/ carry their own tests against their own
    // unmerged code; they run in their worktree, not here.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
  resolve: {
    alias: { '@': root },
  },
})
