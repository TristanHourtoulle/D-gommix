import withSerwistInit from '@serwist/next'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@degommix/game-core', '@degommix/db'],
  experimental: {
    // Client-side Router Cache only (not the `use cache` data cache). The tab
    // pages still run their queries server-side (getLeaderboard & co feed
    // `initialData`), so a `dynamic` staleTime would replay a pre-game RSC
    // payload after a game finished — a second cache layer fighting the
    // websocket invalidation. `dynamic: 0` keeps every tab tap fresh; switches
    // stay instant anyway because TanStack Query paints from its client cache
    // while the RSC payload streams in.
    staleTimes: { dynamic: 0, static: 180 },
  },
}

// The service worker is only built for production: `next dev` keeps serving
// fresh responses without a cache layer in between.
const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV !== 'production',
})

export default withSerwist(nextConfig)
