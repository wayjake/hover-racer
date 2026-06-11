// All audio runs through Howler: it owns the AudioContext and master output
// (volume, mute, autoplay unlock), and one-shot SFX are pre-rendered offline
// to WAV and played as Howl instances. The engine and music are synthesized
// live (speed-reactive pitch, procedural sequencing) — Howler can't generate
// sound, so those Web Audio nodes plug into Howler's master gain instead.
// initAudio() must be called from a user gesture (browser autoplay policy).

import { Howl, Howler } from 'howler'

export const audioState = {
  ready: false,
  muted: false,
  trackName: '',
}

// Procedural music "tracks" — each is a seed of patterns the sequencer
// plays for STEPS_PER_TRACK steps before rotating to the next.
const MUSIC_TRACKS = [
  {
    name: 'Dune Drift',
    bpm: 92,
    root: 110, // A2
    scale: [0, 1, 4, 5, 7, 8, 10], // phrygian dominant — desert flavor
    bass: [0, 0, 7, 0, 5, 0, 7, 10],
    bassWave: 'sawtooth',
    leadWave: 'triangle',
    leadDensity: 0.28,
    hat: false,
  },
  {
    name: 'Canyon Pulse',
    bpm: 132,
    root: 98, // G2
    scale: [0, 2, 3, 7, 9],
    bass: [0, 0, 0, 3, 0, 0, 10, 7],
    bassWave: 'square',
    leadWave: 'square',
    leadDensity: 0.4,
    hat: true,
  },
  {
    name: 'Mirage',
    bpm: 70,
    root: 123.47, // B2
    scale: [0, 2, 4, 7, 9],
    bass: [0, 7, 5, 7],
    bassWave: 'triangle',
    leadWave: 'sine',
    leadDensity: 0.2,
    hat: false,
  },
]

const STEPS_PER_TRACK = 128 // 8th notes; ~30-55s per track depending on bpm
const MASTER_VOL = 0.6

let ctx = null
let master, engineBus, musicBus, delayIn
let engine = null
let sharedNoise = null
let drone = null
let trackIdx = 0
let step = 0
let nextNoteTime = 0

function hash(n) {
  let x = (n * 2654435761) >>> 0
  x ^= x >>> 13
  x = (x * 0x5bd1e995) >>> 0
  // ^ yields a SIGNED 32-bit int — force unsigned or the hash goes negative
  x = (x ^ (x >>> 15)) >>> 0
  return x / 4294967296
}

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume()
    return
  }
  // the synth runs constantly, so Howler must not suspend the shared context
  // when no Howl has played for a while
  Howler.autoSuspend = false
  Howler.volume(MASTER_VOL) // also forces Howler to create its AudioContext

  // On devices whose sample rate isn't 44.1kHz (any modern Mac: 48kHz),
  // Howler CLOSES its AudioContext and creates a fresh one the first time
  // a Howl is constructed (the "mobile unload" workaround in _unlockAudio).
  // Our first Howl appears asynchronously from buildSfx, which would strand
  // the whole synth graph on the closed context — so trigger the swap now,
  // before we capture the context and attach anything to it.
  Howler._unlockAudio()
  ctx = Howler.ctx

  // compressor glues the mix and stops the engine drowning the music; splice
  // it between Howler's master gain and the speakers so SFX go through it too
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.ratio.value = 6
  Howler.masterGain.disconnect()
  Howler.masterGain.connect(comp)
  comp.connect(ctx.destination)

  // everything synthesized feeds this bus, then Howler's master gain
  master = ctx.createGain()
  master.gain.value = 1
  master.connect(Howler.masterGain)

  engineBus = ctx.createGain()
  engineBus.gain.value = 0.6
  engineBus.connect(master)

  musicBus = ctx.createGain()
  musicBus.gain.value = 1.5
  musicBus.connect(master)

  // shared echo for lead notes
  delayIn = ctx.createGain()
  const delay = ctx.createDelay(1)
  delay.delayTime.value = 0.28
  const feedback = ctx.createGain()
  feedback.gain.value = 0.35
  delayIn.connect(musicBus)
  delayIn.connect(delay)
  delay.connect(feedback)
  feedback.connect(delay)
  delay.connect(musicBus)

  sharedNoise = makeNoise(ctx, 1)

  buildSfx()
  buildEngine()
  startMusic()
  audioState.ready = true
}

export function toggleMute() {
  if (!ctx) return
  audioState.muted = !audioState.muted
  Howler.mute(audioState.muted)
}

// ---------------------------------------------------------------- engine ---

function buildEngine() {
  const out = ctx.createGain()
  out.gain.value = 0
  out.connect(engineBus)

  // low rumble: detuned saw pair through a lowpass that opens with speed
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 320
  filter.connect(out)

  const oscA = ctx.createOscillator()
  oscA.type = 'sawtooth'
  oscA.frequency.value = 42
  const oscB = ctx.createOscillator()
  oscB.type = 'sawtooth'
  oscB.frequency.value = 42.5
  oscB.detune.value = 9
  const rumbleGain = ctx.createGain()
  rumbleGain.gain.value = 0.5
  oscA.connect(rumbleGain)
  oscB.connect(rumbleGain)
  rumbleGain.connect(filter)

  // podracer-style high whine, bypasses the lowpass to stay bright
  const whine = ctx.createOscillator()
  whine.type = 'sawtooth'
  whine.frequency.value = 250
  const whineGain = ctx.createGain()
  whineGain.gain.value = 0
  whine.connect(whineGain)
  whineGain.connect(out)

  // wind/thrust noise
  const noiseSrc = ctx.createBufferSource()
  noiseSrc.buffer = sharedNoise
  noiseSrc.loop = true
  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'bandpass'
  noiseFilter.frequency.value = 1100
  noiseFilter.Q.value = 0.8
  const noiseGain = ctx.createGain()
  noiseGain.gain.value = 0
  noiseSrc.connect(noiseFilter)
  noiseFilter.connect(noiseGain)
  noiseGain.connect(out)

  oscA.start()
  oscB.start()
  whine.start()
  noiseSrc.start()

  engine = { out, filter, oscA, oscB, whine, whineGain, noiseGain }
}

// f: 0..1 speed factor; boost: whether the booster is firing
export function setEngine(f, boost) {
  if (!engine) return
  f = Math.min(f, 1)
  const t = ctx.currentTime
  const k = 0.06
  const base = 42 + f * 150 + (boost ? 50 : 0)
  engine.oscA.frequency.setTargetAtTime(base, t, k)
  engine.oscB.frequency.setTargetAtTime(base * 1.01, t, k)
  engine.whine.frequency.setTargetAtTime(base * 6, t, k)
  engine.filter.frequency.setTargetAtTime(320 + f * 2800 + (boost ? 1500 : 0), t, k)
  // quadratic curves keep cruise speeds quiet under the music; boost still roars
  engine.out.gain.setTargetAtTime(0.06 + f * f * 0.13 + (boost ? 0.1 : 0), t, k)
  engine.whineGain.gain.setTargetAtTime(0.01 + f * f * 0.045 + (boost ? 0.06 : 0), t, k)
  engine.noiseGain.gain.setTargetAtTime(0.015 + f * f * 0.1 + (boost ? 0.07 : 0), t, k)
}

// ----------------------------------------------------------------- music ---

function startMusic() {
  trackIdx = 0
  step = 0
  nextNoteTime = ctx.currentTime + 0.1
  startDrone(MUSIC_TRACKS[trackIdx])
  audioState.trackName = MUSIC_TRACKS[trackIdx].name
  setInterval(scheduler, 90)
}

export function nextTrack() {
  if (!ctx) return
  step = 0
  rotateTo((trackIdx + 1) % MUSIC_TRACKS.length)
}

function rotateTo(idx) {
  trackIdx = idx
  stopDrone()
  startDrone(MUSIC_TRACKS[trackIdx])
  audioState.trackName = MUSIC_TRACKS[trackIdx].name
}

// classic lookahead scheduler: every 90ms, schedule notes ~250ms out
function scheduler() {
  const track = MUSIC_TRACKS[trackIdx]
  const stepDur = 60 / track.bpm / 2
  while (nextNoteTime < ctx.currentTime + 0.25) {
    scheduleStep(track, step, nextNoteTime, stepDur)
    nextNoteTime += stepDur
    step++
    if (step >= STEPS_PER_TRACK) {
      step = 0
      rotateTo((trackIdx + 1) % MUSIC_TRACKS.length)
      break // step duration changed; let the next tick continue
    }
  }
}

function scheduleStep(track, st, time, stepDur) {
  // kick on every beat — rhythmic punch the engine can't mask
  if (st % 4 === 0) kick(time)

  // bass riff on quarter notes
  if (st % 2 === 0) {
    const semis = track.bass[(st >> 1) % track.bass.length]
    note(time, track.root * 2 ** (semis / 12), stepDur * 1.8, track.bassWave, 0.3, musicBus)
  }

  // lead melody an octave up so it sits above the engine's spectrum
  const h = hash(st * 7 + trackIdx * 131)
  if (h < track.leadDensity) {
    const deg = track.scale[Math.floor(hash(st * 13 + 5) * track.scale.length)]
    const octave = h < track.leadDensity / 3 ? 8 : 4
    note(time, track.root * octave * 2 ** (deg / 12), stepDur * 3, track.leadWave, 0.16, delayIn)
  }

  if (st % 2 === 1) hat(time, track.hat ? 0.09 : 0.05)
}

function kick(time) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.frequency.setValueAtTime(160, time)
  osc.frequency.exponentialRampToValueAtTime(42, time + 0.1)
  g.gain.setValueAtTime(0.55, time)
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.18)
  osc.connect(g)
  g.connect(musicBus)
  osc.start(time)
  osc.stop(time + 0.2)
}

function note(time, freq, dur, wave, vol, dest) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = wave
  osc.frequency.value = freq
  g.gain.setValueAtTime(0.0001, time)
  g.gain.exponentialRampToValueAtTime(vol, time + 0.03)
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur)
  osc.connect(g)
  g.connect(dest)
  osc.start(time)
  osc.stop(time + dur + 0.1)
}

function hat(time, vol = 0.09) {
  const src = ctx.createBufferSource()
  src.buffer = sharedNoise
  const f = ctx.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = 6000
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, time)
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05)
  src.connect(f)
  f.connect(g)
  g.connect(musicBus)
  src.start(time)
  src.stop(time + 0.06)
}

// sustained root + fifth pad under each track
function startDrone(track) {
  const g = ctx.createGain()
  g.gain.value = 0
  g.gain.setTargetAtTime(0.07, ctx.currentTime, 1.5)
  g.connect(musicBus)
  const oscs = [track.root / 2, (track.root / 2) * 1.498].map((freq) => {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = freq
    o.connect(g)
    o.start()
    return o
  })
  drone = { g, oscs }
}

function stopDrone() {
  if (!drone) return
  const { g, oscs } = drone
  g.gain.setTargetAtTime(0, ctx.currentTime, 0.5)
  oscs.forEach((o) => o.stop(ctx.currentTime + 2))
  drone = null
}

// ------------------------------------------------------------------ sfx ---
// One-shots are rendered once in an OfflineAudioContext, encoded to WAV, and
// handed to Howler — playback gets Howl pooling, per-id volume, and rate.

let scrapeHowls = []
let explosionHowl = null
let lastScrape = 0

function buildSfx() {
  // gritty wall-scrape noise burst; three bandpass variants stand in for the
  // old per-play random filter frequency
  ;[650, 1100, 1750].forEach((freq, i) => {
    renderToHowl(0.15, (oc) => {
      const src = oc.createBufferSource()
      src.buffer = makeNoise(oc, 0.15)
      const f = oc.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = freq
      f.Q.value = 1.2
      const g = oc.createGain()
      g.gain.setValueAtTime(1, 0)
      g.gain.exponentialRampToValueAtTime(0.004, 0.12)
      src.connect(f)
      f.connect(g)
      g.connect(oc.destination)
      src.start(0)
    }).then((h) => {
      scrapeHowls[i] = h
    })
  })

  // deep boom + noise blast; rendered at reduced gain so the sum can't clip
  // the 16-bit WAV — the compressor squashes the level difference anyway
  renderToHowl(1.2, (oc) => {
    const boom = oc.createOscillator()
    boom.frequency.setValueAtTime(120, 0)
    boom.frequency.exponentialRampToValueAtTime(28, 0.7)
    const bg = oc.createGain()
    bg.gain.setValueAtTime(0.5, 0)
    bg.gain.exponentialRampToValueAtTime(0.001, 1.1)
    boom.connect(bg)
    bg.connect(oc.destination)
    boom.start(0)
    boom.stop(1.2)

    const src = oc.createBufferSource()
    src.buffer = makeNoise(oc, 1.1)
    const f = oc.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(5000, 0)
    f.frequency.exponentialRampToValueAtTime(300, 0.9)
    const g = oc.createGain()
    g.gain.setValueAtTime(0.39, 0)
    g.gain.exponentialRampToValueAtTime(0.001, 1)
    src.connect(f)
    f.connect(g)
    g.connect(oc.destination)
    src.start(0)
  }).then((h) => {
    explosionHowl = h
  })
}

// Gritty noise burst when grinding the canyon wall; intensity 0..1
export function playScrape(intensity) {
  if (!ctx || ctx.currentTime - lastScrape < 0.09) return
  const howl = scrapeHowls[Math.floor(Math.random() * scrapeHowls.length)]
  if (!howl) return // still rendering
  lastScrape = ctx.currentTime
  const id = howl.play()
  howl.volume(0.05 + intensity * 0.22, id)
  howl.rate(0.8 + Math.random() * 0.5, id)
}

// Deep boom + noise blast when a part of the ship explodes
export function playExplosion() {
  if (!explosionHowl) return
  const id = explosionHowl.play()
  explosionHowl.rate(0.92 + Math.random() * 0.16, id)
}

// -------------------------------------------------------------- helpers ---

function makeNoise(audioCtx, seconds) {
  const buffer = audioCtx.createBuffer(
    1,
    Math.ceil(seconds * audioCtx.sampleRate),
    audioCtx.sampleRate,
  )
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

async function renderToHowl(duration, build) {
  const rate = ctx.sampleRate
  const oc = new OfflineAudioContext(1, Math.ceil(duration * rate), rate)
  build(oc)
  const rendered = await oc.startRendering()
  const url = URL.createObjectURL(new Blob([encodeWav(rendered)], { type: 'audio/wav' }))
  return new Howl({ src: [url], format: ['wav'] })
}

// mono 16-bit PCM WAV
function encodeWav(buffer) {
  const data = buffer.getChannelData(0)
  const out = new DataView(new ArrayBuffer(44 + data.length * 2))
  const str = (off, s) => {
    for (let i = 0; i < s.length; i++) out.setUint8(off + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  out.setUint32(4, 36 + data.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  out.setUint32(16, 16, true)
  out.setUint16(20, 1, true) // PCM
  out.setUint16(22, 1, true) // mono
  out.setUint32(24, buffer.sampleRate, true)
  out.setUint32(28, buffer.sampleRate * 2, true)
  out.setUint16(32, 2, true)
  out.setUint16(34, 16, true)
  str(36, 'data')
  out.setUint32(40, data.length * 2, true)
  for (let i = 0; i < data.length; i++) {
    out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true)
  }
  return out.buffer
}
