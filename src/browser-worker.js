/* Real browser-side CFD worker. Can also be concatenated after browser-flow.js. */
if (!self.BrowserFlow) importScripts('browser-flow.js');
(function () {
  'use strict';
  let simulation = null, running = false, timer = null, generation = 0, lastPublish = 0, records = [], computeSeconds = 0;
  function transferList(snapshot) { return snapshot.field ? Object.values(snapshot.field).filter(x => ArrayBuffer.isView(x)).map(x => x.buffer) : []; }
  function publish(type = 'frame') {
    const snapshot = simulation.snapshot(true), history = records; records = [];
    const message = { type, snapshot, history, running, meta: simulation.getMeta(), performance: { computeSeconds, simulatedTime: snapshot.t, speedRatio: computeSeconds ? snapshot.t / computeSeconds : 0 } };
    self.postMessage(message, transferList(snapshot)); lastPublish = performance.now();
  }
  function schedule() { if (running && timer === null) timer = setTimeout(tick, 0); }
  function tick() {
    timer = null; if (!running || !simulation) return;
    const began = performance.now();
    try {
      do {
        simulation.advance(5); records.push(simulation.scalar());
      } while (performance.now() - began < 35);
      computeSeconds += (performance.now() - began) / 1000;
      if (performance.now() - lastPublish >= 100) publish();
      schedule();
    } catch (error) {
      running = false; self.postMessage({ type: 'error', message: String(error.message || error), t: simulation.stepCount * simulation.dt });
    }
  }
  self.onmessage = function (event) {
    const message = event.data || {};
    try {
      if (message.type === 'init' || message.type === 'reset') {
        running = false; if (timer !== null) clearTimeout(timer); timer = null; generation++;
        simulation = new self.BrowserFlow(message.config || {}); records = []; computeSeconds = 0;
        publish('ready');
      } else if (!simulation) throw Error('Initialize the browser solver first.');
      else if (message.type === 'control') {
        const params = message.params || {};
        simulation.setParams(params);
        if (params.running !== undefined) running = !!params.running;
        publish(); schedule();
      } else if (message.type === 'run') { running = true; schedule(); }
      else if (message.type === 'pause') { running = false; if (timer !== null) clearTimeout(timer); timer = null; publish(); }
      else if (message.type === 'snapshot') publish();
      else throw Error('Unknown worker message type.');
    } catch (error) { self.postMessage({ type: 'error', message: String(error.message || error) }); }
  };
})();
