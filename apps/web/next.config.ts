import withSerwistInit from '@serwist/next'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@degommix/game-core', '@degommix/db'],
}

// The service worker is only built for production: `next dev` keeps serving
// fresh responses without a cache layer in between.
const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV !== 'production',
})

export default withSerwist(nextConfig)
