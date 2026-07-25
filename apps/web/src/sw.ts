import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist'
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60
const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60

const networkOnly = new NetworkOnly()

/**
 * Runtime rules are evaluated in order, so every dynamic origin is claimed by
 * `NetworkOnly` before any caching strategy can see it. Only immutable build
 * output and public assets are cached; HTML documents and RSC payloads always
 * hit the network because they carry per-session game and account data.
 */
const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ url: { pathname } }) => pathname.startsWith('/api/'),
    handler: networkOnly,
  },
  {
    matcher: ({ url: { pathname } }) => pathname.startsWith('/socket.io/'),
    handler: networkOnly,
  },
  {
    matcher: ({ sameOrigin, url: { pathname } }) =>
      sameOrigin && pathname.startsWith('/_next/static/'),
    handler: new CacheFirst({
      cacheName: 'static-build-assets',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 128,
          maxAgeSeconds: ONE_YEAR_IN_SECONDS,
          maxAgeFrom: 'last-used',
        }),
      ],
    }),
  },
  {
    matcher: ({ request, sameOrigin }) =>
      sameOrigin &&
      (request.destination === 'image' || request.destination === 'font'),
    handler: new StaleWhileRevalidate({
      cacheName: 'static-media-assets',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 96,
          maxAgeSeconds: THIRTY_DAYS_IN_SECONDS,
          maxAgeFrom: 'last-used',
        }),
      ],
    }),
  },
  {
    matcher: () => true,
    handler: networkOnly,
  },
]

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
})

serwist.addEventListeners()
