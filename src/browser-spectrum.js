/* Actual signal peak, never selected by the structure's natural frequency. */
(function(root) {
  'use strict';
  function dominantFrequency(rows, key, minimumRms = .001) {
    const count = rows.length;
    if (count < 64) return null;
    const span = rows[count - 1].t - rows[0].t, dt = span / (count - 1);
    if (span < 20 || !(dt > 0)) return null;
    let mean = 0, covariance = 0, varianceX = 0;
    for (let i = 0; i < count; i++) {
      if (!Number.isFinite(rows[i][key]) || (i && Math.abs(rows[i].t - rows[i - 1].t - dt) > .001 * dt)) return null;
      mean += rows[i][key] / count;
    }
    for (let i = 0; i < count; i++) { const x = i - (count - 1) / 2; covariance += x * (rows[i][key] - mean); varianceX += x * x; }
    const slope = covariance / varianceX;
    let n = 1; while (n < count) n *= 2;
    const real = new Float64Array(n), imag = new Float64Array(n); let energy = 0;
    for (let i = 0; i < count; i++) {
      const value = rows[i][key] - mean - slope * (i - (count - 1) / 2);
      energy += value * value;
      real[i] = value * .5 * (1 - Math.cos(2 * Math.PI * i / (count - 1)));
    }
    if (Math.sqrt(energy / count) < minimumRms) return null;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { const tmp = real[i]; real[i] = real[j]; real[j] = tmp; }
    }
    for (let length = 2; length <= n; length *= 2) {
      const angle = -2 * Math.PI / length, wr = Math.cos(angle), wi = Math.sin(angle);
      for (let start = 0; start < n; start += length) {
        let ar = 1, ai = 0;
        for (let j = 0; j < length / 2; j++) {
          const a = start + j, b = a + length / 2;
          const br = ar * real[b] - ai * imag[b], bi = ar * imag[b] + ai * real[b];
          real[b] = real[a] - br; imag[b] = imag[a] - bi; real[a] += br; imag[a] += bi;
          const next = ar * wr - ai * wi; ai = ar * wi + ai * wr; ar = next;
        }
      }
    }
    let peak = 1, power = 0;
    for (let i = 1; i <= n / 2; i++) {
      const p = real[i] * real[i] + imag[i] * imag[i];
      if (p > power) { power = p; peak = i; }
    }
    const frequency = peak / (n * dt);
    if (frequency * span < 2.5) return null;
    return { frequency, resolution: 1 / (count * dt), windowStart: rows[0].t, windowEnd: rows[count - 1].t,
      method: 'linear detrend, Hann window, global non-DC FFT peak; zero padding does not improve physical resolution', samples: count };
  }
  root.VIVSpectrum = { dominantFrequency };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.VIVSpectrum;
})(typeof self !== 'undefined' ? self : globalThis);
