/* A prescribed displacement history, sampled in time; not a CFD solver. */
(function (root, factory) {
  'use strict';
  const math = factory();
  if (typeof module === 'object' && module.exports) module.exports = math;
  root.TimeDifferencesMath = math;
  if (!root.document) return;
  const $ = id => document.getElementById(id);
  if (!$('time-differences')) return;
  const state = {model: 'quadratic', t: 2, dt: 1};
  const colors = ['#216b99', '#008b88', '#d66a28'];
  const format = (v, digits = 3) => Math.abs(v) < 0.5 * 10 ** -digits ? (0).toFixed(digits) : v.toFixed(digits);
  const put = (id, text) => { $(id).textContent = text; };
  let timer = null;

  function plot(id, order, data) {
    const model = math.models[state.model], value = [model.f, model.v, model.a][order];
    const samples = Array.from({length: 241}, (_, j) => ({t: j / 30, y: value(j / 30)}));
    const values = samples.map(p => p.y);
    if (order === 1) values.push(data.vMinus, data.vPlus);
    if (order === 2) values.push(data.acceleration);
    let low = Math.min(0, ...values), high = Math.max(0, ...values);
    if (high - low < 0.001) { low -= 1; high += 1; }
    const span = high - low;
    low -= span * 0.12; high += span * 0.16;
    const width = Math.max(320, $(id).clientWidth);
    $(id).setAttribute('viewBox', `0 0 ${width} 160`);
    const left = 49, right = width - 58;
    const X = t => left + t / 8 * (right - left);
    const Y = v => 120 - (v - low) / (high - low) * 104;
    const n = v => v.toFixed(2);
    const line = (x1, y1, x2, y2, color, width = 1, dash = '') => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
    const dot = (t, v, color, r = 4.5) => `<circle cx="${n(X(t))}" cy="${n(Y(v))}" r="${r}" fill="white" stroke="${color}" stroke-width="2.5"/>`;
    const text = (x, y, content, color = '#627c8c', anchor = 'middle', cls = '') => `<text x="${n(x)}" y="${n(y)}" text-anchor="${anchor}" font-size="16" fill="${color}" ${cls ? `class="${cls}"` : ''}>${content}</text>`;
    let svg = '';
    for (let tick = 0; tick <= 8; tick += 2) {
      svg += line(X(tick), 15, X(tick), 120, '#e3ecef');
      svg += text(X(tick), 146, String(tick));
    }
    svg += text(width - 3, 146, 't / s', '#627c8c', 'end');
    for (const y of [0, (low + high) / 2, high - 0.06 * (high - low)]) {
      if (Math.abs(y) < 0.001 && svg.includes('data-zero')) continue;
      svg += line(left, Y(y), right, Y(y), '#e3ecef');
      svg += text(left - 8, Y(y) + 5, format(y, Math.abs(y) >= 10 ? 0 : 1), '#627c8c', 'end');
    }
    svg += line(X(state.t), 9, X(state.t), 120, '#8bafbb', 1.4, '4 5');
    const path = samples.map((p, j) => `${j ? 'L' : 'M'}${n(X(p.t))},${n(Y(p.y))}`).join(' ');
    svg += `<path d="${path}" fill="none" stroke="${order === 0 ? '#216b99' : '#9aabb4'}" stroke-width="2.3" ${order ? 'stroke-dasharray="6 5"' : ''}/>`;
    if (order === 0) {
      const start = Math.ceil(-state.t / state.dt - 1e-8), end = Math.floor((8 - state.t) / state.dt + 1e-8);
      for (let j = start; j <= end; j++) {
        const t = state.t + j * state.dt;
        svg += dot(t, model.f(t), '#a8c2cb', 2.6);
      }
      svg += line(X(data.times[0]), Y(data.f[0]), X(data.times[1]), Y(data.f[1]), colors[0], 3.2);
      svg += line(X(data.times[1]), Y(data.f[1]), X(data.times[2]), Y(data.f[2]), colors[2], 3.2);
      data.times.forEach((t, j) => {
        svg += dot(t, data.f[j], colors[j], 5.5);
        const labelX = X(state.t) + (j - 1) * Math.max(58, X(state.t + state.dt) - X(state.t));
        // Keep labels separated even when the three sampling instants are close.
        const labelY = Math.max(18, Y(data.f[j]) - 26);
        svg += line(labelX, labelY + 5, X(t), Y(data.f[j]) - 7, colors[j], 1);
        svg += text(labelX, labelY, ['i−1', 'i', 'i+1'][j], colors[j], 'middle', 'td-point-text');
      });
    } else if (order === 1) {
      [data.vMinus, data.vPlus].forEach((v, j) => {
        svg += line(X(data.times[j]), Y(v), X(data.times[j + 1]), Y(v), colors[j * 2], 4);
        svg += dot((data.times[j] + data.times[j + 1]) / 2, v, colors[j * 2], 5);
      });
    } else {
      svg += dot(state.t, data.acceleration, colors[1], 6);
    }
    $(id).innerHTML = svg;
  }

  function render() {
    const d = math.sample(state.model, state.t, state.dt);
    $('td-model').value = state.model;
    $('td-dt').value = state.dt;
    $('td-time').value = state.t;
    put('td-dt-value', format(state.dt));
    put('td-time-value', format(state.t));
    $('td-half').disabled = state.dt <= 0.100001;
    ['before', 'current', 'after'].forEach((name, j) => put('td-' + name, `t = ${format(d.times[j])} s；f = ${format(d.f[j])} m`));
    put('td-f-values', `fᵢ₋₁ = ${format(d.f[0])} m；fᵢ = ${format(d.f[1])} m；fᵢ₊₁ = ${format(d.f[2])} m`);
    put('td-v-values', `前段：(${format(d.f[1])} − (${format(d.f[0])})) / ${format(state.dt)} = ${format(d.vMinus)} m/s；后段：(${format(d.f[2])} − (${format(d.f[1])})) / ${format(state.dt)} = ${format(d.vPlus)} m/s`);
    put('td-a-values', `(${format(d.vPlus)} − (${format(d.vMinus)})) / ${format(state.dt)} = ${format(d.acceleration)} m/s²`);
    put('td-v-exact', `tᵢ 处精确速度 ${format(d.exactV)} m/s；前向差分 ${format(d.vPlus)} m/s；绝对误差 ${format(Math.abs(d.vPlus - d.exactV), 5)} m/s。`);
    put('td-a-exact', `tᵢ 处精确加速度 ${format(d.exactA)} m/s²；中心二阶差分 ${format(d.acceleration)} m/s²；绝对误差 ${format(Math.abs(d.acceleration - d.exactA), 5)} m/s²。`);
    const observation = state.model === 'quadratic'
      ? '匀加速：后段平均速度比前段大。即使时间步改变，这条抛物线的二阶差分仍为 2 m/s²。'
      : state.model === 'linear'
        ? '匀速：相同时间内位移增量相同。两段平均速度都是 2 m/s，加速度为 0。'
        : '振动：速度、加速度都在变。固定当前时刻，缩小 Δt，比较差分与精确导数的读数。';
    put('td-observation', observation);
    plot('td-displacement', 0, d); plot('td-velocity', 1, d); plot('td-acceleration', 2, d);
  }
  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    put('td-play', '播放采样'); $('td-play').setAttribute('aria-pressed', 'false');
  }
  $('td-model').addEventListener('change', () => { stop(); state.model = $('td-model').value; render(); });
  for (const [id, key] of [['td-dt', 'dt'], ['td-time', 't']]) {
    $(id).addEventListener('input', () => { stop(); state[key] = Number(Number($(id).value).toFixed(3)); render(); });
  }
  $('td-half').addEventListener('click', () => { stop(); state.dt = Math.max(0.1, Number((state.dt / 2).toFixed(3))); render(); });
  $('td-reset').addEventListener('click', () => { stop(); Object.assign(state, {model: 'quadratic', t: 2, dt: 1}); render(); });
  $('td-play').addEventListener('click', () => {
    if (timer !== null) { stop(); return; }
    put('td-play', '暂停采样'); $('td-play').setAttribute('aria-pressed', 'true');
    timer = setInterval(() => { state.t = state.t + state.dt > 7.000001 ? 1 : Number((state.t + state.dt).toFixed(3)); render(); }, 900);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  const advanced = $('spatial-extension');
  advanced.addEventListener('toggle', () => {
    if (advanced.open && root.CourseLab) root.CourseLab.setDerivativeParameters({});
    if (!advanced.open && $('d-play').textContent.includes('暂停')) $('d-play').click();
  });
  $('td-open-space').addEventListener('click', () => { stop(); advanced.open = true; });
  root.TimeDifferenceLab = {getState: () => ({...state, playing: timer !== null, ...math.sample(state.model, state.t, state.dt)})};
  new ResizeObserver(render).observe(document.querySelector('.td-visual'));
  render();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const w = Math.PI / 4;
  const models = {
    quadratic: {f: t => t * t, v: t => 2 * t, a: () => 2},
    linear: {f: t => 2 * t, v: () => 2, a: () => 0},
    sine: {f: t => 2 * Math.sin(w * t), v: t => 2 * w * Math.cos(w * t), a: t => -2 * w * w * Math.sin(w * t)}
  };
  function sample(name, t, dt) {
    if (!models[name] || !Number.isFinite(t) || !Number.isFinite(dt) || dt <= 0) throw new RangeError('A known function, finite time and positive uniform time step are required.');
    const model = models[name], times = [t - dt, t, t + dt], f = times.map(model.f);
    const vMinus = (f[1] - f[0]) / dt, vPlus = (f[2] - f[1]) / dt;
    return {times, f, vMinus, vPlus, acceleration: (vPlus - vMinus) / dt, exactV: model.v(t), exactA: model.a(t)};
  }
  return {models, sample};
});
