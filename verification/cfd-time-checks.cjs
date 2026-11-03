'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const P = require('../src/cfd-time.js');
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const initial = P.sample('quadratic', 2, 1);
assert.deepEqual(initial.times, [1, 2, 3]);
assert.deepEqual(initial.f, [1, 4, 9]);
near(initial.vMinus, 3); near(initial.vPlus, 5); near(initial.acceleration, 2);
let cases = 0;
for (const t of [1, 1.137, 2, 4.5, 7]) {
  for (const dt of [0.1, 0.125, 0.25, 0.5, 0.739, 1]) {
    const q = P.sample('quadratic', t, dt), l = P.sample('linear', t, dt);
    near(q.vMinus, 2 * t - dt); near(q.vPlus, 2 * t + dt); near(q.acceleration, 2);
    near(l.vMinus, 2); near(l.vPlus, 2); near(l.acceleration, 0);
    near(q.times[1] - q.times[0], dt); near(q.times[2] - q.times[1], dt);
    // Independent identity from the trigonometric difference formula.
    const s = P.sample('sine', t, dt), w = Math.PI / 4;
    near(s.acceleration, -8 * Math.sin(w * t) * Math.sin(w * dt / 2) ** 2 / dt ** 2);
    cases++;
  }
}
const errors = [0.4, 0.2, 0.1].map(dt => {
  const s = P.sample('sine', 1.3, dt);
  return {dt, first: Math.abs(s.vPlus - s.exactV), second: Math.abs(s.acceleration - s.exactA)};
});
for (let j = 1; j < errors.length; j++) {
  assert.ok(errors[j].first < errors[j - 1].first);
  assert.ok(errors[j].second < errors[j - 1].second);
  const ratio = errors[j - 1].second / errors[j].second;
  assert.ok(ratio > 3.9 && ratio < 4.1, 'central second derivative has second-order convergence');
}
for (const dt of [0, -1, NaN, Infinity]) assert.throws(() => P.sample('sine', 2, dt), RangeError);
const html = fs.readFileSync(path.join(__dirname, '../CFD_三维控制体与有限体积.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
scripts.forEach((match, j) => new vm.Script(match[1], {filename: `embedded-${j}.js`}));
console.log(JSON.stringify({status: 'passed', analyticCases: cases * 3, defaultExample: initial, sineConvergence: errors, scriptsParsed: scripts.length}, null, 2));
