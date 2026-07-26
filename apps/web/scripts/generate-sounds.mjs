/**
 * Regenerates the two SYNTHESISED arena samples of `public/sounds/` — `paf` and
 * `fanfare`.
 *
 * Run with: pnpm --filter @degommix/web sounds
 *
 * The third sample, `ouch.m4a`, is NOT generated here: the owner asked for a
 * real « ouch », so it is a sourced CC0 voice recording. Its provenance and the
 * exact commands that produced it live in `public/sounds/LICENSE.txt`. Running
 * this script never touches it.
 *
 * Why synthesis for the other two: the licence question disappears. Both are
 * arithmetic written here, so their provenance is this file and their licence
 * is the repository's — no CC-BY attribution surface to build, no marketplace
 * terms to read, no downloaded metadata to sanitise.
 *
 * Four invariants this script exists to guarantee:
 *
 * 1. **Deterministic output.** The only noise source is a seeded LCG, so
 *    re-running the script on the same machine reproduces the same bytes. A
 *    committed binary that changes on every run is unreviewable.
 * 2. **No dependency.** 44.1 kHz mono 16-bit PCM is written by hand into a
 *    44-byte WAV header plus samples; the encode is delegated to a system
 *    binary (`afconvert` on macOS, `ffmpeg` elsewhere). Adding an audio
 *    dependency to ship three files under 50 KB would be absurd.
 * 3. **A hard size ceiling.** Nothing ≥ 50 KB is written. These files are
 *    fetched on a phone over whatever connection the pub has.
 * 4. **No clicks and no clipping.** Every sample is peak-normalised to −3 dBFS
 *    and gets a 5 ms fade in and out, because a buffer that starts on a
 *    non-zero value pops through a phone speaker.
 *
 * Retuning any recipe below means re-doing the listening pass: a "small tweak"
 * to a synthesis parameter can double a file size or introduce a click.
 */
import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(HERE, '../public/sounds')

const SAMPLE_RATE = 44100
/** Peak target, ≈ −3 dBFS: loud enough on a phone speaker, never clipped. */
const PEAK = 0.708
const FADE_MS = 5
const MAX_BYTES = 50 * 1024

/* ------------------------------------------------------------------ helpers */

/**
 * Seeded LCG (Numerical Recipes constants) mapped to [-1, 1]. `Math.random`
 * would make every run produce a different binary — see invariant 1.
 */
function makeNoise(seed) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return (state / 0x80000000 - 1)
  }
}

/**
 * Chamberlin state-variable filter, stepped one sample at a time so the cutoff
 * can sweep. Returns `{ low, band }` per call; stable while the cutoff stays
 * well under `sampleRate / 6`, which every recipe here respects.
 */
function makeSvf(q) {
  let low = 0
  let band = 0
  return (input, cutoffHz) => {
    const f = 2 * Math.sin((Math.PI * cutoffHz) / SAMPLE_RATE)
    low += f * band
    const high = input - low - (1 / q) * band
    band += f * high
    return { low, band }
  }
}

/** Attack then exponential decay, both in seconds. */
function envelope(t, attackS, tauS) {
  const attack = t < attackS ? t / attackS : 1
  const decay = Math.exp(-Math.max(0, t - attackS) / tauS)
  return attack * decay
}

/** Soft saturation — tames the transient peaks without a hard-clip buzz. */
function softClip(x) {
  return Math.tanh(x)
}

/** In place: peak-normalise to PEAK, then fade FADE_MS in and out. */
function finish(samples) {
  let peak = 0
  for (const value of samples) peak = Math.max(peak, Math.abs(value))
  const scale = peak > 0 ? PEAK / peak : 0
  for (let i = 0; i < samples.length; i += 1) samples[i] *= scale

  const fade = Math.round((FADE_MS / 1000) * SAMPLE_RATE)
  for (let i = 0; i < fade && i < samples.length; i += 1) {
    samples[i] *= i / fade
    samples[samples.length - 1 - i] *= i / fade
  }
  return samples
}

/** 16-bit little-endian mono WAV: a 44-byte canonical header plus samples. */
function toWav(samples) {
  const dataBytes = samples.length * 2
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2)
  }
  return buffer
}

function allocate(durationMs) {
  return new Float64Array(Math.round((durationMs / 1000) * SAMPLE_RATE))
}

/* ------------------------------------------------------------------ recipes */

/**
 * `paf`, 180 ms — a dry comic-book impact: a white-noise burst through a
 * band-pass around 1.6 kHz (Q ≈ 1.2) with a 4 ms attack and a τ ≈ 45 ms decay,
 * layered with a 90 Hz sine thump at −4 dB decaying over 120 ms.
 */
function renderPaf() {
  const samples = allocate(180)
  const noise = makeNoise(0x50414601)
  const band = makeSvf(1.2)
  let thumpPhase = 0
  for (let i = 0; i < samples.length; i += 1) {
    const t = i / SAMPLE_RATE
    const crack = band(noise(), 1600).band * envelope(t, 0.004, 0.045)
    thumpPhase += (2 * Math.PI * 90) / SAMPLE_RATE
    const thump = Math.sin(thumpPhase) * 0.63 * envelope(t, 0.002, 0.12)
    samples[i] = softClip((crack * 1.8 + thump) * 1.2)
  }
  return finish(samples)
}

/**
 * One brass voice: an additive saw (harmonics at 1/n, capped below Nyquist)
 * through a low-pass that sweeps, which is what makes it read as brass rather
 * than as an organ. `freqAt(t)` carries the pitch bend or the vibrato.
 */
function renderBrass(samples, freqAt, gainAt, cutoffAt, detuneCents, offsetSamples) {
  const HARMONICS = 8
  const WEIGHTS = [1, 0.5, 0.316, 0.2, 0.14, 0.1, 0.075, 0.06]
  const detune = Math.pow(2, detuneCents / 1200)
  const low = makeSvf(0.9)
  let phase = 0
  for (let i = 0; i + offsetSamples < samples.length; i += 1) {
    const t = i / SAMPLE_RATE
    const freq = freqAt(t) * detune
    phase += (2 * Math.PI * freq) / SAMPLE_RATE
    let value = 0
    for (let h = 1; h <= HARMONICS; h += 1) {
      if (freq * h >= SAMPLE_RATE / 2) break
      value += WEIGHTS[h - 1] * Math.sin(phase * h)
    }
    samples[i + offsetSamples] += low(value, cutoffAt(t)).low * gainAt(t)
  }
}

/**
 * `fanfare`, 1200 ms — three brass notes, G3 → C4 → E4, 220 ms apart, the last
 * held 600 ms with a 4 Hz vibrato of ±6 cents. Short and celebratory: it marks
 * the village falling, it is not a jingle.
 */
function renderFanfare() {
  const samples = allocate(1200)
  const NOTES = [
    { freq: 196, onsetMs: 0, holdS: 0.14, releaseS: 0.12, gain: 0.9, vibrato: false },
    { freq: 262, onsetMs: 220, holdS: 0.14, releaseS: 0.12, gain: 0.95, vibrato: false },
    { freq: 330, onsetMs: 440, holdS: 0.36, releaseS: 0.26, gain: 1, vibrato: true },
  ]
  for (const note of NOTES) {
    const offset = Math.round((note.onsetMs / 1000) * SAMPLE_RATE)
    const freqAt = note.vibrato
      ? (t) => note.freq * Math.pow(2, (6 * Math.sin(2 * Math.PI * 4 * t)) / 1200)
      : () => note.freq
    const cutoffAt = (t) => 1000 + (2800 - 1000) * Math.min(1, t / 0.12)
    const gainAt = (t) => {
      const level =
        t < 0.02 ? t / 0.02 : t < note.holdS ? 1 : Math.exp(-(t - note.holdS) / note.releaseS)
      return level * note.gain
    }
    renderBrass(samples, freqAt, gainAt, cutoffAt, 0, offset)
    renderBrass(samples, freqAt, (t) => gainAt(t) * 0.6, cutoffAt, 8, offset)
  }
  for (let i = 0; i < samples.length; i += 1) samples[i] = softClip(samples[i] * 0.8)
  return finish(samples)
}

/* ------------------------------------------------------------------- encode */

async function which(binary) {
  try {
    await run('which', [binary])
    return true
  } catch {
    return false
  }
}

/**
 * WAV → AAC-LC ≈ 96 kbps mono. AAC is chosen over MP3 deliberately: MP3 carries
 * ~13 ms of encoder delay that `decodeAudioData` does not necessarily strip,
 * which would smear the 40 ms sync between the paf and the `.hit-stamp`
 * animation. Both encoders are told to write no metadata.
 */
async function encode(wavPath, outPath) {
  if (await which('afconvert')) {
    await run('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '96000', wavPath, outPath])
    return
  }
  if (await which('ffmpeg')) {
    await run('ffmpeg', [
      '-y',
      '-i',
      wavPath,
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-ac',
      '1',
      '-map_metadata',
      '-1',
      outPath,
    ])
    return
  }
  throw new Error('Neither afconvert nor ffmpeg is available: cannot encode AAC.')
}

async function main() {
  const recipes = [
    ['paf', renderPaf],
    ['fanfare', renderFanfare],
  ]

  await mkdir(OUT_DIR, { recursive: true })
  const work = await mkdtemp(join(tmpdir(), 'degommix-sounds-'))

  try {
    for (const [id, render] of recipes) {
      const samples = render()
      const wavPath = join(work, `${id}.wav`)
      const outPath = join(work, `${id}.m4a`)
      await writeFile(wavPath, toWav(samples))
      await encode(wavPath, outPath)

      const { size } = await stat(outPath)
      if (size >= MAX_BYTES) {
        throw new Error(`${id}.m4a is ${size} bytes, over the ${MAX_BYTES} byte ceiling.`)
      }
      await copyFile(outPath, join(OUT_DIR, `${id}.m4a`))
      const durationMs = Math.round((samples.length / SAMPLE_RATE) * 1000)
      process.stdout.write(`${id}.m4a  ${size} bytes  ${durationMs} ms\n`)
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

await main()
