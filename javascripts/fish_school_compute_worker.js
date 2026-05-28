// CC BY-NC-SA 4.0 (Attribution-NonCommercial-ShareAlike) https://creativecommons.org/licenses/by-nc-sa/4.0/
let bootPromise = null;

async function boot(){
  if(bootPromise) return bootPromise;
  bootPromise = (async () => {
    const core = await import('./fish_school_compute_core.js');
    importScripts('./vendor/d3-delaunay/6/d3-delaunay.min.js');
    const Delaunay = self.d3?.Delaunay ?? null;
    if(!Delaunay) throw new Error('Unable to load Delaunay in worker');
    return {core, Delaunay};
  })();
  return bootPromise;
}

self.addEventListener('message', async (event) => {
  const data = event.data ?? {};
  if(data.type !== 'step') return;
  try {
    const {core, Delaunay} = await boot();
    const state = core.stateFromPayload(data.state);
    const t0 = performance.now();
    core.computeStep(state, {
      ...data.config,
      Delaunay,
      random: Math.random,
    });
    const computeMs = performance.now() - t0;
    const payload = core.cloneStatePayload(state, {copyArrays: false});
    self.postMessage({
      type: 'step_result',
      simId: data.simId,
      requestId: data.requestId,
      stateVersion: data.stateVersion,
      computeMs,
      state: payload,
    }, core.getTransferListFromPayload(payload));
  } catch (err) {
    self.postMessage({
      type: 'error',
      simId: data.simId,
      requestId: data.requestId,
      stateVersion: data.stateVersion,
      message: err?.message ?? String(err),
    });
  }
});
