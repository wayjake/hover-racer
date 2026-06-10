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
  master.connect(ctx.destination)

  engineBus = ctx.createGain()
  engineBus.connect(master)

  musicBus = ctx.createGain()
  musicBus.gain.value = 0.5
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
  const t = ctx.currentTime
  const k = 0.06
  const base = 42 + f * 150 + (boost ? 50 : 0)
  engine.oscA.frequency.setTargetAtTime(base, t, k)
  engine.oscB.frequency.setTargetAtTime(base * 1.01, t, k)
  engine.whine.frequency.setTargetAtTime(base * 6, t, k)
  engine.filter.frequency.setTargetAtTime(320 + f * 2800 + (boost ? 1500 : 0), t, k)
  engine.out.gain.setTargetAtTime(0.07 + f * 0.16 + (boost ? 0.08 : 0), t, k)
  engine.whineGain.gain.setTargetAtTime(0.015 + f * 0.05 + (boost ? 0.07 : 0), t, k)
  engine.noiseGain.gain.setTargetAtTime(0.02 + f * 0.12 + (boost ? 0.06 : 0), t, k)
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
  // bass riff on quarter notes
  if (st % 2 === 0) {
    const semis = track.bass[(st >> 1) % track.bass.length]
    note(time, track.root * 2 ** (semis / 12), stepDur * 1.8, track.bassWave, 0.15, musicBus)
  }

  // sparse lead melody, deterministic per track so phrases repeat
  const h = hash(st * 7 + trackIdx * 131)
  if (h < track.leadDensity) {
    const deg = track.scale[Math.floor(hash(st * 13 + 5) * track.scale.length)]
    const octave = h < track.leadDensity / 3 ? 4 : 2
    note(time, track.root * octave * 2 ** (deg / 12), stepDur * 3, track.leadWave, 0.06, delayIn)
  }

  if (track.hat && st % 2 === 1) hat(time)
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

function hat(time) {
  const src = ctx.createBufferSource()
  src.buffer = sharedNoise
  const f = ctx.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = 6000
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.045, time)
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
  g.gain.setTargetAtTime(0.045, ctx.currentTime, 1.5)
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
