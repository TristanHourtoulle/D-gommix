/**
 * Regenerates the shipped PWA icon set from the committed SVG sources.
 *
 * Run with: pnpm --filter @degommix/web icons
 *
 * Two invariants this script exists to guarantee:
 *
 * 1. Every PNG it writes is 8-bit RGBA with an opaque alpha channel. Turbopack's
 *    ICO decoder rejects anything else ("The PNG is not in RGBA format!"), which
 *    makes `next dev` return 500 on every page while `next build` stays green
 *    (see commit 0bf40f2). `flatten()` then `ensureAlpha()` is what enforces it.
 * 2. The SVGs are rasterised at a high density and downsampled, so the 16 px
 *    favicon cut is antialiased rather than nearest-neighboured.
 *
 * The ICO container is written by hand: an ICO holding PNG payloads is a 6-byte
 * header plus one 16-byte directory entry per image, which is cheaper than
 * taking on another dependency just to concatenate buffers.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../..')
const BRANDING = resolve(REPO, 'assets/branding')
const PWA_DIR = resolve(REPO, 'apps/web/public/icons-pwa')
const APP_DIR = resolve(REPO, 'apps/web/src/app')

/** App parchment — the manifest background_color and theme_color. */
const PARCHMENT = '#ece0c4'
/** Rasterisation density; 120 px viewBox at 72 dpi baseline, ~5x headroom. */
const DENSITY = 1200

/** Renders an SVG to an opaque 8-bit RGBA PNG buffer of the given square size. */
async function renderPng(svgPath, size) {
  const svg = await readFile(svgPath)
  return sharp(svg, { density: DENSITY })
    .resize(size, size, { fit: 'contain', background: PARCHMENT })
    .flatten({ background: PARCHMENT })
    .ensureAlpha(1)
    .png({ palette: false, compressionLevel: 9 })
    .toBuffer()
}

/** Packs PNG buffers into an ICO container (ICONDIR + ICONDIRENTRY[] + payloads). */
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)

  let offset = 6 + entries.length * 16
  const directory = entries.map(({ size, data }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1) // height
    entry.writeUInt8(0, 2) // palette size: 0 = not paletted
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })

  return Buffer.concat([header, ...directory, ...entries.map((e) => e.data)])
}

async function main() {
  await mkdir(PWA_DIR, { recursive: true })

  const master = resolve(BRANDING, 'pion-couronne.svg')
  const simple = resolve(BRANDING, 'pion-couronne-simple.svg')

  /*
   * icon-512-maskable is rendered from the same master as icon-512: the artwork
   * is already full bleed with the motif inside the 80 % safe zone, so one cut
   * serves both purposes. The file stays separate because the manifest still
   * declares it, and dropping a declared icon would 404 for installed clients.
   */
  const targets = [
    { out: resolve(PWA_DIR, 'icon-192.png'), src: master, size: 192 },
    { out: resolve(PWA_DIR, 'icon-512.png'), src: master, size: 512 },
    { out: resolve(PWA_DIR, 'icon-512-maskable.png'), src: master, size: 512 },
    { out: resolve(PWA_DIR, 'apple-touch-icon.png'), src: master, size: 180 },
  ]

  for (const { out, src, size } of targets) {
    await writeFile(out, await renderPng(src, size))
    console.log(`wrote ${out} (${size}x${size})`)
  }

  const icoSizes = [16, 32, 48]
  const icoEntries = []
  for (const size of icoSizes) {
    icoEntries.push({ size, data: await renderPng(simple, size) })
  }
  const icoPath = resolve(APP_DIR, 'favicon.ico')
  await writeFile(icoPath, buildIco(icoEntries))
  console.log(`wrote ${icoPath} (${icoSizes.join('/')})`)
}

await main()
