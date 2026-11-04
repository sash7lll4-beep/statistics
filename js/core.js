/* Общие утилиты и реестр предметов. Подключается первым: данные предметов используют эти функции. */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sum = a => a.reduce((s, x) => s + x, 0);
const mean = a => sum(a) / a.length;
const sorted = a => a.slice().sort((x, y) => x - y);
const r2 = x => Math.round(x * 100) / 100;
const fmt = x => { const v = Math.round(x * 1000) / 1000; return Number.isInteger(v) ? String(v) : String(r2(v)); };
const list = a => '[' + a.join(', ') + ']';
const distinctInts = (n, lo, hi) => { const s = new Set(); while (s.size < n) s.add(rint(lo, hi)); return [...s]; };
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const parseNum = s => {
  if (s == null) return NaN;
  let t = String(s).trim().replace(/\s/g, '').replace(/[%−]/g, m => m === '−' ? '-' : '').replace(',', '.');
  if (t === '') return NaN;
  return Number(t);
};
const normCode = s => String(s).replace(/[‘’`´«»“”„]/g, "'").replace(/"/g, "'").replace(/\s+/g, '').replace(/−/g, '-');

function quantile(s, p) { const pos = (s.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos); return s[lo] + (s[hi] - s[lo]) * (pos - lo); }
function qExplain(s, p, name) {
  const pos = (s.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return `${name}: позиция (n−1)·${p} = ${fmt(pos)} → x[${lo}] = ${s[lo]}`;
  return `${name}: позиция (n−1)·${p} = ${fmt(pos)} → x[${lo}] + (x[${hi}] − x[${lo}])·${fmt(pos - lo)} = ${s[lo]} + (${s[hi]} − ${s[lo]})·${fmt(pos - lo)} = ${fmt(quantile(s, p))}`;
}
const F = s => `<div class="formula">${s}</div>`;
const Q = "'";
const SUBJECTS = [];
const addSubject = s => { SUBJECTS.push(s); };
