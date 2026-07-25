import withSerwistInit from '@serwist/next'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@degommix/game-core', '@degommix/db'],
  experimental: {
    // Client-side Router Cache only (not the `use cache` data cache): every tab
    // is a dynamic route, and Next 15 ships `dynamic: 0`, so each tap on the
    // tab bar paid a full RSC round-trip even when coming back one second
    // later. The screen data no longer lives in that payload — it is owned by
    // TanStack Query and invalidated by websocket events — so reusing the
    // rendered shell for 30 s is safe and makes tab switches instant.
    staleTimes: { dynamic: 30, static: 180 },
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
