// restore-images.js — 把白底抠图(CQ-xxx)换回原图(src-xxx)
// 用法: cd E:\LUMIERE && node restore-images.js

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const ROOT = __dirname;
const DB_PATH = path.join(ROOT, '.data', 'db.json');
const SOURCES_PATH = path.join(ROOT, 'assets', 'img', 'collected', 'sources.json');
const IMG_DIR = path.join(ROOT, 'assets', 'img', 'collected');
const ASSETS_PREFIX = '/assets/img/collected/';

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));

// 工具: 下载图片到本地
function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destPath)) { resolve('exists'); return; }
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // 重定向
        downloadImage(new URL(res.headers.location, url).href, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const out = fs.createWriteStream(destPath);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve('ok')));
      out.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// 从 sources.json 反查 CQ 文件的原始 URL
function getOriginalUrl(cqFilename) {
  const entry = sources[cqFilename];
  if (entry && entry.url) return entry.url;
  return null;
}

// 生成一个 src 风格的文件名（哈希原始URL）
function hashUrl(url) {
  let h = 0;
  for (let i = 0; i < url.length; i++) { h = ((h << 5) - h + url.charCodeAt(i)) | 0; }
  return Math.abs(h).toString(16).padStart(16, '0');
}

function getExtFromUrl(url) {
  const m = url.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
  if (m) return m[1].toLowerCase();
  return 'jpg';
}

let changed = 0;
const toDownload = [];

// === 处理 products ===
for (const [id, p] of Object.entries(db.products)) {
  let pChanged = false;

  // 1. 修复主图 image 字段
  if (p.image && p.image.startsWith(ASSETS_PREFIX)) {
    const filename = p.image.replace(ASSETS_PREFIX, '');
    if (filename.startsWith('CQ-')) {
      // 找 gallery 里第一个 src-xxx 作为替换
      const srcFromGallery = (p.gallery || []).find(g => {
        const fn = g.replace(ASSETS_PREFIX, '');
        return fn.startsWith('src-');
      });
      if (srcFromGallery) {
        console.log(`[${id}] image: ${filename} → ${srcFromGallery.replace(ASSETS_PREFIX, '')}`);
        p.image = srcFromGallery;
        pChanged = true;
      } else {
        // gallery 里没有 src，从 sources.json 找原 URL 下载
        const origUrl = getOriginalUrl(filename);
        if (origUrl) {
          const ext = getExtFromUrl(origUrl);
          const newFn = `orig-${hashUrl(origUrl)}.${ext}`;
          const newPath = path.join(IMG_DIR, newFn);
          console.log(`[${id}] image: ${filename} → (下载原图) ${newFn}`);
          toDownload.push({ url: origUrl, dest: newPath, filename: newFn });
          p.image = ASSETS_PREFIX + newFn;
          pChanged = true;
        } else {
          console.log(`[${id}] image: ${filename} → ⚠️ 找不到原图来源，跳过`);
        }
      }
    }
  }

  // 2. 修复 gallery: 过滤掉 CQ-xxx（白底图）
  if (Array.isArray(p.gallery) && p.gallery.length > 0) {
    const filtered = p.gallery.filter(g => {
      const fn = g.replace(ASSETS_PREFIX, '');
      return !fn.startsWith('CQ-');
    });
    if (filtered.length !== p.gallery.length) {
      const removed = p.gallery.length - filtered.length;
      console.log(`[${id}] gallery: 移除 ${removed} 张白底图`);
      p.gallery = filtered;
      pChanged = true;

      // 如果 gallery 清空了，从 sources.json 下载原图补上
      if (p.gallery.length === 0) {
        console.log(`[${id}] gallery 空了，从 sources.json 找原图...`);
        for (const g of p.gallery) {} // 原 gallery 已被过滤，需要重新处理
      }
    }
  }

  // 3. 如果 image 还没指到 gallery 里的图，也修正
  if (p.gallery && p.gallery.length > 0 && p.image !== p.gallery[0]) {
    const imgFn = (p.image || '').replace(ASSETS_PREFIX, '');
    const firstGalleryFn = p.gallery[0].replace(ASSETS_PREFIX, '');
    // 只有当当前 image 不是白底且已有意义时才改
    if (imgFn.startsWith('CQ-')) {
      p.image = p.gallery[0];
      pChanged = true;
    }
  }

  if (pChanged) changed++;
}

// === 处理 drafts ===
for (const [id, d] of Object.entries(db.drafts)) {
  let dChanged = false;

  if (d.image && d.image.startsWith(ASSETS_PREFIX)) {
    const filename = d.image.replace(ASSETS_PREFIX, '');
    if (filename.startsWith('CQ-')) {
      // 优先用 mainSource（draft 特有字段）
      const origUrl = d.mainSource || getOriginalUrl(filename);
      if (origUrl) {
        const ext = getExtFromUrl(origUrl);
        const newFn = `orig-${hashUrl(origUrl)}.${ext}`;
        const newPath = path.join(IMG_DIR, newFn);
        console.log(`[${id}] image: ${filename} → (下载原图) ${newFn}`);
        toDownload.push({ url: origUrl, dest: newPath, filename: newFn });
        d.image = ASSETS_PREFIX + newFn;
        dChanged = true;
      }
    }
  }

  // gallery 过滤 CQ
  if (Array.isArray(d.gallery)) {
    const filtered = d.gallery.filter(g => {
      const fn = g.replace(ASSETS_PREFIX, '');
      return !fn.startsWith('CQ-');
    });
    if (filtered.length !== d.gallery.length) {
      console.log(`[${id}] gallery: 移除 ${d.gallery.length - filtered.length} 张白底图`);
      d.gallery = filtered;
      dChanged = true;
    }
  }

  // 关掉 whiteStatus（不再走白底队列）
  if (d.whiteStatus) {
    d.whiteStatus = 'done';
    delete d.whiteError;
    // 不删 whiteAt，保留记录
    dChanged = true;
  }

  if (dChanged) changed++;
}

// === 下载需要的原图 ===
(async () => {
  console.log(`\n共 ${toDownload.length} 张图需要下载...`);
  let ok = 0, fail = 0;
  for (const job of toDownload) {
    try {
      const r = await downloadImage(job.url, job.dest);
      console.log(`  ✅ ${r === 'exists' ? '(已存在)' : '下载'} ${job.filename}`);
      ok++;
    } catch (e) {
      console.log(`  ❌ 失败 ${job.filename}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\n下载完成: ${ok} 成功, ${fail} 失败`);

  // === 写回 db.json ===
  if (changed > 0 || toDownload.length > 0) {
    const bakPath = DB_PATH + '.bak-' + Date.now();
    fs.copyFileSync(DB_PATH, bakPath);
    console.log(`\n备份: ${bakPath}`);
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
    console.log(`✅ db.json 已更新 (${changed} 个商品/草稿被修改)`);
  } else {
    console.log('\n无需修改，已经全是原图了');
  }
})();
