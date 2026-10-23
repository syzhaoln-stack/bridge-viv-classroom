(function () {
  'use strict';
  const $ = id => document.getElementById(id), panel = $('browser-lab');
  if (!panel) return;
  const C = { ink: '#173b51', muted: '#5c7180', teal: '#008b88', blue: '#216b99', orange: '#ce6a2b' };
  const controls = ['browser-run', 'browser-wind', 'browser-fn', 'browser-zeta', 'browser-mass', 'browser-sc', 'browser-free', 'browser-fixed', 'browser-reset', 'browser-export', 'browser-export-csv'];
  const finite = Number.isFinite, fmt = (v, n = 3) => finite(v) ? v.toFixed(n) : '—';
  const set = (id, text) => { const el = $(id); if (el.textContent !== text) el.textContent = text; };
  const visible = el => {
    if (document.hidden || !el.getClientRects().length) return false;
    for (let ancestor = el; ancestor; ancestor = ancestor.parentElement) if (ancestor.hidden || (ancestor.tagName === 'DETAILS' && !ancestor.open)) return false;
    return true;
  };
  const sc = p => Math.PI ** 2 * p.massRatio * p.zeta;
  let engine, state = { ready: false, running: false, history: [], parameters: {}, error: null }, frame = null;
  let draft = { U: .6, fn: .18, zeta: .01, massRatio: 10, fixed: false }, fieldMode = 'vorticity', theme = 'dark';
  let dirty = true, paintTimer = null, editTimer = null, pendingEdits = {}, editingUntil = 0, lastFieldKey = '', displayScale = 10, chartDraws = 0;
  const raster = document.createElement('canvas'), rasterCtx = raster.getContext('2d');
  const ranges = { vorticity: [-8, 8], velocity: [0, 2.5], pressure: [-2, 2], surface: [-3, 1.5] };
  const palettes = {
    dark: [[63, 151, 207], [17, 34, 52], [237, 131, 91]],
    light: [[29, 110, 171], [239, 247, 249], [204, 81, 46]]
  };
  function color(value, range, mode, style) {
    const q = Math.max(0, Math.min(1, (value - range[0]) / (range[1] - range[0])));
    const stops = mode === 'velocity' ? style === 'dark' ? [[16, 35, 56], [30, 149, 177], [251, 213, 101]] : [[240, 248, 251], [42, 154, 180], [198, 102, 34]] : palettes[style];
    const i = q < .5 ? 0 : 1, a = q < .5 ? q * 2 : (q - .5) * 2;
    return stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * a));
  }
  function rangeFill(el) { el.style.setProperty('--fill', (100 * (Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) + '%'); }
  function updateLabels() {
    set('browser-wind-out', fmt(draft.U, 2)); set('browser-fn-out', fmt(draft.fn, 3)); set('browser-zeta-out', fmt(draft.zeta * 100, 2) + '%');
    set('browser-mass-out', fmt(draft.massRatio, 0)); set('browser-sc-out', fmt(sc(draft), 3));
    $('browser-sc').min = String(Math.PI ** 2 * draft.massRatio * Number($('browser-zeta').min) / 100);
    $('browser-sc').max = String(Math.PI ** 2 * draft.massRatio * Number($('browser-zeta').max) / 100);
    $('browser-sc').value = String(sc(draft));
    for (const [id, key, factor] of [['browser-wind', 'U', 1], ['browser-fn', 'fn', 1], ['browser-zeta', 'zeta', 100], ['browser-mass', 'massRatio', 1]]) {
      $(id).value = String(draft[key] * factor); rangeFill($(id));
    }
    rangeFill($('browser-sc'));
    $('browser-free').setAttribute('aria-pressed', String(!draft.fixed)); $('browser-fixed').setAttribute('aria-pressed', String(draft.fixed));
    set('browser-support-note', draft.fixed ? '固定在切换时的位置；解除固定后从该位置继续响应。流场随后继续调整。' : '流体升力推动结构，结构运动反馈给流场。');
  }
  function applyLimits(meta) {
    const limits = meta && meta.limits; if (!limits) return;
    for (const [key, id, factor] of [['U', 'browser-wind', 1], ['fn', 'browser-fn', 1], ['zeta', 'browser-zeta', 100], ['massRatio', 'browser-mass', 1]]) {
      if (!limits[key]) continue; const lim = limits[key], min = Array.isArray(lim) ? lim[0] : lim.min, max = Array.isArray(lim) ? lim[1] : lim.max;
      if (finite(min)) $(id).min = String(min * factor); if (finite(max)) $(id).max = String(max * factor);
    }
  }
  function receive(next) {
    if (!next) return;
    const previousFrame = frame; state = next; frame = next.snapshot || null;
    if (frame !== previousFrame) lastFieldKey = '';
    if (next.sessionId && panel.dataset.session !== next.sessionId) { panel.dataset.session = next.sessionId; lastFieldKey = ''; }
    applyLimits(next.meta);
    if (performance.now() >= editingUntil && !editTimer) {
      const parameters = next.parameters || frame || {};
      for (const key of ['U', 'fn', 'zeta', 'massRatio', 'fixed']) if (parameters[key] !== undefined) draft[key] = parameters[key];
      updateLabels();
    }
    const ready = next.ready !== false && !!frame;
    controls.forEach(id => { $(id).disabled = !ready || (id !== 'browser-reset' && !!next.error); });
    set('browser-run', next.running ? '暂停' : frame && frame.t > 0 ? '继续实验' : '开始实验');
    $('browser-run').setAttribute('aria-pressed', String(!!next.running));
    set('browser-badge', next.error ? '已停止' : !ready ? '准备中' : next.running ? '正在计算' : '已暂停');
    $('browser-status').dataset.error = String(!!next.error);
    if (next.error) set('browser-status', '计算已停止：' + (next.error.message || next.error) + '。可在更多设置中重新开始。');
    else if (!ready) set('browser-status', '正在准备浏览器内的流场计算…');
    else set('browser-status', next.running ? (frame.t < 40 ? '初始尾流正在发展，可随时拖动风速。' : '拖动风速，继续观察同一条尾流和结构响应。') : frame.t > 0 ? '拖动风速或点继续，沿用当前流场。' : '拖动风速或点开始，让尾流逐步发展。');
    dirty = true; scheduleDraw();
  }
  function send(params) {
    if (!engine) return;
    try { engine.control(params); } catch (error) { set('browser-status', '操作未完成：' + error.message); $('browser-status').dataset.error = 'true'; }
  }
  function edit(params) {
    editingUntil = performance.now() + 500; clearTimeout(editTimer); Object.assign(pendingEdits, params);
    editTimer = setTimeout(() => { editTimer = null; const patch = pendingEdits; pendingEdits = {}; send(patch); }, 70);
  }
  function prepare(canvas) {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight), ratio = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
    const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, w, h); return { ctx, w, h };
  }
  function projection(w, h, bounds) {
    const pad = 10, topPad = 24, bottomPad = 10;
    const scale = Math.min(Math.max(1, w - 2 * pad) / (bounds[1] - bounds[0]), Math.max(1, h - topPad - bottomPad) / (bounds[3] - bounds[2]));
    const width = (bounds[1] - bounds[0]) * scale, height = (bounds[3] - bounds[2]) * scale;
    const left = (w - width) / 2, top = topPad + (h - topPad - bottomPad - height) / 2;
    return { scale, width, height, left, top, x: x => left + (x - bounds[0]) * scale, y: y => top + (bounds[3] - y) * scale };
  }
  function sample(field, data, x, y) {
    const b = field.bounds, gx = (x - b[0]) / (b[1] - b[0]) * (field.width - 1), gy = (y - b[2]) / (b[3] - b[2]) * (field.height - 1);
    if (gx < 0 || gy < 0 || gx > field.width - 1 || gy > field.height - 1) return null;
    const ix = Math.min(field.width - 2, Math.floor(gx)), iy = Math.min(field.height - 2, Math.floor(gy)), ax = gx - ix, ay = gy - iy;
    const ids = [iy * field.width + ix, iy * field.width + ix + 1, (iy + 1) * field.width + ix, (iy + 1) * field.width + ix + 1];
    const weights = [(1 - ax) * (1 - ay), ax * (1 - ay), (1 - ax) * ay, ax * ay];
    let sum = 0, weight = 0;
    for (let j = 0; j < 4; j++) if ((!field.solid || !field.solid[ids[j]]) && finite(data[ids[j]])) { sum += data[ids[j]] * weights[j]; weight += weights[j]; }
    return weight > 1e-8 ? sum / weight : null;
  }
  function surface() {
    if (!frame) return null;
    const s = frame.surfacePressure;
    if (s && (s.Cp || s.cp)) {
      const theta = Array.from(s.thetaDegrees || s.theta || []), cp = Array.from(s.Cp || s.cp);
      if (!theta.length || theta.length !== cp.length) return null;
      if (theta.at(-1) < theta[0] + 359.9) { theta.push(theta[0] + 360); cp.push(cp[0]); }
      return { theta, cp, pRef: s.pRef, source: '粗网格外侧节点近壁取样，并非精确壁面压力', definition: s.referenceDescription || s.reference || '入口截面平均静压', raw: s };
    }
    return null;
  }
  function fieldRaster(field, p, box) {
    const width = Math.max(1, Math.ceil(p.width)), height = Math.max(1, Math.ceil(p.height));
    raster.width = width; raster.height = height;
    const pixels = rasterCtx.createImageData(width, height), range = ranges[fieldMode], yOffset = field.coordinateFrame === 'body-attached' ? frame.y : 0;
    const background = theme === 'dark' ? [16, 30, 45] : [240, 247, 250], key = fieldMode === 'pressure' ? 'pressure' : 'vorticity';
    for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
      const x = box[0] + (i + .5) / width * (box[1] - box[0]), yLab = box[3] - (j + .5) / height * (box[3] - box[2]), y = yLab - yOffset;
      let value = null;
      if (x * x + (yLab - frame.y) ** 2 >= .25) {
        if (fieldMode === 'velocity') { const u = sample(field, field.u, x, y), v = sample(field, field.v, x, y); if (u !== null && v !== null) value = Math.hypot(u, v); }
        else if (field[key]) value = sample(field, field[key], x, y);
      }
      const rgb = value === null ? background : color(value, range, fieldMode, theme), k = 4 * (j * width + i);
      pixels.data[k] = rgb[0]; pixels.data[k + 1] = rgb[1]; pixels.data[k + 2] = rgb[2]; pixels.data[k + 3] = 255;
    }
    rasterCtx.putImageData(pixels, 0, 0);
  }
  function drawField() {
    if (!visible($('browser-field'))) return;
    if ($('browser-field').clientWidth < 24 || $('browser-field').clientHeight < 40) return;
    const canvas = $('browser-field'), { ctx, w, h } = prepare(canvas), dark = theme === 'dark', ink = dark ? '#cde1ee' : C.ink;
    ctx.fillStyle = dark ? '#101e2d' : '#f0f7fa'; ctx.fillRect(0, 0, w, h);
    ctx.font = '10px "Segoe UI","Microsoft YaHei",sans-serif'; ctx.fillStyle = dark ? '#a9c7d9' : C.muted;
    if (!frame || !frame.field) { ctx.textAlign = 'center'; ctx.fillText(state.error ? '等待重新开始' : '流场正在准备', w / 2, h / 2); return; }
    const box = fieldMode === 'surface' ? [-1.6, 1.6, frame.y - 1.05, frame.y + 1.05] : [-1.5, 9.5, -2, 2];
    const p = projection(w, h, box), field = frame.field;
    const key = [state.sessionId, frame.step, fieldMode, theme, w, h].join(':');
    if (fieldMode !== 'surface') {
      if (key !== lastFieldKey) { fieldRaster(field, p, box); lastFieldKey = key; }
      ctx.drawImage(raster, p.left, p.top, p.width, p.height);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(p.left, p.top, p.width, p.height); ctx.clip();
    ctx.setLineDash([3, 4]); ctx.strokeStyle = dark ? 'rgba(160,191,210,.25)' : 'rgba(80,115,135,.25)'; ctx.lineWidth = .7;
    ctx.beginPath(); ctx.moveTo(p.x(-.9), p.y(0)); ctx.lineTo(p.x(.9), p.y(0)); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(p.x(0), p.y(frame.y), .5 * p.scale, 0, 2 * Math.PI); ctx.fillStyle = '#f5fafc'; ctx.fill(); ctx.strokeStyle = dark ? '#b9d0df' : C.ink; ctx.lineWidth = 1; ctx.stroke();
    if (fieldMode === 'surface') {
      const s = surface();
      if (s) for (let i = 0; i < s.theta.length - 1; i++) {
        const a = s.theta[i] * Math.PI / 180, b = s.theta[i + 1] * Math.PI / 180, rgb = color((s.cp[i] + s.cp[i + 1]) / 2, ranges.surface, 'surface', theme);
        ctx.beginPath(); ctx.strokeStyle = 'rgb(' + rgb.join(',') + ')'; ctx.lineWidth = 7;
        ctx.moveTo(p.x(-.5 * Math.cos(a)), p.y(frame.y + .5 * Math.sin(a))); ctx.lineTo(p.x(-.5 * Math.cos(b)), p.y(frame.y + .5 * Math.sin(b))); ctx.stroke();
      }
      ctx.fillStyle = ink; ctx.font = '10px "Segoe UI","Microsoft YaHei",sans-serif'; ctx.textAlign = 'right'; ctx.fillText('0° 迎风', p.x(-.65), p.y(frame.y) + 4); ctx.textAlign = 'left'; ctx.fillText('180° 背风', p.x(.65), p.y(frame.y) + 4); ctx.textAlign = 'center'; ctx.fillText('90°', p.x(0), p.y(frame.y + .72)); ctx.fillText('270°', p.x(0), p.y(frame.y - .79));
    }
    ctx.restore(); ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.font = '10px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillText(fieldMode === 'surface' ? '当前圆柱压力 · 瞬态' : '来流 →', 11, 16);
    ctx.textAlign = 'right'; ctx.fillText('Re = ' + fmt(frame.Re, 0), w - 11, 16);
    canvas.dataset.step = String(frame.step); canvas.dataset.time = String(frame.t); canvas.dataset.y = String(frame.y); canvas.dataset.coordinateFrame = 'laboratory'; canvas.dataset.sourceFrame = field.coordinateFrame || 'laboratory';
  }
  function line(ctx, x0, y0, x1, y1, stroke = C.ink, width = 1.4) { ctx.beginPath(); ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  function recentHistory(span = 40) {
    const rows = Array.isArray(state.history) ? state.history : [];
    const end = frame ? frame.t : 0; let start = rows.length - 1;
    while (start > 0 && rows[start - 1].t >= end - span) start--;
    return rows.slice(Math.max(0, start));
  }
  function drawStructure(rows) {
    if (!visible($('browser-structure'))) return;
    const { ctx, w, h } = prepare($('browser-structure')); ctx.fillStyle = '#eef5f8'; ctx.fillRect(0, 0, w, h);
    if (!frame) return;
    const peak = Math.max(.001, Math.abs(frame.y), ...rows.map(r => Math.abs(r.y || 0)));
    displayScale = [10, 5, 2, 1, .5].find(factor => peak * factor * 18 < h * .23) || .25;
    const x = w * .43, eq = h * .64, radius = 12, cy = eq - frame.y * 18 * displayScale, top = 13, bottom = cy - radius;
    line(ctx, x - 25, top, x + 25, top);
    if (frame.fixed) line(ctx, x, top, x, bottom);
    else {
      const a = x - 11, b = x + 11, mid = (top + bottom) / 2;
      ctx.beginPath(); ctx.strokeStyle = C.blue; ctx.moveTo(a, top);
      for (let j = 0; j < 8; j++) ctx.lineTo(a + (j % 2 ? 4 : -4), top + 5 + (bottom - top - 10) * j / 7); ctx.lineTo(a, bottom); ctx.stroke();
      line(ctx, b, top, b, mid - 7, C.teal); line(ctx, b - 4, mid - 7, b + 4, mid - 7, C.teal); line(ctx, b - 4, mid - 7, b - 4, mid + 10, C.teal); line(ctx, b + 4, mid - 7, b + 4, mid + 10, C.teal); line(ctx, b - 4, mid + 2, b + 4, mid + 2, C.teal); line(ctx, b, mid + 2, b, bottom, C.teal);
    }
    ctx.setLineDash([2, 3]); line(ctx, 10, eq, w - 9, eq, '#b5c9d3', .8); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x, cy, radius, 0, Math.PI * 2); ctx.fillStyle = 'white'; ctx.fill(); ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.font = '10px "Segoe UI","Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = C.ink; ctx.fillText(frame.fixed ? '固定' : 'm', x, cy + 3);
    if (finite(frame.lift) && Math.abs(frame.lift) > 1e-9) {
      const ax = x + 24, direction = frame.lift > 0 ? -1 : 1, end = cy + direction * 20;
      line(ctx, ax, cy, ax, end, C.orange, 1.7); line(ctx, ax, end, ax - 3, end - direction * 5, C.orange); line(ctx, ax, end, ax + 3, end - direction * 5, C.orange);
    }
    set('browser-motion-scale', '结构示意 · 位移 ×' + displayScale);
    $('browser-structure').dataset.y = String(frame.y); $('browser-structure').dataset.displacementScale = String(displayScale);
  }
  function plot(canvas, rows, xKey, yKey, options = {}) {
    if (!visible(canvas)) return; chartDraws++;
    const { ctx, w, h } = prepare(canvas), m = { l: w < 250 ? 35 : 42, r: 7, t: 10, b: 28 }, pw = w - m.l - m.r, ph = h - m.t - m.b;
    const data = rows.filter(r => finite(r[xKey]) && finite(r[yKey]));
    const loX = options.xMin !== undefined ? options.xMin : data.length ? data[0][xKey] : 0;
    const hiX = options.xMax !== undefined ? options.xMax : data.length ? Math.max(loX + .1, data.at(-1)[xKey]) : 40;
    let lo = data.length ? Infinity : -.01, hi = data.length ? -Infinity : .01;
    for (const row of data) { lo = Math.min(lo, row[yKey]); hi = Math.max(hi, row[yKey]); }
    if (options.symmetric) { const span = Math.max(.001, Math.abs(lo), Math.abs(hi)) * 1.12; lo = -span; hi = span; }
    else { const pad = Math.max(.001, (hi - lo) * .12); lo -= pad; hi += pad; }
    const x = v => m.l + (v - loX) / (hiX - loX) * pw, y = v => m.t + (hi - v) / (hi - lo) * ph;
    ctx.font = '9px "Segoe UI","Microsoft YaHei",sans-serif'; ctx.fillStyle = C.muted;
    for (const value of [lo, (lo + hi) / 2, hi]) { line(ctx, m.l, y(value), w - m.r, y(value), '#dce6eb', .6); ctx.textAlign = 'right'; ctx.fillText(fmt(value, Math.max(Math.abs(lo), Math.abs(hi)) < .01 ? 4 : 3), m.l - 4, y(value) + 3); }
    if (lo < 0 && hi > 0) line(ctx, m.l, y(0), w - m.r, y(0), '#b8ced8', .7);
    ctx.textAlign = 'left'; ctx.fillText(fmt(loX, options.angle ? 0 : 1), m.l, h - 13); ctx.textAlign = 'right'; ctx.fillText(fmt(hiX, options.angle ? 0 : 1), w - m.r, h - 13);
    ctx.textAlign = 'center'; ctx.fillText(options.angle ? '周向角 θ / °' : '计算时间 t*', m.l + pw / 2, h - 1);
    if (data.length > 1) {
      ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip(); ctx.beginPath(); ctx.strokeStyle = options.color || C.teal; ctx.lineWidth = 1.6;
      const stride = Math.max(1, Math.floor(data.length / (w * 2)));
      for (let i = 0; i < data.length; i += stride) { const r = data[i]; if (i) ctx.lineTo(x(r[xKey]), y(r[yKey])); else ctx.moveTo(x(r[xKey]), y(r[yKey])); }
      const last = data.at(-1); ctx.lineTo(x(last[xKey]), y(last[yKey])); ctx.stroke(); ctx.restore();
    } else { ctx.textAlign = 'center'; ctx.fillStyle = C.muted; ctx.fillText('等待响应建立', m.l + pw / 2, m.t + ph / 2); }
    canvas.dataset.points = String(data.length); canvas.dataset.lastTime = String(data.length ? data.at(-1)[xKey] : 0);
  }
  function drawReadings(rows) {
    if (!frame) return;
    const p = frame, U = finite(p.U) ? p.U : draft.U;
    set('browser-actual-u', fmt(U, 2)); set('browser-y', fmt(p.y, 4)); set('browser-clock', 't* = ' + fmt(p.t, 1));
    set('browser-stage', p.fixed ? '结构已固定' : !state.running ? p.t > 0 ? '保持当前流场' : '等待开始计算' : p.t < 40 ? '尾流正在发展' : '观察振幅的变化');
    set('browser-ur', fmt(U / p.fn, 3)); set('browser-m', fmt(p.mass, 3)); set('browser-k', fmt(p.k, 3)); set('browser-c', fmt(p.c, 3)); set('browser-re', fmt(p.Re, 1));
    if (rows.length > 1) {
      const ys = rows.map(r => r.y).filter(finite), amplitude = ys.length > 1 ? (Math.max(...ys) - Math.min(...ys)) / 2 : null;
      set('browser-response-note', '最近一段时程的半峰峰幅值 A/D = ' + fmt(amplitude, 4) + (p.fixed ? '。统计窗可能包含固定前的运动。' : '。调参后需继续观察，响应不会立即达到稳态。'));
    } else set('browser-response-note', '初始流场需要发展，响应会随计算逐步建立。');
    const speed = state.performance && state.performance.speedRatio;
    set('browser-performance', '计算时间 / 实际耗时 = ' + fmt(speed, 2) + '×；计算时间不一定与现实时间同步。');
    if (visible($('browser-frequency-note'))) {
      const frequency = p.frequency || {};
      const measure = v => finite(v) ? fmt(v, 3) : '采样中';
      set('browser-frequency-note', '最近窗口频谱主峰：尾流 ' + measure(p.fProbe !== undefined ? p.fProbe : frequency.probe) + '，升力 ' + measure(p.fLift !== undefined ? p.fLift : frequency.lift) + '；结构固有频率 ' + fmt(p.fn, 3) + '。StU/D≈' + fmt(.16 * U, 3) + ' 仅作参考。变速时估计有延迟，固定或弱响应时不报告振动频率。');
    }
  }
  function draw() {
    if (document.hidden || !visible(panel)) return;
    const rows = recentHistory(); drawField(); drawStructure(rows); plot($('browser-motion'), rows, 't', 'y', { symmetric: true }); drawReadings(rows);
    if (visible($('browser-wind-history'))) plot($('browser-wind-history'), state.history || [], 't', 'U', { color: C.blue });
    if (visible($('browser-lift-history'))) plot($('browser-lift-history'), state.history || [], 't', 'CL', { color: C.orange });
    $('browser-surface-card').hidden = fieldMode !== 'surface';
    if (fieldMode === 'surface' && visible($('browser-cp'))) {
      const s = surface();
      if (s) { plot($('browser-cp'), s.theta.map((theta, i) => ({ theta, cp: s.cp[i] })), 'theta', 'cp', { angle: true, xMin: 0, xMax: 360, color: C.orange }); set('browser-cp-note', 'Cp=(p−pRef)/(½ρU(t)²)；pRef：' + s.definition + '。' + s.source + '。0°迎风，90°上方，180°背风，270°下方。颜色固定 −3～1.5，曲线保留原值。'); }
      else { plot($('browser-cp'), [], 'theta', 'cp', { angle: true, xMin: 0, xMax: 360 }); set('browser-cp-note', '当前求解器尚未提供近壁压力取样。'); }
    }
    dirty = false;
  }
  function scheduleDraw() {
    if (paintTimer || document.hidden) return;
    paintTimer = setTimeout(() => { paintTimer = null; if (dirty) draw(); }, 90);
  }
  function updateFieldMode() {
    fieldMode = $('browser-field-mode').value; theme = $('browser-theme').value; lastFieldKey = '';
    const names = { vorticity: '涡量 ωD/Uref', velocity: '速度 |u|/Uref', pressure: '压力 p/(ρUref²)', surface: '表面压力系数 Cp' };
    set('browser-field-name', names[fieldMode]); const range = ranges[fieldMode]; set('browser-scale-label', fmt(range[0], 1) + '　' + fmt(range[1], 1));
    const stops = [range[0], (range[0] + range[1]) / 2, range[1]].map(v => 'rgb(' + color(v, range, fieldMode, theme).join(',') + ')');
    panel.querySelector('.browser-colorbar').style.background = 'linear-gradient(90deg,' + stops.join(',') + ')';
    const wrap = panel.querySelector('.browser-field-wrap'); wrap.style.background = theme === 'dark' ? '#101e2d' : '#f0f7fa'; wrap.style.color = theme === 'dark' ? '#bed3e1' : C.muted;
    dirty = true; draw();
  }
  function download(name, blob) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
  function exportRecord(csv) {
    const current = engine && engine.getState ? engine.getState() : state;
    if (csv) {
      const columns = ['step', 't', 'U', 'Re', 'y', 'v', 'a', 'CL', 'CD', 'probeV', 'fn', 'zeta', 'massRatio', 'Sc', 'fixed', 'fProbe', 'fLift', 'fY'];
      const text = '\ufeff' + columns.join(',') + '\r\n' + (current.history || []).map(row => columns.map(key => row[key] == null ? '' : typeof row[key] === 'boolean' ? Number(row[key]) : row[key]).join(',')).join('\r\n');
      download('VIV_browser_history.csv', new Blob([text], { type: 'text/csv;charset=utf-8' }));
    } else {
      const record = { schema: 'viv-browser-experiment-v1', exportedAt: new Date().toISOString(), provenance: { mode: 'browser-live-computation', readsPrecomputedFlow: false }, ...current,
        display: { field: fieldMode, theme, range: ranges[fieldMode], coordinateFrame: 'laboratory', sourceCoordinateFrame: frame && frame.field && frame.field.coordinateFrame, interpolation: 'Bilinear interpolation of actual grid samples, with fluid weights renormalized near solid cells; velocity components before magnitude; no temporal interpolation.', structureDisplacementScale: displayScale } };
      download('VIV_browser_experiment.json', new Blob([JSON.stringify(record, (_, value) => ArrayBuffer.isView(value) ? Array.from(value) : value, 2)], { type: 'application/json' }));
    }
  }
  $('browser-run').addEventListener('click', () => send({ running: !state.running }));
  $('browser-wind').addEventListener('input', () => { draft.U = Number($('browser-wind').value); updateLabels(); edit({ U: draft.U, running: true }); });
  for (const [id, key, factor] of [['browser-fn', 'fn', 1], ['browser-zeta', 'zeta', .01], ['browser-mass', 'massRatio', 1]]) $(id).addEventListener('input', () => {
    draft[key] = Number($(id).value) * factor; updateLabels(); edit({ fn: draft.fn, zeta: draft.zeta, massRatio: draft.massRatio });
  });
  $('browser-sc').addEventListener('input', () => { draft.zeta = Number($('browser-sc').value) / (Math.PI ** 2 * draft.massRatio); updateLabels(); edit({ zeta: draft.zeta }); });
  for (const [id, fixed] of [['browser-free', false], ['browser-fixed', true]]) $(id).addEventListener('click', () => { draft.fixed = fixed; editingUntil = performance.now() + 500; updateLabels(); send({ fixed }); });
  $('browser-reset').addEventListener('click', () => { clearTimeout(editTimer); editTimer = null; pendingEdits = {}; lastFieldKey = ''; send({ reset: true, running: false }); });
  $('browser-field-mode').addEventListener('change', updateFieldMode); $('browser-theme').addEventListener('change', updateFieldMode);
  $('browser-export').addEventListener('click', () => exportRecord(false)); $('browser-export-csv').addEventListener('click', () => exportRecord(true));
  panel.querySelectorAll('details').forEach(el => el.addEventListener('toggle', () => { dirty = true; scheduleDraw(); }));
  window.addEventListener('resize', () => { lastFieldKey = ''; dirty = true; draw(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { dirty = true; scheduleDraw(); } });
  window.VIVBrowserView = { draw: () => { dirty = true; draw(); }, getState: () => ({ ready: state.ready, running: state.running, error: state.error, sessionId: state.sessionId, field: fieldMode, theme, draft: { ...draft, Sc: sc(draft) }, historyLength: (state.history || []).length, current: frame ? { step: frame.step, t: frame.t, y: frame.y, U: frame.U, fn: frame.fn, zeta: frame.zeta, massRatio: frame.massRatio, Sc: frame.Sc, fixed: frame.fixed } : null, structureDisplacementScale: displayScale, chartDraws, advancedOpen: $('browser-more').open, fieldShape: frame && frame.field ? [frame.field.width, frame.field.height] : null }) };
  function initialize() {
    engine = window.VIVBrowserEngine;
    if (!engine || typeof engine.subscribe !== 'function') { set('browser-status', '计算模块尚未加载，请刷新页面后重试。'); $('browser-status').dataset.error = 'true'; return; }
    engine.subscribe(receive); if (engine.getState) receive(engine.getState());
  }
  updateLabels(); draw(); initialize();
})();
