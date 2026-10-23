(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VIVPhysics = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const TAU = 2 * Math.PI;

  // Mass is per unit span: m* = m / (rho D^2), without the pi/4 area factor.
  function passive(p, U = p.U) {
    const fs = p.St * U / p.D, wn = TAU * p.fn, ws = TAU * fs;
    const m = p.massRatio * p.rho * p.D * p.D;
    const force = 0.5 * p.rho * U * U * p.D * p.Cl;
    const den = Math.hypot(wn * wn - ws * ws, 2 * p.zeta * wn * ws);
    const amplitude = (force / m) / den;
    return { fs, wn, ws, m, force, amplitude, q: amplitude / p.D,
      phase: Math.atan2(2 * p.zeta * wn * ws, wn * wn - ws * ws),
      ratio: fs / p.fn, Ur: U / (p.fn * p.D), Ucross: p.fn * p.D / p.St,
      Sc: 4 * Math.PI * p.massRatio * p.zeta,
      massDamping: p.massRatio * p.zeta,
      acceleration: amplitude * ws * ws };
  }

  function sweep(p) {
    const u = [], f = [], natural = [], amplitude = [];
    for (let i = 0; i <= 400; i++) {
      const U = 0.1 + i * 11.9 / 400;
      const r = passive(p, U);
      u.push(U); f.push(r.fs); natural.push(p.fn); amplitude.push(r.q);
    }
    return { u, f, natural, amplitude };
  }

  // q=y/D; q'' + 2*zeta*wn*q' + wn^2*q = mu*wn*(1-epsilon*q^2)*q'.
  // This hypothetical nonlinear aerodynamic damping isolates amplitude saturation.
  // It contains no wake oscillator, velocity-dependent coefficient identification,
  // or frequency-clamping rule and cannot predict a lock-in speed interval.
  function nonlinear(p) {
    const wn = TAU * p.fn;
    const dt = Math.min(0.005, 1 / (p.fn * 180));
    const duration = Math.max(45 / p.fn, 45);
    const n = Math.ceil(duration / dt);
    const stride = Math.max(1, Math.floor(n / 2200));
    const out = { t: [], q: [], v: [], energy: [], input: [], loss: [],
      workIn: [], workLoss: [], dt, duration };
    let q = 0.006, v = 0, workIn = 0, workLoss = 0;
    const acceleration = (a, b) => -wn * wn * a + wn * (p.mu * (1 - p.epsilon * a * a) - 2 * p.zeta) * b;
    let maxTail = 0;
    for (let i = 0; i <= n; i++) {
      const t = i * dt;
      const pin = p.mu * wn * (1 - p.epsilon * q * q) * v * v;
      const loss = 2 * p.zeta * wn * v * v;
      if (t > duration * 0.8) maxTail = Math.max(maxTail, Math.abs(q));
      if (i % stride === 0 || i === n) {
        out.t.push(t); out.q.push(q); out.v.push(v); out.energy.push((v * v + wn * wn * q * q) / 2);
        out.input.push(pin); out.loss.push(loss); out.workIn.push(workIn); out.workLoss.push(workLoss);
      }
      if (i === n) break;
      const k1q = v, k1v = acceleration(q, v);
      const k2q = v + dt * k1v / 2, k2v = acceleration(q + dt * k1q / 2, v + dt * k1v / 2);
      const k3q = v + dt * k2v / 2, k3v = acceleration(q + dt * k2q / 2, v + dt * k2v / 2);
      const k4q = v + dt * k3v, k4v = acceleration(q + dt * k3q, v + dt * k3v);
      const nextQ = q + dt / 6 * (k1q + 2 * k2q + 2 * k3q + k4q);
      const nextV = v + dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
      const nextPin = p.mu * wn * (1 - p.epsilon * nextQ * nextQ) * nextV * nextV;
      const nextLoss = 2 * p.zeta * wn * nextV * nextV;
      workIn += dt * (pin + nextPin) / 2; workLoss += dt * (loss + nextLoss) / 2;
      q = nextQ; v = nextV;
    }
    out.tailAmplitude = maxTail;
    out.averagedAmplitude = p.mu > 2 * p.zeta ? Math.sqrt(4 * (p.mu - 2 * p.zeta) / (p.mu * p.epsilon)) : 0;
    out.growth = wn * (p.mu - 2 * p.zeta) / 2;
    out.energyBalanceResidual = out.energy[out.energy.length - 1] - out.energy[0] - workIn + workLoss;
    return out;
  }

  function interpolate(x, y, value) {
    if (value <= x[0]) return y[0];
    if (value >= x[x.length - 1]) return y[y.length - 1];
    let lo = 0, hi = x.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (x[m] <= value) lo = m; else hi = m; }
    return y[lo] + (y[hi] - y[lo]) * (value - x[lo]) / (x[hi] - x[lo]);
  }

  // Reference implementation for compact numerical checks (not used for large data).
  function spectrumUniform(values, dt, hann = true) {
    const n = values.length, mean = values.reduce((s, x) => s + x, 0) / n;
    const w = values.map((_, i) => hann ? 0.5 - 0.5 * Math.cos(TAU * i / (n - 1)) : 1);
    const gain = w.reduce((s, x) => s + x, 0), f = [], a = [];
    for (let k = 0; k <= Math.floor(n / 2); k++) {
      let re = 0, im = 0;
      for (let j = 0; j < n; j++) {
        const theta = TAU * j * k / n, value = (values[j] - mean) * w[j];
        re += value * Math.cos(theta); im -= value * Math.sin(theta);
      }
      const factor = k === 0 || (n % 2 === 0 && k === n / 2) ? 1 : 2;
      f.push(k / (n * dt)); a.push(factor * Math.hypot(re, im) / gain);
    }
    let peak = 1;
    for (let k = 2; k < a.length; k++) if (a[k] > a[peak]) peak = k;
    return { f, a, peakHz: f[peak], peakAmplitude: a[peak], peakIndex: peak };
  }
  return { passive, sweep, nonlinear, interpolate, spectrumUniform };
});
