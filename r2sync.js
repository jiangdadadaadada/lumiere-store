/* ============================================================
   LUMIÈRE · 图片同步到 Cloudflare R2
   ------------------------------------------------------------
   走的通道：Cloudflare 官方 REST 接口
     PUT /accounts/{acct}/r2/buckets/{bucket}/objects/{key}
   （api.cloudflare.com 在本机可直连；<acct>.r2.cloudflarestorage.com
     的 S3 端口时通时不通、*.workers.dev 又被打断，所以不用它们）

   本地仍留一份原图（后台/译图/发货都靠它）；
   R2 是线上镜像：前台页面静态资源里找不到图时，Worker 会回落到 R2
   （Worker 里已绑 [[r2_buckets]] IMG = lumiere-img）。
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ACCT = '8b24e894da9b401318e11c82bfd4aad6';
const BUCKET = 'lumiere-img';
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCT}/r2/buckets/${BUCKET}`;
const PUBLIC_BASE = 'https://pub-70a352fa1a7d4db9b093906989cc565f.r2.dev';
const INDEX_FILE = path.join(ROOT, '.data', 'r2-index.json');
const TOKEN_FILE = path.join(ROOT, '.data', 'cf-token.txt');

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.avif': 'image/avif', '.json': 'application/json', '.txt': 'text/plain'
};

function token() {
  let t = '';
  try { t = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch (e) {}
  if (!t) {
    try {
      const s = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
      const m = /cfut_[A-Za-z0-9]+/.exec(s);
      if (m) t = m[0];
    } catch (e) {}
  }
  return t;
}

let index = null;
function loadIndex() {
  if (index) return index;
  try { index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); } catch (e) { index = {}; }
  if (!index || typeof index !== 'object' || Array.isArray(index)) index = {};
  return index;
}
let saveTimer = null;
function saveIndexSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });
      fs.writeFileSync(INDEX_FILE, JSON.stringify(loadIndex(), null, 1));
    } catch (e) {}
  }, 1500);
}

function keyOf(rel) { return String(rel || '').replace(/^\/+/, ''); }
function absOf(rel) { return path.join(ROOT, keyOf(rel).replace(/\//g, path.sep)); }

const queue = [];
let running = 0;
const MAX_PARALLEL = 3;
let lastError = '';

async function send(rel) {
  const relPath = String(rel || '');
  if (!/^\/?assets\/img\//.test(relPath)) return { ok: false, skip: true };
  const abs = absOf(relPath);
  let st;
  try { st = fs.statSync(abs); } catch (e) { return { ok: false, error: '本地文件不存在' }; }
  const key = keyOf(relPath);
  const rec = loadIndex()[key];
  if (rec && rec.size === st.size && rec.mtimeMs === st.mtimeMs) return { ok: true, skip: true, key };
  const tk = token();
  if (!tk) return { ok: false, error: '缺少 Cloudflare token（.data/cf-token.txt）' };
  const ext = path.extname(abs).toLowerCase();
  const body = fs.readFileSync(abs);
  try {
    const r = await fetch(`${API}/objects/${key}`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + tk,
        'Content-Type': MIME[ext] || 'application/octet-stream'
      },
      body
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) {
      lastError = `HTTP ${r.status} ${JSON.stringify(j.errors || j).slice(0, 120)}`;
      return { ok: false, error: lastError };
    }
    loadIndex()[key] = { size: st.size, mtimeMs: st.mtimeMs, at: new Date().toISOString(), url: `${PUBLIC_BASE}/${key}` };
    saveIndexSoon();
    return { ok: true, key, size: st.size, url: `${PUBLIC_BASE}/${key}` };
  } catch (e) {
    lastError = e.message;
    return { ok: false, error: e.message };
  }
}

function drain() {
  while (running < MAX_PARALLEL && queue.length) {
    const job = queue.shift();
    running++;
    send(job.rel)
      .then(r => job.resolve(r))
      .catch(e => job.resolve({ ok: false, error: e.message }))
      .finally(() => { running--; drain(); });
  }
}

function push(rel) {
  return new Promise(resolve => { queue.push({ rel, resolve }); drain(); });
}
function pushAsync(rel) { push(rel).catch(() => {}); }

function collectImages() {
  const dir = path.join(ROOT, 'assets', 'img');
  const list = [];
  (function walk(d) {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jpg|jpeg|png|webp|gif|avif)$/i.test(e.name)) list.push(p);
      if (list.length > 4000) return;
    }
  })(dir);
  return list.map(p => '/' + path.relative(ROOT, p).replace(/\\/g, '/'));
}

function pendingList() {
  return collectImages().filter(rel => {
    const rec = loadIndex()[keyOf(rel)];
    try {
      const st = fs.statSync(absOf(rel));
      return !rec || rec.size !== st.size || rec.mtimeMs !== st.mtimeMs;
    } catch (e) { return false; }
  });
}

async function syncAll(limit) {
  const all = collectImages();
  const todo = pendingList();
  const target = (typeof limit === 'number' && limit > 0) ? todo.slice(0, limit) : todo;
  let ok = 0, fail = 0;
  for (const rel of target) {
    const r = await send(rel);
    if (r.ok) ok++; else fail++;
  }
  try { fs.writeFileSync(INDEX_FILE, JSON.stringify(loadIndex(), null, 1)); } catch (e) {}
  return { total: all.length, pending: todo.length, uploaded: ok, failed: fail, lastError };
}

function status() {
  const idx = loadIndex();
  const keys = Object.keys(idx);
  const bytes = keys.reduce((s, k) => s + (idx[k].size || 0), 0);
  return {
    count: keys.length,
    bytes,
    localImages: collectImages().length,
    pending: pendingList().length,
    bucket: BUCKET,
    publicBase: PUBLIC_BASE,
    lastError,
    sample: keys.slice(0, 3).map(k => ({ key: k, url: idx[k].url }))
  };
}

module.exports = { push, pushAsync, syncAll, status, PUBLIC_BASE, BUCKET, API };
