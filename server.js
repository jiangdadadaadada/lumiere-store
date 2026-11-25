/* ============================================================
   LUMIÈRE · 本地开发服务器 (Node, 无需依赖)
   同时提供静态文件 + /api/* 后端，供本地完整联调。
   启动: node server.js  → http://localhost:8080
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { URL } = require('url');
const collector = require('./whitebg.js');   /* 图片白底转换（入库前统一走它） */
const imtr = require('./imtranslate.js');    /* 商品图中文→英文回贴（OCR + 翻译） */
const r2sync = require('./r2sync.js');       /* 图片同步到 R2（经 Worker 中转） */
const optimize = require('./content-optimize.js'); /* 采集标题/描述/规格自动优化 */

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

/* 加载 ESM 核心业务层（backend-core.js 使用 export） */
let core;
(async () => {
  const mod = await import('./backend-core.js');
  core = mod;
  console.log('✓ 后端核心业务层已加载');
})();

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.ico':'image/x-icon', '.webp':'image/webp', '.avif':'image/avif', '.gif':'image/gif',
  '.mp4':'video/mp4', '.webm':'video/webm', '.mp3':'audio/mpeg',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf',
  '.txt':'text/plain; charset=utf-8', '.pdf':'application/pdf'
};

/* 内存存储 + 本地文件持久化
   原本纯内存，重启即丢商品/订单/客服会话；这里落一份 JSON，
   保证「后台改完 → 重启服务」不会回滚。生产部署仍用 D1（worker.js）。 */
const DATA_DIR = path.join(ROOT, '.data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const TRANS_CACHE = new Map();   /* 中文→英文自动翻译的缓存，避免同一段描述反复请求 */
const mem = { products: new Map(), drafts: new Map(), orders: new Map(), stock: new Map(), chats: new Map(), settings: null };

/* ---------- 多站点注册表 ----------
   一个后台管多个独立站：每个站点有自己的域名 / 币种 / 主题色；
   商品、草稿、订单按 site 字段隔离，历史数据自动归到默认站点。 */
const SITE_DEFAULT = {
  id:'lumiere', name:'LUMIÈRE', domain:'lumiere.store', aliases:[],
  currency:'USD', rate:0.139, accent:'#7F77DD', active:true, isDefault:true
};
function normalizeSites(list){
  const out = [];
  (Array.isArray(list) ? list : []).forEach(s => {
    if (!s || !s.id) return;
    const id = String(s.id).toLowerCase().replace(/[^a-z0-9_-]/g,'');
    if (!id || out.some(x => x.id === id)) return;
    out.push({
      id, name: String(s.name || id).slice(0, 40),
      domain: String(s.domain || '').toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'').replace(/^www\./,''),
      aliases: Array.isArray(s.aliases) ? s.aliases.map(x => String(x).toLowerCase().trim()).filter(Boolean).slice(0,8) : [],
      currency: String(s.currency || 'USD').toUpperCase().slice(0,5),
      rate: Number(s.rate) > 0 ? Number(s.rate) : 0.139,
      accent: /^#[0-9a-f]{6}$/i.test(String(s.accent||'')) ? String(s.accent) : '#7F77DD',
      active: s.active !== false,
      isDefault: !!s.isDefault
    });
  });
  if (!out.some(x => x.isDefault)) {
    const d = out.find(x => x.id === SITE_DEFAULT.id);
    if (d) d.isDefault = true; else out.unshift(Object.assign({}, SITE_DEFAULT));
  }
  return out;
}
function defaultSiteId(){ const d = mem.sites.find(x => x.isDefault); return d ? d.id : SITE_DEFAULT.id; }
function siteById(id){ return mem.sites.find(x => x.id === String(id||'')) || null; }
function siteFromHost(host){
  const clean = String(host || '').split(':')[0].toLowerCase().replace(/^www\./,'');
  if (!clean) return null;
  return mem.sites.find(s => s.domain === clean || (s.aliases||[]).includes(clean)) || null;
}
/* 站点解析：显式 ?site= 优先（后台切换用），否则按访问域名匹配，最后回落默认站点 */
function resolveSite(req, url){
  const q = url && url.searchParams ? url.searchParams.get('site') : '';
  if (q && siteById(q)) return String(q);
  const byHost = siteFromHost(req.headers.host);
  return byHost ? byHost.id : defaultSiteId();
}

/* 采集诊断记录（内存 + 落盘 .data/collect-diag.json） */
const diagLog = [];
const env = { /* 本地无 D1，走内存 */ };

let saveTimer = null;
function loadStore(reload) {
  /* reload=true：先清空各 Map 再载入，避免重复累加（供 /api/_reload 本地热重载用） */
  if (reload) {
    mem.products.clear(); mem.drafts.clear(); mem.orders.clear();
    mem.stock.clear(); mem.chats.clear();
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const j = JSON.parse(raw);
    if (j.products) Object.entries(j.products).forEach(([k, v]) => mem.products.set(k, v));
    if (j.drafts) Object.entries(j.drafts).forEach(([k, v]) => mem.drafts.set(k, v));
    if (j.orders) Object.entries(j.orders).forEach(([k, v]) => mem.orders.set(k, v));
    if (j.stock) Object.entries(j.stock).forEach(([k, v]) => mem.stock.set(k, Number(v) || 0));
    if (j.chats) Object.entries(j.chats).forEach(([k, v]) => mem.chats.set(k, v));
    if (j.sites) mem.sites = j.sites;
    if (j.settings) mem.settings = j.settings;
    mem.sites = normalizeSites(mem.sites);
    console.log(`✓ 已恢复本地数据：商品 ${mem.products.size} · 草稿 ${mem.drafts.size} · 订单 ${mem.orders.size} · 客服会话 ${mem.chats.size}`);
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('⚠ 读取 .data/db.json 失败：', e.message);
  }
}
function saveStoreNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj = {
      products: Object.fromEntries(mem.products),
      drafts: Object.fromEntries(mem.drafts),
      orders: Object.fromEntries(mem.orders),
      stock: Object.fromEntries(mem.stock),
      chats: Object.fromEntries(mem.chats),
      sites: mem.sites,
      settings: mem.settings
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 1));
  } catch (e) { console.warn('⚠ 写入 .data/db.json 失败：', e.message); }
}
function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveStoreNow, 120);
}
loadStore();

/* 免费翻译接口（MyMemory）：单次请求不宜太长，按句子切成 <320 字的块再拼回去 */
async function translateText(text, sl, tl) {
  const chunks = [];
  let buf = '';
  const parts = String(text).split(/(?<=[。！？；!?;\n])/).filter(x => x.trim());
  for (const part of parts.length ? parts : [text]) {
    if ((buf + part).length > 320 && buf) { chunks.push(buf); buf = ''; }
    if (part.length > 320) {
      for (let i = 0; i < part.length; i += 320) chunks.push(part.slice(i, i + 320));
    } else {
      buf += part;
    }
  }
  if (buf) chunks.push(buf);
  const out = [];
  for (const c of chunks) {
    const key = sl + '>' + tl + ':' + c;
    if (TRANS_CACHE.has(key)) { out.push(TRANS_CACHE.get(key)); continue; }
    const u = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(c) + '&langpair=' + encodeURIComponent(sl + '|' + tl);
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const t = String((j && j.responseData && j.responseData.translatedText) || '').trim();
    if (!t || /^MYMEMORY WARNING/i.test(t)) throw new Error('翻译接口额度用尽或没返回内容');
    if (TRANS_CACHE.size > 800) TRANS_CACHE.clear();
    TRANS_CACHE.set(key, t);
    out.push(t);
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

function send(res, code, body, type, noCache) {
  const headers = {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Payment-Signature'
  };
  /* ★ HTML 强制不缓存：之前后台页被浏览器缓存旧版，用户改了代码却一直看到旧页面
     （SKU 提示文字都对不上），每次都要手动 Ctrl+F5。这里从服务端根治。 */
  if (noCache) headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0';
  res.writeHead(code, headers);
  /* Buffer（静态文件）直接原样输出；对象才 JSON 序列化 */
  if (Buffer.isBuffer(body)) return res.end(body);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

/* 本地 IP → 国家：调用免费服务，失败回退 US */
async function lookupCountry(req) {
  try {
    const forwarded = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    if (forwarded.includes('127.0.0.1') || forwarded.includes('::1') || forwarded.includes('::ffff:127.0.0.1')) {
      return 'CN'; // 本地开发默认中国，便于验证中文界面
    }
    const r = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(2000) }).then(x=>x.json()).catch(()=>null);
    if (r && r.country_code) return r.country_code;
  } catch (e) {}
  return 'US';
}

/* 商品入库前白底兜底：**只强制首图**转白底，图集 / SKU 图保持原样。
   （需求：首图强制白底图，其他图按原有的就行） */
async function enforceWhiteProduct(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const main = payload.image;
  if (typeof main !== 'string' || !main) return payload;
  if (main.startsWith('data:image/svg')) return payload;
  /* 已是本地白底图就跳过，避免重复抠图 */
  if (main.startsWith('/assets/img/')) {
    const guard = path.join(ROOT, 'assets', 'whitebg-guard.json');
    try {
      const g = JSON.parse(fs.readFileSync(guard, 'utf8'));
      if (g[main] === true) return payload;
    } catch (e) { /* 守卫文件缺失则继续 */ }
  }
  let r = null;
  try {
    r = await collector.convertRemoteOne(main);
  } catch (e) {
    return payload;  /* 转换失败不阻断入库，原图照存 */
  }
  if (r && r.ok && r.path) payload.image = localToSitePath(r.path);
  return payload;
}

/* 本地绝对路径（如 E:/LUMIERE/assets/img/x.jpg）→ 站内相对路径 /assets/img/x.jpg
   仅处理位于项目根目录下的文件；根目录之外保持原样。 */
function localToSitePath(v) {
  if (typeof v !== 'string' || !v) return v;
  if (!/^[A-Za-z]:[\\/]/.test(v)) return v;
  const abs = path.resolve(v);
  const root = path.resolve(ROOT);
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return v;
  return '/' + rel.replace(/\\/g, '/');
}

/* 删除草稿时连带清理它生成的白底图。
   不清理的话，草稿删光后 assets/img/collected/ 会堆一堆孤儿文件。
   安全约束：
   - 只动 /assets/img/collected/ 目录下的文件
   - 解析后必须仍在项目根目录内（防目录穿越）
   - 还有别的草稿在用这张图就不删
   - 同步清掉白底缓存记录，否则下次采集同一张图会被当成「已转过」而跳过抠图 */
function removeCollectedFile(imgPath, skipId) {
  if (typeof imgPath !== 'string' || !imgPath) return false;
  if (!imgPath.startsWith('/assets/img/collected/')) return false;
  for (const d of mem.drafts.values()) {
    if (d.id === skipId) continue;
    if (d.image === imgPath) return false;
    if (Array.isArray(d.gallery) && d.gallery.indexOf(imgPath) >= 0) return false;
  }
  const root = path.resolve(ROOT);
  const abs = path.resolve(root, '.' + imgPath);
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  try {
    if (!fs.existsSync(abs)) return false;
    fs.unlinkSync(abs);
    collector.forgetSource(imgPath);
  } catch (e) { return false; }
  const guard = path.join(ROOT, 'assets', 'whitebg-guard.json');
  try {
    const g = JSON.parse(fs.readFileSync(guard, 'utf8'));
    if (g[imgPath] === true) {
      delete g[imgPath];
      fs.writeFileSync(guard, JSON.stringify(g, null, 2));
    }
  } catch (e) { /* 守卫文件缺失无所谓 */ }
  return true;
}

/* ============================================================
   采集 → 草稿箱：首图白底转换队列
   ---------------------------------------------------------
   采集链路要求「秒回」：商品先立刻落进草稿箱，首图白底转换
   放到后台队列异步做，不占用采集响应时间。

   队列串行执行（pymatting 内存峰值高，并发会 OOM），
   每张约 2 秒，模型常驻不重复加载。
   ============================================================ */
const wbQueue = [];
let wbRunning = false;
/* done/failed 是本进程生命周期内的累计数，pending 是当前队列剩余 */
const wbState = { done: 0, failed: 0, current: '' };

function wbEnqueue(draftId, imageUrl) {
  wbQueue.push({ id: draftId, url: imageUrl });
}

/* 批量入队：一次性塞进队列，只启动一次泵。
   逐个 wbEnqueue 会每条都调一次 wbPump（虽然被 wbRunning 挡住，
   但仍有额外开销），批量入队更干净。 */
function wbEnqueueBatch(jobs) {
  for (const j of jobs) wbQueue.push(j);
  setImmediate(wbPump);
}

/* 一次处理一批任务：
   ① 下载并行（慢的是网络等待，并行最划算）
   ② 抠图串行（pymatting 内存峰值高，并发会 OOM）
   之前是逐张「下载+抠图」完全串行，遇到慢图床时
   60 张图最坏要串行等 60×15 秒，整个队列被拖死。 */
const WB_BATCH = 6;

async function wbPump() {
  if (wbRunning) return;
  const batch = wbQueue.splice(0, WB_BATCH);
  if (!batch.length) return;
  wbRunning = true;
  wbState.current = batch.length > 1 ? (batch[0].id + ' 等 ' + batch.length + ' 张') : (batch[0].id || '');
  try {
  /* 预下载：远程图并发拉到本地，失败的先记下来 */
  let pre = [];
  try {
    pre = await collector.prefetchRemote(batch.map(j => j.url));
  } catch (e) {
    pre = batch.map(() => ({ error: e.message }));
  }
  for (let i = 0; i < batch.length; i++) {
    const job = batch[i];
    let p = pre[i] || { error: '下载失败' };
    const d = mem.drafts.get(job.id);
    if (!d) continue;   /* 草稿已被删除 */
    try {
      /* 首图是 120×64 占位图时，自动改试图集里的下一张真实商品图 */
      const backups = (job.candidates || []).filter(u => u && u !== job.url);
      while (p.error && /占位图|图片太小|尺寸/.test(p.error) && backups.length) {
        const next = backups.shift();
        const retry = await collector.prefetchRemote([next]);
        p = retry && retry[0] ? retry[0] : { error: '下载失败' };
        if (!p.error) d.image = next;
      }
      if (p.error) {
        /* 白底失败也不能留破图：把原图缓存到本站，至少后台能正常显示 */
        if (d.image && /^https?:\/\//i.test(d.image)) {
          const fb = await collector.cacheRemote(d.image);
          if (fb.ok) d.image = fb.path;
        }
        d.whiteStatus = 'failed';
        d.whiteError = p.error;
        wbState.failed++;
        mem.drafts.set(job.id, d);
        saveStoreNow();
        continue;
      }
      /* 用已下载好的本地文件抠图，避免二次下载 */
      const r = await collector.convertRemoteOne(p.file);
      /* 转换要几秒，这期间草稿可能已被删除。
         此时不能再 mem.drafts.set —— 那会把已删的草稿"复活"，
         同时转换出来的白底图也成了没人引用的孤儿文件，一并清掉。 */
      if (!mem.drafts.has(job.id)) {
        if (r && r.ok && r.path) removeCollectedFile(localToSitePath(r.path), job.id);
        continue;
      }
      if (r.ok) {
        d.image = localToSitePath(r.path);
        /* 账本记下这张白底图来自哪个原始 URL —— 文件丢了能重新生成 */
        collector.recordSource(d.image, job.url, 'white');
        d.whiteStatus = 'done';
        d.whiteAt = new Date().toISOString();
        wbState.done++;
      } else {
        /* 抠图失败 → 退回本地缓存的原图，不留破图 */
        const fb = await collector.cacheRemote(d.image);
        if (fb.ok) d.image = fb.path;
        d.whiteStatus = 'failed';
        d.whiteError = r.error || '白底转换失败';
        wbState.failed++;
      }
      mem.drafts.set(job.id, d);
      saveStoreNow();
    } catch (e) {
      const cur = mem.drafts.get(job.id);
      if (cur) { cur.whiteStatus = 'failed'; cur.whiteError = e.message; mem.drafts.set(job.id, cur); saveStoreNow(); }
      wbState.failed++;
    }
  }
  /* 清理预下载的临时文件 */
  for (const p of pre) {
    if (p && p.file && p.file.indexOf(path.join(ROOT, '_tmp')) === 0) {
      try { fs.unlinkSync(p.file); } catch (e) {}
    }
  }
  } finally {
    /* 无论中途抛什么异常，wbRunning 都必须复位，否则整个白底队列会永久卡死 */
    wbRunning = false;
    wbState.current = '';
    setImmediate(wbPump);   /* 让出事件循环，服务端不卡 */
  }
}
/* 恢复未完成的白底转换：服务重启后，之前排队的草稿继续转
   （pending = 还没转完；failed = 上次失败，重新排队重试） */
function resumeWhiteQueue() {
  const pending = Array.from(mem.drafts.values())
    .filter(d => d.whiteStatus === 'pending' || d.whiteStatus === 'failed')
    .filter(d => d.image && !d.image.startsWith('/assets/img/collected/'));
  if (!pending.length) return;
  console.log(`↻ 恢复 ${pending.length} 个待转换草稿的首图白底`);
  wbEnqueueBatch(pending.map(d => ({ id: d.id, url: d.image })));
}

/* ============================================================
   图集图片本地化队列
   ---------------------------------------------------------
   采集时图集存 1688 CDN 外链，后台经常整批破图。这里在采集响应
   返回之后，把图集图片原样下载到本站静态目录并替换路径。
   图片还是原来那张，不抠图、不阻塞采集。
   ============================================================ */
const imgQueue = [];
let imgRunning = false;

function imgEnqueue(jobs) {
  for (const j of jobs) imgQueue.push(j);
  if (imgQueue.length) setImmediate(imgPump);
}

async function imgPump() {
  if (imgRunning) return;
  const batch = imgQueue.splice(0, 24);
  if (!batch.length) return;
  imgRunning = true;
  let changed = false;
  try {
    await Promise.all(batch.map(async (job) => {
      const d = mem.drafts.get(job.id);
      if (!d || !Array.isArray(d.gallery)) return;
      const u = d.gallery[job.i];
      if (typeof u !== 'string' || !/^https?:\/\//i.test(u)) return;
      const r = await collector.cacheRemote(u);
      if (!r.ok) return;
      /* 转换期间草稿可能被编辑/删除：源地址没变才写回，避免覆盖用户操作 */
      const cur = mem.drafts.get(job.id);
      if (!cur || !Array.isArray(cur.gallery) || cur.gallery[job.i] !== u) return;
      cur.gallery[job.i] = r.path;
      mem.drafts.set(job.id, cur);
      changed = true;
    }));
  } catch (e) {
    console.error('图集缓存失败:', e.message);
  } finally {
    if (changed) saveStoreNow();
    imgRunning = false;
    if (imgQueue.length) setImmediate(imgPump);
  }
}

/* SKU 选项图同样落本地：1688 图床对带本站 Referer 的请求直接 403（后台整片破图的根源），
   缓存到 assets/img/collected/ 后由本站发图，后台与发布都不再依赖外站。 */
const skuImgQueue = [];
let skuImgRunning = false;

function skuImgEnqueue(jobs) {
  for (const j of jobs) skuImgQueue.push(j);
  if (skuImgQueue.length) setImmediate(skuImgPump);
}

async function skuImgPump() {
  if (skuImgRunning) return;
  const batch = skuImgQueue.splice(0, 16);
  if (!batch.length) return;
  skuImgRunning = true;
  let changed = false;
  try {
    await Promise.all(batch.map(async (job) => {
      const d = mem.drafts.get(job.id);
      if (!d || !d.skuImages || !d.skuImages[job.k]) return;
      const u = d.skuImages[job.k][job.v];
      if (typeof u !== 'string' || !/^https?:\/\//i.test(u)) return;
      /* _sum.jpg 只有 60×60，卡片里放大会糊；优先存 400×400，失败再退回原图 */
      const big = u.replace(/_sum\.jpg$/i, '_400x400.jpg');
      let r = await collector.cacheRemote(big);
      if (!r.ok && big !== u) r = await collector.cacheRemote(u);
      if (!r.ok) return;
      const cur = mem.drafts.get(job.id);
      if (!cur || !cur.skuImages || !cur.skuImages[job.k] || cur.skuImages[job.k][job.v] !== u) return;
      cur.skuImages[job.k][job.v] = r.path;
      mem.drafts.set(job.id, cur);
      changed = true;
    }));
  } catch (e) {
    console.error('SKU 图缓存失败:', e.message);
  } finally {
    if (changed) saveStoreNow();
    skuImgRunning = false;
    if (skuImgQueue.length) setImmediate(skuImgPump);
  }
}

/* 老草稿修复：白底文件丢了 / 图集还是外链时，重新排队补齐 */
function repairDraftImages() {
  const wb = [], imgs = [], skus = [];
  for (const d of mem.drafts.values()) {
    let needWhite = false;
    if (typeof d.image !== 'string' || !d.image) needWhite = true;
    else if (d.image.startsWith('/assets/img/')) {
      const f = path.resolve(ROOT, '.' + d.image);
      if (!fs.existsSync(f) || fs.statSync(f).size < 1024) needWhite = true;
    }
    if (needWhite && d.gallery && d.gallery.length) {
      d.image = d.gallery[0];
      d.whiteStatus = 'pending';
      mem.drafts.set(d.id, d);
      wb.push({ id: d.id, url: d.image, candidates: d.gallery.slice() });
    }
    (d.gallery || []).forEach((u, i) => {
      if (typeof u === 'string' && /^https?:\/\//i.test(u)) imgs.push({ id: d.id, i });
    });
    /* SKU 选项图仍是外链的，一并排进本地缓存（历史草稿也能修好） */
    const skuBag = d.skuImages || {};
    Object.keys(skuBag).forEach(k => Object.keys(skuBag[k] || {}).forEach(v => {
      const u = skuBag[k][v];
      if (typeof u === 'string' && /^https?:\/\//i.test(u)) skus.push({ id: d.id, k, v });
    }));
  }
  if (wb.length) wbEnqueueBatch(wb);
  if (imgs.length) imgEnqueue(imgs);
  if (skus.length) skuImgEnqueue(skus);
  return { white: wb.length, gallery: imgs.length, sku: skus.length };
}

/* ============================================================
   图片自愈巡检（治本）
   ---------------------------------------------------------
   数据库里的路径只是"文件应该在哪"，不是"文件一定在"。
   测试脚本、手工清理、磁盘异常都可能让文件消失，而 db 还指向它 ——
   表现出来就是整批破图，且没人知道。

   巡检规则：
   ① 文件在 → 跳过
   ② 文件丢了、来源账本有原 URL → 自动重下 / 重做白底
   ③ 两者都没有 → 写 imageError，后台明确显示错误，不再静默破图

   触发：服务启动、每 10 分钟、管理端手动调用。
   ============================================================ */
const healState = { running: false, lastAt: '', last: null };

function localFileOk(rel) {
  if (typeof rel !== 'string' || !rel.startsWith('/assets/img/collected/')) return false;
  try {
    const abs = path.resolve(ROOT, '.' + rel);
    return fs.existsSync(abs) && fs.statSync(abs).size > 200;
  } catch (e) { return false; }
}
function storeOf(id) { return mem.drafts.get(id) ? mem.drafts : mem.products; }

async function healImages() {
  if (healState.running) return healState.last || { running: true };
  healState.running = true;
  const r = { checked: 0, healed: 0, failed: 0, noSource: 0, errors: [] };
  try {
    const sources = collector.readSources();
    const all = Array.from(mem.drafts.values()).concat(Array.from(mem.products.values()));
    const tasks = [];
    let changed = false;
    for (const d of all) {
      /* 老数据补齐价格缺失标记：0 价不再是"免费"，而是"没抓到" */
      if (!(Number(d.price) > 0) && d.priceMissing === undefined) {
        d.priceMissing = true;
        d.priceMissingAt = d.collectedAt || new Date().toISOString();
        const st = storeOf(d.id);
        if (st) st.set(d.id, d);
        changed = true;
      }
      if (typeof d.image === 'string' && d.image.startsWith('/assets/img/collected/') && !localFileOk(d.image))
        tasks.push({ id: d.id, field: 'main', value: d.image });
      else if (typeof d.image === 'string' && /^https?:\/\//i.test(d.image))
        tasks.push({ id: d.id, field: 'main', value: d.image });
      (Array.isArray(d.gallery) ? d.gallery : []).forEach((u, i) => {
        if (typeof u === 'string' && u.startsWith('/assets/img/collected/') && !localFileOk(u))
          tasks.push({ id: d.id, field: 'gallery', index: i, value: u });
        else if (typeof u === 'string' && /^https?:\/\//i.test(u))
          tasks.push({ id: d.id, field: 'gallery', index: i, value: u });
      });
    }
    r.checked = tasks.length;

    for (const t of tasks) {
      const store = storeOf(t.id);
      const d = store && store.get(t.id);
      if (!d) continue;
      const now = t.field === 'main' ? d.image : (d.gallery || [])[t.index];
      /* 已被别的任务修好，跳过 */
      if (now && now !== t.value && (/^https?:/i.test(now) ? false : localFileOk(now))) continue;

      let url = /^https?:\/\//i.test(t.value) ? t.value : '';
      const rec = sources[path.basename(String(t.value || ''))];
      let type = t.field === 'main' ? 'white' : 'gallery';
      const dbSource = t.field === 'main' ? d.mainSource : (d.gallerySources || [])[t.index];
      /* 优先用 db 里永久留档的原始链接，其次是来源账本 */
      if (!url && /^https?:\/\//i.test(dbSource || '')) url = dbSource;
      if (!url && rec && rec.url) { url = rec.url; type = rec.type || type; }
      /* 白底图连来源都没了 → 借同一商品图集里的任意一张重建 */
      if (!url && type === 'white') {
        const gs = Array.isArray(d.gallerySources) ? d.gallerySources : [];
        for (const g of gs) { if (/^https?:\/\//i.test(g || '')) { url = g; break; } }
        for (const g of (d.gallery || [])) {
          const gr = sources[path.basename(String(g || ''))];
          if (gr && gr.url) { url = gr.url; break; }
          if (/^https?:\/\//i.test(g || '')) { url = g; break; }
        }
      }
      if (!url) {
        r.noSource++;
        d.imageError = t.field === 'main' ? '主图源文件丢失，请手动上传' : '部分图集图片源文件丢失';
        store.set(t.id, d);
        changed = true;
        continue;
      }

      try {
        let finalPath;
        if (type === 'white') {
          const pre = await collector.prefetchRemote([url]);
          if (!pre[0] || pre[0].error) throw new Error((pre[0] && pre[0].error) || '下载失败');
          const conv = await collector.convertRemoteOne(pre[0].file);
          if (!conv.ok) throw new Error(conv.error || '白底转换失败');
          finalPath = localToSitePath(conv.path);
          collector.recordSource(finalPath, url, 'white');
        } else {
          const c = await collector.cacheRemote(url);
          if (!c.ok) throw new Error(c.error || '图片缓存失败');
          finalPath = c.path;
        }
        if (t.field === 'main') {
          /* 文件名变了，所有还指向旧路径的草稿/商品一起改 */
          for (const [sid, item] of store) {
            if (item.image === t.value) { item.image = finalPath; store.set(sid, item); }
          }
          d.whiteStatus = 'done';
          d.whiteAt = new Date().toISOString();
        } else {
          d.gallery[t.index] = finalPath;
        }
        delete d.imageError;
        store.set(t.id, d);
        r.healed++;
        changed = true;
      } catch (e) {
        r.failed++;
        r.errors.push(t.id + ' ' + t.field + ': ' + e.message);
        d.imageError = '图片恢复失败：' + e.message;
        store.set(t.id, d);
        changed = true;
      }
    }
    if (changed) saveStoreNow();
  } catch (e) {
    r.errors.push('巡检异常: ' + e.message);
  } finally {
    healState.running = false;
    healState.lastAt = new Date().toISOString();
    healState.last = r;
    if (r.healed || r.failed || r.noSource) console.log('图片巡检:', JSON.stringify(r));
  }
  return r;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === 'OPTIONS') return send(res, 204, {});

  /* ---- API ---- */
  if (pathname.startsWith('/api/')) {
    if (!core) return send(res, 503, { error: 'core loading' });

    if (pathname === '/api/geo' && req.method === 'GET') {
      const country = await lookupCountry(req);
      return send(res, 200, core.GEO_ROUTE(country));
    }
    if (pathname === '/api/currencies' && req.method === 'GET') {
      return send(res, 200, core.CURRENCY_ROUTE());
    }
      /* ---- 商品英文描述自动翻译（中文 → 英文） ---- */
  if (pathname === '/api/translate' && req.method === 'GET') {
    const q = String(url.searchParams.get('q') || '').trim().slice(0, 4000);
    const sl = (url.searchParams.get('sl') || 'zh-CN').slice(0, 12);
    const tl = (url.searchParams.get('tl') || 'en').slice(0, 12);
    if (!q) return send(res, 400, { error: '缺少要翻译的文本' });
    try {
      const text = await translateText(q, sl, tl);
      return send(res, 200, { ok: true, text });
    } catch (e) {
      return send(res, 502, { error: '翻译失败：' + e.message });
    }
  }
if (pathname === '/api/health') {
      return send(res, 200, { ok:true, service:'lumiere', d1:false, mode:'local' });
    }

    /* ---- 站点：当前访问落在哪个站（前台/后台都用它定位） ---- */
    if (pathname === '/api/site' && req.method === 'GET') {
      const id = resolveSite(req, url);
      return send(res, 200, { ok:true, site: siteById(id), sites: mem.sites, default: defaultSiteId() });
    }
    if (pathname === '/api/sites' && req.method === 'GET') {
      return send(res, 200, { ok:true, sites: mem.sites, default: defaultSiteId() });
    }
    if (pathname === '/api/sites' && req.method === 'POST') {
      let raw = ''; for await (const c of req) raw += c;
      let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) { return send(res, 400, { error:'invalid json' }); }
      /* 校验先做，任何失败都不改动 mem.sites，避免"报错却写进了数据库" */
      const sid = String(b.id || '').toLowerCase().replace(/[^a-z0-9_-]/g,'');
      if (!sid) return send(res, 400, { error:'站点 ID 只能用小写字母、数字、- 和 _' });
      if (mem.sites.some(o => o.id === sid)) return send(res, 409, { error:'站点 ID 已存在' });
      const dom = String(b.domain || '').toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'').replace(/^www\./,'');
      if (dom && mem.sites.some(o => o.domain === dom || (o.aliases || []).includes(dom))) {
        return send(res, 409, { error:'域名已被其他站点使用' });
      }
      const aliases = Array.isArray(b.aliases) ? b.aliases.map(x => String(x).toLowerCase().trim()).filter(Boolean) : [];
      const clash = aliases.find(a => mem.sites.some(o => o.domain === a || (o.aliases || []).includes(a)));
      if (clash) return send(res, 409, { error:'别名域名已被占用：' + clash });
      const merged = normalizeSites(mem.sites.concat([Object.assign({}, b, { id: sid, isDefault:false })]));
      const created = merged.find(x => x.id === sid);
      if (!created) return send(res, 400, { error:'站点创建失败，请检查站点 ID' });
      mem.sites = merged; saveStoreNow();
      return send(res, 201, { ok:true, site: created, sites: mem.sites });
    }
    const siteM = /^\/api\/sites\/([^/]+)$/.exec(pathname);
    if (siteM) {
      const sid = decodeURIComponent(siteM[1]);
      const cur = siteById(sid);
      if (!cur) return send(res, 404, { error:'站点不存在' });
      if (req.method === 'PUT') {
        let raw = ''; for await (const c of req) raw += c;
        let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) { return send(res, 400, { error:'invalid json' }); }
        delete b.id;
        const next = normalizeSites(mem.sites.map(x => x.id === sid ? Object.assign({}, x, b) : x));
        const dom = String(b.domain || '').toLowerCase();
        const other = next.find(x => x.id !== sid && x.domain && x.domain === dom);
        if (other) return send(res, 409, { error:'域名已被站点 ' + other.id + ' 使用' });
        mem.sites = next; saveStoreNow();
        return send(res, 200, { ok:true, site: siteById(sid), sites: mem.sites });
      }
      if (req.method === 'DELETE') {
        if (cur.isDefault) return send(res, 400, { error:'默认站点不能删除' });
        const used = Array.from(mem.products.values()).filter(x => (x.site||'lumiere') === sid).length
          + Array.from(mem.drafts.values()).filter(x => (x.site||'lumiere') === sid).length
          + Array.from(mem.orders.values()).filter(x => (x.site||'lumiere') === sid).length;
        if (used > 0) return send(res, 400, { error:'该站点还有 ' + used + ' 条数据（商品/草稿/订单），请先清理' });
        mem.sites = mem.sites.filter(x => x.id !== sid); saveStoreNow();
        return send(res, 200, { ok:true, sites: mem.sites });
      }
    }
    /* 本地热重载磁盘 db → 内存（仅允许 127.0.0.1，便于修数据后免重启生效） */
    if (pathname === '/api/_reload' && req.method === 'POST') {
      const rip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (rip !== '127.0.0.1' && rip !== '::1') return send(res, 403, { error:'local only' });
      /* 以磁盘为准整体重载（调用方应先写好 db.json；热重载前不做落盘，避免内存旧数据覆盖磁盘） */
      loadStore(true);
      return send(res, 200, { ok:true, drafts:mem.drafts.size, products:mem.products.size });
    }
    if (pathname === '/api/_queue_status' && req.method === 'GET') {
      return send(res, 200, { imgQueue: imgQueue.length, imgRunning, wbQueue: wbQueue.length, wbRunning, heal: healState.last, lastAt: healState.lastAt });
    }
    /* 一次性迁移：从历史缓存里提取的原始链接补全 db 留档 + 来源账本 */
    if (pathname === '/api/_backfill_sources' && req.method === 'POST') {
      const rip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (rip !== '127.0.0.1' && rip !== '::1') return send(res, 403, { error:'local only' });
      let raw = ''; for await (const c of req) raw += c;
      let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
      const urls = Array.isArray(b.urls) ? b.urls : [];
      const byHash = new Map();
      for (const u of urls) {
        if (typeof u !== 'string' || !/^https?:\/\//i.test(u)) continue;
        byHash.set(crypto.createHash('md5').update(u).digest('hex').slice(0, 16), u);
      }
      let addedSources = 0, filledMain = 0, filledGallery = 0;
      const names = fs.existsSync(collector.IMG_DIR) ? fs.readdirSync(collector.IMG_DIR) : [];
      for (const f of names) {
        const h = /^src-([0-9a-f]{16})\./.exec(f);
        if (!h || !byHash.has(h[1])) continue;
        const cur = collector.readSources();
        if (cur[f]) continue;
        collector.recordSource(f, byHash.get(h[1]), 'gallery');
        addedSources++;
      }
      const sources = collector.readSources();
      const all = Array.from(mem.drafts.values()).concat(Array.from(mem.products.values()));
      for (const d of all) {
        if (!d.mainSource) {
          const rec = sources[path.basename(String(d.image || ''))];
          if (rec && rec.url) { d.mainSource = rec.url; filledMain++; }
        }
        const g = Array.isArray(d.gallery) ? d.gallery : [];
        if (!Array.isArray(d.gallerySources) || d.gallerySources.length < g.length) {
          const gs = g.map(u => { const rec = sources[path.basename(String(u || ''))]; return rec && rec.url ? rec.url : ''; });
          if (gs.some(Boolean)) { d.gallerySources = gs; filledGallery++; }
        }
      }
      saveStoreNow();
      return send(res, 200, { addedSources, filledMain, filledGallery, urls: urls.length });
    }
    /* 手动触发图片自愈巡检（本地） */
    if (pathname === '/api/_heal_images' && req.method === 'POST') {
      const rip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (rip !== '127.0.0.1' && rip !== '::1') return send(res, 403, { error:'local only' });
      return send(res, 200, await healImages());
    }
    /* 本地修复：白底文件丢失 / 图集还是外链 → 后台补齐（不阻塞请求） */
    if (pathname === '/api/_repair_images' && req.method === 'POST') {
      const rip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (rip !== '127.0.0.1' && rip !== '::1') return send(res, 403, { error:'local only' });
      const r = repairDraftImages();
      return send(res, 200, { ok:true, ...r });
    }

    /* ---- 白底转换：dataURL / 外链 / 本地图 → 白底后本地路径 ---- */
    if (pathname === '/api/whitebg' && req.method === 'POST') {
      let raw = ''; for await (const c of req) raw += c;
      let b; try { b = JSON.parse(raw || '{}'); } catch (e) { return send(res, 400, { error:'invalid json' }); }
      try {
        if (Array.isArray(b.images)) {
          const r = await collector.convertMany(b.images);
          return send(res, 200, { ok:true, results:r });
        }
        const r = await collector.convertToWhite(b.image || '', { force: b.force === true });
        return send(res, r.ok ? 200 : 400, r.ok ? { ok:true, ...r } : { error: r.error });
      } catch (e) { return send(res, 400, { error: e.message }); }
    }

    /* ---- 图片中文翻译：OCR 识别 → 译文回贴，产出新图（原图不动） ---- */
    if (pathname === '/api/img/translate' && req.method === 'POST') {
      let raw = ''; for await (const c of req) raw += c;
      let b; try { b = JSON.parse(raw || '{}'); } catch (e) { return send(res, 400, { error:'invalid json' }); }
      try {
        const r = await imtr.translate(b.image || '');
        if (r.ok && r.image) r2sync.pushAsync(r.image);
        return send(res, r.ok ? 200 : 400, r.ok ? r : { error: r.error });
      } catch (e) { return send(res, 400, { error: e.message }); }
    }

    /* ---- R2 图片镜像：本地扫一遍，把没推过的图推到桶里（经 Worker 中转） ---- */
    if (pathname === '/api/r2/sync' && req.method === 'POST') {
      try {
        let raw = ''; for await (const c of req) raw += c;
        let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
        const r = await r2sync.syncAll(typeof b.limit === 'number' ? b.limit : 0);
        return send(res, 200, { ok: true, ...r });
      } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
    }
    if (pathname === '/api/r2/status' && req.method === 'GET') {
      return send(res, 200, { ok: true, ...r2sync.status() });
    }

    /* ============================================================
       一键发布到云端：db.json → D1 + sync R2 + 同步前端
       admin 后台點「發布到雲端」按鈕就调这个
       ============================================================ */
    if (pathname === '/api/publish' && req.method === 'POST') {
      try {
        const WRRANGLER = path.join(ROOT, 'node_modules', '.bin', 'wrangler.cmd');
        const dbPath = path.join(ROOT, '.data', 'db.json');
        const tmpDir = path.join(ROOT, '_tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        let steps = [], ok = true;
        const step = (name, fn) => {
          try { const r = fn(); steps.push({ name, ok: true, ...r }); return r; }
          catch (e) { steps.push({ name, ok: false, error: e.message }); ok = false; return null; }
        };

        step('生成 seed SQL', () => {
          const prods = JSON.parse(fs.readFileSync(dbPath, 'utf-8')).products || {};
          const seed = Object.entries(prods).map(([sku, p]) => {
            const d = JSON.stringify(p).replace(/'/g, "''");
            const t = String(p.name || '').replace(/'/g, "''");
            const now = new Date().toISOString();
            return `INSERT OR REPLACE INTO products (id, data, title, price, created_at) VALUES ('${sku}', '${d}', '${t}', ${p.price || 0}, '${now}');`;
          }).join('\n');
          const sqlPath = path.join(tmpDir, 'seed-latest.sql');
          fs.writeFileSync(sqlPath, seed, 'utf-8');
          return { count: Object.keys(prods).length, file: 'seed-latest.sql' };
        });

        /* Step 2: 清空 D1 舊商品 */
        step('清空 D1', () => ({
          out: execSync(`"${WRRANGLER}" d1 execute lumiere-db --remote --command "DELETE FROM products;"`,
            { cwd: ROOT, encoding: 'utf-8', timeout: 30000 }).trim().slice(-100)
        }));

        /* Step 3: Seed D1 新商品 */
        step('Seed D1', () => ({
          out: execSync(`"${WRRANGLER}" d1 execute lumiere-db --remote --file "${path.join(tmpDir, 'seed-latest.sql')}"`,
            { cwd: ROOT, encoding: 'utf-8', timeout: 60000 }).trim().slice(-100)
        }));

        /* Step 4: 同步前端到 deploy/www */
        step('同步前端', () => {
          const wwwDir = path.join(ROOT, 'deploy', 'www');
          for (const f of fs.readdirSync(ROOT)) {
            if (f.endsWith('.html')) fs.copyFileSync(path.join(ROOT, f), path.join(wwwDir, f));
          }
          const assetsSrc = path.join(ROOT, 'assets');
          const assetsDst = path.join(wwwDir, 'assets');
          const cpDir = (s, d) => {
            if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
            for (const e of fs.readdirSync(s)) {
              const sp = path.join(s, e), dp = path.join(d, e);
              fs.statSync(sp).isDirectory()
                ? (fs.existsSync(dp) ? fs.rmSync(dp, { recursive: true }) : null, cpDir(sp, dp))
                : fs.copyFileSync(sp, dp);
            }
          };
          for (const e of fs.readdirSync(assetsSrc)) {
            const sp = path.join(assetsSrc, e), dp = path.join(assetsDst, e);
            fs.statSync(sp).isDirectory() ? cpDir(sp, dp) : fs.copyFileSync(sp, dp);
          }
          const blogSrc = path.join(ROOT, 'blog');
          if (fs.existsSync(blogSrc)) cpDir(blogSrc, path.join(wwwDir, 'blog'));
          const cnt = fs.readdirSync(wwwDir, { recursive: true }).filter(f => !fs.statSync(path.join(wwwDir, f)).isDirectory()).length;
          return { files: cnt };
        });

        /* Step 5: wrangler deploy */
        step('部署 Worker', () => ({
          out: execSync(`"${WRRANGLER}" deploy`,
            { cwd: ROOT, encoding: 'utf-8', timeout: 180000 }).trim().slice(-200)
        }));

        return send(res, 200, { ok, steps, url: 'https://lumiere-store.lumiere-store.workers.dev' });
      } catch (e) {
        return send(res, 500, { ok: false, error: e.message, stack: e.stack?.slice(0, 500) });
      }
    }

    /* ============================================================
       草稿箱：采集品先进这里编辑，确认后才发布到正式商品库
       ============================================================ */

    /* 清理来源链接里的追踪参数，落库链接要干净可直达 */
const TRACK_Q = /^(traceId|spm.*|from|utm_.*|ali_trackid|scm.*|pvid|clickid|sdkPref|bd_vid|bft_.*|refer_site|homeTp|sref|cookie2|bid|d_kw|traceid|td_page_id)$/i;
function cleanSourceUrl(u) {
  if (!u || typeof u !== 'string') return '';
  try {
    const x = new URL(u);
    /* 商品详情页：只留路径（offer id 已在路径里） */
    if (/\/(offer|item|product|dp)\/\d+/i.test(x.pathname)) return x.origin + x.pathname;
    const keep = [];
    x.searchParams.forEach((v, k) => {
      if (TRACK_Q.test(k)) return;
      /* offerId 只有在店铺域名下才是追踪参数 */
      if (/^offerid$/i.test(k) && /(^|\.)shop\d|shop\./i.test(x.hostname)) return;
      keep.push(k + '=' + v);
    });
    const base = x.origin + x.pathname;
    return base + (keep.length ? '?' + keep.join('&') : '');
  } catch (e) { return u; }
}

/* SKU 组合矩阵归一化：组合名 + 价格 + 库存 + 缩略图
   采集端从 1688 的「规格」区逐行读出就是这份数据，这里只做清洗与去重。 */
function normalizeSkus(list) {
  if (!Array.isArray(list)) return [];
  const out = [], seen = {};
  for (const s of list) {
    if (!s || typeof s !== 'object') continue;
    const name = String(s.name || '').trim().slice(0, 60);
    if (!name || seen[name]) continue;
    seen[name] = 1;
    const price = Number(s.price);
    const stock = Number(s.stock);
    out.push({
      name,
      price: price > 0 ? price : 0,
      stock: stock > 0 ? Math.floor(stock) : 0,
      image: typeof s.image === 'string' && s.image ? s.image : ''
    });
    if (out.length >= 60) break;
  }
  return out;
}

/* ---------- 采集去重 ----------
同一个 1688 链接或同一个商品名（去掉空格/括号/标点后比较）已经在商品库或草稿箱里，
就不再重复入库，避免反复采集把草稿箱灌满一样的货。 */
function dupNameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[（）()【】\[\]{}<>《》「」"'“”·、,，.。!！?？:：;；\-—_/\\|+*&~]/g, '')
    .trim();
}
function dupKeysOf(o) {
  const url = cleanSourceUrl(o && (o.sourceUrl || o.url) || '').replace(/\/+$/, '');
  return { url, name: dupNameKey(o && o.name) };
}
/* 商品库 + 草稿箱里已有的键；targetSite 为空时按全站比较 */
function buildDupIndex(targetSite) {
  const urls = new Set(), names = new Set();
  const sameSite = o => !targetSite || (o && (o.site || '') ) === targetSite;
  const add = o => {
    const k = dupKeysOf(o);
    if (k.url) urls.add(k.url);
    if (k.name) names.add(k.name);
  };
  try { mem.products.forEach(x => { if (sameSite(x)) add(x); }); } catch (e) {}
  try { mem.drafts.forEach(x => { if (sameSite(x)) add(x); }); } catch (e) {}
  return { urls, names };
}

/* 采集入口：商品立刻落草稿箱，首图白底后台异步转换 */
    if (pathname === '/api/collect/batch' && req.method === 'POST') {
      let raw = ''; for await (const c of req) raw += c;
      let b; try { b = JSON.parse(raw || '{}'); } catch (e) { return send(res, 400, { error:'invalid json' }); }
      const list = Array.isArray(b.drafts) ? b.drafts : [];
      if (!list.length) return send(res, 400, { error:'没有待采集的商品' });
      const ok = [], bad = [], dup = [], doneKeys = { urls: new Set(), names: new Set() };
      /* 目标站点：显式传入 > 后台设置 > 未绑定（未绑定时按全站去重） */
      const targetSite = (b.site || (mem.settings && mem.settings.collectSite) || '');
      const skipDup = b.allowDuplicate !== true;
      const idx = skipDup ? buildDupIndex(targetSite) : { urls: new Set(), names: new Set() };
      /* ---- 第 1 步：直接落库，首图保留原 URL ---- */
      for (const d of list) {
        if (!d || !d.name) { bad.push({ name:'(未命名)', error:'缺少商品名称' }); continue; }
        /* ★ 重复过滤：同一来源链接或同名商品已在商品库/草稿箱（含本批前面几条）就跳过 */
        if (skipDup) {
          const k = dupKeysOf(d);
          if (k.url && (idx.urls.has(k.url) || doneKeys.urls.has(k.url))) {
            dup.push({ name: d.name, reason: '已存在同一来源链接的商品', sourceUrl: cleanSourceUrl(d.url || d.sourceUrl || '') });
            continue;
          }
          if (k.name && (idx.names.has(k.name) || doneKeys.names.has(k.name)) ) {
            dup.push({ name: d.name, reason: '已存在同名商品' });
            continue;
          }
          if (k.url) doneKeys.urls.add(k.url);
          if (k.name) doneKeys.names.add(k.name);
        }
        let images = Array.isArray(d.images) ? d.images.filter(u => typeof u === 'string' && u) : [];
        /* 1688 的「跨境」通用占位图不能当商品主图 */
        const realImages = images.filter(u => !optimize.isPlaceholderImage(u));
        if (realImages.length) images = realImages;
        /* ★ 主图最多 5 张（第 1 张是主图，其余进图集）：详情长图不采集 */
        images = images.slice(0, 5);
        const main = images[0] || '';
        if (!main) { bad.push({ name:d.name, error:'缺少主图' }); continue; }

        /* ---- 内容自动优化：标题品牌化 / 描述重写 / 属性映射 ---- */
        const attrs = d.attrs || d.attributes || [];
        const titleInfo = optimize.optimizeTitle(d.name, attrs);
        const copy = optimize.optimizeDesc(d.name, attrs, titleInfo, d.desc);
        const specOut = optimize.normalizeSpecs(attrs);
        let specs = specOut.specs.length ? specOut.specs : (Array.isArray(d.specs) ? d.specs : []);
        const core = specOut.core;

        /* ★ SKU 组合矩阵：组合名 + 价格 + 库存 + 缩略图（真实可售单元）。
           采集端从 1688「规格」区逐行读出，有矩阵就以它为准。 */
        const skus = normalizeSkus(d.skus);
        const hasMatrix = skus.length >= 2;

        /* ★ 结构化 SKU 选项（颜色/款式 + 选项图）→ spec_* + skuImages。
           注意：有组合矩阵时不走这条路 —— 1688 常把整条组合枚举塞在「规格」里，
           再拆成「颜色」只会得到 4 个"颜色"，每个都是一整句 SKU 名。 */
        let skuImages = (d.skuImages && typeof d.skuImages === 'object') ? d.skuImages : {};
        const skuOpts = Array.isArray(d.skuOptions) ? d.skuOptions : [];
        const setSpecVal = (key, val) => {
          const hit = specs.find(s => s.k === key);
          if (hit) hit.v = val; else specs.push({ k: key, v: val });
        };
        if (!hasMatrix) {
          for (const g of skuOpts) {
            if (!g || !Array.isArray(g.items) || g.items.length < 2) continue;
            const names = g.items.map(x => x.name).filter(Boolean);
            if (names.length < 2) continue;
            const gl = String(g.group || '');
            let key, imgKey;
            if (/颜色|色系|color/i.test(gl)) { key = 'spec_color'; imgKey = 'spec_color'; }
            else if (/尺寸|尺码|size/i.test(gl)) { key = 'spec_size'; imgKey = 'spec_size'; }
            else { key = 'spec_version'; imgKey = 'spec_version'; }
            setSpecVal(key, names.join(' / '));
            /* 选项图按 组→值 存，后台 renderSkuImages 用 CUR.skuImages[组][值] 读 */
            const imgs = {};
            for (const it of g.items) {
              if (it.name && it.image) imgs[it.name] = it.image;
            }
            if (Object.keys(imgs).length) skuImages[imgKey] = Object.assign({}, skuImages[imgKey] || {}, imgs);
          }
          /* 单一规格维度时，选项名本身已是完整规格名（如「小蝌蚪跳蛋（紫色）袋装」），
             属性表里再拆出来的 spec_version/spec_size 是重复信息，删掉避免 SKU 区出现两组。 */
          if (skuOpts.filter(g => g && Array.isArray(g.items) && g.items.length >= 2).length === 1) {
            const keepKey = /颜色|色系|color/i.test(String(skuOpts[0].group || '')) ? 'spec_color'
              : (/尺寸|尺码|size/i.test(String(skuOpts[0].group || '')) ? 'spec_size' : 'spec_version');
            specs = specs.filter(s => !['spec_color', 'spec_version', 'spec_size'].includes(s.k) || s.k === keepKey);
          }
        } else {
          /* 组合矩阵优先：清掉从枚举文本里猜出来的颜色/款式，图交给矩阵 */
          skuImages = {};
          specs = specs.filter(s => !['spec_color', 'spec_version', 'spec_size'].includes(s.k));
        }

        const matrixPrices = hasMatrix ? skus.map(s => s.price).filter(p => p > 0) : [];
        const matrixMin = matrixPrices.length ? Math.min.apply(null, matrixPrices) : 0;
        const matrixStock = hasMatrix ? skus.reduce((a, s) => a + (s.stock || 0), 0) : 0;
        /* 展示价 = 最低组合价；库存 = 各组合合计（1688 的库存是按组合给的） */
        const priceVal = (hasMatrix && matrixMin > 0) ? matrixMin : (Number(d.price) || 0);
        const stockVal = hasMatrix ? (matrixStock || Number(d.stock) || 0) : (Number(d.stock) || 0);
        const payload = {
          name: titleInfo.name, nameEn: titleInfo.nameEn, category: titleInfo.category,
          desc: copy.desc, descEn: copy.descEn,
          price: priceVal,
          /* 价格为 0 不等于免费：明确标记"没抓到"，让后台提醒人工填写 */
          priceMissing: !(priceVal > 0),
          priceMissingAt: !(priceVal > 0) ? new Date().toISOString() : '',
          stock: stockVal,
          /* 首图先存原地址，转好后由后台队列替换成白底本地路径 */
          image: main,
          /* ★ 原始链接永久留档：本地图丢了可以直接从 db 自己恢复，
             不依赖 sources.json 账本（账本文件也可能被清掉） */
          mainSource: main,
          gallerySources: images.slice(1),
          gallery: images.slice(1),
          specs, skuImages,
          /* ★ SKU 组合矩阵（组合名 / 价格 / 库存 / 缩略图）：前后台都按它展示售卖单元 */
          skus,
          features: (d.features && d.features.length) ? d.features : titleInfo._feats.map(f => f.w),
          badge: d.badge || '',
          material: core.material || d.material || '—', size: core.size || d.size || '—',
          noise: core.noise || d.noise || '', waterproof: core.waterproof || d.waterproof || '',
          battery: core.battery || d.battery || '',
          /* 原文留档，方便人工核对优化是否失真 */
          originalName: d.name, originalDesc: d.desc || '',
          sourceUrl: cleanSourceUrl(d.url || d.sourceUrl || ''),
          collectedAt: new Date().toISOString(),
          whiteStatus: 'pending'
        };
        const stamp = Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
        const id = 'DRAFT-' + stamp;
        /* 站点归属：显式传入 > 后台设置的「采集目标站点」> 按访问域名解析 */
        /* 采集入库：payload 显式指定 > 设置里的采集默认站 > 不绑定（留空，等后台在草稿箱里选站点）
       以前这里回退到 resolveSite（默认站），导致草稿一进来就被打上默认站，用户没法"先选站点再发布" */
    const siteOfPayload = (payload && payload.site) || (mem.settings && mem.settings.collectSite) || '';
        const draft = Object.assign({ id, status:'pending', sku:'', site: siteOfPayload, createdAt:new Date().toISOString() }, payload, { site: siteOfPayload });
        mem.drafts.set(id, draft);
        ok.push(draft);
      }
      saveStoreNow();   /* 响应返回前已写盘 */
      if (dup.length) console.log('[collect] 跳过重复 ' + dup.length + ' 条：' + dup.map(x => x.name).slice(0, 5).join('、'));

      /* ---- 第 2 步：首图排入后台白底队列 ----
         必须放在响应之后：入队会触发下载远程图 + 抠图，
         放在请求链路里会拖慢采集（实测多花 2~3 秒）。 */
      setImmediate(() => {
        wbEnqueueBatch(ok.map(d => ({ id: d.id, url: d.image,
          /* 首图若被判定为占位图，后台队列按顺序改试图集里的下一张 */
          candidates: [d.image].concat(Array.isArray(d.gallery) ? d.gallery : []) })));
        /* 图集原样缓存到本站，避免后台整批破图；同样不占采集响应时间 */
        imgEnqueue(ok.reduce((a, d) => {
          (Array.isArray(d.gallery) ? d.gallery : []).forEach((u, i) => {
            if (typeof u === 'string' && /^https?:\/\//i.test(u)) a.push({ id: d.id, i });
          });
          return a;
        }, []));
        /* SKU 选项图：外链一律落本地，否则后台卡片全是破图 */
        skuImgEnqueue(ok.reduce((a, d) => {
          const bag = (d && d.skuImages) || {};
          Object.keys(bag).forEach(k => Object.keys(bag[k] || {}).forEach(v => {
            const u = bag[k][v];
            if (typeof u === 'string' && /^https?:\/\//i.test(u)) a.push({ id: d.id, k, v });
          }));
          return a;
        }, []));
        collector.warmup();   /* 提前预热模型，后台队列第一张不卡 */
      });

      return send(res, 200, { ok:true, total:ok.length + bad.length, succeeded:ok.length, failed:bad.length, skipped:dup.length, duplicates:dup, drafts:ok, errors:bad });
    }

    /* ============================================================
       扩展自更新：浏览器问服务端「最新扩展版本是多少」
       ---------------------------------------------------------
       之前靠扩展自己比对本地 BUILD 常量，但**运行中的代码是旧的**，
       它永远不知道自己已经过期，于是改了磁盘文件浏览器也不更新。
       现在改成：服务端从磁盘读出真实版本号告诉扩展，
       扩展发现不一致就 chrome.runtime.reload()。
       ============================================================ */
    if (pathname === '/api/ext/version' && req.method === 'GET') {
      let build = '';
      try {
        const src = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');
        const m = /const BUILD = '([^']+)'/.exec(src);
        if (m) build = m[1];
      } catch (e) {}
      return send(res, 200, { ok: true, build: build, at: Date.now() });
    }

    /* ============================================================
       采集诊断上报
       ---------------------------------------------------------
       扩展在采集失败时把页面现场信息 POST 上来，
       这样不需要用户开 F12 跑脚本，我直接读服务端日志就能定位。
       ============================================================ */
    if (pathname === '/api/collect/diag' && req.method === 'POST') {
      let raw = ''; for await (const c of req) raw += c;
      let b; try { b = JSON.parse(raw || '{}'); } catch (e) { return send(res, 400, { error:'invalid json' }); }
      const rec = Object.assign({ at: new Date().toISOString() }, b);
      diagLog.unshift(rec);
      while (diagLog.length > 40) diagLog.pop();
      try {
        fs.writeFileSync(path.join(ROOT, '.data', 'collect-diag.json'),
          JSON.stringify(diagLog, null, 2));
      } catch (e) {}
      console.log('[采集诊断] ' + (rec.stage || '') + ' | ' + (rec.url || '').slice(0, 90) +
        ' | ' + (rec.error || ('解析 ' + (rec.parsed || 0) + ' 款')));
      return send(res, 200, { ok: true });
    }

    /* 读取最近诊断记录（我在本地直接读文件，不依赖这个接口） */
    if (pathname === '/api/collect/diag' && req.method === 'GET') {
      return send(res, 200, { ok: true, total: diagLog.length, records: diagLog });
    }

    /* 草稿列表 */
    if (pathname === '/api/drafts' && req.method === 'GET') {
      const rawSite = url.searchParams.get('site');
      /* site 参数显式给了就照用（空串 = 未绑定站点），没给才按域名回退 */
      const sid = rawSite === null ? resolveSite(req, url) : rawSite;
      /* site=all：后台草稿箱「全部站点」视图用，跨站列出并带上归属，方便新站接入后识别 */
      const wantAll = (rawSite === 'all');
      const list = Array.from(mem.drafts.values())
        .filter(d => wantAll || ((d.site || '') === (sid || '')))
        .map(d => Object.assign({}, d, { site: d.site || '' }))
        .sort((a,b) => String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      /* done / failed 要按「当前草稿的状态」统计，不能用进程内累计计数：
         累计计数在草稿删光后仍然显示几十个失败，用户会以为还有一堆坏数据。 */
      return send(res, 200, { ok:true, total:list.length, drafts:list,
        whitebg:{ pending:wbQueue.length,
                  done:list.filter(d => d.whiteStatus === 'done').length,
                  failed:list.filter(d => d.whiteStatus === 'failed').length,
                  running:wbRunning, current:wbState.current } });
    }

    /* 白底转换队列状态（草稿箱轮询用） */
    if (pathname === '/api/whitebg/status' && req.method === 'GET') {
      const drafts = Array.from(mem.drafts.values());
      return send(res, 200, { ok:true,
        pending:drafts.filter(d => d.whiteStatus === 'pending').length,
        done:drafts.filter(d => d.whiteStatus === 'done').length,
        failed:drafts.filter(d => d.whiteStatus === 'failed').length,
        running:wbRunning, queued:wbState.pending, current:wbState.current });
    }

    /* 发布草稿 → 正式商品库（必须先判 publish，再判通用 :id 路由） */
    const pubM = /^\/api\/drafts\/([^/]+)\/publish$/.exec(pathname);
    if (pubM && req.method === 'POST') {
      const id = decodeURIComponent(pubM[1]);
      const d = mem.drafts.get(id);
      if (!d) return send(res, 404, { error:'草稿不存在' });
      /* 首图还没转白底：先转完再发布，保证商城首图是白底 */
      if (d.whiteStatus === 'pending' && d.image && !d.image.startsWith('/assets/img/collected/')) {
        const r = await collector.convertRemoteOne(d.image);
        if (r.ok) {
          d.image = localToSitePath(r.path);
          d.whiteStatus = 'done';
          mem.drafts.set(id, d);
          saveStoreNow();
        } else {
          d.whiteStatus = 'failed'; d.whiteError = r.error;
          mem.drafts.set(id, d); saveStoreNow();
          return send(res, 400, { error:'首图白底转换失败，无法发布：' + (r.error || '未知原因') });
        }
      }
      let raw = ''; for await (const c of req) raw += c;
      let overrides = {}; try { overrides = JSON.parse(raw || '{}'); } catch (e) {}
      /* 发布目标站点：弹窗里选的站点优先，否则用草稿已绑定的站点；
         两者都没有 → 直接拒绝，不允许"不知道发到哪"地发布 */
      const hasPick = overrides.site !== undefined && String(overrides.site || '') !== '';
      if (hasPick) {
        const target = String(overrides.site);
        if (!mem.sites.some(x => x.id === target)) return send(res, 400, { error:'站点不存在：' + target });
        overrides.site = target;
      } else if (!d.site) {
        return send(res, 400, { error:'这条草稿还没绑定站点，请先选择站点再发布' });
      } else if (!mem.sites.some(x => x.id === d.site)) {
        return send(res, 400, { error:'草稿绑定的站点已不存在：' + d.site });
      } else {
        overrides.site = d.site;
      }
      /* 发布时以草稿内容为准，允许前端带最终字段覆盖（如 SKU、价格） */
      const payload = Object.assign({}, d, overrides);
      /* 价格没抓到就别让 0 价流到商城 */
      if (!(Number(payload.price) > 0) && d.priceMissing)
        return send(res, 400, { error:'该商品价格未抓到，请先填写真实售价再发布' });
      delete payload.id; delete payload.status; delete payload.createdAt;
      delete payload.collectedAt; delete payload.sourceUrlDraft;
      delete payload.whiteStatus; delete payload.whiteError; delete payload.whiteAt;
      delete payload.priceMissing; delete payload.priceMissingAt; delete payload.imageError;
      if (payload.sku) { payload.id = payload.sku; delete payload.sku; }
      else delete payload.sku;
      payload.collectedAt = d.collectedAt || new Date().toISOString();
      const result = await core.handleApi({ method:'POST', path:'/api/products', body:payload, request:req, env, mem });
      if (!result.data || result.data.error) return send(res, result.status || 400, result.data);
      mem.drafts.delete(id);
      saveStoreNow();
      return send(res, 201, { ok:true, product:result.data.product });
    }

    /* 草稿单条：编辑 / 丢弃 */
    const draftM = /^\/api\/drafts\/([^/]+)$/.exec(pathname);
    if (draftM) {
      const id = decodeURIComponent(draftM[1]);
      const d = mem.drafts.get(id);
      if (!d) return send(res, 404, { error:'草稿不存在' });
      if (req.method === 'PUT') {
        let raw = ''; for await (const c of req) raw += c;
        let b; try { b = JSON.parse(raw || '{}'); } catch (e) { return send(res, 400, { error:'invalid json' }); }
        /* 图片若被改动：首图白底走后台队列，不阻塞保存 */
        if (b.site !== undefined) {
          const target = String(b.site || '');
          /* 空串 = 解绑，回到「未绑定站点」；非空必须命中已有站点 */
          if (target && !mem.sites.some(x => x.id === target)) return send(res, 400, { error:'站点不存在：' + target });
        }
        const merged = Object.assign({}, d, b, { id });
        merged.site = merged.site || '';
        const oldImage = d.image;
        merged.image = localToSitePath(merged.image);
        if (Array.isArray(merged.gallery)) merged.gallery = merged.gallery.map(localToSitePath);
        /* SKU 组合矩阵：图可能是本地上传路径或 1688 远程图，统一规整一次（价格必须是正数人民币） */
        if (Array.isArray(merged.skus)) merged.skus = normalizeSkus(merged.skus).map(s => Object.assign(s, { image: s.image ? localToSitePath(s.image) : '' }));
        merged.updatedAt = new Date().toISOString();
        /* 首图换了且还是外链：排入后台白底队列（立即返回，不等抠图） */
        if (merged.image !== oldImage && merged.image && !merged.image.startsWith('/assets/img/collected/')) {
          merged.whiteStatus = 'pending';
          delete merged.whiteError;
          setImmediate(() => wbEnqueueBatch([{ id, url: merged.image }]));
        } else if (merged.image && merged.image.startsWith('/assets/img/collected/')) {
          merged.whiteStatus = 'done';
        }
        mem.drafts.set(id, merged);
        saveStoreNow();
        return send(res, 200, { ok:true, draft:merged });
      }
      if (req.method === 'DELETE') {
        const old = mem.drafts.get(id);
        mem.drafts.delete(id);
        /* 连带删掉这个草稿生成的白底图，避免留下孤儿文件 */
        if (old) {
          removeCollectedFile(old.image, id);
          if (Array.isArray(old.gallery)) for (const g of old.gallery) removeCollectedFile(g, id);
        }
        saveStoreNow();
        return send(res, 200, { ok:true, id });
      }
    }

    let body = null;
    if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      try { body = JSON.parse(raw || '{}'); } catch (e) { return send(res, 400, { error:'invalid json' }); }
    }

    const fakeRequest = { url: `http://localhost:${PORT}${req.url}`, headers: req.headers };
    /* 商品写入前统一白底兜底：任何来源（后台上传/采集/外链）的图都保证白底 */
    if (body && (pathname === '/api/products' && req.method === 'POST'
      || (pathname.startsWith('/api/products/') && req.method === 'PUT'))) {
      await enforceWhiteProduct(body);
    }
    /* 商品列表的 site=all 要透传成 "all"，其余接口一律解析成真实站点 */
    const wantAllList = req.method === 'GET' && url.searchParams.get('site') === 'all'
      && (pathname === '/api/products' || pathname === '/api/stock');
    const apiSite = wantAllList ? 'all' : resolveSite(req, url);
    const result = await core.handleApi({ method:req.method, path:pathname, body, request:fakeRequest, env, mem, site: apiSite });
    /* 任何写操作后落盘（saveStore 内部 120ms 去抖） */
    if (req.method !== 'GET') saveStore();
    return send(res, result.status || 200, result.data);
  }

  /* ---- 静态文件 ---- */
  let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(ROOT)) return send(res, 403, { error:'forbidden' });
  fs.readFile(filePath, (err, data) => {
    if (err) {
      /* 只有"看起来是页面"的路径才回退到 index.html；
         带扩展名的静态资源（图片/字体/音频等）缺文件一律 404，
         否则会把 HTML 当成图片吐给浏览器，前端就是一片破图 */
      const ext = path.extname(pathname);
      if (ext && ext !== '.html') return send(res, 404, { error:'not found' });
      return fs.readFile(path.join(ROOT,'index.html'), (e2, d2) => {
        if (e2) return send(res, 404, { error:'not found' });
        send(res, 200, d2, MIME['.html'], true);
      });
    }
    const ct = MIME[path.extname(filePath)] || 'application/octet-stream';
    send(res, 200, data, ct, /html/i.test(ct));
  });
});

server.listen(PORT, () => {
  console.log(`\n  LUMIÈRE 本地服务已启动`);
  console.log(`  网站:     http://localhost:${PORT}`);
  console.log(`  后端健康: http://localhost:${PORT}/api/health`);
  console.log(`  地理定位: http://localhost:${PORT}/api/geo`);
  console.log(`  订单列表: http://localhost:${PORT}/api/orders\n`);
  /* 先自愈巡检（文件丢了自动重建），再恢复未转完的白底队列 */
  setTimeout(() => { healImages().then(() => resumeWhiteQueue()); }, 800);
  /* 历史草稿里仍是外链的图集 / SKU 选项图，启动时排进本地缓存，
     否则后台翻旧草稿会看到整片破图（图床对本站 Referer 返回 403） */
  setTimeout(() => { try { repairDraftImages(); } catch (e) {} }, 1500);
  /* 定时巡检：任何原因导致的文件丢失都能在 10 分钟内自愈 */
  setInterval(() => { healImages(); }, 10 * 60 * 1000).unref();
  /* 预热白底模型，让第一张转换不用等 5 秒加载 */
  collector.warmup();
});
