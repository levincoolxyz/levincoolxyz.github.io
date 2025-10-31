const ctx = new (window.AudioContext || window.webkitAudioContext)();
let buf = null, playing = false;

const params = {
  grainSize: 0.060,  // seconds
  density: 30,       // grains per second
  transpose: 0,      // semitones
  spray: 0.015,      // seconds
  scanRate: 1.0,     // 1 = normal speed scan through buffer
  position: 0.0      // seconds, center of scan
};

function semitonesToRate(st){ return Math.pow(2, st/12); }

// Precompute a Hann window curve for up to 200 ms at 48 kHz
function hann(N){ const a = new Float32Array(N); for(let n=0;n<N;n++){ a[n]=0.5*(1-Math.cos(2*Math.PI*n/(N-1))); } return a; }
const MAX_WIN_SAMPLES = 0.2 * 48000;
const HANN = hann(MAX_WIN_SAMPLES);

function makeGrain(startTime, offset, duration, rate, panVal=0){
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;

  const g = ctx.createGain();
  const p = ctx.createStereoPanner();

  // Envelope
  const N = Math.max(4, Math.min(HANN.length, Math.floor(duration * ctx.sampleRate)));
  const curve = (N === HANN.length) ? HANN : HANN.slice(0, N);
  g.gain.cancelScheduledValues(startTime);
  g.gain.setValueCurveAtTime(curve, startTime, duration);

  src.connect(g); g.connect(p); p.connect(ctx.destination);
  p.pan.setValueAtTime(panVal, startTime);

  // Start: (when, offsetInBuffer, grainDuration)
  const safeOffset = Math.max(0, Math.min(buf.duration - duration, offset));
  src.start(startTime, safeOffset, duration);

  // GC cleanup
  src.stop(startTime + duration + 0.05);
  src.onended = () => { src.disconnect(); g.disconnect(); p.disconnect(); };
}

// Look-ahead scheduler
let schedulerTimer = null;
const lookAhead = 0.1;      // seconds of audio to schedule ahead
const tick = 0.025;         // seconds between scheduling passes
let scanPos = 0;            // seconds within buffer

function scheduler(){
  const now = ctx.currentTime;
  const rate = semitonesToRate(params.transpose);
  const grainsToSchedule = Math.ceil(params.density * lookAhead);

  const period = 1 / params.density;
  for(let i=0;i<grainsToSchedule;i++){
    const t = now + i*period;
    const d = params.grainSize;
    // Update scanning position (synchronous granular): advance by scanRate*period
    scanPos = (scanPos + params.scanRate * period) % (buf ? buf.duration : 1);

    const jitter = (Math.random()*2-1) * params.spray;
    const offset = Math.max(0, Math.min(buf.duration, params.position + jitter + scanPos));
    const panVal = (Math.random()*2-1); // stereo spread; scale if you add a UI knob

    makeGrain(t, offset, d, rate, panVal);
  }
}

function startEngine(){
  if (!buf || playing) return;
  playing = true;
  // initialize scan position around current params.position
  scanPos = 0;
  function loop(){
    if (!playing) return;
    scheduler();
    schedulerTimer = setTimeout(loop, tick*1000);
  }
  loop();
}

function stopEngine(){
  playing = false;
  if (schedulerTimer) clearTimeout(schedulerTimer);
}

// Wire UI
document.getElementById('file').addEventListener('change', async (e)=>{
  const file = e.target.files[0]; if (!file) return;
  const ab = await file.arrayBuffer();
  buf = await ctx.decodeAudioData(ab);
  params.position = Math.min(params.position, buf.duration*0.5);
});
document.getElementById('grain').oninput = e => params.grainSize = Math.max(0.005, e.target.value/1000);
document.getElementById('dens').oninput  = e => params.density   = Math.max(1, +e.target.value);
document.getElementById('semi').oninput  = e => params.transpose = +e.target.value;
document.getElementById('spray').oninput = e => params.spray     = e.target.value/1000;
document.getElementById('scan').oninput  = e => params.scanRate  = +e.target.value;

document.getElementById('play').onclick = async ()=>{
  if (ctx.state !== 'running') await ctx.resume();
  if (playing) { stopEngine(); e.target.textContent='Play'; }
  else { startEngine(); e.target.textContent='Pause'; }
};

// Autoplay policy: resume context on first user gesture (handled above).
