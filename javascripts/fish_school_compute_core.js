// CC BY-NC-SA 4.0 (Attribution-NonCommercial-ShareAlike) https://creativecommons.org/licenses/by-nc-sa/4.0/
const ERR_TOL = 1e-12;
const SHARK_HEAD_OFFSET = 1.5;
const WHALE_HEAD_OFFSET = 0.8;

export function gaussian(rand = Math.random){
  let u = 0;
  let v = 0;
  while(u === 0) u = 1 - rand();
  while(v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function wrapAngle(a){
  a = (a + Math.PI) % (Math.PI * 2);
  if(a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

export function getAngle(phi, dx, dy, dist){
  const r = dist ?? Math.hypot(dx, dy);
  if(!Number.isFinite(r) || r === 0) return 0;
  const rx = dx / r;
  const ry = dy / r;
  const ex = Math.cos(phi);
  const ey = Math.sin(phi);
  let cross = ex * ry - ey * rx;
  let dot = ex * rx + ey * ry;
  cross = Math.max(-1, Math.min(1, cross));
  dot = Math.max(-1, Math.min(1, dot));
  let theta = Math.acos(dot);
  if(cross < 0) theta = -theta;
  return theta;
}

export function createSimulationState(instanceParams, initMode = 'random', rand = Math.random){
  const state = {
    n: 0,
    x: new Float64Array(0),
    y: new Float64Array(0),
    theta: new Float64Array(0),
    vx: new Float64Array(0),
    vy: new Float64Array(0),
    w: new Float64Array(0),
    baits: [],
    sharkGoal: null,
    cp: {x: 0, y: 0},
    pointerActive: false,
    pointerInside: false,
    sharkState: {x: -25, y: 0, theta: 0},
    whaleState: {x: 0, y: -25, theta: Math.PI / 2},
  };
  resetSimulationState(state, instanceParams, initMode, rand);
  return state;
}

export function resetSimulationState(state, instanceParams, initMode = 'random', rand = Math.random){
  const n = Math.max(0, Math.round(Number(instanceParams?.n ?? 0) || 0));
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const theta = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const w = new Float64Array(n);

  if(initMode === 'line'){
    for(let i = 0; i < n; i++){
      const t = n > 1 ? (i / (n - 1)) : 0.5;
      y[i] = -10 + 20 * t + gaussian(rand) + gaussian(rand);
      x[i] = gaussian(rand);
      theta[i] = 0;
    }
  } else {
    for(let i = 0; i < n; i++){
      x[i] = gaussian(rand) * 10;
      y[i] = gaussian(rand) * 10;
      theta[i] = rand() * Math.PI * 2;
    }
  }

  state.n = n;
  state.x = x;
  state.y = y;
  state.theta = theta;
  state.vx = vx;
  state.vy = vy;
  state.w = w;
}

function cloneBaits(baits){
  return (baits ?? []).map((bait) => ({x: Number(bait.x) || 0, y: Number(bait.y) || 0}));
}

function clonePoint(point){
  if(!point) return null;
  return {x: Number(point.x) || 0, y: Number(point.y) || 0};
}

function clonePose(pose, fallback){
  const src = pose ?? fallback;
  return {
    x: Number(src?.x ?? fallback.x) || 0,
    y: Number(src?.y ?? fallback.y) || 0,
    theta: Number(src?.theta ?? fallback.theta) || 0,
  };
}

function maybeCopyArray(arr, copy){
  return copy ? new Float64Array(arr) : arr;
}

export function cloneStatePayload(state, {copyArrays = true} = {}){
  return {
    n: state.n >>> 0,
    x: maybeCopyArray(state.x, copyArrays),
    y: maybeCopyArray(state.y, copyArrays),
    theta: maybeCopyArray(state.theta, copyArrays),
    vx: maybeCopyArray(state.vx, copyArrays),
    vy: maybeCopyArray(state.vy, copyArrays),
    w: maybeCopyArray(state.w, copyArrays),
    baits: cloneBaits(state.baits),
    sharkGoal: clonePoint(state.sharkGoal),
    cp: clonePoint(state.cp) ?? {x: 0, y: 0},
    pointerActive: !!state.pointerActive,
    pointerInside: !!state.pointerInside,
    sharkState: clonePose(state.sharkState, {x: -25, y: 0, theta: 0}),
    whaleState: clonePose(state.whaleState, {x: 0, y: -25, theta: Math.PI / 2}),
  };
}

export function stateFromPayload(payload){
  return {
    n: payload.n >>> 0,
    x: payload.x,
    y: payload.y,
    theta: payload.theta,
    vx: payload.vx,
    vy: payload.vy,
    w: payload.w,
    baits: cloneBaits(payload.baits),
    sharkGoal: clonePoint(payload.sharkGoal),
    cp: clonePoint(payload.cp) ?? {x: 0, y: 0},
    pointerActive: !!payload.pointerActive,
    pointerInside: !!payload.pointerInside,
    sharkState: clonePose(payload.sharkState, {x: -25, y: 0, theta: 0}),
    whaleState: clonePose(payload.whaleState, {x: 0, y: -25, theta: Math.PI / 2}),
  };
}

export function getTransferListFromPayload(payload){
  return [
    payload.x.buffer,
    payload.y.buffer,
    payload.theta.buffer,
    payload.vx.buffer,
    payload.vy.buffer,
    payload.w.buffer,
  ];
}

export function meanPoint(state){
  const n = state.n;
  if(!n) return {x: 0, y: 0};
  let sx = 0;
  let sy = 0;
  for(let i = 0; i < n; i++){
    sx += state.x[i];
    sy += state.y[i];
  }
  return {x: sx / n, y: sy / n};
}

export function computeFrameMetrics(state){
  const n = state.n;
  if(!n){
    return {meanX: 0, meanY: 0, pol: 0, pi: 0};
  }

  let cx = 0;
  let cy = 0;
  let sumCos = 0;
  let sumSin = 0;
  for(let i = 0; i < n; i++){
    cx += state.x[i];
    cy += state.y[i];
    sumCos += Math.cos(state.theta[i]);
    sumSin += Math.sin(state.theta[i]);
  }
  cx /= n;
  cy /= n;

  let angularMomentumSum = 0;
  for(let i = 0; i < n; i++){
    const rx = state.x[i] - cx;
    const ry = state.y[i] - cy;
    const r = Math.hypot(rx, ry);
    if(r < 1e-9) continue;
    const rhatx = rx / r;
    const rhaty = ry / r;
    let vx = state.vx?.[i];
    let vy = state.vy?.[i];
    let speed = Math.hypot(vx, vy);
    if(!Number.isFinite(speed) || speed < 1e-12){
      vx = Math.cos(state.theta[i]);
      vy = Math.sin(state.theta[i]);
      speed = 1;
    }
    const vhatx = vx / speed;
    const vhaty = vy / speed;
    angularMomentumSum += (rhatx * vhaty - rhaty * vhatx);
  }
  const pi = Math.abs(angularMomentumSum / n);

  return {
    meanX: cx,
    meanY: cy,
    pol: Math.hypot(sumCos / n, sumSin / n),
    pi,
  };
}

export function snapshotForRecording(state, simId, stateFlags, tSec){
  const n = state.n;
  const fish = new Float32Array(n * 3);
  const metrics = computeFrameMetrics(state);
  for(let i = 0; i < n; i++){
    const k = i * 3;
    fish[k] = state.x[i];
    fish[k + 1] = state.y[i];
    fish[k + 2] = state.theta[i];
  }
  const sharkOn = !!stateFlags?.shark;
  const whaleOn = !!stateFlags?.whale;
  const shark = new Float32Array([
    sharkOn ? state.sharkState.x : NaN,
    sharkOn ? state.sharkState.y : NaN,
    sharkOn ? state.sharkState.theta : NaN,
  ]);
  const whale = new Float32Array([
    whaleOn ? state.whaleState.x : NaN,
    whaleOn ? state.whaleState.y : NaN,
    whaleOn ? state.whaleState.theta : NaN,
  ]);
  return {
    tSec,
    simId,
    n,
    fish,
    pol: metrics.pol,
    pi: metrics.pi,
    shark,
    whale,
    sharkOn,
    whaleOn,
  };
}

function getSharkHeadPos(sharkState, dir){
  const ex = dir?.x ?? Math.cos(sharkState.theta);
  const ey = dir?.y ?? Math.sin(sharkState.theta);
  return {
    x: sharkState.x + ex * SHARK_HEAD_OFFSET,
    y: sharkState.y + ey * SHARK_HEAD_OFFSET,
  };
}

function getWhaleHeadPos(whaleState, dir){
  const ex = dir?.x ?? Math.cos(whaleState.theta);
  const ey = dir?.y ?? Math.sin(whaleState.theta);
  return {
    x: whaleState.x + ex * WHALE_HEAD_OFFSET,
    y: whaleState.y + ey * WHALE_HEAD_OFFSET,
  };
}

function addPredatorFlow(state, predState, factor, params, Ux, Uy, wHydro){
  for(let i = 0; i < state.n; i++){
    const dx = state.x[i] - predState.x;
    const dy = state.y[i] - predState.y;
    const r2 = dx * dx + dy * dy;
    if(r2 < ERR_TOL) continue;
    const invr4 = 1 / (r2 * r2);
    const invr6 = invr4 / r2;
    const c2r = dx * dx - dy * dy;
    const c2i = -2 * dx * dy;
    const c3r = c2r * dx + c2i * dy;
    const c3i = c2r * (-dy) + c2i * dx;
    const expR = Math.cos(predState.theta);
    const expI = Math.sin(predState.theta);
    const expTermR = Math.cos(2 * state.theta[i] + predState.theta);
    const expTermI = Math.sin(2 * state.theta[i] + predState.theta);
    const termUr = expR * c2r - expI * c2i;
    const termUi = expR * c2i + expI * c2r;
    const termWi = expTermR * c3i + expTermI * c3r;
    Ux[i] += termUr * invr4 / Math.PI * params.If * factor;
    Uy[i] += -termUi * invr4 / Math.PI * params.If * factor;
    wHydro[i] += termWi * invr6 * 2 / Math.PI * params.If * factor;
  }
}

function applySharkEvade(state, params, wVision){
  const esk = {x: Math.cos(state.sharkState.theta), y: Math.sin(state.sharkState.theta)};
  const orth = {x: -esk.y, y: esk.x};
  const sharkHead = getSharkHeadPos(state.sharkState, esk);
  for(let i = 0; i < state.n; i++){
    const d = Math.hypot(sharkHead.x - state.x[i], sharkHead.y - state.y[i]);
    if(d === 0) continue;
    const dop1 = Math.hypot(sharkHead.x - orth.x - state.x[i], sharkHead.y - orth.y - state.y[i]);
    const dop2 = Math.hypot(sharkHead.x + orth.x - state.x[i], sharkHead.y + orth.y - state.y[i]);
    const sign = dop1 <= dop2 ? -1 : 1;
    const wSk = getAngle(state.theta[i], orth.x * sign, orth.y * sign);
    const blend = Math.exp(params.sharkH - d);
    wVision[i] = (wVision[i] + wSk * blend) / (1 + blend);
  }
}

function applyWhaleEvade(state, params, wVision){
  const ewh = {x: Math.cos(state.whaleState.theta), y: Math.sin(state.whaleState.theta)};
  const orth = {x: -ewh.y, y: ewh.x};
  for(let i = 0; i < state.n; i++){
    const dx = state.whaleState.x - state.x[i];
    const dy = state.whaleState.y - state.y[i];
    const d = Math.hypot(dx, dy);
    if(d === 0) continue;
    const dop1 = Math.hypot(state.whaleState.x - orth.x - state.x[i], state.whaleState.y - orth.y - state.y[i]);
    const dop2 = Math.hypot(state.whaleState.x + orth.x - state.x[i], state.whaleState.y + orth.y - state.y[i]);
    const sign = dop1 <= dop2 ? -1 : 1;
    const unitX = dx / d;
    const unitY = dy / d;
    const wWh = getAngle(state.theta[i], orth.x * sign - unitX, orth.y * sign - unitY);
    const blend = Math.exp(params.whaleH - d);
    wVision[i] = (wVision[i] + wWh * blend) / (1 + blend);
  }
}

function updateShark(state, params, stateFlags, Ux, Uy, rand){
  if(!state.n) return;
  const dt = params.dt;
  const esk = {x: Math.cos(state.sharkState.theta), y: Math.sin(state.sharkState.theta)};
  const head = getSharkHeadPos(state.sharkState, esk);
  if(stateFlags.hard){
    let bestDx = 0;
    let bestDy = 0;
    let bestDist = Infinity;
    const phiC = Math.PI / 2;
    for(let i = 0; i < state.n; i++){
      const dx = state.x[i] - head.x;
      const dy = state.y[i] - head.y;
      const dist = Math.hypot(dx, dy);
      const phi = getAngle(state.sharkState.theta, dx, dy, dist);
      if(Math.abs(phi) < phiC && dist < bestDist){
        bestDx = dx;
        bestDy = dy;
        bestDist = dist;
      }
    }
    if(!Number.isFinite(bestDist)){
      for(let i = 0; i < state.n; i++){
        const dx = state.x[i] - head.x;
        const dy = state.y[i] - head.y;
        const dist = Math.hypot(dx, dy);
        if(dist < bestDist){
          bestDx = dx;
          bestDy = dy;
          bestDist = dist;
        }
      }
    }
    if(Number.isFinite(bestDist)){
      let turn = getAngle(state.sharkState.theta, bestDx, bestDy, bestDist);
      turn = Math.exp(-turn * turn / (Math.PI * Math.PI)) * turn;
      state.sharkState.theta = wrapAngle(state.sharkState.theta + turn * dt);
    }
    state.sharkState.x += esk.x * dt * 1.5;
    state.sharkState.y += esk.y * dt * 1.5;
    return;
  }
  if(state.sharkGoal){
    const dx = state.sharkGoal.x - head.x;
    const dy = state.sharkGoal.y - head.y;
    const dist = Math.hypot(dx, dy);
    let turn = getAngle(state.sharkState.theta, dx, dy, dist);
    turn = Math.exp(-turn * turn / (Math.PI * Math.PI)) * turn;
    state.sharkState.theta = wrapAngle(state.sharkState.theta + turn * dt);
    state.sharkState.x += esk.x * dt * 1.5;
    state.sharkState.y += esk.y * dt * 1.5;
    return;
  }
  const idx = Math.min(state.n - 1, Math.floor(state.n * 187 / 500));
  const noise = gaussian(rand) / Math.sqrt(dt);
  state.sharkState.x += esk.x * dt * 1.5 + Ux[idx] * dt;
  state.sharkState.y += esk.y * dt * 1.5 + Uy[idx] * dt;
  state.sharkState.theta = wrapAngle(state.sharkState.theta + ((state.w[idx] ?? 0) + noise) * 0.1 * dt);
}

function updateWhale(state, params, stateFlags, Ux, Uy, rand){
  if(!state.n) return;
  const dt = params.dt;
  const ewh = {x: Math.cos(state.whaleState.theta), y: Math.sin(state.whaleState.theta)};
  if(stateFlags.whaleFollow && state.pointerInside){
    const dx = state.cp.x - state.whaleState.x;
    const dy = state.cp.y - state.whaleState.y;
    const dist = Math.hypot(dx, dy);
    if(dist > ERR_TOL){
      let turn = getAngle(state.whaleState.theta, dx, dy, dist);
      turn = Math.exp(-turn * turn / (Math.PI * Math.PI)) * turn;
      state.whaleState.theta = wrapAngle(state.whaleState.theta + turn * dt);
    }
    const ex = Math.cos(state.whaleState.theta);
    const ey = Math.sin(state.whaleState.theta);
    state.whaleState.x += ex * dt / 1.5;
    state.whaleState.y += ey * dt / 1.5;
    return;
  }

  if(stateFlags.hard){
    const phiC = Math.PI / 2;
    let subset = null;
    let subsetCount = 0;
    for(let i = 0; i < state.n; i++){
      const dx = state.x[i] - state.whaleState.x;
      const dy = state.y[i] - state.whaleState.y;
      const dist = Math.hypot(dx, dy);
      const phi = getAngle(state.whaleState.theta, dx, dy, dist);
      if(Math.abs(phi) < phiC){
        if(!subset) subset = new Uint32Array(state.n);
        subset[subsetCount++] = i;
      }
    }
    let tx = 0;
    let ty = 0;
    if(subsetCount > 0){
      const xs = new Float64Array(subsetCount);
      const ys = new Float64Array(subsetCount);
      for(let i = 0; i < subsetCount; i++){
        xs[i] = state.x[subset[i]];
        ys[i] = state.y[subset[i]];
      }
      xs.sort();
      ys.sort();
      const mid = Math.floor(subsetCount / 2);
      tx = subsetCount % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
      ty = subsetCount % 2 ? ys[mid] : (ys[mid - 1] + ys[mid]) / 2;
    } else {
      const center = meanPoint(state);
      tx = center.x;
      ty = center.y;
    }
    const dx = tx - state.whaleState.x;
    const dy = ty - state.whaleState.y;
    const dist = Math.hypot(dx, dy);
    let turn = getAngle(state.whaleState.theta, dx, dy, dist);
    turn = Math.exp(-turn * turn / (Math.PI * Math.PI)) * turn;
    state.whaleState.theta = wrapAngle(state.whaleState.theta + turn * dt);
    state.whaleState.x += ewh.x * dt;
    state.whaleState.y += ewh.y * dt;
    return;
  }

  const idx = Math.min(state.n - 1, Math.floor(state.n * 234 / 500));
  const noise = gaussian(rand) / Math.sqrt(dt);
  state.whaleState.x += ewh.x * dt / 1.5 + Ux[idx] * dt;
  state.whaleState.y += ewh.y * dt / 1.5 + Uy[idx] * dt;
  state.whaleState.theta = wrapAngle(state.whaleState.theta + ((state.w[idx] ?? 0) + noise) * 0.1 * dt);
}

function compactAfterDeaths(state, params, stateFlags){
  if(!stateFlags.death || (!stateFlags.shark && !stateFlags.whale) || state.n === 0) return false;
  const sharkHead = stateFlags.shark ? getSharkHeadPos(state.sharkState) : null;
  const whaleHead = stateFlags.whale ? getWhaleHeadPos(state.whaleState) : null;
  let survivors = 0;
  for(let i = 0; i < state.n; i++){
    let dead = false;
    if(sharkHead){
      const d = Math.hypot(state.x[i] - sharkHead.x, state.y[i] - sharkHead.y);
      if(d <= params.sharkH / 3) dead = true;
    }
    if(!dead && whaleHead){
      const d = Math.hypot(state.x[i] - whaleHead.x, state.y[i] - whaleHead.y);
      if(d <= params.whaleH / 3) dead = true;
    }
    if(dead) continue;
    if(survivors !== i){
      state.x[survivors] = state.x[i];
      state.y[survivors] = state.y[i];
      state.theta[survivors] = state.theta[i];
      state.vx[survivors] = state.vx[i];
      state.vy[survivors] = state.vy[i];
      state.w[survivors] = state.w[i];
    }
    survivors++;
  }
  if(survivors === state.n) return false;
  state.n = survivors;
  state.x = state.x.slice(0, survivors);
  state.y = state.y.slice(0, survivors);
  state.theta = state.theta.slice(0, survivors);
  state.vx = state.vx.slice(0, survivors);
  state.vy = state.vy.slice(0, survivors);
  state.w = state.w.slice(0, survivors);
  return true;
}

export function computeStep(state, config){
  const rand = config.random ?? Math.random;
  const {params, instanceParams, stateFlags, hydroEnabled, hydroShellOnly, hydroRangeOnly, rCut, Delaunay} = config;
  const n = state.n;
  if(!n) return state;

  const cosT = new Float64Array(n);
  const sinT = new Float64Array(n);
  for(let i = 0; i < n; i++){
    cosT[i] = Math.cos(state.theta[i]);
    sinT[i] = Math.sin(state.theta[i]);
  }

  const idx = new Uint32Array(n);
  for(let i = 0; i < n; i++) idx[i] = i;

  const delaunay = (Delaunay && n >= 3) ? Delaunay.from(idx, (i) => state.x[i], (i) => state.y[i]) : null;
  const delaunayNeighbors = delaunay ? Array.from({length: n}, (_, i) => Array.from(delaunay.neighbors(i))) : null;
  const wVision = new Float64Array(n);
  const minDist = new Float64Array(n);
  minDist.fill(Infinity);

  if(delaunay){
    for(let i = 0; i < n; i++){
      const neighbors = delaunayNeighbors[i];
      let sum = 0;
      let denom = 0;
      let minR = Infinity;
      for(const j of neighbors){
        if(j === i) continue;
        const dx = state.x[j] - state.x[i];
        const dy = state.y[j] - state.y[i];
        const dist = Math.hypot(dx, dy);
        const theta = getAngle(state.theta[i], dx, dy, dist);
        const phi = wrapAngle(state.theta[j] - state.theta[i]);
        const weight = 1 + Math.cos(theta);
        sum += (instanceParams.Ia * Math.sin(phi) + dist * Math.sin(theta)) * weight;
        denom += weight;
        if(dist < minR) minR = dist;
      }
      wVision[i] = denom > ERR_TOL ? sum / denom : 0;
      minDist[i] = minR;
    }
  }

  if(state.baits.length){
    const attrNum = Math.min(n, 5);
    for(const bait of state.baits){
      const distList = new Array(n);
      for(let i = 0; i < n; i++){
        distList[i] = {idx: i, dist: Math.hypot(bait.x - state.x[i], bait.y - state.y[i])};
      }
      distList.sort((a, b) => a.dist - b.dist);
      const attrD = (distList[0].dist + distList[Math.min(attrNum - 1, distList.length - 1)].dist) / 2;
      for(let k = 0; k < attrNum && k < distList.length; k++){
        const item = distList[k];
        const dvx = bait.x - state.x[item.idx];
        const dvy = bait.y - state.y[item.idx];
        const wBait = getAngle(state.theta[item.idx], dvx, dvy, item.dist);
        const blend = Math.exp(params.attrS * (item.dist - attrD));
        wVision[item.idx] = (wVision[item.idx] * blend + wBait) / (1 + blend);
      }
    }
  }

  if(stateFlags.mouse && state.pointerActive){
    for(let i = 0; i < n; i++){
      const dx = state.cp.x - state.x[i];
      const dy = state.cp.y - state.y[i];
      const dist = Math.hypot(dx, dy);
      if(dist === 0) continue;
      const wCp = getAngle(state.theta[i], -dy, -dx, dist);
      const blend = Math.exp(params.replS * (params.replD - dist));
      wVision[i] = (wVision[i] + wCp * blend) / (1 + blend);
    }
  }

  const wNoise = new Float64Array(n);
  const noiseScale = instanceParams.In * Math.sqrt(params.dt);
  for(let i = 0; i < n; i++) wNoise[i] = noiseScale * gaussian(rand);

  if(stateFlags.shark){
    const head = getSharkHeadPos(state.sharkState);
    for(let i = 0; i < n; i++){
      const d = Math.hypot(head.x - state.x[i], head.y - state.y[i]);
      const sig = 1 / (1 + Math.exp(-(params.sharkH - d)));
      wNoise[i] *= (1 + 2 * instanceParams.In * sig);
    }
  }
  if(stateFlags.whale){
    const head = getWhaleHeadPos(state.whaleState);
    for(let i = 0; i < n; i++){
      const d = Math.hypot(head.x - state.x[i], head.y - state.y[i]);
      const sig = 1 / (1 + Math.exp(-(params.whaleH - d)));
      wNoise[i] *= (1 + 2 * instanceParams.In * sig);
    }
  }

  const Ux = new Float64Array(n);
  const Uy = new Float64Array(n);
  const wHydro = new Float64Array(n);

  if(hydroEnabled){
    if(hydroShellOnly && delaunayNeighbors){
      for(let i = 0; i < n; i++){
        let uR = 0;
        let uI = 0;
        let wSum = 0;
        const neighbors = delaunayNeighbors[i];
        for(const j of neighbors){
          if(i === j) continue;
          const dx = state.x[i] - state.x[j];
          const dy = state.y[i] - state.y[j];
          const r2 = dx * dx + dy * dy;
          if(r2 < ERR_TOL) continue;
          const invr4 = 1 / (r2 * r2);
          const invr6 = invr4 / r2;
          const c2r = dx * dx - dy * dy;
          const c2i = -2 * dx * dy;
          const c3r = c2r * dx + c2i * dy;
          const c3i = c2r * (-dy) + c2i * dx;
          const expTermR = Math.cos(2 * state.theta[i] + state.theta[j]);
          const expTermI = Math.sin(2 * state.theta[i] + state.theta[j]);
          const termUr = cosT[j] * c2r - sinT[j] * c2i;
          const termUi = cosT[j] * c2i + sinT[j] * c2r;
          const termWi = expTermR * c3i + expTermI * c3r;
          uR += termUr * invr4;
          uI += termUi * invr4;
          wSum += termWi * invr6 * 2;
        }
        const avoid = 1 / (1 + Math.exp((params.fishH - minDist[i]) / params.fishH * 10));
        Ux[i] = uR / Math.PI * params.If * avoid;
        Uy[i] = -uI / Math.PI * params.If * avoid;
        wHydro[i] = wSum / Math.PI * params.If * avoid;
      }
    } else if(hydroRangeOnly){
      const cell = rCut > 0 ? rCut : 1;
      const r2cut = rCut * rCut;
      const grid = new Map();
      const key = (ix, iy) => `${ix},${iy}`;
      for(let i = 0; i < n; i++){
        const ix = Math.floor(state.x[i] / cell);
        const iy = Math.floor(state.y[i] / cell);
        const bucketKey = key(ix, iy);
        let bucket = grid.get(bucketKey);
        if(!bucket){
          bucket = [];
          grid.set(bucketKey, bucket);
        }
        bucket.push(i);
      }
      for(let i = 0; i < n; i++){
        let uR = 0;
        let uI = 0;
        let wSum = 0;
        const ix = Math.floor(state.x[i] / cell);
        const iy = Math.floor(state.y[i] / cell);
        for(let gx = ix - 1; gx <= ix + 1; gx++){
          for(let gy = iy - 1; gy <= iy + 1; gy++){
            const bucket = grid.get(key(gx, gy));
            if(!bucket) continue;
            for(const j of bucket){
              if(i === j) continue;
              const dx = state.x[i] - state.x[j];
              const dy = state.y[i] - state.y[j];
              const r2 = dx * dx + dy * dy;
              if(r2 > r2cut || r2 < ERR_TOL) continue;
              const invr4 = 1 / (r2 * r2);
              const invr6 = invr4 / r2;
              const c2r = dx * dx - dy * dy;
              const c2i = -2 * dx * dy;
              const c3r = c2r * dx + c2i * dy;
              const c3i = c2r * (-dy) + c2i * dx;
              const expTermR = Math.cos(2 * state.theta[i] + state.theta[j]);
              const expTermI = Math.sin(2 * state.theta[i] + state.theta[j]);
              const termUr = cosT[j] * c2r - sinT[j] * c2i;
              const termUi = cosT[j] * c2i + sinT[j] * c2r;
              const termWi = expTermR * c3i + expTermI * c3r;
              uR += termUr * invr4;
              uI += termUi * invr4;
              wSum += termWi * invr6 * 2;
            }
          }
        }
        const avoid = 1 / (1 + Math.exp((params.fishH - minDist[i]) / params.fishH * 10));
        Ux[i] = uR / Math.PI * params.If * avoid;
        Uy[i] = -uI / Math.PI * params.If * avoid;
        wHydro[i] = wSum / Math.PI * params.If * avoid;
      }
    } else {
      for(let i = 0; i < n; i++){
        let uR = 0;
        let uI = 0;
        let wSum = 0;
        for(let j = 0; j < n; j++){
          if(i === j) continue;
          const dx = state.x[i] - state.x[j];
          const dy = state.y[i] - state.y[j];
          const r2 = dx * dx + dy * dy;
          if(r2 < ERR_TOL) continue;
          const invr4 = 1 / (r2 * r2);
          const invr6 = invr4 / r2;
          const c2r = dx * dx - dy * dy;
          const c2i = -2 * dx * dy;
          const c3r = c2r * dx + c2i * dy;
          const c3i = c2r * (-dy) + c2i * dx;
          const expTermR = Math.cos(2 * state.theta[i] + state.theta[j]);
          const expTermI = Math.sin(2 * state.theta[i] + state.theta[j]);
          const termUr = cosT[j] * c2r - sinT[j] * c2i;
          const termUi = cosT[j] * c2i + sinT[j] * c2r;
          const termWi = expTermR * c3i + expTermI * c3r;
          uR += termUr * invr4;
          uI += termUi * invr4;
          wSum += termWi * invr6 * 2;
        }
        const avoid = 1 / (1 + Math.exp((params.fishH - minDist[i]) / params.fishH * 10));
        Ux[i] = uR / Math.PI * params.If * avoid;
        Uy[i] = -uI / Math.PI * params.If * avoid;
        wHydro[i] = wSum / Math.PI * params.If * avoid;
      }
    }
  }

  if(stateFlags.shark){
    if(hydroEnabled){
      addPredatorFlow(state, state.sharkState, 1000, params, Ux, Uy, wHydro);
    }
  } else {
    const center = meanPoint(state);
    state.sharkState.x = center.x - 25;
    state.sharkState.y = center.y;
    state.sharkState.theta = 0;
  }
  if(stateFlags.whale){
    if(hydroEnabled){
      addPredatorFlow(state, state.whaleState, 6, params, Ux, Uy, wHydro);
    }
  } else {
    const center = meanPoint(state);
    state.whaleState.x = center.x;
    state.whaleState.y = center.y - 25;
    state.whaleState.theta = Math.PI / 2;
  }

  if(stateFlags.evade){
    if(stateFlags.shark) applySharkEvade(state, params, wVision);
    if(stateFlags.whale) applyWhaleEvade(state, params, wVision);
  }

  for(let i = 0; i < n; i++){
    const thetaDot = wVision[i] + wHydro[i];
    state.w[i] = thetaDot;
    state.x[i] += (Math.cos(state.theta[i]) + Ux[i]) * params.dt;
    state.y[i] += (Math.sin(state.theta[i]) + Uy[i]) * params.dt;
    state.theta[i] = wrapAngle(state.theta[i] + thetaDot * params.dt + wNoise[i]);
    state.vx[i] = Math.cos(state.theta[i]) + Ux[i];
    state.vy[i] = Math.sin(state.theta[i]) + Uy[i];
  }

  if(stateFlags.shark) updateShark(state, params, stateFlags, Ux, Uy, rand);
  if(stateFlags.whale) updateWhale(state, params, stateFlags, Ux, Uy, rand);

  compactAfterDeaths(state, params, stateFlags);
  return state;
}
