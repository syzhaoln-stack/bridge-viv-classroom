(function () {
  'use strict';
  const $ = id => document.getElementById(id), root = $('viv-lesson');
  if (!root) return;
  const engine = window.VIVBrowserEngine, finite = Number.isFinite;
  const fmt = (value, digits = 3) => finite(value) ? value.toFixed(digits) : '—';
  const letters = ['A', 'B', 'C', 'D'];
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const questions = [
    {
      id: 1, topic: '风速变大，振幅一定变大吗？',
      title: '关于涡振的说法，正确的是：',
      options: ['随机振动', '涡脱频率接近结构频率导致共振', '振动幅度会不断增长至发散', '风速越大，振幅越大'], correct: 1,
      explanation: '<p>涡脱落产生交替升力，推动结构振动。当脱涡频率接近结构固有频率时，响应可能明显增强；流固耦合还可能产生频率锁定。</p><p>涡振通常表现为一定风速区间内的有限幅振动。离开这一范围后，振幅可能减小，不能只凭风速大小判断。启动后振幅正在建立，也不等于最终会发散。</p>',
      guidance: '在弹性支承下，依次调低、中、高风速。每次保持一段时间，记录振幅与频率，再比较。1.00 是便于对照的中间风速，实际响应峰值会随固有频率和阻尼改变。',
      actions: [['free', '弹性支承'], ['low', '低风速 0.60'], ['middle', '中间风速 1.00'], ['high', '高风速 1.50']]
    },
    {
      id: 2, topic: '区分涡振与动力失稳',
      title: '以下哪种风致效应，对应振动幅度无限增长？',
      condition: '按超过临界条件后的线性失稳模型讨论。',
      options: ['颤振（动力失稳）', '涡振（共振）', '抖振（随机振动）', '扭转发散（静风失稳）'], correct: 0,
      explanation: '<p>颤振是气流与结构相互作用造成的动力失稳。超过临界条件后，线性模型中的振动幅值可持续增长。</p><p>这里的“无限增长”是理想化发散趋势；真实结构可能先受非线性限制或发生破坏。扭转发散属于静力平衡失稳，不能把静态转角增大等同于振动幅值增长。</p>',
      guidance: '回到当前涡振实验，观察振幅建立之后是否仍持续增长。单个短时间窗不能判断失稳；当前模型只用于涡振，下面的其他机制是概念对照。',
      actions: [['observe', '到涡振实验中观察']],
      mechanisms: true
    },
    {
      id: 3, topic: '比较涡脱落、升力与结构频率',
      title: '涡脱落的频率 ____ 升力的频率；____ 于来流风速。',
      condition: '按交替脱涡的主频讨论；断面尺寸固定、St 近似不变，且处于锁定区外。',
      options: ['等于；反比', '大于；正比', '等于；正比', '小于；反比'], correct: 2,
      explanation: '<p>在本题条件下，交替脱涡对应升力的主频；由 fₛ = St·U/D 可知，St 与 D 不变时 fₛ 与 U 成正比。</p><p>当前探针给出尾流横向速度的主频估计，不是直接计数每个涡。应保持风速，积累足够周期后比较 fₛ 与 fL；短窗、谐波与非平稳变化都可能让估计有差异。进入锁定区后，不能继续套用简单正比关系。</p>',
      guidance: '先固定结构，分别保持较低、较高风速，观察尾流与升力的主频。随后解除固定，比较它们与固有频率。刚调完风速时频谱混合了前后状态，等待窗口更新再记录。',
      actions: [['fixed', '固定结构'], ['low', '低风速 0.60'], ['high', '高风速 1.50'], ['free', '解除固定']],
      frequencies: true
    },
    {
      id: 4, topic: '怎样减小涡振？',
      title: '以下哪种措施不能可靠降低涡振的幅值？',
      condition: '本题中，C、D 均指使结构避开所考察风速下的原共振区。',
      options: ['提高阻尼比', '降低来流湍流度', '结构频率远离涡脱频率区间', '提高刚度'], correct: 1,
      explanation: '<p>降低来流湍流度不是可靠的涡振减振措施。湍流可能改变涡的组织和相关性，其影响依赖断面、尺度与工况，不能直接套用“风更平稳，振动更小”。</p><p>提高阻尼通常有利于抑制涡振。质量不变时，提高刚度会提高固有频率；只有让频率避开所考察风速下的共振区，才有预期的减振作用，也可能把易振风速区间移到别处。</p><p>本页的低雷诺数模型没有可调来流湍流度，因此不提供“调湍流验证”的按钮。</p>',
      guidance: '先找到有明显振动的风速并保持。记录阻尼 1% 的结果，再改到 8%，等响应调整后记录；然后单独改变固有频率，判断它靠近还是远离实际升力频率。每次只改变一个量。',
      actions: [['dampingLow', '阻尼比 1%'], ['dampingHigh', '阻尼比 8%'], ['frequencyBase', '固有频率 0.18'], ['frequencyHigh', '固有频率 0.28']]
    }
  ];
  const actions = {
    free: { fixed: false }, fixed: { fixed: true }, low: { U: .6 }, middle: { U: 1 }, high: { U: 1.5 },
    dampingLow: { zeta: .01 }, dampingHigh: { zeta: .08 }, frequencyBase: { fn: .18 }, frequencyHigh: { fn: .28 }, observe: {}
  };
  const answers = questions.map(q => ({ questionId: q.id, selected: null, submitted: false, correct: null, attempts: [] }));
  const records = [], observations = [];
  let current = engine ? engine.getState() : null, activeQuestion = null, lastDisplay = -Infinity, recordSerial = 0;

  function renderQuestion(q) {
    const options = q.options.map((option, i) => '<label class="lesson-option"><input type="radio" name="lesson-answer-' + q.id + '" value="' + i + '"><span class="lesson-option-letter">' + letters[i] + '</span><span>' + escape(option) + '</span></label>').join('');
    const buttons = q.actions.map(([action, label]) => '<button type="button" data-lesson-action="' + action + '" data-question="' + q.id + '" disabled>' + escape(label) + '</button>').join('');
    return '<details id="lesson-question-' + q.id + '" class="lesson-question"' + (q.id === 1 ? ' open' : '') + '><summary><span class="lesson-question-number">' + q.id + '</span>' + q.topic + '<span id="lesson-result-' + q.id + '" class="lesson-question-result">未作答</span></summary>' +
      '<div class="lesson-question-content"><form data-lesson-question="' + q.id + '"><fieldset><legend>' + q.title + '</legend>' + (q.condition ? '<p class="lesson-condition">' + q.condition + '</p>' : '') + '<div class="lesson-options">' + options + '</div></fieldset><div class="lesson-submit-row"><button type="submit" class="lesson-submit" disabled>提交答案</button><span class="lesson-submit-hint">提交后看解释，可重新选择</span></div><div id="lesson-feedback-' + q.id + '" class="lesson-feedback" role="status" hidden></div></form>' +
      '<details class="lesson-observe"><summary>到实验中观察</summary><p>' + q.guidance + '</p><div class="lesson-observe-actions">' + buttons + '<button type="button" class="lesson-record-button" data-lesson-record="' + q.id + '" disabled>记录当前观察</button></div>' +
      (q.frequencies ? '<dl class="lesson-frequency"><dt>尾流探针主频 fₛ（估计）</dt><dd id="lesson-f-probe">—</dd><dt>升力主频 fL（估计）</dt><dd id="lesson-f-lift">—</dd><dt>结构固有频率 fₙ（设定）</dt><dd id="lesson-f-natural">—</dd></dl><p id="lesson-frequency-window" class="lesson-frequency-window">等待足够时程后显示频率与窗口分辨率。</p><p>保持风速后再比较；这里显示实际信号估计，不强制同频。频率单位均为 fD/Uref。</p>' : '') +
      (q.mechanisms ? '<details><summary>四种机制的概念对照</summary><div class="lesson-mechanisms"><div><strong>涡振 · 近频激励与流固耦合</strong>通常集中在一定风速区间，形成有限幅振动。</div><div><strong>颤振 · 动力失稳</strong>气流向结构运动输入能量，超过临界条件后线性响应可持续增长。</div><div><strong>抖振 · 随机受迫振动</strong>来流湍流产生随机脉动力，驱动结构响应。</div><div><strong>扭转发散 · 静力失稳</strong>气动力矩与扭转恢复力失去稳定平衡，主要是静态转角失稳。</div></div><p>这些是机制说明，当前圆柱 CFD 没有计算颤振、抖振或扭转发散。</p></details>' : '') + '</details></div></details>';
  }
  $('lesson-questions').innerHTML = questions.map(renderQuestion).join('');

  function setText(id, value) { const el = $(id); if (el && el.textContent !== value) el.textContent = value; }
  function updateProgress() {
    const count = answers.filter(answer => answer.submitted).length;
    setText('lesson-progress', '已提交 ' + count + ' / 4');
    $('lesson-export').disabled = !records.length && !answers.some(answer => answer.selected !== null);
  }
  function ready() { return !!(current && current.ready && current.snapshot && !current.error); }
  function updateLive(force = false) {
    const now = performance.now();
    if (!force && now - lastDisplay < 450) return;
    lastDisplay = now;
    root.querySelectorAll('[data-lesson-action],[data-lesson-record]').forEach(button => { button.disabled = !ready(); });
    $('lesson-dock-record').disabled = !ready();
    if (!root.open || !$('lesson-question-3').open) return;
    const s = current && current.snapshot;
    setText('lesson-f-probe', fmt(s?.fProbe)); setText('lesson-f-lift', fmt(s?.fLift)); setText('lesson-f-natural', fmt(s?.fn));
    const info = s?.frequencyInfo;
    const describe = (name, value) => value && finite(value.frequency) ? name + '窗 ' + fmt(value.windowStart, 1) + '–' + fmt(value.windowEnd, 1) + '；Δf≈' + fmt(value.resolution) : name + '：信号或时程尚不足';
    setText('lesson-frequency-window', describe('尾流', info?.probe) + '。' + describe('升力', info?.lift) + '。');
  }
  root.addEventListener('toggle', () => updateLive(true), true);
  root.addEventListener('change', event => {
    const input = event.target;
    if (!input.matches('input[type=radio]')) return;
    const form = input.closest('form'), id = Number(form.dataset.lessonQuestion), answer = answers[id - 1];
    answer.selected = Number(input.value); answer.submitted = false; answer.correct = null;
    $('lesson-feedback-' + id).hidden = true;
    form.querySelector('[type=submit]').disabled = false;
    setText('lesson-result-' + id, answer.attempts.length ? '已修改，待提交' : '待提交');
    updateProgress();
  });
  root.addEventListener('submit', event => {
    const form = event.target.closest('[data-lesson-question]'); if (!form) return;
    event.preventDefault();
    const id = Number(form.dataset.lessonQuestion), answer = answers[id - 1], q = questions[id - 1];
    if (answer.selected === null) return;
    answer.submitted = true; answer.correct = answer.selected === q.correct;
    answer.attempts.push({ selected: answer.selected, correct: answer.correct, recordedAt: new Date().toISOString(), simulationTime: current?.snapshot?.t ?? null });
    const feedback = $('lesson-feedback-' + id);
    feedback.dataset.correct = String(answer.correct);
    feedback.innerHTML = '<strong>' + (answer.correct ? '选择正确' : '再对照一下：本题选 ' + letters[q.correct]) + '</strong>' + q.explanation;
    feedback.hidden = false;
    setText('lesson-result-' + id, answer.correct ? '已答对' : '已提交，可再选');
    updateProgress();
  });

  function scrollTo(element) {
    if (!element) return;
    element.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function observe(id, action) {
    if (!ready() || !engine || !Object.prototype.hasOwnProperty.call(actions, action)) return;
    try {
      const before = current.snapshot, requested = { ...actions[action], running: true };
      engine.control(requested);
      activeQuestion = id;
      observations.push({ questionId: id, action, requested, sessionId: current.sessionId, atTime: before.t, recordedAt: new Date().toISOString() });
      $('lesson-observe-dock').hidden = false; document.body.classList.add('lesson-is-observing');
      setText('lesson-dock-context', '正在观察第 ' + id + ' 题 · 沿用当前流场');
      setText('lesson-dock-status', '保持一段时间，再记录；调参后会有过渡过程。');
      setText('lesson-status', '已进入第 ' + id + ' 题的实验观察。');
      scrollTo($('browser-field'));
    } catch (error) { setText('lesson-status', '参数未能调整：' + error.message); }
  }
  function windowStats(s) {
    const rows = (current.history || []).filter(row => finite(row.t) && row.t >= s.t - 40 && row.t <= s.t + 1e-7 && finite(row.y));
    if (rows.length < 2) return { samples: rows.length, start: s.t, end: s.t, duration: 0, amplitude: null, rms: null, mixedParameters: false, windRange: [s.U, s.U] };
    let low = Infinity, high = -Infinity, sum = 0, uLow = Infinity, uHigh = -Infinity;
    for (const row of rows) { low = Math.min(low, row.y); high = Math.max(high, row.y); sum += row.y; if (finite(row.U)) { uLow = Math.min(uLow, row.U); uHigh = Math.max(uHigh, row.U); } }
    const mean = sum / rows.length;
    const rms = Math.sqrt(rows.reduce((total, row) => total + (row.y - mean) ** 2, 0) / rows.length);
    const mixed = rows.some(row => ['fn', 'zeta', 'massRatio', 'fixed'].some(key => row[key] !== undefined && row[key] !== s[key]));
    return { samples: rows.length, start: rows[0].t, end: rows.at(-1).t, duration: rows.at(-1).t - rows[0].t,
      amplitude: (high - low) / 2, rms, mean, mixedParameters: mixed, windRange: [uLow, uHigh] };
  }
  function capture(id) {
    if (!ready()) return;
    const s = current.snapshot, stats = windowStats(s);
    const scalar = {};
    for (const key of ['t', 'step', 'U', 'Re', 'fn', 'zeta', 'massRatio', 'fixed', 'y', 'v', 'CL', 'CD', 'Sc', 'k', 'c', 'fProbe', 'fLift', 'fY']) scalar[key] = s[key] ?? null;
    const record = { id: ++recordSerial, questionId: id, recordedAt: new Date().toISOString(), sessionId: current.sessionId,
      requestedWind: current.parameters?.U ?? null, snapshot: scalar, window: stats,
      frequencyInfo: s.frequencyInfo ? JSON.parse(JSON.stringify(s.frequencyInfo)) : null, note: '', isSteadyState: null };
    records.push(record); appendRecord(record); updateProgress();
    setText('lesson-record-count', records.length + ' 条');
    const notice = '已记录第 ' + records.length + ' 条观察（t* = ' + fmt(s.t, 1) + '）。';
    setText('lesson-status', notice); setText('lesson-dock-status', notice);
    return record;
  }
  function appendRecord(record) {
    const list = $('lesson-record-list'); list.querySelector('.lesson-empty')?.remove();
    const s = record.snapshot, w = record.window, card = document.createElement('article');
    card.className = 'lesson-record-card'; card.dataset.recordId = String(record.id);
    const windVaries = finite(w.windRange[0]) && w.windRange[1] - w.windRange[0] > .01;
    const warnings = [];
    if (w.duration < 35) warnings.push('窗口较短');
    if (windVaries) warnings.push('窗口内风速变化');
    if (w.mixedParameters) warnings.push('窗口内结构参数或支承改变');
    const frequencyWindows = ['probe', 'lift'].map(key => {
      const info = record.frequencyInfo?.[key];
      return info && finite(info.frequency) ? (key === 'probe' ? '尾流' : '升力') + '测频窗 ' + fmt(info.windowStart, 1) + '–' + fmt(info.windowEnd, 1) + '，Δf≈' + fmt(info.resolution) : '';
    }).filter(Boolean).join('；');
    card.innerHTML = '<div class="lesson-record-head"><strong>观察 ' + record.id + ' · 第 ' + record.questionId + ' 题</strong><span>t* ' + fmt(s.t, 1) + '</span></div>' +
      '<div class="lesson-record-values"><span>实际 U <b>' + fmt(s.U, 2) + '</b></span><span>fₙ <b>' + fmt(s.fn) + '</b></span><span>阻尼比 <b>' + fmt(s.zeta * 100, 1) + '%</b></span><span>半峰峰值 A/D <b>' + fmt(w.amplitude, 4) + '</b></span><span>尾流 fₛ <b>' + fmt(s.fProbe) + '</b></span><span>升力 fL <b>' + fmt(s.fLift) + '</b></span></div>' +
      '<p class="lesson-note">' + (s.fixed ? '固定结构' : '弹性支承') + '；m* = ' + fmt(s.massRatio, 0) + '；位移窗口 ' + fmt(w.start, 1) + '–' + fmt(w.end, 1) + '；RMS = ' + fmt(w.rms, 4) + ' D。' + (warnings.length ? warnings.join('，') + '。' : '') + '未判定稳态。</p>' +
      (frequencyWindows ? '<p class="lesson-note">' + frequencyWindows + '。</p>' : '') +
      '<label for="lesson-observation-' + record.id + '">我的观察<textarea id="lesson-observation-' + record.id + '" data-observation-note="' + record.id + '" maxlength="1200" placeholder="例如：参数改变后，振动与尾流发生了什么变化？"></textarea></label>';
    list.prepend(card);
  }
  root.addEventListener('input', event => {
    const id = Number(event.target.dataset.observationNote);
    if (id) { const record = records.find(item => item.id === id); if (record) record.note = event.target.value; }
  });
  root.addEventListener('click', event => {
    const action = event.target.closest('[data-lesson-action]');
    if (action) { observe(Number(action.dataset.question), action.dataset.lessonAction); return; }
    const record = event.target.closest('[data-lesson-record]');
    if (record) capture(Number(record.dataset.lessonRecord));
  });
  $('lesson-dock-record').addEventListener('click', () => { if (activeQuestion) capture(activeQuestion); });
  function hideDock() { $('lesson-observe-dock').hidden = true; document.body.classList.remove('lesson-is-observing'); }
  $('lesson-dock-close').addEventListener('click', hideDock);
  $('lesson-dock-return').addEventListener('click', () => {
    root.open = true;
    const question = $('lesson-question-' + activeQuestion);
    if (question) { question.open = true; scrollTo(question); question.querySelector('summary').focus({ preventScroll: true }); }
    hideDock();
  });
  function exportedState() {
    return {
      schema: 'viv-classroom-lesson-v1', exportedAt: new Date().toISOString(), source: 'current browser live CFD',
      units: { time: 't Uref / D', velocity: 'U / Uref', displacement: 'y / D', frequency: 'f D / Uref', dampingRatio: 'fraction' },
      questions: questions.map(q => ({ id: q.id, topic: q.topic, title: q.title, condition: q.condition || '', options: q.options })),
      answers, observations, records,
      amplitudeDefinition: 'Half the peak-to-peak displacement over at most the latest 40 nondimensional time units. Not a steady-state amplitude claim.',
      frequencyDefinition: 'Estimated from current signals, with finite-window resolution in each record. Missing values mean insufficient signal or record length.',
      steadyStateAssessment: 'not performed'
    };
  }
  $('lesson-export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(exportedState(), null, 2)], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '涡振课堂_作答与观察_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setText('lesson-status', '已导出作答、参数操作和观察记录。');
  });
  window.VIVLesson = { getState: () => JSON.parse(JSON.stringify({ ...exportedState(), activeQuestion, submittedCount: answers.filter(answer => answer.submitted).length })) };
  if (engine) engine.subscribe(next => { current = next; updateLive(); });
  else setText('lesson-status', '实验尚未准备好，题目仍可作答。');
  updateLive(true); updateProgress();
})();
