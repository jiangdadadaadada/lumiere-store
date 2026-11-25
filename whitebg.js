/* ============================================================
   LUMIÈRE · 商品图片白底转换
   入库前所有图片（采集 / 后台上传 / 外链）统一走这里转白底。
   只依赖 Node 内置模块 + 本地 Python312 白底脚本，零付费服务。

   性能要点：
   · rembg 的 u2netp 模型每次启动 Python 要加载 ~4.8 秒，
     所以这里走「常驻进程」whitebg-worker.js，模型只加载一次。
   · pymatting 内存与像素数成正比（800px 单张峰值近 2GiB，
     并发 3 张直接 OOM），因此抠图环节严格串行；
     下载环节是网络 IO，可以放心并行。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const worker = require('./whitebg-worker.js');   /* 常驻 Python 进程客户端 */
const r2sync = require('./r2sync.js');           /* 图片同步到 R2（Worker 中转） */

const ROOT = __dirname;
const PY = 'C:\\Program Files\\Python312\\python.exe';
const WHITEBG = path.join(ROOT, 'tools', 'whitebg.py');
const IMG_DIR = path.join(ROOT, 'assets', 'img', 'collected');
/* 图片来源账本：本地文件 → 原始 URL。
   数据库里存的只是路径，文件一旦丢失就再也找不到原图。
   有了账本，巡检时凭文件名就能把图重新下载回来 —— 这是"治本"的关键。 */
const SOURCES = path.join(IMG_DIR, 'sources.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function readSources() {
  try { return JSON.parse(fs.readFileSync(SOURCES, 'utf8')) || {}; }
  catch (e) { return {}; }
}
function writeSources(map) {
  try {
    fs.mkdirSync(IMG_DIR, { recursive: true });
    fs.writeFileSync(SOURCES, JSON.stringify(map, null, 2));
  } catch (e) { console.error('图片来源账本写入失败:', e.message); }
}
/* 记录「本地文件 ← 原始 URL」。url 必须是可重新下载的 http(s) 链接。 */
function recordSource(rel, url, type) {
  if (!rel || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;
  const key = typeof rel === 'string' ? path.basename(rel) : '';
  if (!key) return;
  const map = readSources();
  map[key] = { url, type: type || 'gallery', at: new Date().toISOString() };
  writeSources(map);
}
function forgetSource(rel) {
  const key = typeof rel === 'string' ? path.basename(rel) : '';
  if (!key) return;
  const map = readSources();
  if (!(key in map)) return;
  delete map[key];
  writeSources(map);
}

/* 读图片头拿宽高（不解码、零开销）。用于拦截 1688 的 120×64「跨境」占位图：
   这种图被当主图抓进来时，白底转换出来就是一块写着字的紫色方块。 */
function imageSize(buf) {
  try {
    if (!buf || buf.length < 24) return null;
    if (buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG')
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (buf.slice(0, 3).toString() === 'GIF')
      return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
      const t = buf.slice(12, 16).toString();
      if (t === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (t === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (t === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >>> 14) & 0x3fff) + 1 }; }
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        let m = buf[i + 1];
        while (m === 0xff) { i++; m = buf[i + 1]; }
        if (m === 0xd8 || m === 0xd9 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        const len = buf.readUInt16BE(i + 2);
        if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].indexOf(m) >= 0)
          return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        i += 2 + len;
      }
    }
  } catch (e) {}
  return null;
}

async function download(url, file, opts) {
  const allowSmall = !!(opts && opts.allowSmall);
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Referer': (() => { try { return new URL(url).origin; } catch (e) { return ''; } })() },
    signal: AbortSignal.timeout(15000), redirect: 'follow'
  });
  if (!r.ok) throw new Error('图片 HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < (allowSmall ? 200 : 1024)) throw new Error('图片太小');
  const dim = imageSize(buf);
  /* 图集缓存要保留原图，即使是小尺寸详情裁图；只有白底主图才拦截占位图 */
  if (!allowSmall && dim && Math.max(dim.w, dim.h) < 240)
    throw new Error(`图片尺寸 ${dim.w}×${dim.h}，疑似占位图`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return buf.length;
}

function whiten(inFile, outFile) {
  /* 单张也走常驻进程：模型常驻，省掉每次 4.8 秒加载 */
  return worker.convertOne(inFile, outFile);
}

const ALLOWED_IMG = /^https?:\/\//i;

/* 已是本地白底图路径（守卫通过）则跳过，避免重复抠图 */
function isWhiteLocal(rel) {
  if (!rel || typeof rel !== 'string') return false;
  if (rel.startsWith('data:')) return false;
  if (!rel.startsWith('/assets/img/')) return false;
  try {
    const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'whitebg-guard.json'), 'utf8'));
    return g[rel] === true;
  } catch (e) { return false; }
}

/* 转换产物直接登记为白底：它已经过抠图 + 纯白合成，无需再统计判定 */
function markWhite(rel) {
  if (!rel || !rel.startsWith('/assets/img/')) return;
  const f = path.join(ROOT, 'assets', 'whitebg-guard.json');
  let g = {};
  try { g = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
  g[rel] = true;
  try {
    fs.writeFileSync(f, JSON.stringify(g, null, 1), 'utf8');
  } catch (e) { /* 守卫写入失败不影响主流程 */ }
}

/* dataURL → Buffer */
function dataUrlToBuf(dataUrl) {
  const m = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(String(dataUrl || '').trim());
  if (!m) return null;
  return Buffer.from(m[1], 'base64');
}

/**
 * 统一白底转换入口：接受 dataURL / 外部 URL / 本地绝对路径
 * 返回 { ok, path, before, changed } —— path 为站内相对路径
 */
async function convertToWhite(src, opts) {
  const force = !!(opts && opts.force);   /* 后台手动点「白底图」：无视守卫，一律重抠 */
  const s = String(src || '').trim();
  if (!s) return { ok:false, error:'空图片' };
  if (!force && s.startsWith('/assets/img/')) {
    if (isWhiteLocal(s)) return { ok:true, path:s, changed:false, skipped:true };
  }
  const stamp = Date.now().toString().slice(-8);
  const tmpDir = path.join(ROOT, '_tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(IMG_DIR, { recursive: true });

  let tmp = null;
  try {
    if (s.startsWith('data:')) {
      const buf = dataUrlToBuf(s);
      if (!buf) return { ok:false, error:'图片 dataURL 无效' };
      tmp = path.join(tmpDir, `cv-${stamp}.img`);
      fs.writeFileSync(tmp, buf);
    } else if (ALLOWED_IMG.test(s)) {
      tmp = path.join(tmpDir, `cv-${stamp}.img`);
      await download(s, tmp);
    } else if (s.startsWith('/assets/img/')) {
      tmp = path.join(ROOT, s.replace(/^\//, ''));
    } else if (/^[A-Za-z]:[\\/]/.test(s)) {
      tmp = path.resolve(s);
    } else {
      return { ok:false, error:'不支持的图片来源' };
    }
    const out = path.join(IMG_DIR, `CV-${stamp}.webp`);
    const r = await whiten(tmp, out);
    const rel = '/assets/img/collected/' + path.basename(out);
    markWhite(rel);
    r2sync.pushAsync(rel);
    return { ok:true, path:rel, before:r.before, changed:r.changed !== false };
  } catch (e) {
    return { ok:false, error:e.message };
  } finally {
    if (tmp && tmp.startsWith(tmpDir)) { try { fs.unlinkSync(tmp); } catch (e) {} }
  }
}

/* 批量：单进程处理，模型只加载一次 */
async function convertMany(list) {
  const stamp = Date.now().toString().slice(-8);
  const tmpDir = path.join(ROOT, '_tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const items = [];
  const keep = [];
  const meta = [];
  const seen = new Set();   /* 同一来源只处理一次 */

  /* 先建立任务清单（不做网络 I/O） */
  const pending = [];
  for (let i = 0; i < list.length; i++) {
    const s = String(list[i] || '').trim();
    if (!s) continue;
    if (seen.has(s)) { meta.push({ src:s, dup:true }); continue; }
    seen.add(s);
    if (s.startsWith('/assets/img/') && isWhiteLocal(s)) {
      meta.push({ src:s, out:s, localWhite:true });
      continue;
    }
    pending.push({ s, i });
  }

  /* 网络图片并行下载（原来逐张 await，60 张排队几十秒） */
  const prepTasks = pending.map(({ s, i }) => (async () => {
    const out = path.join(IMG_DIR, `CV-${stamp}-${i + 1}.webp`);
    try {
      if (s.startsWith('data:')) {
        const buf = dataUrlToBuf(s);
        if (!buf) return { s, error:'图片 dataURL 无效' };
        const tmp = path.join(tmpDir, `mv-${stamp}-${i}.img`);
        fs.writeFileSync(tmp, buf); keep.push(tmp);
        return { s, tmp, out };
      }
      if (ALLOWED_IMG.test(s)) {
        const tmp = path.join(tmpDir, `mv-${stamp}-${i}.img`);
        await download(s, tmp); keep.push(tmp);
        return { s, tmp, out };
      }
      if (s.startsWith('/assets/img/')) {
        const abs = path.join(ROOT, s.replace(/^\//, ''));
        if (!fs.existsSync(abs)) return { s, error:'本地文件不存在' };
        return { s, abs, out };
      }
      if (/^[A-Za-z]:[\\/]/.test(s)) {
        const abs = path.resolve(s);
        if (!fs.existsSync(abs)) return { s, error:'本地文件不存在' };
        return { s, abs, out };
      }
      return { s, error:'不支持的图片来源' };
    } catch (e) { return { s, error:e.message }; }
  })());
  const prepared = await Promise.all(prepTasks);
  prepared.forEach(p => {
    if (p.error) { meta.push({ src:p.s, error:p.error }); return; }
    const srcFile = p.tmp || p.abs;
    items.push({ src:srcFile, out:p.out });
    meta.push({ src:p.s, out:p.out, tmp:p.tmp });
  });

  const results = [];
  const bySrc = new Map();   /* 源 → 转换结果，供重复项复用 */
  if (items.length) {
    /* 抠图走常驻进程：模型常驻内存，省掉每批 4.8 秒的加载开销。
       进程内串行执行（pymatting 内存峰值高，并发会 OOM）。 */
    try {
      await worker.boot();
      await worker.waitReady(60000);
      const conv = await worker.convertItems(items);
      conv.forEach(r => {
        const m = meta.find(x => x.out === r.out);
        const rel = r.ok ? '/assets/img/collected/' + path.basename(r.out) : null;
        if (rel) markWhite(rel);
        const rec = { src: m ? m.src : r.src, ok: !!r.ok,
                      path: rel,
                      before: r.before, changed: r.changed, error: r.error };
        if (m) bySrc.set(m.src, rec);
      });
    } catch (e) {
      items.forEach(it => {
        const m = meta.find(x => x.out === it.out);
        bySrc.set(m ? m.src : it.src, { src: m ? m.src : it.src, ok:false, path:null, error:e.message });
      });
    }
  }
  /* 按输入顺序输出，重复来源复用首次结果 */
  meta.forEach(m => {
    if (m.localWhite) results.push({ src:m.src, ok:true, path:m.out, changed:false, skipped:true });
    else if (m.error) results.push({ src:m.src, ok:false, path:null, error:m.error });
    else if (m.dup) { const r = bySrc.get(m.src); results.push(r ? { ...r, dup:true } : { src:m.src, ok:false, path:null, error:'未转换' }); }
    else { const r = bySrc.get(m.src); if (r) results.push(r); }
  });
  keep.forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
  return results;
}

/* 采集页「图片批量」入口：走 convertMany，单进程处理，模型只加载一次 */
async function whitenImages(urls, cap = 200) {
  if (!Array.isArray(urls) || !urls.length) throw new Error('没有图片链接');
  const list = urls.slice(0, cap).map(u => String(u || '').trim()).filter(Boolean);
  const res = await convertMany(list);
  return res.map(r => r.ok
    ? { url: r.src, path: r.path, ok: true, before: r.before, changed: r.changed }
    : { url: r.src, error: r.error, ok: false });
}

/**
 * 批量预下载：把远程图片先并发拉到本地临时文件。
 * 草稿箱的抠图队列用它 —— 慢的是网络等待，并行做最划算；
 * 抠图本身（pymatting 内存峰值高）仍必须串行。
 * @returns [{src, file} | {src, error}]
 */
async function prefetchRemote(urls) {
  const list = Array.isArray(urls) ? urls : [];
  const tmpDir = path.join(ROOT, '_tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const stamp = Date.now().toString().slice(-8);
  const out = new Array(list.length);
  await Promise.all(list.map(async (u, i) => {
    const s = String(u || '').trim();
    if (!s) { out[i] = { src: s, error: '空图片' }; return; }
    try {
      if (s.startsWith('/assets/img/')) {
        out[i] = { src: s, file: path.resolve(ROOT, s.replace(/^\//, '')) };
        return;
      }
      if (/^[A-Za-z]:[\\/]/.test(s)) { out[i] = { src: s, file: path.resolve(s) }; return; }
      const file = path.join(tmpDir, `pf-${stamp}-${i}.img`);
      await download(s, file);
      out[i] = { src: s, file };
    } catch (e) {
      out[i] = { src: s, error: e.message || '下载失败' };
    }
  }));
  return out;
}

/**
 * 单张「下载 → 转白底」，走常驻进程（模型常驻，不重复加载）。
 * 供后台草稿队列逐张调用：一张约 2 秒，不会占满内存。
 * @returns {ok, path, error}
 */
async function convertRemoteOne(url) {
  const s = String(url || '').trim();
  if (!s) return { ok: false, error: '空图片' };
  if (s.startsWith('/assets/img/')) {
    if (isWhiteLocal(s)) return { ok: true, path: s, changed: false, skipped: true };
  }
  const stamp = Date.now().toString().slice(-8);
  const tmpDir = path.join(ROOT, '_tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(IMG_DIR, { recursive: true });
  let tmp = null;
  try {
    if (s.startsWith('data:')) {
      const buf = dataUrlToBuf(s);
      if (!buf) return { ok: false, error: '图片 dataURL 无效' };
      tmp = path.join(tmpDir, `cq-${stamp}.img`);
      fs.writeFileSync(tmp, buf);
    } else if (ALLOWED_IMG.test(s)) {
      tmp = path.join(tmpDir, `cq-${stamp}.img`);
      await download(s, tmp);
    } else if (s.startsWith('/assets/img/')) {
      tmp = path.join(ROOT, s.replace(/^\//, ''));
    } else if (/^[A-Za-z]:[\\/]/.test(s)) {
      tmp = path.resolve(s);
    } else {
      return { ok: false, error: '不支持的图片来源' };
    }
    let out = path.join(IMG_DIR, `CQ-${stamp}.webp`);
    /* 批量处理时同一毫秒可能撞名（文件名被覆盖会导致两个草稿指向同一张图）*/
    if (fs.existsSync(out)) out = path.join(IMG_DIR, `CQ-${stamp}-${Math.random().toString(36).slice(2, 6)}.webp`);
    const r = await worker.convertOne(tmp, out);
    if (!r.ok) return { ok: false, error: r.error || '白底转换失败' };
    const rel = '/assets/img/collected/' + path.basename(out);
    markWhite(rel);
    r2sync.pushAsync(rel);
    return { ok: true, path: rel, before: r.before, changed: r.changed };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    if (tmp && tmp.startsWith(tmpDir)) { try { fs.unlinkSync(tmp); } catch (e) {} }
  }
}

/* 预热常驻进程（提前加载好模型，避免第一张卡 5 秒） */
function warmup() {
  worker.boot().then(() => worker.waitReady(60000)).catch(() => {});
}

/**
 * 把远程商品图原样缓存到本站 assets/img/collected/。
 *
 * 为什么需要：采集到的图集是 1688 CDN 外链，后台页面里经常整批破图
 * （图床防盗链 / 临时链接失效 / 网络环境差异），命令行能下不代表浏览器能显示。
 * 落到本站静态目录后由自己的服务发图，图还是原来那张，不再依赖外站。
 *
 * 只下载、不抠图：图集保持原样，只有主图走白底流程。
 * 文件名按 URL 取哈希：重复图不会重复下载，也不会互相覆盖。
 */
async function cacheRemote(url) {
  const s = String(url || '').trim();
  if (!/^https?:\/\//i.test(s)) return { ok: false, error: '非远程图片' };
  const m = /\.(jpg|jpeg|png|webp|gif|bmp|avif)(?:[?#]|$)/i.exec(s);
  const ext = m ? m[1].toLowerCase() : 'jpg';
  const name = 'src-' + crypto.createHash('md5').update(s).digest('hex').slice(0, 16) + '.' + ext;
  const file = path.join(IMG_DIR, name);
  const rel = '/assets/img/collected/' + name;
  fs.mkdirSync(IMG_DIR, { recursive: true });
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > 200) {
      recordSource(rel, s, 'gallery');
      r2sync.pushAsync(rel);
      return { ok: true, path: rel, cached: true };
    }
    await download(s, file, { allowSmall: true });
    if (!fs.existsSync(file) || fs.statSync(file).size < 200) throw new Error('下载结果不是有效图片');
    recordSource(rel, s, 'gallery');
    r2sync.pushAsync(rel);
    return { ok: true, path: rel };
  } catch (e) {
    try { fs.unlinkSync(file); } catch (_) {}
    return { ok: false, error: e.message || '图片缓存失败' };
  }
}

module.exports = { convertToWhite, convertMany, whitenImages, convertRemoteOne, prefetchRemote, cacheRemote, warmup, recordSource, forgetSource, readSources, IMG_DIR };
