// CC BY-NC-SA 4.0 (Attribution-NonCommercial-ShareAlike) https://creativecommons.org/licenses/by-nc-sa/4.0/
const EPS = 1e-12;
const TWO_PI = 2 * Math.PI;

export const DEFAULT_3D_PARAMS = Object.freeze({
  dt: 0.04,
  speed: 1,
  muBins: 5,
  azimuthBins: 8,
  maxTurn: 12,
  horizontalSpread: 10,
  verticalSpread: 5,
  lineLength: 20,
  lineTransverseSpread: 1,
  lineAxialSpread: 1,
  lineVerticalSpread: 1,
});

export function gaussian(rand = Math.random){
  let u = 0;
  let v = 0;
  while(u === 0) u = 1 - rand();
  while(v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO_PI * v);
}

function finiteNumber(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, lo, hi){
  return Math.max(lo, Math.min(hi, value));
}

function normalize3(x, y, z, fallback = {x: 1, y: 0, z: 0}){
  const m = Math.hypot(x, y, z);
  if(!(m > EPS)) return {...fallback};
  return {x: x / m, y: y / m, z: z / m};
}

function randomUnitVector(rand = Math.random){
  const z = 2 * rand() - 1;
  const a = TWO_PI * rand();
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return {x: r * Math.cos(a), y: r * Math.sin(a), z};
}

function randomInBall(rx, rz, rand = Math.random){
  const dir = randomUnitVector(rand);
  const mag = Math.cbrt(rand());
  return {x: dir.x * rx * mag, y: dir.y * rx * mag, z: dir.z * rz * mag};
}

function clonePoint3(point){
  if(!point) return null;
  return {
    x: finiteNumber(point.x, 0),
    y: finiteNumber(point.y, 0),
    z: finiteNumber(point.z, 0),
  };
}

function clonePoints3(points){
  return (points ?? []).map(clonePoint3).filter(Boolean);
}

function maybeCopyArray(arr, copy){
  return copy ? new Float64Array(arr) : arr;
}

function tangentComponent(ax, ay, az, px, py, pz){
  const d = ax * px + ay * py + az * pz;
  return {x: ax - d * px, y: ay - d * py, z: az - d * pz};
}

function randomTangentVector(px, py, pz, rand = Math.random){
  return tangentComponent(gaussian(rand), gaussian(rand), gaussian(rand), px, py, pz);
}

function bodyFrame(px, py, pz){
  const p = normalize3(px, py, pz);
  const useZRef = Math.abs(p.z) < 0.9;
  const rx = 0;
  const ry = useZRef ? 0 : 1;
  const rz = useZRef ? 1 : 0;
  const e1 = normalize3(
    ry * p.z - rz * p.y,
    rz * p.x - rx * p.z,
    rx * p.y - ry * p.x,
    {x: 1, y: 0, z: 0},
  );
  const e2 = {
    x: p.y * e1.z - p.z * e1.y,
    y: p.z * e1.x - p.x * e1.z,
    z: p.x * e1.y - p.y * e1.x,
  };
  return {p, e1, e2};
}

function readBinConfig(config = {}){
  const params = config.params ?? config;
  const muBins = Math.max(1, Math.min(64, Math.round(finiteNumber(params.muBins, DEFAULT_3D_PARAMS.muBins))));
  const azimuthBins = Math.max(1, Math.min(128, Math.round(finiteNumber(params.azimuthBins, DEFAULT_3D_PARAMS.azimuthBins))));
  return {muBins, azimuthBins, binCount: muBins * azimuthBins};
}

function angularBinForDirection(rhatx, rhaty, rhatz, frame, muBins, azimuthBins){
  const mu = clamp(frame.p.x * rhatx + frame.p.y * rhaty + frame.p.z * rhatz, -1, 1);
  const u = rhatx * frame.e1.x + rhaty * frame.e1.y + rhatz * frame.e1.z;
  const v = rhatx * frame.e2.x + rhaty * frame.e2.y + rhatz * frame.e2.z;
  const az = Math.atan2(v, u);
  const muBin = clamp(Math.floor(((mu + 1) * 0.5) * muBins), 0, muBins - 1);
  const azBin = clamp(Math.floor(((az + Math.PI) / TWO_PI) * azimuthBins), 0, azimuthBins - 1);
  return {index: muBin * azimuthBins + azBin, mu};
}

function visualWeightFromMu(mu){
  return Math.max(0, 1 + clamp(mu, -1, 1));
}

export function createSimulationState3D(instanceParams = {}, initMode = 'random', rand = Math.random){
  const state = {
    n: 0,
    x: new Float64Array(0),
    y: new Float64Array(0),
    z: new Float64Array(0),
    px: new Float64Array(0),
    py: new Float64Array(0),
    pz: new Float64Array(0),
    vx: new Float64Array(0),
    vy: new Float64Array(0),
    vz: new Float64Array(0),
    turnX: new Float64Array(0),
    turnY: new Float64Array(0),
    turnZ: new Float64Array(0),
    baits: [],
    cp: {x: 0, y: 0, z: 0},
    pointerActive: false,
  };
  resetSimulationState3D(state, instanceParams, initMode, rand);
  return state;
}

export function resetSimulationState3D(state, instanceParams = {}, initMode = 'random', rand = Math.random){
  const n = Math.max(0, Math.round(finiteNumber(instanceParams.n, 0)));
  const horizontalSpread = Math.max(0, finiteNumber(instanceParams.horizontalSpread, DEFAULT_3D_PARAMS.horizontalSpread));
  const verticalSpread = Math.max(0, finiteNumber(instanceParams.verticalSpread, DEFAULT_3D_PARAMS.verticalSpread));
  const lineLength = Math.max(0, finiteNumber(instanceParams.lineLength, DEFAULT_3D_PARAMS.lineLength));
  const lineTransverseSpread = Math.max(0, finiteNumber(instanceParams.lineTransverseSpread, DEFAULT_3D_PARAMS.lineTransverseSpread));
  const lineAxialSpread = Math.max(0, finiteNumber(instanceParams.lineAxialSpread, DEFAULT_3D_PARAMS.lineAxialSpread));
  const lineVerticalSpread = Math.max(0, finiteNumber(instanceParams.lineVerticalSpread, DEFAULT_3D_PARAMS.lineVerticalSpread));
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const z = new Float64Array(n);
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const pz = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const vz = new Float64Array(n);
  const turnX = new Float64Array(n);
  const turnY = new Float64Array(n);
  const turnZ = new Float64Array(n);

  for(let i = 0; i < n; i++){
    if(initMode === 'line'){
      const t = n > 1 ? (i / (n - 1)) : 0.5;
      x[i] = gaussian(rand) * lineTransverseSpread;
      y[i] = (t - 0.5) * lineLength + gaussian(rand) * lineAxialSpread;
      z[i] = gaussian(rand) * lineVerticalSpread;
      px[i] = 1;
      py[i] = 0;
      pz[i] = 0;
    } else if(initMode === 'ball'){
      const pos = randomInBall(horizontalSpread, verticalSpread, rand);
      x[i] = pos.x;
      y[i] = pos.y;
      z[i] = pos.z;
      const dir = randomUnitVector(rand);
      px[i] = dir.x;
      py[i] = dir.y;
      pz[i] = dir.z;
    } else {
      x[i] = gaussian(rand) * horizontalSpread;
      y[i] = gaussian(rand) * horizontalSpread;
      z[i] = gaussian(rand) * verticalSpread;
      const dir = randomUnitVector(rand);
      px[i] = dir.x;
      py[i] = dir.y;
      pz[i] = dir.z;
    }
    vx[i] = px[i];
    vy[i] = py[i];
    vz[i] = pz[i];
  }

  state.n = n;
  state.x = x;
  state.y = y;
  state.z = z;
  state.px = px;
  state.py = py;
  state.pz = pz;
  state.vx = vx;
  state.vy = vy;
  state.vz = vz;
  state.turnX = turnX;
  state.turnY = turnY;
  state.turnZ = turnZ;
}

export function cloneStatePayload3D(state, {copyArrays = true} = {}){
  return {
    n: state.n >>> 0,
    x: maybeCopyArray(state.x, copyArrays),
    y: maybeCopyArray(state.y, copyArrays),
    z: maybeCopyArray(state.z, copyArrays),
    px: maybeCopyArray(state.px, copyArrays),
    py: maybeCopyArray(state.py, copyArrays),
    pz: maybeCopyArray(state.pz, copyArrays),
    vx: maybeCopyArray(state.vx, copyArrays),
    vy: maybeCopyArray(state.vy, copyArrays),
    vz: maybeCopyArray(state.vz, copyArrays),
    turnX: maybeCopyArray(state.turnX, copyArrays),
    turnY: maybeCopyArray(state.turnY, copyArrays),
    turnZ: maybeCopyArray(state.turnZ, copyArrays),
    baits: clonePoints3(state.baits),
    cp: clonePoint3(state.cp) ?? {x: 0, y: 0, z: 0},
    pointerActive: !!state.pointerActive,
  };
}

export function stateFromPayload3D(payload){
  return {
    n: payload.n >>> 0,
    x: payload.x,
    y: payload.y,
    z: payload.z,
    px: payload.px,
    py: payload.py,
    pz: payload.pz,
    vx: payload.vx,
    vy: payload.vy,
    vz: payload.vz,
    turnX: payload.turnX,
    turnY: payload.turnY,
    turnZ: payload.turnZ,
    baits: clonePoints3(payload.baits),
    cp: clonePoint3(payload.cp) ?? {x: 0, y: 0, z: 0},
    pointerActive: !!payload.pointerActive,
  };
}

export function getTransferListFromPayload3D(payload){
  return [
    payload.x.buffer,
    payload.y.buffer,
    payload.z.buffer,
    payload.px.buffer,
    payload.py.buffer,
    payload.pz.buffer,
    payload.vx.buffer,
    payload.vy.buffer,
    payload.vz.buffer,
    payload.turnX.buffer,
    payload.turnY.buffer,
    payload.turnZ.buffer,
  ];
}

export function meanPoint3D(state){
  const n = state.n >>> 0;
  if(!n) return {x: 0, y: 0, z: 0};
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for(let i = 0; i < n; i++){
    sx += state.x[i];
    sy += state.y[i];
    sz += state.z[i];
  }
  return {x: sx / n, y: sy / n, z: sz / n};
}

export function computeFrameMetrics3D(state){
  const n = state.n >>> 0;
  if(!n) return {meanX: 0, meanY: 0, meanZ: 0, pol: 0, pi: 0};
  const center = meanPoint3D(state);
  let spx = 0;
  let spy = 0;
  let spz = 0;
  let lx = 0;
  let ly = 0;
  let lz = 0;
  for(let i = 0; i < n; i++){
    spx += state.px[i];
    spy += state.py[i];
    spz += state.pz[i];
    const rx = state.x[i] - center.x;
    const ry = state.y[i] - center.y;
    const rz = state.z[i] - center.z;
    const rMag = Math.hypot(rx, ry, rz);
    const vMag = Math.hypot(state.vx[i], state.vy[i], state.vz[i]);
    if(rMag < 1e-9 || vMag < 1e-9) continue;
    const rhatx = rx / rMag;
    const rhaty = ry / rMag;
    const rhatz = rz / rMag;
    const vhatx = state.vx[i] / vMag;
    const vhaty = state.vy[i] / vMag;
    const vhatz = state.vz[i] / vMag;
    lx += rhaty * vhatz - rhatz * vhaty;
    ly += rhatz * vhatx - rhatx * vhatz;
    lz += rhatx * vhaty - rhaty * vhatx;
  }
  return {
    meanX: center.x,
    meanY: center.y,
    meanZ: center.z,
    pol: Math.hypot(spx / n, spy / n, spz / n),
    pi: Math.hypot(lx / n, ly / n, lz / n),
  };
}

export function buildAngularNearestNeighborhood3D(state, config = {}){
  const n = state.n >>> 0;
  const params = {...DEFAULT_3D_PARAMS, ...(config.params ?? config)};
  const {muBins, azimuthBins, binCount} = readBinConfig(params);
  const indices = new Int32Array(n * binCount);
  const dist2 = new Float64Array(n * binCount);
  const mu = new Float64Array(n * binCount);
  const counts = new Uint16Array(n);
  indices.fill(-1);
  dist2.fill(Infinity);
  mu.fill(NaN);

  for(let i = 0; i < n; i++){
    const frame = bodyFrame(state.px[i], state.py[i], state.pz[i]);
    for(let j = 0; j < n; j++){
      if(i === j) continue;
      const dx = state.x[j] - state.x[i];
      const dy = state.y[j] - state.y[i];
      const dz = state.z[j] - state.z[i];
      const d2 = dx * dx + dy * dy + dz * dz;
      if(d2 < EPS) continue;
      const invD = 1 / Math.sqrt(d2);
      const bin = angularBinForDirection(dx * invD, dy * invD, dz * invD, frame, muBins, azimuthBins);
      const weight = visualWeightFromMu(bin.mu, params);
      if(weight <= 0) continue;
      const slot = i * binCount + bin.index;
      if(d2 < dist2[slot]){
        if(indices[slot] < 0) counts[i]++;
        indices[slot] = j;
        dist2[slot] = d2;
        mu[slot] = bin.mu;
      }
    }
  }

  return {indices, dist2, mu, counts, muBins, azimuthBins, binCount};
}

function addTargetSteering(state, i, target, strength, px, py, pz){
  if(!(strength > 0) || !target) return {x: 0, y: 0, z: 0};
  const dx = target.x - state.x[i];
  const dy = target.y - state.y[i];
  const dz = target.z - state.z[i];
  const dist = Math.hypot(dx, dy, dz);
  if(dist < EPS) return {x: 0, y: 0, z: 0};
  const tangent = tangentComponent(dx / dist, dy / dist, dz / dist, px, py, pz);
  return {x: strength * tangent.x, y: strength * tangent.y, z: strength * tangent.z};
}

export function computeStep3D(state, config = {}){
  const rand = config.random ?? Math.random;
  const params = {...DEFAULT_3D_PARAMS, ...(config.params ?? {})};
  const instanceParams = config.instanceParams ?? {};
  const n = state.n >>> 0;
  if(!n) return state;

  const dt = Math.max(0, finiteNumber(params.dt, DEFAULT_3D_PARAMS.dt));
  const speed = Math.max(0, finiteNumber(params.speed, DEFAULT_3D_PARAMS.speed));
  const alignmentStrength = Math.max(0, finiteNumber(instanceParams.Ia, finiteNumber(params.alignmentStrength, 1.5)));
  const noiseStrength = Math.max(0, finiteNumber(instanceParams.In, finiteNumber(params.noiseStrength, 0.3)));
  const maxTurn = Math.max(0, finiteNumber(params.maxTurn, DEFAULT_3D_PARAMS.maxTurn));
  const baitStrength = Math.max(0, finiteNumber(params.baitStrength, 1));
  const pointerStrength = Math.max(0, finiteNumber(params.pointerStrength, 0));
  const neighborhood = buildAngularNearestNeighborhood3D(state, params);
  const {binCount} = neighborhood;

  for(let i = 0; i < n; i++){
    const p = normalize3(state.px[i], state.py[i], state.pz[i]);
    state.px[i] = p.x;
    state.py[i] = p.y;
    state.pz[i] = p.z;

    let tx = 0;
    let ty = 0;
    let tz = 0;
    let denom = 0;
    for(let bin = 0; bin < binCount; bin++){
      const slot = i * binCount + bin;
      const j = neighborhood.indices[slot];
      if(j < 0) continue;
      const d2 = neighborhood.dist2[slot];
      if(d2 < EPS) continue;

      const weight = visualWeightFromMu(neighborhood.mu[slot], params);
      if(weight <= 0) continue;
      const align = tangentComponent(state.px[j], state.py[j], state.pz[j], p.x, p.y, p.z);
      tx += weight * alignmentStrength * align.x;
      ty += weight * alignmentStrength * align.y;
      tz += weight * alignmentStrength * align.z;
      denom += weight;
    }

    if(denom > EPS){
      tx /= denom;
      ty /= denom;
      tz /= denom;
    }
    if(state.baits?.length){
      for(const bait of state.baits){
        const steer = addTargetSteering(state, i, bait, baitStrength, p.x, p.y, p.z);
        tx += steer.x;
        ty += steer.y;
        tz += steer.z;
      }
    }
    if(state.pointerActive){
      const steer = addTargetSteering(state, i, state.cp, pointerStrength, p.x, p.y, p.z);
      tx += steer.x;
      ty += steer.y;
      tz += steer.z;
    }

    const turnMag = Math.hypot(tx, ty, tz);
    if(maxTurn > 0 && turnMag > maxTurn){
      const scale = maxTurn / turnMag;
      tx *= scale;
      ty *= scale;
      tz *= scale;
    }
    state.turnX[i] = tx;
    state.turnY[i] = ty;
    state.turnZ[i] = tz;
  }

  const noiseScale = noiseStrength * Math.sqrt(dt);
  for(let i = 0; i < n; i++){
    const px0 = state.px[i];
    const py0 = state.py[i];
    const pz0 = state.pz[i];
    state.x[i] += speed * px0 * dt;
    state.y[i] += speed * py0 * dt;
    state.z[i] += speed * pz0 * dt;

    const noise = randomTangentVector(px0, py0, pz0, rand);
    const next = normalize3(
      px0 + state.turnX[i] * dt + noiseScale * noise.x,
      py0 + state.turnY[i] * dt + noiseScale * noise.y,
      pz0 + state.turnZ[i] * dt + noiseScale * noise.z,
      {x: px0, y: py0, z: pz0},
    );
    state.px[i] = next.x;
    state.py[i] = next.y;
    state.pz[i] = next.z;
    state.vx[i] = speed * next.x;
    state.vy[i] = speed * next.y;
    state.vz[i] = speed * next.z;
  }

  return state;
}

export function snapshotForRecording3D(state, simId, tSec){
  const n = state.n >>> 0;
  const fish = new Float32Array(n * 6);
  for(let i = 0; i < n; i++){
    const k = i * 6;
    fish[k] = state.x[i];
    fish[k + 1] = state.y[i];
    fish[k + 2] = state.z[i];
    fish[k + 3] = state.px[i];
    fish[k + 4] = state.py[i];
    fish[k + 5] = state.pz[i];
  }
  const metrics = computeFrameMetrics3D(state);
  return {tSec, simId, n, fish, pol: metrics.pol, pi: metrics.pi};
}
