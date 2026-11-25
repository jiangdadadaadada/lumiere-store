/* ============================================================
   LUMIÈRE · 商品图中文翻译（Node 侧调用器）
   ---------------------------------------------------------
   把图交给 tools/imtranslate.py：RapidOCR 本地识别 → 译文回贴。
   结果写到 assets/img/collected/tr-<hash>.<ext>，原图不动。
   同一张图（路径 + 修改时间 + 大小）译过一次就直接复用结果。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PY = 'C:\\Program Files\\Python312\\python.exe';
/* 依赖装在 Python312 的「用户目录」：Program Files 下写不进去（WinError 5），
   且这台机器的 Python 关了 user site，所以要显式把路径塞进 PYTHONPATH。 */
const PY_USER_SITE = 'C:\\Users\\Administrator\\AppData\\Roaming\\Python\\Python312\\site-packages';
const SCRIPT = path.join(ROOT, 'tools', 'imtranslate.py');
const COLLECT = path.join(ROOT, 'assets', 'img', 'collected');
const CACHE = path.join(COLLECT, 'translate-cache.json');
const TMP = path.join(ROOT, '_tmp');

let running = 0;
const queue = [];
/* 渲染配方版本：抹字/排版算法一改就要变，否则旧产物会被直接复用（缓存 key 含版本） */
const RECIPE = 'r3-lines';

function saveTmpDataUrl(dataUrl) {
  const m = /^data:image\/([a-z0-9+.-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const ext = m[1].toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'png');
  fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, 'tr-in-' + crypto.randomBytes(6).toString('hex') + '.' + ext);
  fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
  return file;
}

/* 只允许项目内的图片：/assets/... 或 dataURL */
function resolveSource(src) {
  if (typeof src !== 'string' || !src) return { error: '缺少图片' };
  if (src.startsWith('data:')) {
    const f = saveTmpDataUrl(src);
    return f ? { abs: f, rel: src, temp: true } : { error: 'dataURL 解析失败' };
  }
  let rel = src;
  if (/^https?:/i.test(rel)) return { error: '只支持站内图片，请先把它下成本地图' };
  if (rel.startsWith('/')) rel = rel.slice(1);
  const abs = path.resolve(ROOT, rel);
  const within = path.relative(ROOT, abs);
  if (!within || within.startsWith('..') || path.isAbsolute(within)) return { error: '图片路径不合法' };
  if (!fs.existsSync(abs)) return { error: '图片不存在：' + rel };
  return { abs, rel: '/' + rel.split(path.sep).join('/'), temp: false };
}

function runPython(args, timeoutMs) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      PYTHONPATH: PY_USER_SITE + (process.env.PYTHONPATH ? ';' + process.env.PYTHONPATH : ''),
      PYTHONIOENCODING: 'utf-8'
    });
    const p = spawn(PY, [SCRIPT, ...args], { cwd: ROOT, windowsHide: true, env });
    let out = '', err = '';
    const timer = setTimeout(() => { try { p.kill(); } catch (e) {} }, timeoutMs || 90000);
    p.stdout.on('data', (c) => { out += c; });
    p.stderr.on('data', (c) => { err += c; });
    p.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, error: '启动 OCR 进程失败：' + e.message }); });
    p.on('exit', () => { clearTimeout(timer); resolve({ ok: true, out, err }); });
  });
}

/* 传进来的是「译过的图」时，回到它的原图重新译一遍（配方升级后可原地刷新） */
function originalOf(src) {
  if (typeof src !== 'string' || !src || src.startsWith('data:')) return null;
  const m = /tr-([0-9a-f]{16})\.(png|jpg|webp)$/i.exec(src);
  if (!m) return null;
  const side = path.join(COLLECT, 'tr-' + m[1] + '.json');
  try {
    const j = JSON.parse(fs.readFileSync(side, 'utf8'));
    if (!j.source) return null;
    const abs = path.resolve(ROOT, String(j.source).replace(/^\//, ''));
    return fs.existsSync(abs) ? j.source : null;
  } catch (e) { return null; }
}

async function translateOne(src) {
  const back = originalOf(src);
  if (back) src = back;
  const r = resolveSource(src);
  if (r.error) return { ok: false, error: r.error };
  const ext = (path.extname(r.abs) || '.jpg').toLowerCase();
  let stamp = '';
  try { const st = fs.statSync(r.abs); stamp = st.mtimeMs + ':' + st.size; } catch (e) {}
  const hash = crypto.createHash('sha1').update(r.rel + '|' + stamp + '|en|' + RECIPE).digest('hex').slice(0, 16);
  const outName = 'tr-' + hash + (ext === '.webp' ? '.webp' : ext === '.png' ? '.png' : '.jpg');
  const outAbs = path.join(COLLECT, outName);
  const outRel = '/assets/img/collected/' + outName;
  const side = path.join(COLLECT, 'tr-' + hash + '.json');

  if (fs.existsSync(outAbs) && fs.existsSync(side)) {
    try {
      const items = JSON.parse(fs.readFileSync(side, 'utf8'));
      /* 老产物没记原图路径，顺手补上，之后点「译图」才能回到原图重译 */
      if (!items.source) {
        try { items.source = r.rel; items.recipe = RECIPE; fs.writeFileSync(side, JSON.stringify(items, null, 1)); } catch (e) {}
      }
      return { ok: true, image: outRel, items: items.items || [], painted: (items.items || []).length, cached: true, untranslated: items.untranslated || 0, note: items.note || '' };
    } catch (e) {}
  }

  fs.mkdirSync(COLLECT, { recursive: true });
  const res = await runPython(['--in', r.abs, '--out', outAbs, '--cache', CACHE]);
  if (r.temp) { try { fs.unlinkSync(r.abs); } catch (e) {} }
  if (!res.ok) return { ok: false, error: res.error };

  const line = (res.out || '').trim().split('\n').filter(Boolean).pop() || '';
  let j = null;
  try { j = JSON.parse(line); } catch (e) {
    if (res.err) console.error('[imtranslate] python:', res.err.slice(0, 400));
    return { ok: false, error: 'OCR 输出解析失败' };
  }
  if (!j.ok) return { ok: false, error: j.error || '翻译失败' };
  if (!j.image) {
    try { if (fs.existsSync(outAbs)) fs.unlinkSync(outAbs); } catch (e) {}
    return { ok: true, image: null, items: [], msg: j.msg || '图片里没有中文' };
  }
  try { fs.writeFileSync(side, JSON.stringify({ at: new Date().toISOString(), source: r.rel, recipe: RECIPE, items: j.items || [], untranslated: j.untranslated || 0, note: j.note || '' }, null, 1)); } catch (e) {}
  return { ok: true, image: outRel, items: j.items || [], painted: j.painted || 0, untranslated: j.untranslated || 0, note: j.note || '' };
}

/* 串行执行：OCR 模型内存占用不小，别并发 */
function translate(src) {
  return new Promise((resolve) => {
    const job = async () => {
      running++;
      try { resolve(await translateOne(src)); }
      catch (e) { resolve({ ok: false, error: e.message }); }
      finally { running--; const next = queue.shift(); if (next) next(); }
    };
    if (running < 1) job(); else queue.push(job);
  });
}

module.exports = { translate };
