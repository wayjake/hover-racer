// All sound is synthesized with the Web Audio API — no audio files.
// initAudio() must be called from a user gesture (browser autoplay policy).

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
  x ^= x >>> 15
  return x / 4294967296
}

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume()
    return
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)()

  master = ctx.createGain()
  master.gain.value = MASTER_VOL
  // compressor glues the mix and stops the engine drowning the music
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.ratio.value = 6
  master.connect(comp)
  comp.connect(ctx.destination)

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

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  sharedNoise = noise

  buildEngine()
  startMusic()
  audioState.ready = true
}

export function toggleMute() {
  if (!ctx) return
  audioState.muted = !audioState.muted
  master.gain.setTargetAtTime(audioState.muted ? 0 : MASTER_VOL, ctx.currentTime, 0.05)
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

let lastScrape = 0

// Gritty noise burst when grinding the canyon wall; intensity 0..1
export function playScrape(intensity) {
  if (!ctx || ctx.currentTime - lastScrape < 0.09) return
  lastScrape = ctx.currentTime
  const t = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = sharedNoise
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 500 + Math.random() * 1500
  f.Q.value = 1.2
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.05 + intensity * 0.22, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
  src.connect(f)
  f.connect(g)
  g.connect(master)
  src.start(t, Math.random())
  src.stop(t + 0.15)
}

// Deep boom + noise blast when a part of the ship explodes
export function playExplosion() {
  if (!ctx) return
  const t = ctx.currentTime
  const boom = ctx.createOscillator()
  boom.frequency.setValueAtTime(120, t)
  boom.frequency.exponentialRampToValueAtTime(28, t + 0.7)
  const bg = ctx.createGain()
  bg.gain.setValueAtTime(0.9, t)
  bg.gain.exponentialRampToValueAtTime(0.001, t + 1.1)
  boom.connect(bg)
  bg.connect(master)
  boom.start(t)
  boom.stop(t + 1.2)

  const src = ctx.createBufferSource()
  src.buffer = sharedNoise
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(5000, t)
  f.frequency.exponentialRampToValueAtTime(300, t + 0.9)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.7, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 1)
  src.connect(f)
  f.connect(g)
  g.connect(master)
  src.start(t)
  src.stop(t + 1.1)
}
