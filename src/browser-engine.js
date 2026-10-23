(function () {
  'use strict';
  const listeners = new Set();
  const state = { ready: false, running: false, error: null, meta: null, snapshot: null, history: [],
    parameters: { U: .6, fn: .18, zeta: .01, massRatio: 10, fixed: false },
    performance: { speedRatio: 0 }, sessionId: 'browser-' + Date.now() };
  let worker, workerURL, sourceText, desiredRunning = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let hiddenPaused = false, resetting = false, lastWall = 0, lastTime = 0, lastEstimate = -Infinity;
  let frequencyStart = 0;
  let frequencies = { fLift: null, fProbe: null, fY: null };
  const notify = () => listeners.forEach(fn => fn(state));
  const send = message => { if (worker) worker.postMessage(message); };
  function fail(error) {
    state.error = sourceText ? error.message || String(error) : '计算程序未能加载，请刷新网页重试。'; state.running = false; desiredRunning = false;
    if (worker) worker.terminate(); worker = null; notify();
  }
  async function source(id, fallback) {
    const element = document.getElementById(id);
    if (element && element.textContent.trim()) return element.textContent;
    const response = await fetch(element?.dataset.workerSrc || fallback);
    if (!response.ok) throw new Error('计算程序加载失败，请刷新网页重试。');
    return response.text();
  }
  function receive(data) {
    if (data.type === 'error') { fail(new Error(data.message)); return; }
    if (!data.snapshot) return;
    if (resetting && data.type !== 'ready') return;
    if (data.type === 'ready') {
      resetting = false; state.ready = true; state.meta = data.meta;
      state.history = []; lastTime = 0; lastWall = performance.now(); lastEstimate = -Infinity; frequencyStart = 0;
      frequencies = { fLift: null, fProbe: null, fY: null };
      state.sessionId = 'browser-' + Date.now();
      send({ type: desiredRunning && !document.hidden ? 'run' : 'pause' });
    }
    const snapshot = data.snapshot;
    if (Array.isArray(data.history)) for (const row of data.history) {
      if (!state.history.length || row.t > state.history.at(-1).t) state.history.push(row);
    }
    if (snapshot.t >= lastEstimate + 2) {
      const recent = state.history.filter(row => row.t >= Math.max(snapshot.t - 40, frequencyStart));
      const spectrum = window.VIVSpectrum.dominantFrequency;
      const info = { lift: spectrum(recent, 'CL'), probe: spectrum(recent, 'probeV'), y: snapshot.fixed ? null : spectrum(recent, 'y', .0002) };
      frequencies = { fLift: info.lift?.frequency ?? null, fProbe: info.probe?.frequency ?? null, fY: info.y?.frequency ?? null, frequencyInfo: info };
      lastEstimate = snapshot.t;
    }
    let min = Infinity, max = -Infinity, count = 0;
    for (let i = state.history.length - 1; i >= 0 && state.history[i].t >= snapshot.t - 40; i--) {
      min = Math.min(min, state.history[i].y); max = Math.max(max, state.history[i].y); count++;
    }
    state.snapshot = { ...snapshot, ...frequencies, fY: snapshot.fixed ? null : frequencies.fY, amplitude: count > 1 ? (max - min) / 2 : 0 };
    const wall = performance.now(), elapsed = (wall - lastWall) / 1000;
    if (elapsed > .2 && snapshot.t > lastTime) {
      const rate = (snapshot.t - lastTime) / elapsed;
      state.performance.speedRatio = state.performance.speedRatio ? .8 * state.performance.speedRatio + .2 * rate : rate;
      lastWall = wall; lastTime = snapshot.t;
    }
    state.running = desiredRunning && !document.hidden;
    notify();
  }
  function control(params) {
    const allowed = ['U', 'fn', 'zeta', 'massRatio', 'fixed'];
    const patch = Object.fromEntries(allowed.filter(k => params[k] !== undefined).map(k => [k, params[k]]));
    const limits = { U: [.5, 1.5], fn: [.08, .3], zeta: [.002, .15], massRatio: [10, 60] };
    for (const [key, range] of Object.entries(limits)) if (patch[key] !== undefined && (!Number.isFinite(patch[key]) || patch[key] < range[0] || patch[key] > range[1])) throw new Error('参数超出可用范围：' + key);
    if (['fn','zeta','massRatio','fixed'].some(key => patch[key] !== undefined && patch[key] !== state.parameters[key])) {
      frequencyStart = state.snapshot?.t || 0; lastEstimate = -Infinity;
      frequencies = { fLift: null, fProbe: null, fY: null, frequencyInfo: null };
      if (state.snapshot) Object.assign(state.snapshot, frequencies);
    }
    Object.assign(state.parameters, patch);
    if (params.running !== undefined) desiredRunning = !!params.running;
    if (params.reset) {
      state.error = null; state.history = []; state.snapshot = null;
      resetting = true; lastEstimate = -Infinity;
      if (!worker) { state.ready = false; startWorker(); }
      else send({ type: 'reset', config: state.parameters });
    } else if (Object.keys(patch).length) send({ type: 'control', params: patch });
    if (params.running !== undefined && state.ready) {
      send({ type: desiredRunning && !document.hidden ? 'run' : 'pause' });
      lastWall = performance.now(); lastTime = state.snapshot?.t || 0;
    }
    state.running = state.ready && desiredRunning && !document.hidden;
    notify();
  }
  window.VIVBrowserEngine = {
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    control, getState: () => state,
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenPaused = desiredRunning; send({ type: 'pause' }); state.running = false; }
    else if (desiredRunning && state.ready && !state.error) { send({ type: 'run' }); state.running = true; }
    lastWall = performance.now(); lastTime = state.snapshot?.t || 0; notify();
  });
  window.addEventListener('pagehide', () => { send({ type: 'pause' }); });
  window.addEventListener('pageshow', event => { if (event.persisted && desiredRunning) send({ type: 'run' }); });
  function startWorker() {
    if (!sourceText) return;
      workerURL = URL.createObjectURL(new Blob([sourceText], { type: 'text/javascript' }));
      worker = new Worker(workerURL); worker.onmessage = e => receive(e.data);
      worker.onerror = e => fail(new Error(e.message || '浏览器计算中断，请刷新后重试。'));
      send({ type: 'init', config: state.parameters });
      URL.revokeObjectURL(workerURL);
  }
  Promise.all([source('browser-flow-source', 'browser-flow.js'), source('browser-worker-source', 'browser-worker.js')])
    .then(parts => { sourceText = parts.join('\n'); startWorker(); }).catch(fail);
})();
