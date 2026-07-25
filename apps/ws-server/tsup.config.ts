import { defineConfig } from 'tsup'

// The workspace packages export TypeScript sources, so the ws-server build
// bundles them (tsc NodeNext cannot emit files outside its rootDir).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  sourcemap: true,
  clean: true,
  noExternal: ['@degommix/game-core', '@degommix/db'],
})
