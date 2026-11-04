/* ===================== ПРЕДМЕТ ===================== */
/* Предмет выбирается до старта движка: смена предмета перезагружает страницу, поэтому всё состояние ниже — одного предмета. */
const SUBJ_KEY = 'trainer:subject';
const storedSubject = (() => { try { return localStorage.getItem(SUBJ_KEY); } catch (e) { return null; } })();
const SUBJ = SUBJECTS.find(s => s.id === storedSubject) || SUBJECTS[0];
const { TOPICS, NOTES, QUIZ, GEN, CODE } = SUBJ;
const TNAME = Object.fromEntries(TOPICS.map(t => [t.id, t.name]));
const subjKey = s => s.key || 'trainer-' + s.id + '-v1';
function switchSubject(id) {
  try { localStorage.setItem(SUBJ_KEY, id); } catch (e) {}
  location.hash = '';
  location.reload();
}

/* ===================== ХРАНИЛИЩЕ ===================== */
const KEY = subjKey(SUBJ);
const blankState = () => ({ v: 1, st: {}, wrong: { q: [], c: [] }, streak: 0, best: 0, log: [], items: {}, goal: 30 });
/* старые сохранения (без log/items/goal) дополняются недостающими полями */
const upgrade = s => Object.assign(blankState(), s, { wrong: Object.assign({ q: [], c: [] }, s.wrong) });
let S = (() => {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return upgrade(s); } catch (e) {}
  return blankState();
})();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
/* журнал: [время в секундах, вид 0/1/2, индекс темы, верно 0/1, секунд на ответ] */
const KIND_IX = { quiz: 0, task: 1, code: 2 };
const LOG_MAX = 15000;
let shownAt = Date.now();
const markShown = () => { shownAt = Date.now(); };
function record(kind, topic, ok, item) {
  const k = kind + ':' + topic;
  const r = S.st[k] || (S.st[k] = { ok: 0, n: 0 });
  r.n++; if (ok) r.ok++;
  S.streak = ok ? (S.streak || 0) + 1 : 0;
  S.best = Math.max(S.best || 0, S.streak);
  const now = Date.now();
  S.log.push([Math.round(now / 1000), KIND_IX[kind], TOPICS.findIndex(t => t.id === topic), ok ? 1 : 0, Math.min(300, Math.round((now - shownAt) / 1000))]);
  if (S.log.length > LOG_MAX) S.log.splice(0, S.log.length - LOG_MAX);
  if (item) { const it = S.items[item] || (S.items[item] = [0, 0]); it[1]++; if (ok) it[0]++; }
  save(); drawStreak();
}
/* номер локального дня: Math.round гасит сдвиг на час при переходе на летнее время */
const dayIx = ms => { const d = new Date(ms); return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 864e5); };
const todayCount = () => { const t = dayIx(Date.now()); let n = 0; for (let i = S.log.length - 1; i >= 0 && dayIx(S.log[i][0] * 1000) === t; i--) n++; return n; };
function drawStreak() {
  const tot = Object.values(S.st).reduce((a, r) => ({ ok: a.ok + r.ok, n: a.n + r.n }), { ok: 0, n: 0 });
  $('#streak').textContent = tot.n ? `сегодня ${todayCount()}/${S.goal} · серия ${S.streak || 0}` : '';
}
const setWrong = (bucket, id, isWrong) => {
  const arr = S.wrong[bucket]; const i = arr.indexOf(id);
  if (isWrong && i < 0) arr.push(id);
  if (!isWrong && i >= 0) arr.splice(i, 1);
  save();
};

CODE.forEach(c => { c.id = hash(c.k + c.code + c.task); });
QUIZ.forEach(q => { q.id = hash(q[1]); });
/* ===================== РОУТЕР ===================== */
const TABS = ['konspekt', 'test', 'tasks', 'code', 'progress'];
const view = $('#view');
let current = 'konspekt';
function go(tab, opts) {
  if (!TABS.includes(tab)) tab = 'konspekt';
  current = tab;
  document.querySelectorAll('nav.tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  try { history.replaceState(null, '', '#' + tab); } catch (e) {}
  try { localStorage.setItem(KEY + ':tab', tab); } catch (e) {}
  ({ konspekt: renderKonspekt, test: renderTest, tasks: renderTasks, code: renderCode, progress: renderProgress })[tab](opts || {});
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav.tabs button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));

function topicChips(selected, onToggle, only) {
  const ts = TOPICS.filter(t => !only || only.includes(t.id));
  const wrap = document.createElement('div'); wrap.className = 'chips scroll';
  const all = document.createElement('button'); all.className = 'chip'; all.textContent = 'Все темы';
  all.setAttribute('aria-pressed', selected.size === 0 ? 'true' : 'false');
  all.onclick = () => { selected.clear(); onToggle(); };
  wrap.appendChild(all);
  ts.forEach(t => {
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = t.name;
    b.setAttribute('aria-pressed', selected.has(t.id) ? 'true' : 'false');
    b.onclick = () => { selected.has(t.id) ? selected.delete(t.id) : selected.add(t.id); onToggle(); };
    wrap.appendChild(b);
  });
  return wrap;
}

/* ===================== КОНСПЕКТ ===================== */
function renderKonspekt() {
  const counts = t => ({ q: QUIZ.filter(q => q[0] === t).length, g: GEN.filter(g => g.t === t).length, c: CODE.filter(c => c.t === t).length });
  view.innerHTML = `<h2 class="view-title">Конспект</h2><p class="lede">Всё из лекций и ноутбуков курса, сжато. Прочитал тему — сразу проверь себя.</p><div class="stack" id="topics"></div>`;
  const box = $('#topics');
  TOPICS.forEach((t, i) => {
    const c = counts(t.id);
    const d = document.createElement('details'); d.className = 'topic';
    d.innerHTML = `<summary><span><span class="t">${t.name}</span><br><span class="n">${c.q} вопр. · ${c.g} генер. · ${c.c} код</span></span></summary>
      <div class="topic-body">${NOTES[t.id].map(n => `<div class="note"><h3>${n.h}</h3>${n.p ? `<p>${n.p}</p>` : ''}${n.ul ? `<ul>${n.ul.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}${n.f ? F(esc(n.f)) : ''}${n.trap ? `<div class="trap"><b>Ловушка.</b> ${n.trap}</div>` : ''}</div>`).join('')}
      <div class="row">${c.q ? `<button class="btn primary" data-go="test">Тест по теме</button>` : ''}${c.g ? `<button class="btn" data-go="tasks">Задачи</button>` : ''}${c.c ? `<button class="btn" data-go="code">Код</button>` : ''}</div></div>`;
    d.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go, { topic: t.id, autostart: true }));
    box.appendChild(d);
  });
}

/* ===================== ТЕСТ ===================== */
const quizSel = new Set();
let quiz = null;
function renderTest(opts) {
  if (opts.topic) { quizSel.clear(); quizSel.add(opts.topic); }
  if (opts.autostart) return startQuiz(false);
  if (quiz && !quiz.done && !opts.setup) return drawQuiz();
  const pool = QUIZ.filter(q => !quizSel.size || quizSel.has(q[0]));
  const wrongN = S.wrong.q.filter(id => QUIZ.some(q => q.id === id)).length;
  view.innerHTML = `<h2 class="view-title">Тест</h2><p class="lede">${QUIZ.length} вопросов по лекциям. Варианты перемешиваются, после ответа — объяснение.</p>
    <div class="stack"><div class="card stack"><span class="eyebrow">Темы</span><div id="tc"></div>
      <span class="eyebrow">Сколько вопросов</span><div class="chips" id="cnt"></div>
      <button class="btn primary wide" id="go">Начать · ${pool.length} в выбранных темах</button></div>
      <div class="card stack"><span class="eyebrow">Работа над ошибками</span><p class="muted" style="margin:0">Вопросы, на которые ты ответил неверно. Верный ответ убирает вопрос из списка.</p>
      <button class="btn wide" id="wr" ${wrongN ? '' : 'disabled'}>Повторить ошибки (${wrongN})</button></div></div>`;
  $('#tc').appendChild(topicChips(quizSel, () => renderTest({ setup: true })));
  let n = (() => { try { return Number(localStorage.getItem(KEY + ':qn')) || 10; } catch (e) { return 10; } })();
  const cnt = $('#cnt');
  [10, 20, 0].forEach(v => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = v ? String(v) : 'Все'; b.setAttribute('aria-pressed', v === n ? 'true' : 'false');
    b.onclick = () => { n = v; try { localStorage.setItem(KEY + ':qn', v); } catch (e) {} cnt.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); }; cnt.appendChild(b); });
  $('#go').onclick = () => startQuiz(false, n);
  $('#wr').onclick = () => startQuiz(true);
}
function startQuiz(mistakes, n) {
  if (n === undefined) { try { n = Number(localStorage.getItem(KEY + ':qn')); } catch (e) {} if (isNaN(n)) n = 10; }
  let pool = mistakes ? QUIZ.filter(q => S.wrong.q.includes(q.id)) : QUIZ.filter(q => !quizSel.size || quizSel.has(q[0]));
  pool = shuffle(pool); if (!mistakes && n) pool = pool.slice(0, n);
  quiz = { items: pool.map(q => { const order = shuffle(q[2].map((_, i) => i)); return { q, order }; }), i: 0, ok: 0, answered: false, wrong: [], mistakes, done: false };
  drawQuiz();
}
function drawQuiz() {
  if (!quiz.items.length) { view.innerHTML = `<div class="card">Вопросов нет. <button class="btn" id="b">Назад</button></div>`; $('#b').onclick = () => { quiz = null; renderTest({ setup: true }); }; return; }
  if (quiz.i >= quiz.items.length) return drawQuizEnd();
  const { q, order } = quiz.items[quiz.i];
  markShown();
  const pct = quiz.i / quiz.items.length * 100;
  view.innerHTML = `<div class="stack"><div class="bar"><i style="width:${pct}%"></i></div>
    <div class="card"><div class="q-head"><span class="eyebrow">${TNAME[q[0]]}</span><span class="mono muted">${quiz.i + 1} / ${quiz.items.length}</span></div>
    <p class="q-text">${q[1]}</p><div class="opts" id="opts"></div><div id="after"></div></div>
    <button class="btn ghost" id="quit">Закончить тест</button></div>`;
  const box = $('#opts');
  order.forEach(oi => {
    const b = document.createElement('button'); b.className = 'opt'; b.innerHTML = q[2][oi]; b.dataset.i = oi;
    b.onclick = () => answerQuiz(oi); box.appendChild(b);
  });
  $('#quit').onclick = () => { quiz.done = true; drawQuizEnd(); };
}
function answerQuiz(oi) {
  if (quiz.answered) return; quiz.answered = true;
  const { q } = quiz.items[quiz.i]; const ok = oi === q[3];
  document.querySelectorAll('#opts .opt').forEach(b => { b.disabled = true; const i = +b.dataset.i; if (i === q[3]) b.classList.add('correct'); else if (i === oi) b.classList.add('wrong'); });
  if (ok) quiz.ok++; else quiz.wrong.push(q);
  record('quiz', q[0], ok, 'q:' + q.id); setWrong('q', q.id, !ok);
  $('#after').innerHTML = `<div class="explain ${ok ? 'good' : 'bad'}"><span class="verdict ${ok ? 'good' : 'bad'}">${ok ? 'Верно' : 'Неверно'}</span>${q[4]}</div>
    <div style="margin-top:12px"><button class="btn primary wide" id="next">${quiz.i + 1 < quiz.items.length ? 'Дальше' : 'Итог'}</button></div>`;
  $('#next').onclick = () => { quiz.i++; quiz.answered = false; drawQuiz(); };
  $('#next').focus({ preventScroll: true });
  $('#after').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function drawQuizEnd() {
  quiz.done = true;
  const n = Math.min(quiz.i + (quiz.answered ? 1 : 0), quiz.items.length) || quiz.i;
  const total = quiz.answered ? quiz.i + 1 : quiz.i;
  view.innerHTML = `<div class="stack"><div class="card"><span class="eyebrow">Итог</span><div class="big-num">${quiz.ok} / ${total || 0}</div>
    <p class="muted" style="margin:4px 0 0">${total ? Math.round(quiz.ok / total * 100) + '% верно' : 'Ни одного ответа'}</p></div>
    ${quiz.wrong.length ? `<div class="card stack"><span class="eyebrow">Ошибки — перечитай</span>${quiz.wrong.map(q => `<div><b>${q[1]}</b><div class="explain">Ответ: ${q[2][q[3]]}. ${q[4]}</div></div>`).join('')}</div>` : ''}
    <div class="row"><button class="btn primary" id="again">Новый тест</button>${S.wrong.q.length ? `<button class="btn" id="wr">Ошибки (${S.wrong.q.length})</button>` : ''}</div></div>`;
  $('#again').onclick = () => { quiz = null; renderTest({ setup: true }); };
  if ($('#wr')) $('#wr').onclick = () => startQuiz(true);
}

/* ===================== КЛАВИШИ ===================== */
let lastInput = null;
document.addEventListener('focusin', e => { if (e.target.matches('input.inp, textarea.inp')) lastInput = e.target; });
function keybar(keys) {
  const k = keys || SUBJ.keys || ["'", '(', ')', '[', ']', '=', '_', '.', ',', ':', '-', '==', 'np.', 'pd.', 'df', '"', '{', '}', '#', '*', '/'];
  const d = document.createElement('div'); d.className = 'keybar'; d.setAttribute('aria-label', 'Символы');
  k.forEach(s => { const b = document.createElement('button'); b.type = 'button'; b.className = 'key'; b.textContent = s;
    b.addEventListener('pointerdown', e => e.preventDefault());
    b.onclick = () => { const el = lastInput && document.body.contains(lastInput) ? lastInput : d.parentElement.querySelector('input.inp, textarea.inp'); if (!el || el.disabled) return;
      const st = el.selectionStart ?? el.value.length, en = el.selectionEnd ?? el.value.length; el.value = el.value.slice(0, st) + s + el.value.slice(en);
      el.focus(); const p = st + s.length; try { el.setSelectionRange(p, p); } catch (e) {} el.dispatchEvent(new Event('input')); };
    d.appendChild(b); });
  return d;
}
const inputAttrs = 'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"';

/* ===================== ЗАДАЧИ ===================== */
const taskSel = new Set();
let task = null, taskStats = { ok: 0, n: 0 };
function renderTasks(opts) {
  if (opts.topic) { taskSel.clear(); if (GEN.some(g => g.t === opts.topic)) taskSel.add(opts.topic); }
  const gTopics = [...new Set(GEN.map(g => g.t))];
  view.innerHTML = `<h2 class="view-title">Задачи на счёт</h2><p class="lede">Генерируются заново каждый раз — бесконечно. Считай в уме или на калькуляторе, дробь можно через запятую.</p>
    <div class="stack"><div id="tc"></div><div id="task"></div></div>`;
  $('#tc').appendChild(topicChips(taskSel, () => renderTasks({}), gTopics));
  if (!task || opts.topic || !(taskSel.size === 0 || taskSel.has(task.t))) newTask(); else drawTask();
}
function newTask() {
  const pool = GEN.filter(g => !taskSel.size || taskSel.has(g.t));
  const g = pick(pool); const r = g.f();
  task = Object.assign({ t: g.t, name: g.name, type: 'num', tol: null, checked: false }, r);
  markShown();
  drawTask();
}
function drawTask() {
  const box = $('#task'); const t = task;
  box.innerHTML = `<div class="card stack"><div class="q-head"><span class="eyebrow">${TNAME[t.t]} · ${t.name}</span><span class="mono muted">${taskStats.ok}/${taskStats.n}</span></div>
    <p class="q-text" style="margin:0">${t.text}</p>
    ${t.type === 'choice' ? `<div class="opts" id="opts">${t.options.map((o, i) => `<button class="opt" data-i="${i}">${o}</button>`).join('')}</div>` :
      `<div class="field"><label for="ans">Ответ</label><input class="inp" id="ans" inputmode="decimal" ${inputAttrs} placeholder="например 12.5"></div>
       <div class="row"><button class="btn primary" id="chk">Проверить</button><button class="btn" id="show">Решение</button></div>`}
    <div id="fb"></div><button class="btn wide" id="nxt">Новая задача</button></div>`;
  if (t.type === 'choice') box.querySelectorAll('.opt').forEach(b => b.onclick = () => checkTask(+b.dataset.i));
  else {
    $('#chk').onclick = () => checkTask($('#ans').value);
    $('#ans').addEventListener('keydown', e => { if (e.key === 'Enter') checkTask($('#ans').value); });
    $('#show').onclick = () => { if (!t.checked) { t.checked = true; taskStats.n++; record('task', t.t, false, 'g:' + t.name); } showSol(false, true); };
  }
  $('#nxt').onclick = () => { newTask(); };
}
function showSol(ok, revealed) {
  const t = task;
  const ansStr = t.type === 'choice' ? t.options[t.answer] : fmt(t.answer);
  $('#fb').innerHTML = `<div class="explain ${revealed ? '' : ok ? 'good' : 'bad'}">${revealed ? '' : `<span class="verdict ${ok ? 'good' : 'bad'}">${ok ? 'Верно' : 'Неверно'}</span>`}<div class="sol">Ответ: <b class="mono">${ansStr}</b><br>${t.sol}</div></div>`;
}
function checkTask(v) {
  const t = task;
  let ok;
  if (t.type === 'choice') {
    if (t.checked) return;
    ok = v === t.answer;
    document.querySelectorAll('#opts .opt').forEach(b => { b.disabled = true; const i = +b.dataset.i; if (i === t.answer) b.classList.add('correct'); else if (i === v) b.classList.add('wrong'); });
  } else {
    const x = parseNum(v); if (isNaN(x)) { $('#fb').innerHTML = `<div class="explain bad">Введи число. Дробную часть можно через точку или запятую.</div>`; return; }
    const tol = t.tol ?? Math.max(0.011, Math.abs(t.answer) * 0.002);
    ok = Math.abs(x - t.answer) <= tol;
    $('#ans').classList.toggle('ok', ok); $('#ans').classList.toggle('no', !ok);
  }
  if (!t.checked) { t.checked = true; taskStats.n++; if (ok) taskStats.ok++; record('task', t.t, ok, 'g:' + t.name); }
  showSol(ok, false);
}

/* ===================== КОД ===================== */
const codeSel = new Set();
let codeKind = 'all', codeQ = null;
const KINDS = [['all', 'Всё'], ['fill', 'Пропуски'], ['out', 'Что выведет'], ['bug', 'Найди ошибку'], ['line', 'Напиши сам'], ['wrong', 'Мои ошибки']];
function renderCode(opts) {
  if (opts.topic) { codeSel.clear(); if (CODE.some(c => c.t === opts.topic)) codeSel.add(opts.topic); codeQ = null; }
  const cTopics = [...new Set(CODE.map(c => c.t))];
  view.innerHTML = `<h2 class="view-title">Код</h2><p class="lede">${SUBJ.codeLede}</p>
    <div class="stack"><div class="chips scroll" id="kinds"></div><div id="tc"></div><div id="cq"></div></div>`;
  KINDS.forEach(([k, n]) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = k === 'wrong' ? `${n} (${S.wrong.c.length})` : n; b.setAttribute('aria-pressed', k === codeKind ? 'true' : 'false');
    b.onclick = () => { codeKind = k; codeQ = null; renderCode({}); }; $('#kinds').appendChild(b); });
  $('#tc').appendChild(topicChips(codeSel, () => { codeQ = null; renderCode({}); }, cTopics));
  if (!codeQ) buildCodeQueue();
  drawCode();
}
function buildCodeQueue() {
  let pool = CODE.filter(c => (!codeSel.size || codeSel.has(c.t)));
  if (codeKind === 'wrong') pool = pool.filter(c => S.wrong.c.includes(c.id));
  else if (codeKind !== 'all') pool = pool.filter(c => c.k === codeKind);
  codeQ = { items: shuffle(pool), i: 0, ok: 0, n: 0 };
}
function renderBlanks(code) {
  return esc(code).replace(/\[(\d)\]/g, (_, d) => `<span class="blank">▢${d}</span>`);
}
function drawCode() {
  const box = $('#cq');
  if (!codeQ.items.length) { box.innerHTML = `<div class="card muted">${codeKind === 'wrong' ? 'Ошибок нет — отлично.' : 'Нет упражнений в этом фильтре.'}</div>`; return; }
  if (codeQ.i >= codeQ.items.length) {
    box.innerHTML = `<div class="card stack"><span class="eyebrow">Круг пройден</span><div class="big-num">${codeQ.ok} / ${codeQ.n}</div><button class="btn primary" id="rs">Ещё круг</button></div>`;
    $('#rs').onclick = () => { buildCodeQueue(); drawCode(); }; return;
  }
  const c = codeQ.items[codeQ.i]; c._done = false;
  markShown();
  const kindName = Object.fromEntries(KINDS)[c.k];
  let body = '';
  if (c.k === 'fill') body = `<pre class="code">${renderBlanks(c.code)}</pre><div class="stack" id="fields">${c.a.map((_, i) => `<div class="field"><label for="f${i}">▢${i + 1}</label><input class="inp" id="f${i}" ${inputAttrs}></div>`).join('')}</div>`;
  else if (c.k === 'out') body = `<pre class="code">${esc(c.code)}</pre><div class="field"><label for="f0">Вывод</label><input class="inp" id="f0" ${inputAttrs}></div>`;
  else if (c.k === 'bug') body = `<pre class="code">${esc(c.code)}</pre><div class="opts" id="opts">${shuffle(c.o.map((_, i) => i)).map(i => `<button class="opt" data-i="${i}">${c.o[i]}</button>`).join('')}</div>`;
  else body = `<div class="field"><label for="f0">Твой код</label><textarea class="inp" id="f0" ${inputAttrs} rows="5"></textarea></div><p class="hint-line" style="margin:0">Проверяются ключевые элементы, пробелы и тип кавычек не важны.</p>`;
  box.innerHTML = `<div class="card stack"><div class="q-head"><span class="eyebrow">${kindName} · ${TNAME[c.t]}</span><span class="mono muted">${codeQ.i + 1} / ${codeQ.items.length}</span></div>
    <p class="q-text" style="margin:0">${c.task}</p>${body}<div id="kb"></div>
    ${c.k !== 'bug' ? `<div class="row"><button class="btn primary" id="chk">Проверить</button><button class="btn" id="show">Показать ответ</button></div>` : ''}
    <div id="fb"></div><button class="btn wide" id="nxt">Дальше</button></div>`;
  if (c.k !== 'bug') {
    $('#kb').appendChild(keybar(c.k === 'out' ? ['(', ')', ',', '.', '-', '[', ']'] : undefined));
    $('#chk').onclick = () => checkCode(c);
    $('#show').onclick = () => { if (!c._done) { c._done = true; codeQ.n++; record('code', c.t, false, 'c:' + c.id); setWrong('c', c.id, true); } codeFeedback(c, null); };
    box.querySelectorAll('input.inp').forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') checkCode(c); }));
  } else box.querySelectorAll('.opt').forEach(b => b.onclick = () => checkBug(c, +b.dataset.i));
  $('#nxt').onclick = () => { codeQ.i++; drawCode(); };
}
/* SQL-предметы сравнивают без учёта регистра */
const normAns = x => SUBJ.ci ? normCode(x).toLowerCase() : normCode(x);
function finishCode(c, ok) {
  if (c._done) return; c._done = true; codeQ.n++; if (ok) codeQ.ok++;
  record('code', c.t, ok, 'c:' + c.id); setWrong('c', c.id, !ok);
}
function checkBug(c, i) {
  if (c._done) return; const ok = i === c.a;
  document.querySelectorAll('#opts .opt').forEach(b => { b.disabled = true; const j = +b.dataset.i; if (j === c.a) b.classList.add('correct'); else if (j === i) b.classList.add('wrong'); });
  finishCode(c, ok); codeFeedback(c, ok);
}
function checkCode(c) {
  let ok;
  if (c.k === 'fill') {
    const res = c.a.map((alts, i) => { const v = normAns($('#f' + i).value); const good = alts.some(a => normAns(a) === v); $('#f' + i).classList.toggle('ok', good); $('#f' + i).classList.toggle('no', !good); return good; });
    ok = res.every(Boolean);
  } else if (c.k === 'out') {
    const raw = $('#f0').value;
    if (typeof c.a === 'number') { const x = parseNum(raw); ok = !isNaN(x) && Math.abs(x - c.a) <= (c.tol ?? 1e-6); }
    else ok = [].concat(c.a).some(a => normAns(raw) === normAns(a));
    $('#f0').classList.toggle('ok', ok); $('#f0').classList.toggle('no', !ok);
  } else {
    const v = normAns($('#f0').value);
    const miss = c.need.filter(tok => !(Array.isArray(tok) ? tok : [tok]).some(a => v.includes(normAns(a))));
    ok = miss.length === 0;
    $('#f0').classList.toggle('ok', ok); $('#f0').classList.toggle('no', !ok);
    if (!ok) {
      if (!c._done) { finishCode(c, false); }
      $('#fb').innerHTML = `<div class="explain bad"><span class="verdict bad">Не хватает ${miss.length} из ${c.need.length} ключевых элементов</span>Подумай ещё или нажми «Показать ответ».</div>`;
      return;
    }
  }
  finishCode(c, ok); codeFeedback(c, ok);
}
function codeFeedback(c, ok) {
  let ans = '';
  if (c.k === 'fill') ans = `<pre class="code">${esc(c.code.replace(/\[(\d)\]/g, (_, d) => c.a[d - 1][0]))}</pre>`;
  else if (c.k === 'out') ans = `Вывод: <b class="mono">${esc([].concat(c.a).join(' или '))}</b>`;
  else if (c.k === 'line') ans = `<pre class="code">${esc(c.ref)}</pre>`;
  else ans = `Ответ: ${c.o[c.a]}`;
  $('#fb').innerHTML = `<div class="explain ${ok === null ? '' : ok ? 'good' : 'bad'}">${ok === null ? '' : `<span class="verdict ${ok ? 'good' : 'bad'}">${ok ? 'Верно' : 'Неверно'}</span>`}<div class="stack" style="gap:8px">${ans}${c.e ? `<div>${c.e}</div>` : ''}</div></div>`;
}

/* ===================== ПРОГРЕСС ===================== */
let resetArmed = false, importArmed = null;
const KIND_KEYS = ['quiz', 'task', 'code'];
const median = a => { if (!a.length) return null; const s = sorted(a), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fmtDur = sec => sec < 60 ? Math.round(sec) + ' с' : sec < 3600 ? Math.round(sec / 60) + ' мин' : Math.floor(sec / 3600) + ' ч ' + Math.round(sec % 3600 / 60) + ' мин';
const pct = (ok, n) => n ? Math.round(ok / n * 100) : null;
const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
/* dayIx(...)·864e5 — полночь UTC той же календарной даты, поэтому читаем UTC-поля */
const dayDate = ix => new Date(ix * 864e5);
const dayLabel = ix => { const d = dayDate(ix); return `${DOW[d.getUTCDay()]}, ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const plainText = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g, ' ').trim(); };
const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
const answersWord = n => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? 'ответ' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'ответа' : 'ответов'; };

function progressData() {
  const today = dayIx(Date.now());
  const byDay = new Map();
  const dtKind = [[], [], []];
  const topicLog = TOPICS.map(() => []);
  S.log.forEach(([ts, k, ti, ok, dt]) => {
    const d = dayIx(ts * 1000); const r = byDay.get(d) || { ok: 0, n: 0, sec: 0 };
    r.n++; r.ok += ok; r.sec += dt; byDay.set(d, r);
    if (dt > 0) dtKind[k].push(dt);
    if (ti >= 0) topicLog[ti].push(ok);
  });
  let streakDays = 0, d = byDay.has(today) ? today : today - 1;
  while (byDay.has(d)) { streakDays++; d--; }
  const week = { ok: 0, n: 0, sec: 0 };
  for (let i = 0; i < 7; i++) { const r = byDay.get(today - i); if (r) { week.ok += r.ok; week.n += r.n; week.sec += r.sec; } }
  return { today, byDay, dtKind, topicLog, streakDays, week, totalSec: sum(S.log.map(e => e[4])) };
}

function renderProgress() {
  const P = progressData();
  const todayN = (P.byDay.get(P.today) || { n: 0 }).n;
  const tot = kind => Object.entries(S.st).filter(([k]) => k.startsWith(kind + ':')).reduce((a, [, r]) => ({ ok: a.ok + r.ok, n: a.n + r.n }), { ok: 0, n: 0 });
  const allTot = KIND_KEYS.map(tot).reduce((a, r) => ({ ok: a.ok + r.ok, n: a.n + r.n }), { ok: 0, n: 0 });
  const cell = (kind, t) => { const r = S.st[kind + ':' + t]; if (!r || !r.n) return `<td class="num"><span class="pill none">—</span></td>`;
    const p = pct(r.ok, r.n); const cls = p >= 80 ? 'good' : p >= 55 ? 'mid' : 'bad'; return `<td class="num"><span class="pill ${cls}">${p}%</span> <span class="muted">${r.ok}/${r.n}</span></td>`; };
  const kp = (name, kind, i) => { const r = tot(kind); const m = median(P.dtKind[i]);
    return `<div class="card"><span class="eyebrow">${name}</span><div class="big-num">${r.n ? pct(r.ok, r.n) + '%' : '—'}</div><span class="muted mono kp-sub">${r.ok}/${r.n}${m ? ` · ~${fmtDur(m)}` : ''}</span></div>`; };
  const weak = TOPICS.map(t => { const rs = KIND_KEYS.map(k => S.st[k + ':' + t.id]).filter(Boolean); const ok = sum(rs.map(r => r.ok)), n = sum(rs.map(r => r.n)); return { t, p: n ? ok / n : null, n }; })
    .filter(x => x.n >= 3).sort((a, b) => a.p - b.p)[0];
  const goalPct = Math.min(100, todayN / S.goal * 100);
  const noLogYet = !S.log.length && allTot.n > 0;

  view.innerHTML = `<h2 class="view-title">Прогресс</h2><p class="lede">Хранится только в этом браузере. Лучшая серия верных ответов подряд: <b>${S.best || 0}</b>.${noLogYet ? ' Графики по дням считаются с момента обновления тренажёра — старые ответы есть только в итогах по темам.' : ''}</p>
    <div class="stack">
    <div class="kpis k4">
      <div class="card"><span class="eyebrow">Сегодня</span><div class="big-num">${todayN}<span class="of">/${S.goal}</span></div><div class="bar" style="margin-top:6px"><i style="width:${goalPct}%;${todayN >= S.goal ? 'background:var(--good)' : ''}"></i></div></div>
      <div class="card"><span class="eyebrow">Дней подряд</span><div class="big-num">${P.streakDays}</div><span class="muted kp-sub">${P.byDay.has(P.today) ? 'включая сегодня' : P.streakDays ? 'реши сегодня, чтобы не прервать' : 'начни сегодня'}</span></div>
      <div class="card"><span class="eyebrow">Точность · 7 дней</span><div class="big-num">${P.week.n ? pct(P.week.ok, P.week.n) + '%' : '—'}</div><span class="muted mono kp-sub">${P.week.ok}/${P.week.n}</span></div>
      <div class="card"><span class="eyebrow">Время · 7 дней</span><div class="big-num">${P.week.n ? fmtDur(P.week.sec) : '—'}</div><span class="muted kp-sub">всего ${fmtDur(P.totalSec)}</span></div>
    </div>
    <div class="row goal-row"><span class="hint-line">Цель в день:</span><div class="chips" id="goal"></div></div>

    <div class="card stack"><div class="chart-head"><span class="eyebrow">Ответы по дням · 14 дней</span><span class="legend"><i class="sw ok"></i>верно <i class="sw no"></i>ошибки</span></div>
      <div id="dbars"></div><div class="readout" id="dro" aria-live="polite"></div></div>

    <div class="card stack"><div class="chart-head"><span class="eyebrow">Активность · 12 недель</span><span class="legend">0 <i class="sw h1"></i><i class="sw h2"></i><i class="sw h3"></i><i class="sw h4"></i> цель</span></div>
      <div id="heat"></div><div class="readout" id="hro" aria-live="polite"></div></div>

    <div class="card stack"><div class="chart-head"><span class="eyebrow">Точность по блокам из 10 ответов</span><span class="legend">пунктир — 80%</span></div>
      <div id="trend"></div><div class="readout" id="tro" aria-live="polite"></div></div>

    ${weak && weak.p < .8 ? `<div class="card stack"><span class="eyebrow">Слабое место</span><div><b>${weak.t.name}</b> — ${Math.round(weak.p * 100)}% верно.</div><div class="row"><button class="btn primary" id="wk">Перечитать и повторить</button></div></div>` : ''}

    <div class="card stack"><span class="eyebrow">Темы</span><div class="mastery" id="mastery"></div>
      <details class="more"><summary>Подробно: тест, задачи, код</summary><div style="overflow-x:auto"><table class="ptable"><thead><tr><th>Тема</th><th>Тест</th><th>Задачи</th><th>Код</th></tr></thead>
      <tbody>${TOPICS.map(t => `<tr><td>${t.name}</td>${cell('quiz', t.id)}${cell('task', t.id)}${cell('code', t.id)}</tr>`).join('')}</tbody></table></div></details></div>

    <div class="kpis">${kp('Тест', 'quiz', 0)}${kp('Задачи', 'task', 1)}${kp('Код', 'code', 2)}</div>
    <p class="hint-line" style="margin:-4px 0 0">Процент верных и типичное время на один ответ.</p>

    <div class="card stack"><span class="eyebrow">Покрытие материала</span><div class="stack" id="cover" style="gap:10px"></div></div>

    <div class="card stack"><span class="eyebrow">Трудные места</span><div id="hard"></div></div>

    <div class="card stack"><span class="eyebrow">Ошибки в очереди</span><div>Тест: <b>${S.wrong.q.length}</b> · Код: <b>${S.wrong.c.length}</b></div>
      <div class="row">${S.wrong.q.length ? `<button class="btn" id="rq">Повторить тест</button>` : ''}${S.wrong.c.length ? `<button class="btn" id="rc">Повторить код</button>` : ''}</div></div>

    <details class="card more" id="xfer"><summary>Перенести прогресс на другое устройство</summary><div class="stack" style="margin-top:12px" id="xbox"></div></details>

    <div class="confirm-row" id="rst"></div>
    </div>`;

  [20, 30, 50, 80].forEach(g => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = g; b.setAttribute('aria-pressed', g === S.goal ? 'true' : 'false');
    b.onclick = () => { S.goal = g; save(); drawStreak(); renderProgress(); }; $('#goal').appendChild(b); });
  drawDayBars(P); drawHeat(P); drawTrend(); drawMastery(P); drawCover(); drawHard();
  if ($('#wk')) $('#wk').onclick = () => go('konspekt', { open: weak.t.id });
  if ($('#rq')) $('#rq').onclick = () => { go('test'); startQuiz(true); };
  if ($('#rc')) $('#rc').onclick = () => { codeKind = 'wrong'; codeQ = null; go('code'); };
  drawTransfer();
  const rst = $('#rst');
  const draw = () => {
    rst.innerHTML = resetArmed ? `<span>Стереть весь прогресс?</span><button class="btn primary" id="y">Да, стереть</button><button class="btn" id="n">Отмена</button>` : `<button class="btn ghost" id="r">Сбросить прогресс</button>`;
    if (resetArmed) { $('#y').onclick = () => { S = blankState(); save(); resetArmed = false; drawStreak(); renderProgress(); }; $('#n').onclick = () => { resetArmed = false; draw(); }; }
    else $('#r').onclick = () => { resetArmed = true; draw(); };
  };
  draw();
}

/* столбцы: снизу «верно», сверху «ошибки», между ними 2px; высоты в px от максимума за период */
function drawDayBars(P) {
  const days = Array.from({ length: 14 }, (_, i) => P.today - 13 + i);
  const vals = days.map(d => P.byDay.get(d) || { ok: 0, n: 0 });
  const max = Math.max(1, ...vals.map(v => v.n)), H = 112;
  const box = $('#dbars');
  box.innerHTML = `<div class="dbars-wrap"><span class="ymax mono">${max}</span><div class="dbars">${days.map((d, i) => { const v = vals[i];
    const hNo = v.n - v.ok ? Math.max(3, Math.round((v.n - v.ok) / max * (H - 2))) : 0, hOk = v.ok ? Math.max(3, Math.round(v.ok / max * (H - 2))) : 0;
    const dt = dayDate(d);
    return `<button class="dcol${d === P.today ? ' today' : ''}" data-i="${i}" aria-label="${dayLabel(d)}: ${v.n} ${answersWord(v.n)}"><span class="stk" style="height:${H}px">${hNo ? `<i class="no" style="height:${hNo}px"></i>` : ''}${hOk ? `<i class="ok" style="height:${hOk}px"></i>` : ''}${v.n ? '' : '<i class="zero"></i>'}</span><span class="dl">${dt.getUTCDate()}</span></button>`; }).join('')}</div></div>`;
  const ro = $('#dro');
  const show = i => { const v = vals[i], d = days[i];
    box.querySelectorAll('.dcol').forEach(b => b.classList.toggle('sel', +b.dataset.i === i));
    ro.innerHTML = `<b>${d === P.today ? 'Сегодня, ' : ''}${dayLabel(d)}</b>: ${v.n ? `${v.ok} верно, ${v.n - v.ok} ${v.n - v.ok === 1 ? 'ошибка' : (v.n - v.ok) % 10 >= 2 && (v.n - v.ok) % 10 <= 4 && ((v.n - v.ok) % 100 < 12 || (v.n - v.ok) % 100 > 14) ? 'ошибки' : 'ошибок'} · ${pct(v.ok, v.n)}%` : 'нет ответов'}`; };
  box.querySelectorAll('.dcol').forEach(b => { b.onclick = () => show(+b.dataset.i); b.onpointerenter = e => { if (e.pointerType === 'mouse') show(+b.dataset.i); }; });
  show(13);
}

/* календарь: столбец — неделя (пн…вс), насыщенность — доля дневной цели */
function drawHeat(P) {
  const dow = (dayDate(P.today).getUTCDay() + 6) % 7;
  const start = P.today - dow - 7 * 11;
  const lvl = n => !n ? 0 : n >= S.goal ? 4 : n >= S.goal * 2 / 3 ? 3 : n >= S.goal / 3 ? 2 : 1;
  let html = '<div class="heat"><span></span>';
  for (let w = 0; w < 12; w++) { const d0 = dayDate(start + 7 * w), prev = w ? dayDate(start + 7 * (w - 1)) : null;
    html += `<span class="hm">${!prev || prev.getUTCMonth() !== d0.getUTCMonth() ? MON[d0.getUTCMonth()] : ''}</span>`; }
  ['пн', '', 'ср', '', 'пт', '', 'вс'].forEach((lab, r) => {
    html += `<span class="hd">${lab}</span>`;
    for (let w = 0; w < 12; w++) { const d = start + 7 * w + r;
      if (d > P.today) { html += '<span class="hc future"></span>'; continue; }
      const n = (P.byDay.get(d) || { n: 0 }).n;
      html += `<button class="hc l${lvl(n)}${d === P.today ? ' today' : ''}" data-d="${d}" aria-label="${dayLabel(d)}: ${n} ${answersWord(n)}"></button>`; }
  });
  $('#heat').innerHTML = html + '</div>';
  const ro = $('#hro');
  const show = d => { const v = P.byDay.get(d);
    $('#heat').querySelectorAll('.hc').forEach(c => c.classList.toggle('sel', +c.dataset.d === d));
    ro.innerHTML = `<b>${dayLabel(d)}</b>: ${v ? `${v.n} ${answersWord(v.n)}, ${pct(v.ok, v.n)}% верно, ${fmtDur(v.sec)}` : 'нет ответов'}`; };
  $('#heat').querySelectorAll('button.hc').forEach(c => { c.onclick = () => show(+c.dataset.d); c.onpointerenter = e => { if (e.pointerType === 'mouse') show(+c.dataset.d); }; });
  const active = [...P.byDay.keys()].filter(d => d >= start).length;
  ro.innerHTML = `Активных дней за 12 недель: <b>${active}</b>. Нажми на клетку — покажу день.`;
}

/* линия точности: блоки по 10 ответов в хронологическом порядке, последние 30 блоков */
let trendRO = null;
function drawTrend() {
  const box = $('#trend'), ro = $('#tro');
  const blocks = [];
  for (let i = 0; i + 10 <= S.log.length; i += 10) blocks.push({ from: i + 1, to: i + 10, ok: sum(S.log.slice(i, i + 10).map(e => e[3])) });
  const tail = S.log.length % 10;
  if (tail >= 5) { const i = S.log.length - tail; blocks.push({ from: i + 1, to: S.log.length, ok: sum(S.log.slice(i).map(e => e[3])) }); }
  if (blocks.length < 2) { box.innerHTML = `<p class="muted" style="margin:0">Линия появится после 20 ответов — сейчас ${S.log.length}.</p>`; ro.textContent = ''; return; }
  const B = blocks.slice(-30);
  const paint = () => {
    const W = Math.max(240, box.clientWidth), H = 150, pl = 36, pr = 10, pt = 8, pb = 22;
    const x = i => pl + (B.length === 1 ? 0 : i / (B.length - 1) * (W - pl - pr));
    const y = p => pt + (1 - p / 100) * (H - pt - pb);
    const pts = B.map((b, i) => [x(i), y(b.ok / (b.to - b.from + 1) * 100)]);
    const grid = [0, 50, 100].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="g"/>`).join('') + [0, 50, 80, 100].map(v => `<text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" class="ax">${v}%</text>`).join('');
    box.innerHTML = `<svg class="trend" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Точность по блокам ответов">
      ${grid}<line x1="${pl}" x2="${W - pr}" y1="${y(80)}" y2="${y(80)}" class="goal"/>
      <polyline points="${pts.map(p => p.join(',')).join(' ')}" class="ln"/>
      <circle id="tdot" r="5" class="dot"/>
      <text x="${pl}" y="${H - 5}" class="ax">${B[0].from}–${B[0].to}</text><text x="${W - pr}" y="${H - 5}" text-anchor="end" class="ax">${B[B.length - 1].from}–${B[B.length - 1].to}</text>
      <rect x="${pl - 6}" y="0" width="${W - pl - pr + 12}" height="${H}" fill="transparent" id="thit"/></svg>`;
    const show = i => { const b = B[i], n = b.to - b.from + 1; const dot = $('#tdot'); dot.setAttribute('cx', pts[i][0]); dot.setAttribute('cy', pts[i][1]);
      ro.innerHTML = `<b>Ответы ${b.from}–${b.to}</b>: ${b.ok} из ${n} верно · ${pct(b.ok, n)}%`; };
    const near = e => { const r = e.currentTarget.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * (W - pl - pr + 12) + pl - 6; let bi = 0; pts.forEach((p, i) => { if (Math.abs(p[0] - px) < Math.abs(pts[bi][0] - px)) bi = i; }); show(bi); };
    const hit = $('#thit'); hit.onpointerdown = near; hit.onpointermove = e => { if (e.pointerType === 'mouse' || e.buttons) near(e); };
    show(B.length - 1);
  };
  paint();
  if (trendRO) trendRO.disconnect();
  let lastW = box.clientWidth;
  if (window.ResizeObserver) { trendRO = new ResizeObserver(() => { if (!document.body.contains(box)) { trendRO.disconnect(); return; } if (box.clientWidth !== lastW) { lastW = box.clientWidth; paint(); } }); trendRO.observe(box); }
}

/* темы: точность по всем ответам + сдвиг «последние 20 против предыдущих 20» */
function drawMastery(P) {
  $('#mastery').innerHTML = TOPICS.map((t, ti) => {
    const rs = KIND_KEYS.map(k => S.st[k + ':' + t.id]).filter(Boolean); const ok = sum(rs.map(r => r.ok)), n = sum(rs.map(r => r.n));
    const p = pct(ok, n);
    const L = P.topicLog[ti]; let trend = '';
    if (L.length >= 20) { const last = L.slice(-20), prev = L.slice(-40, -20);
      if (prev.length >= 10) { const dlt = Math.round(mean(last) * 100 - mean(prev) * 100);
        trend = dlt >= 10 ? `<span class="tr up">↑ ${dlt}</span>` : dlt <= -10 ? `<span class="tr down">↓ ${-dlt}</span>` : `<span class="tr">≈</span>`; } }
    const cls = p === null ? 'none' : p >= 80 ? 'good' : p >= 55 ? 'mid' : 'bad';
    return `<button class="mrow" data-t="${t.id}"><span class="mname">${t.name}</span><span class="mval">${p === null ? '<span class="pill none">не начато</span>' : `<span class="pill ${cls}">${p}%</span> <span class="muted mono">${n}</span>`}${trend}</span>
      <span class="mbar"><i style="width:${p || 0}%"></i><b style="left:80%"></b></span></button>`;
  }).join('') + `<p class="hint-line" style="margin:2px 0 0">Метка на полосе — 80%. Стрелка: последние 20 ответов по теме против 20 предыдущих. Нажми на тему — откроется конспект.</p>`;
  $('#mastery').querySelectorAll('.mrow').forEach(b => b.onclick = () => go('konspekt', { open: b.dataset.t }));
}

function drawCover() {
  const it = S.items;
  const rows = [
    ['Вопросы теста', QUIZ.map(q => it['q:' + q.id])],
    ['Упражнения по коду', CODE.map(c => it['c:' + c.id])],
    ['Типы задач на счёт', [...new Set(GEN.map(g => g.name))].map(nm => it['g:' + nm])],
  ];
  $('#cover').innerHTML = rows.map(([name, arr]) => { const seen = arr.filter(Boolean).length, solved = arr.filter(r => r && r[0] > 0).length, N = arr.length;
    return `<div><div class="cov-head"><span>${name}</span><span class="mono muted">${solved} / ${N}</span></div>
      <div class="cbar" aria-label="${name}: верно хотя бы раз ${solved}, видел ${seen} из ${N}"><i class="seen" style="width:${seen / N * 100}%"></i><i class="solved" style="width:${solved / N * 100}%"></i></div>
      <span class="hint-line">видел ${seen} · хотя бы раз верно ${solved} · не открывал ${N - seen}</span></div>`; }).join('')
    + (Object.keys(it).length ? '' : `<p class="hint-line" style="margin:0">Считается с момента обновления тренажёра.</p>`);
}

function drawHard() {
  const qById = Object.fromEntries(QUIZ.map(q => ['q:' + q.id, q])), cById = Object.fromEntries(CODE.map(c => ['c:' + c.id, c]));
  const rows = Object.entries(S.items).map(([id, [ok, n]]) => ({ id, ok, n, bad: n - ok })).filter(r => r.bad > 0)
    .sort((a, b) => b.bad - a.bad || a.ok / a.n - b.ok / b.n).slice(0, 6);
  if (!rows.length) { $('#hard').innerHTML = `<p class="muted" style="margin:0">Пока нет — ошибки появятся здесь, начиная с самых частых.</p>`; return; }
  $('#hard').innerHTML = `<ol class="hard">${rows.map(r => {
    let kind, topic, text;
    if (qById[r.id]) { const q = qById[r.id]; kind = 'Тест'; topic = q[0]; text = plainText(q[1]); }
    else if (cById[r.id]) { const c = cById[r.id]; kind = 'Код'; topic = c.t; text = plainText(c.task); }
    else { const nm = r.id.slice(2); const g = GEN.find(x => x.name === nm); kind = 'Задача'; topic = g ? g.t : null; text = nm; }
    return `<li><span class="eyebrow">${kind}${topic ? ' · ' + TNAME[topic] : ''}</span><div>${esc(clip(text, 120))}</div><span class="hint-line mono">ошибок ${r.bad} · верно ${r.ok}/${r.n}</span></li>`; }).join('')}</ol>`;
}

/* перенос: весь объект S в base64 (UTF-8 через encodeURIComponent) */
function drawTransfer() {
  const box = $('#xbox');
  const enc = () => btoa(unescape(encodeURIComponent(JSON.stringify(S))));
  box.innerHTML = `<p class="hint-line" style="margin:0">Скопируй код здесь и вставь его в тренажёр на другом устройстве. Там текущий прогресс заменится этим.</p>
    <div class="row"><button class="btn" id="xcopy">Скопировать код прогресса</button></div><div id="xout"></div>
    <div class="field"><label for="xin">Вставь код с другого устройства</label><textarea class="inp" id="xin" rows="3" ${inputAttrs}></textarea></div>
    <div class="confirm-row" id="ximp"></div>`;
  $('#xcopy').onclick = async () => {
    const code = enc(); let ok = false;
    try { await navigator.clipboard.writeText(code); ok = true; } catch (e) {}
    $('#xout').innerHTML = ok ? `<p class="verdict good" style="margin:0">Скопировано (${Math.round(code.length / 1024)} КБ).</p>` : `<p class="hint-line" style="margin:0 0 6px">Буфер обмена недоступен — выдели и скопируй вручную:</p><textarea class="inp" rows="3" readonly id="xraw"></textarea>`;
    if (!ok) { $('#xraw').value = code; $('#xraw').focus(); $('#xraw').select(); }
  };
  const drawImp = () => {
    const imp = $('#ximp');
    if (!importArmed) { imp.innerHTML = `<button class="btn" id="xgo">Загрузить</button>`; $('#xgo').onclick = () => {
      let obj = null; try { obj = JSON.parse(decodeURIComponent(escape(atob($('#xin').value.trim())))); } catch (e) {}
      if (!obj || obj.v !== 1 || typeof obj.st !== 'object') { imp.innerHTML = `<span class="verdict bad" style="margin:0">Код не распознан — скопируй его целиком.</span>`; setTimeout(drawImp, 2500); return; }
      importArmed = obj; drawImp(); }; return; }
    const n = Object.values(importArmed.st).reduce((a, r) => a + r.n, 0);
    imp.innerHTML = `<span>Заменить текущий прогресс на загруженный (${n} ${answersWord(n)})?</span><button class="btn primary" id="xy">Да, заменить</button><button class="btn" id="xn">Отмена</button>`;
    $('#xy').onclick = () => { S = upgrade(importArmed); importArmed = null; save(); drawStreak(); renderProgress(); };
    $('#xn').onclick = () => { importArmed = null; drawImp(); };
  };
  drawImp();
}

/* открыть тему в конспекте по ссылке из «Прогресса» */
const _rk = renderKonspekt;
renderKonspekt = function (opts) { _rk(); if (opts && opts.open) { const i = TOPICS.findIndex(t => t.id === opts.open); const d = document.querySelectorAll('details.topic')[i]; if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ block: 'start' }), 0); } } };

/* ===================== ВЫБОР ПРЕДМЕТА ===================== */
/* сводка по предмету читается прямо из его хранилища, не загружая его движок */
function subjectSummary(s) {
  let st = null; try { st = JSON.parse(localStorage.getItem(subjKey(s))); } catch (e) {}
  if (!st || !st.st) return { n: 0, ok: 0, today: 0, goal: 30 };
  const tot = Object.values(st.st).reduce((a, r) => ({ ok: a.ok + r.ok, n: a.n + r.n }), { ok: 0, n: 0 });
  const t = dayIx(Date.now()); let today = 0; const log = st.log || [];
  for (let i = log.length - 1; i >= 0 && dayIx(log[i][0] * 1000) === t; i--) today++;
  return { ...tot, today, goal: st.goal || 30 };
}
function renderSubjects() {
  current = null;
  document.querySelectorAll('nav.tabs button').forEach(b => b.setAttribute('aria-current', 'false'));
  view.innerHTML = `<h2 class="view-title">Предметы</h2><p class="lede">Прогресс у каждого предмета свой.</p><div class="stack" id="subjs"></div>`;
  SUBJECTS.forEach(s => {
    const m = subjectSummary(s); const p = m.n ? Math.round(m.ok / m.n * 100) : null;
    const b = document.createElement('button'); b.className = 'card subj' + (s === SUBJ && storedSubject ? ' cur' : '');
    b.innerHTML = `<span class="subj-ic">${s.icon}</span><span class="subj-body"><b>${s.name}</b><span class="muted">${s.sub}</span>
      <span class="subj-meta mono">${s.TOPICS.length} тем · ${s.QUIZ.length} вопросов · ${s.GEN.length} задач · ${s.CODE.length} упражнений</span>
      <span class="subj-meta">${m.n ? `сегодня ${m.today}/${m.goal} · ${p}% верно из ${m.n}` : 'ещё не начат'}</span></span>`;
    b.onclick = () => s === SUBJ && storedSubject ? go('konspekt') : switchSubject(s.id);
    $('#subjs').appendChild(b);
  });
  window.scrollTo(0, 0);
}
$('#brand').innerHTML = storedSubject ? `Тренажёр <span class="brand-sw">${SUBJ.short || SUBJ.name} ▾</span><small>${SUBJ.name} · ${SUBJ.sub}</small>` : 'Тренажёр<small>выбери предмет</small>';
$('#brand').onclick = renderSubjects;
document.title = 'Тренажёр · ' + (SUBJ.short || SUBJ.name);

/* ===================== СТАРТ ===================== */
drawStreak();
(() => {
  if (!storedSubject) return renderSubjects();
  let t = (location.hash || '').slice(1);
  if (!TABS.includes(t)) { try { t = localStorage.getItem(KEY + ':tab'); } catch (e) {} }
  go(TABS.includes(t) ? t : 'konspekt');
})();

/* офлайн-режим: service worker кэширует приложение после первого открытия */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
