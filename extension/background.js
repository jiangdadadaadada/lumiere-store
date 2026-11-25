/* ============================================================
   LUMIÈRE 采集器 · Service Worker
   ---------------------------------------------------------
   一键流程：当前标签页 → 抓列表 → 直接送服务端 → 自动转白底
             → 存入 LUMIÈRE 草稿箱
   不新开任何标签页，也不关闭任何标签页。
   ============================================================ */

const API_BASE = 'http://127.0.0.1:8080';
const STORAGE_KEY = 'lum_collect_state';
/* 服务端现在「先落库、白底后台转」，响应是秒回的，
   所以不需要分批了 —— 一次全发，省掉 7 次往返。 */
const BATCH_SIZE = 200;
/* 与 content.js 保持一致的构建号：变了就重载扩展并把页面按钮重新挂上 */
const BUILD = '20261125o';

let state = {
  running: false, phase: '', url: '', total: 0, done: 0, failed: 0,
  imported: 0, importFailed: 0, sample: [], message: '',
  startedAt: 0, finishedAt: 0, tabId: 0,
  /* 采集失败时的页面诊断信息（链接数 / 丢弃原因 / 样本） */
  diag: null,
  /* 本次采集走的是列表页还是详情页 */
  source: '',
  /* 分段耗时（毫秒）：用户反馈慢时能直接看出卡在哪一步 */
  timings: { inject: 0, scrollParse: 0, import: 0, total: 0, wakeup: 0 },
  /* ===== 全店采集专用字段 ===== */
  shopUrls: [],          // 收集到的所有商品 URL
  shopFound: 0,          // 扫描到的商品总数
  shopUnique: 0,         // 去重后待采集数
  shopSkippedExisting: 0 // 跳过已采过的数量
};

/* 打一个时间戳 */
const mark = () => Date.now();

function saveState() { chrome.storage.local.set({ [STORAGE_KEY]: state }); }
function loadState() {
  return new Promise((res) => {
    chrome.storage.local.get([STORAGE_KEY], (r) => {
      if (r && r[STORAGE_KEY] && !state.running) {
        const old = r[STORAGE_KEY];
        Object.assign(state, old);
        /* ★ 关键：service worker 重启 = 上一次任务必然已经中断。
           storage 里残留的 running:true 是"死任务"，不能恢复，
           否则 finally 永远不会执行，按钮永久卡在"已有任务在运行"。
           只恢复展示用的字段，运行状态一律清零。 */
        state.running = false;
        /* timings 要补齐默认键：storage 里可能是旧版本结构，缺键会让分段耗时显示不全 */
        state.timings = Object.assign({ inject: 0, scrollParse: 0, import: 0, total: 0, wakeup: 0 }, old.timings || {});
        /* 写回 storage，避免残留的 running:true 继续误导页面按钮和后续判断 */
        saveState();
      }
      res(state);
    });
  });
}
function publicState() {
  return {
    running: state.running, phase: state.phase, url: state.url,
    total: state.total, done: state.done, failed: state.failed,
    imported: state.imported, importFailed: state.importFailed,
    message: state.message, startedAt: state.startedAt, finishedAt: state.finishedAt,
    sample: state.sample || [],
    diag: state.diag || null,
    source: state.source || '',
    timings: state.timings || {},
    shopUrls: state.shopUrls || [],
    shopFound: state.shopFound || 0,
    shopUnique: state.shopUnique || 0,
    shopSkippedExisting: state.shopSkippedExisting || 0
  };
}
/* 进度通知必须用 chrome.tabs.sendMessage 定向发给页面。
   chrome.runtime.sendMessage 只在扩展页之间广播，**到不了 content script**，
   会导致页面按钮永远停在"正在读取当前页面…"（看起来像卡死几十秒）。 */
function broadcast(msg) {
  if (state.tabId) {
    try { chrome.tabs.sendMessage(state.tabId, msg).catch(() => {}); } catch (e) {}
  }
  /* popup 页仍走 runtime 广播（没有接收方时静默忽略） */
  try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch (e) {}
}
function pushProgress(text) {
  if (text) state.message = text;
  saveState();
  broadcast({ type: 'progress', state: publicState() });
}

/* ★ 所有请求必须带超时 ★
   之前用裸 fetch，服务没启动/已经关掉时请求会一直挂着不返回，
   用户看到的就是「点采集之后卡住、很久没反应」，其实是永远等不到响应。
   现在 8 秒超时，并给出明确原因，不再假装还在采集中。 */
const API_TIMEOUT = 8000;
async function apiFetch(path, opt) {
  const r = await fetch(API_BASE + path, Object.assign({ signal: AbortSignal.timeout(API_TIMEOUT) }, opt || {}));
  if (!r.ok) throw new Error('服务返回 HTTP ' + r.status);
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { throw new Error('服务返回格式错误：' + t.slice(0, 80)); }
}
async function apiPost(path, body) {
  try {
    return await apiFetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  } catch (e) { throw new Error('连接后台服务失败（' + e.message + '）。请确认 LUMIÈRE 服务已启动：http://' + API_BASE.slice(7)); }
}
async function apiGet(path) {
  try { return await apiFetch(path); }
  catch (e) { throw new Error('连接后台服务失败（' + e.message + '）'); }
}

/* ensureInjected 见下方 runCollect 前的定义（带页面 URL 去重）。
   ★ world:'MAIN' —— 解析器必须跑在页面主世界：隔离世界的 window 是沙箱，
   读不到 window.detailData / window.offerData 等内嵌数据，
   而 1688 新版详情页的标题/价格/主图大量放在这些变量里。
   inject.js 不调用任何 chrome.* API，跑主世界是安全的。 */

/* 给任意 promise 加硬超时 —— 没有超时的话，页面主线程一卡，
   chrome.scripting.executeScript 会永远不返回，用户看到的就是「一直转圈」。 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error((label || '操作') + '超时（' + Math.round(ms / 1000) + ' 秒），页面可能太重或被验证码拦截')), ms))
  ]);
}

async function callParser(tabId, method, opts, pageUrl) {
  await ensureInjected(tabId, pageUrl);
  const results = await withTimeout(chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (m, o) => {
      if (!window.__LUM_COLLECT__) return { ok: false, error: '解析器未注入' };
      try { return await window.__LUM_COLLECT__[m](o || {}); }
      catch (e) { return { ok: false, error: e.message }; }
    },
    args: [method, opts || {}]
  }), method === 'list' ? 8000 : 6000, '页面解析');
  return results && results[0] ? results[0].result : { ok: false, error: '无返回' };
}

async function importBatches(items) {
  let ok = 0, bad = 0;
  const errors = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const slice = items.slice(i, i + BATCH_SIZE);
    const drafts = slice.map((it) => ({
      name: it.name,
      price: Number(it.price) || 0,
      stock: Number(it.stock) || 0,
      category: it.category || 'women',
      desc: it.desc || '',
      images: it.images || (it.image ? [it.image] : []),
      url: it.url || '',
      offerId: it.offerId || '',
      /* ★ 关键：解析器抓到的真实属性与 SKU 选项必须透传给服务端，
         否则服务端 normalizeSpecs / skuOptions 收到空数组，规格尺寸颜色全空。 */
      attrs: it.attrs || [],
      skuOptions: it.skuOptions || [],
      /* ★ 真实 SKU 组合（组合名 + 价格 + 库存 + 缩略图）：服务端按它建矩阵，
         不再把组合名伪装成「颜色」写进规格 */
      skus: it.skus || []
    })).filter((d) => !!d.name);

    if (!drafts.length) { bad += slice.length; continue; }

    try {
      const r = await apiPost('/api/collect/batch', { drafts });
      if (r && r.ok) {
        ok += r.succeeded || 0;
        bad += r.failed || 0;
        (r.errors || []).forEach((e) => { if (errors.length < 5) errors.push(e.name + '（' + e.error + '）'); });
      } else {
        bad += drafts.length;
        if (errors.length < 5) errors.push('批次 ' + (i / BATCH_SIZE + 1) + '：' + ((r && r.error) || '存草稿失败'));
      }
    } catch (e) {
      bad += drafts.length;
      if (errors.length < 5) errors.push('批次 ' + (i / BATCH_SIZE + 1) + '：' + e.message);
    }
    state.imported = ok;
    state.importFailed = bad;
    pushProgress('已存草稿 ' + ok + ' 款，首图白底后台转换中…');
  }
  return { ok, bad, errors };
}

/* 采集失败时给出可诊断的原因。
   之前只丢一句「没解析出商品」，用户完全不知道是「链接没认出来」还是「标题/图没抓到」。 */
function describeEmptyList(d) {
  d = d || {};
  const links = d.linkCount || 0;
  const total = d.totalLinks || 0;
  const sk = d.skipped || {};
  const det = d.detail;

  /* 详情页场景：页面确实是商品页，但字段没抓到 —— 直接说清缺什么 */
  if (det && (det.imageCount || det.hasPrice)) {
    const miss = [];
    if (!det.hasName) miss.push('没抓到商品名称');
    if (!det.imageCount) miss.push('没抓到商品主图');
    if (!det.hasPrice) miss.push('没抓到价格');
    return '这是商品详情页，但' + (miss.length ? miss.join('、') : '字段没解析出来')
      + '（已抓名称:' + (det.name || '无') + '）';
  }
  if (!links) {
    const base = '这个页面没找到商品链接（页面共 ' + total + ' 个链接，一个都不像商品详情页）';
    return det && det.name ? base + '（页面标题：' + det.name + '）' : base;
  }
  return '找到 ' + links + ' 个商品链接，但都没解析出可用商品'
    + '（标题不合格 ' + (sk.badName || 0) + ' 个、没抓到商品图 ' + (sk.noImage || 0) + ' 个）';
}

/* ============================================================
   采集诊断上报
   ---------------------------------------------------------
   扩展在失败时把「页面现场」POST 到服务端：
   页面标题、各类候选选择器的命中情况、链接样本、图片样本、
   内嵌数据变量是否存在。这样我读服务端日志就能定位到
   具体是哪个字段没抓到，不需要用户开 F12 跑脚本。
   ============================================================ */
async function reportDiag(stage, info, diag) {
  try {
    /* 若调用方已经带了 probe（detail 解析时顺手抓的），直接复用：
       不用再 executeScript 一趟，页面卡住时也能拿到现场。 */
    let probe = (info && info.probe) || null;
    try {
      const tabs = probe ? null : await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0] && tabs[0].id) {
        const r = await withTimeout(chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          world: 'MAIN',
          func: () => {
            const out = { href: location.href, title: document.title, html: document.documentElement.outerHTML.length };
            const pick = (sel) => {
              try {
                const n = document.querySelector(sel);
                return n ? (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '';
              } catch (e) { return ''; }
            };
            /* 标题候选：把常见选择器的命中情况全列出来 */
            out.titleHits = {};
            ['h1', '.title-text', '[class*="title-text"]', '[class*="d-title"]', '[class*="offer-title"]',
             '[class*="product-title"]', '[class*="item-title"]', '[class*="subject"]', '[class*="main-title"]',
             '.mod-detail-title', '[class*="detail-title"]', '[class*="title"]'].forEach(s => {
              const v = pick(s);
              if (v) out.titleHits[s] = v;
            });
            const m = document.querySelector('meta[property="og:title"],meta[name="og:title"]');
            out.ogTitle = m ? (m.content || '') : '';
            /* 价格候选 */
            out.priceHits = {};
            ['.price-text', '[class*="price-text"]', '[class*="priceValue"]', '[class*="price-value"]',
             '[class*="price"]', '[class*="Price"]', '[class*="money"]', '[class*="amount"]'].forEach(s => {
              const v = pick(s);
              if (v) out.priceHits[s] = v;
            });
            /* 图片候选：取最大的几张商品图 */
            const imgs = Array.from(document.querySelectorAll('img')).map(im => ({
              src: (im.getAttribute('data-src') || im.getAttribute('data-lazyload') || im.getAttribute('src') || '').slice(0, 200),
              cls: (im.className || '').toString().slice(0, 80),
              w: im.naturalWidth || parseInt(im.getAttribute('width') || '0', 10) || 0,
              h: im.naturalHeight || parseInt(im.getAttribute('height') || '0', 10) || 0
            })).filter(x => x.src && !/^data:/.test(x.src));
            out.imgHits = imgs.sort((a, b) => (b.w * b.h) - (a.w * a.h)).slice(0, 6);
            /* 内嵌数据变量：主世界里能不能读到 */
            out.embedVars = {};
            ['detailData', 'offerData', '__INIT_DATA__', '__NEXT_DATA__', 'window.__PAGE_DATA__',
             'window.__INITIAL_STATE__', '__NUXT__', '__APOLLO_STATE__'].forEach(n => {
              try {
                const v = eval(n);
                if (v && typeof v === 'object') out.embedVars[n] = Object.keys(v).slice(0, 12);
              } catch (e) {}
            });
            /* 链接样本：看看商品链接长什么样 */
            const as = Array.from(document.querySelectorAll('a[href]'));
            out.linkTotal = as.length;
            out.linkSamples = as.map(a => (a.getAttribute('href') || '').slice(0, 160))
              .filter(h => h && h[0] !== '#').slice(0, 12);
            return out;
          }
        }), 8000, '现场探针');
        probe = (r && r[0] && r[0].result) || null;
      }
    } catch (e) {
      probe = { probeError: e.message };
    }

    const body = {
      stage: stage,
      build: BUILD,
      url: (info && info.url) || (probe && probe.href) || '',
      pageTitle: (info && info.pageTitle) || (probe && probe.title) || '',
      error: (info && info.error) || '',
      linkCount: (info && info.linkCount) || 0,
      totalLinks: (info && info.totalLinks) || 0,
      skipped: (info && info.skipped) || {},
      samples: (info && info.samples) || {},
      timings: (info && info.timings) || state.timings,
      probe: probe
    };
    await withTimeout(apiPost('/api/collect/diag', body), 5000, '诊断上报');
  } catch (e) {
    /* 上报失败不影响主流程 */
  }
}

/* ★ 临时诊断：把页面里 SKU 的原始结构上报（不影响采集结果，也不阻塞采集）。
   用来定位「颜色/款式名字抓到了、每项缩略图却是空」到底卡在哪。
   拿到结构后这段直接删。 */
function reportSkuDump(tabId, pageUrl) {
  (async () => {
    try {
      const dump = await callParser(tabId, 'skuDump', {}, pageUrl);
      if (!dump || dump.ok === false) return;
      await withTimeout(apiPost('/api/collect/diag', {
        stage: 'sku-dump', build: BUILD, url: pageUrl || '', dump
      }), 5000, 'SKU 结构上报');
    } catch (e) { /* 上报失败不影响采集 */ }
  })();
}

/* ★ 轻量开始上报：完全不碰页面主线程，不用 executeScript。
   即使页面被 1688 的重脚本卡死，只要能拿到 tab.url 就能上报。
   目的：用户点采集后服务端立刻能看到「谁、在什么页面、用的哪个版本、走的哪条分支」，
   不再靠猜。fire-and-forget，绝不能因为上报失败拖慢采集。 */
function reportStart(pageUrl, directDetail) {
  try {
    const body = {
      stage: 'start', build: BUILD, url: pageUrl || '',
      directDetail: !!directDetail, at: new Date().toISOString()
    };
    fetch(API_BASE + '/api/collect/diag', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(3000)
    }).catch(() => {});
  } catch (e) {}
}

/* ★ 判断是不是「真正的商品详情页」——别人家插件快，核心就在这里：
   详情页直接读当前商品数据，一遍就够，不需要扫全页链接、不需要滚动加载。
   要排除 1688 学习中心/社区等内容页：它们的路径里也有 /detail/，但不是商品。 */
function isProductDetailUrl(url) {
  try {
    const u = new URL(url);
    const h = u.hostname;
    /* 1688 内容域（学习中心 / 社区 / 论坛）—— 路径带 /detail/ 但绝不是商品 */
    if (/(^|\.)(peixun|club|bbs|space|learning|help|wiki)\.1688\.com$/i.test(h)) return false;
    /* /offer/数字.html（1688、拼多多系店铺页通用） */
    if (/\/offer\/\d{5,}/i.test(u.pathname)) return true;
    /* detail.1688.com 域名基本都是商品页 */
    if (/(^|\.)detail\.1688\.com$/i.test(h)) return true;
    /* 淘宝 / 天猫商品页 */
    if (/(^|\.)item\.(taobao|tmall)\.com$/i.test(h)) return true;
    /* URL 参数里带明确的商品 ID */
    if (/[?&](offerId|offer_id|goods_id|itemId)=\d{5,}/i.test(u.search)) return true;
    return false;
  } catch (e) { return false; }
}

/* 已注入解析器的标签页：key = tabId + '|' + url，页面导航后 key 变化会重新注入。
   避免同一页反复 executeScript 注入整个 inject.js（每次几十 KB，纯属浪费）。 */
/* ★ 不再用内存 Set 盲目去重：
   旧逻辑只要 tabId+url 没变就永不重注，页面里一旦注入了旧版解析器，
   扩展升到新版也进不去 —— 这正是「版本号升了、采集行为还是旧的」的根因。
   改成每次采集先探测页面里 __LUM_COLLECT__.__build，不符就强制重注。 */
const PARSER_BUILD = '20261125f';
async function ensureInjected(tabId, url) {
  try {
    const probe = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (want) => !!(window.__LUM_COLLECT__ && window.__LUM_COLLECT__.__build === want),
      args: [PARSER_BUILD]
    });
    const ok = probe && probe[0] && probe[0].result;
    if (ok) return true;   /* 已是当前版本，零开销 */
  } catch (e) {}
  /* 版本不符 / 没注入过 / 探测失败 → 强制重新注入新版（inject.js 内部会覆盖旧对象） */
  try {
    await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['inject.js'] });
    return true;
  } catch (e) { return false; }
}

async function runCollect(cfg) {
  state.running = true;
  state.phase = 'list';
  state.url = cfg.url || '';
  state.total = 0; state.done = 0; state.failed = 0;
  state.imported = 0; state.importFailed = 0;
  state.sample = []; state.message = '正在读取当前页面…';
  state.diag = null; state.source = '';
  state.startedAt = Date.now();
  /* 每次采集重置分段计时，避免上一轮的数字混进来 */
  state.timings = { inject: 0, scrollParse: 0, import: 0, total: 0, wakeup: 0 };
  /* 用户点击 → 扩展真正开始干活 的间隔（MV3 service worker 冷启动会占几秒） */
  state.timings.wakeup = cfg.clickAt ? state.startedAt - cfg.clickAt : 0;
  saveState();

  try {
    /* ★ 用「点按钮的那个标签页」：优先 start 消息里带来的 tabId，
       不再用 active tab 猜。不新开、不跳转、不关闭。 */
    let tab = null;
    if (cfg.tabId) { try { tab = await chrome.tabs.get(cfg.tabId); } catch (e) {} }
    if (!tab) tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab || !tab.id) throw new Error('找不到当前标签页');
    state.tabId = tab.id;   /* 进度通知要定向发到这个标签页 */

    const tParse = mark();
    /* ★ 页面 URL 也以消息带来的为准（cfg.url），tab.url 仅作兜底。
       active tab 可能不是点按钮的页面，别让它覆盖真实来源。 */
    const pageUrl = cfg.url || tab.url || '';
    /* ★★ 详情页直通 ★★
       这是"别人家采集快"的核心：停在商品详情页时，直接读当前这一个商品，
       一遍 detail() 就完事 —— 不扫几千个链接、不滚动加载、不白等。
       旧实现无论什么页面都先跑 list() 扫全页+滚动约 4 秒，返回空才回头跑 detail()，
       等于把最慢的路走了一遍才走对路，用户看到的就是"一直在读取当前页面"。 */
    const directDetail = isProductDetailUrl(pageUrl);
    reportStart(pageUrl, directDetail);   /* 一点采集就上报，页面卡死也能拿到现场 */
    let items = [];
    let source = directDetail ? 'detail' : 'list';
    let detailRes = null;
    let listRes = null;

    if (directDetail) {
      pushProgress('正在提取当前商品…');
      detailRes = await callParser(tab.id, 'detail', {}, pageUrl);
      /* ★ 反爬拦截页 / 非商品页：解析器返回 ok:false + 明确原因。
         直接中断，不再做价格重试、不再走「没解析出商品」那套泛化提示。 */
      if (detailRes && detailRes.ok === false && detailRes.error) {
        reportDiag('blocked', { url: pageUrl, error: detailRes.error }, state.diag);
        throw new Error(detailRes.error);
      }
      /* ★ 临时：详情页解析完顺手上报一次 SKU 原始结构（异步，不拖慢采集） */
      reportSkuDump(tab.id, pageUrl);
      const d = detailRes && detailRes.ok && detailRes.items && detailRes.items[0];
      /* 1688 新版价格常由异步接口回填，首帧抓到时可能还是 0。
         只在缺价格时等 350ms 再读一次，正常页零额外开销。
         属性等待已在解析器 detail() 内部用 MutationObserver 完成。 */
      if (d && !(Number(d.price) > 0)) {
        await new Promise(r => setTimeout(r, 350));
        const again = await callParser(tab.id, 'detail', {}, pageUrl);
        const d2 = again && again.ok && again.items && again.items[0];
        if (d2 && Number(d2.price) > 0) d.price = d2.price;
      }
      if (d && d.name && (d.images && d.images.length)) {
        items = [{ offerId: d.offerId || '', url: d.url || '', name: d.name, price: d.price || '',
          image: d.images[0], images: d.images, desc: d.desc || '', attrs: d.attrs || [],
          sku: d.sku || '', skuOptions: d.skuOptions || [], skus: d.skus || [] }];
        /* ★ 价格或规格缺失 → 立即上报页面真实结构，下次对着改，不再盲猜 */
        if (!d.price || !(d.attrs && d.attrs.length)) {
          reportDiag('detail-fields', { url: pageUrl, pageTitle: d.name, probe: (detailRes && detailRes.probe) || null });
        }
      }
    } else {
      listRes = await callParser(tab.id, 'list', {
        limit: cfg.limit || 60,
        scroll: true, scrollTimes: 12, scrollDelay: 350
      }, pageUrl);
      if (!listRes || !listRes.ok) throw new Error((listRes && listRes.error) || '这个页面没解析出商品列表');
      items = listRes.items || [];
      /* 列表页解析为空 → 兜底按详情页再试一次（覆盖 URL 不规范的详情页） */
      if (!items.length) {
        detailRes = await callParser(tab.id, 'detail', {}, pageUrl);
        const d = detailRes && detailRes.ok && detailRes.items && detailRes.items[0];
        if (d && d.name && (d.images && d.images.length)) {
          items = [{ offerId: d.offerId || '', url: d.url || '', name: d.name, price: d.price || '',
            image: d.images[0], images: d.images, desc: d.desc || '', attrs: d.attrs || [],
            sku: d.sku || '', skuOptions: d.skuOptions || [], skus: d.skus || [] }];
          source = 'detail';
        }
      }
    }
    state.timings.scrollParse = Date.now() - tParse;
    if (!items.length) {
      /* 真的没解析出来：把诊断信息带出去，别只丢一句「没解析出商品」 */
      state.diag = {
        linkCount: (listRes && listRes.linkCount) || 0,
        totalLinks: (listRes && listRes.totalLinks) || 0,
        skipped: (listRes && listRes.skipped) || {},
        samples: (listRes && listRes.samples) || {},
        pageTitle: (listRes && listRes.pageTitle) || '',
        isDetailPage: !!(listRes && listRes.isDetailPage) || directDetail,
        url: (listRes && listRes.url) || pageUrl
      };
      /* 详情页兜底也失败了 → 把详情页解析结果一并带出来，
         这样能看出「标题没抓到」还是「图没抓到」 */
      if (detailRes && detailRes.ok && detailRes.items && detailRes.items[0]) {
        const d = detailRes.items[0];
        state.diag.detail = {
          hasName: !!d.name, name: String(d.name || '').slice(0, 120),
          hasPrice: !!d.price, price: d.price || '',
          imageCount: (d.images || []).length
        };
      }
      /* 上报现场到服务端：用户不用开 F12 跑脚本，我直接读日志定位 */
      reportDiag('empty-list', state.diag, state.diag);
      throw new Error(describeEmptyList(state.diag));
    }
    state.diag = null;
    state.source = source;

    state.total = items.length;
    const merged = items.map((it) => ({
      name: it.name || '',
      price: it.price || '',
      desc: it.desc || '',
      attrs: it.attrs || [],
      sku: it.sku || '',
      images: it.images || (it.image ? [it.image] : []),
      url: it.url || '',
      offerId: it.offerId || '',
      /* ★ SKU 规格选项（颜色/款式+选项图）随商品一起透传，不能在中间层丢掉 */
      skuOptions: it.skuOptions || [],
      skus: it.skus || []
    })).filter((x) => !!x.name);
    state.done = merged.length;
    pushProgress('找到 ' + merged.length + ' 款，正在存入草稿箱…');

    state.phase = 'import';
    state.sample = merged.slice(0, 3).map((it) => ({
      name: it.name, price: it.price, images: (it.images || []).length
    }));
    const imp = await importBatches(merged);
    state.timings.import = Date.now() - tParse - state.timings.scrollParse;
    state.timings.total = Date.now() - state.startedAt;

    state.phase = 'done';
    state.imported = imp.ok;
    state.importFailed = imp.bad;
    state.finishedAt = Date.now();
    /* 首图白底转换在服务端后台队列里跑，不占用采集时间 */
    state.message = '已存入草稿箱：' + imp.ok + ' 款' +
      (imp.bad ? ('，失败 ' + imp.bad + ' 款') : '') +
      '，首图白底后台转换中…' +
      (imp.errors && imp.errors.length ? ('（' + imp.errors[0] + '）') : '');
    saveState();
    broadcast({ type: 'done', state: publicState() });
  } catch (e) {
    state.phase = 'error';
    state.message = '失败：' + (e && e.message ? e.message : e);
    state.finishedAt = Date.now();
    /* 失败也要上报：带上页面现场，下一次就能直接定位到具体字段 */
    reportDiag('error', {
      url: cfg.url || '',
      error: (e && e.message) || String(e),
      timings: state.timings
    }, state.diag);
    saveState();
    broadcast({ type: 'error', state: publicState() });
  } finally {
    state.running = false;
    saveState();
  }
}

/* ============================================================
   全店采集：扫描階段
   ---------------------------------------------------------
   在当前标签页（应该是店铺页）翻页收集所有商品 URL。
   流程：
   ① 解析当前页商品鏈接 → 存入 Set 去重
   ② 点下一页或构造下一页 URL → 跳轉 → 重复 ①
   ③ 最多翻 cfg.pages 页
   ④ 去重后問服务端哪些商品已存在 → 标记跳过
   ⑤ phase = 'shop-scan-done'，popup 显示「发現 N 款」+「开始采集」按钮
   ============================================================ */
async function runShopScan(cfg) {
  state.running = true;
  state.phase = 'shop-scan';
  state.url = cfg.url || '';
  state.shopUrls = []; state.shopFound = 0; state.shopUnique = 0; state.shopSkippedExisting = 0;
  state.message = '正在加载 ERP 采集引擎…';
  state.startedAt = Date.now();
  state.timings = { inject: 0, scrollParse: 0, import: 0, total: 0, wakeup: 0 };
  state.tabId = cfg.tabId;
  saveState();

  const allOffers = new Map();  // offerId -> {offerId, url, title, image, price}
  const tabId = cfg.tabId;
  const maxPages = cfg.pages || 10;

  try {
    /* 等待 ERP inject-1688.js 注入完成 */
    pushProgress('等待采集引擎就绪…');
    let ready = false;
    for (let i = 0; i < 20 && !ready; i++) {
      try {
        const r = await withTimeout(chrome.scripting.executeScript({
          target: { tabId }, world: 'MAIN',
          func: () => !!(window.__c1688 && typeof window.__c1688.list === 'function')
        }), 2000, '检查引擎');
        ready = !!(r && r[0] && r[0].result);
      } catch (e) {}
      if (!ready) await new Promise(r => setTimeout(r, 300));
    }
    if (!ready) throw new Error('ERP 采集引擎未就绪，请重载扩展后刷新页面');
    pushProgress('引擎就绪');

    for (let page = 1; page <= maxPages; page++) {
      pushProgress('扫描第 ' + page + '/' + maxPages + ' 页…');

      /* ★ 核心：调 ERP 的 listAcrossScroll，滚动 + 收集当前页所有商品 */
      const res = await withTimeout(chrome.scripting.executeScript({
        target: { tabId }, world: 'MAIN',
        func: async (steps) => {
          try {
            const rows = typeof window.__c1688.listAcrossScroll === 'function'
              ? await window.__c1688.listAcrossScroll(steps)
              : window.__c1688.list();
            return { ok: true, rows: rows || [] };
          } catch (e) {
            return { ok: false, error: e.message };
          }
        },
        args: [12]
      }), 30000, 'ERP 扫描');

      const r = res && res[0] ? res[0].result : { ok: false, error: '无返回' };
      if (!r || !r.ok) {
        if (page === 1) throw new Error('ERP 扫描失败: ' + ((r && r.error) || '未知错误'));
        break;
      }

      const rows = r.rows || [];
      rows.forEach(row => {
        if (row.offerId && !allOffers.has(row.offerId)) {
          /* ★ 强制转换成真实详情页 URL（ERP list() 返回的可能是 SPA 模板页链接）*/
          let url = row.url || '';
          if (!url.includes('detail.1688.com/offer/') || !/\/offer\/\d+\.html/i.test(url)) {
            url = 'https://detail.1688.com/offer/' + row.offerId + '.html';
          }
          allOffers.set(row.offerId, { offerId: row.offerId, url, title: row.title || '', image: row.image || '', price: row.price || '' });
        }
      });

      pushProgress('第 ' + page + ' 页 ' + rows.length + ' 款，累计 ' + allOffers.size + ' 款');

      /* 如果没有翻页按钮就停（1688 店铺页通常只有一页 offerlist）*/
      let hasNext = false;
      try {
        const nr = await withTimeout(chrome.scripting.executeScript({
          target: { tabId }, world: 'MAIN',
          func: () => {
            /* 1688 offerlist 翻页检测 */
            const sel = [
              '[class*="pagination"] a[class*="next"]',
              '[class*="Pagination"] a[class*="next"]',
              '[class*="next"]',
              'a.offer-pagination-next',
              '.offer-pagination .next',
              '.page-next', '.pager-next',
              'a[aria-label="下一页"]',
              'button[aria-label="下一页"]'
            ];
            for (const s of sel) {
              const el = document.querySelector(s);
              if (el) {
                const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true'
                  || el.classList.contains('disabled')
                  || el.classList.contains('page-disabled');
                if (!disabled) return true;
              }
            }
            /* 文本兜底：页面底部有没有「下一页/Next」可点 */
            const textEls = document.querySelectorAll('a,button,span,div');
            for (const el of textEls) {
              const t = (el.textContent || '').trim();
              if (/^(下一页|下页|Next|▶|›|»)$/.test(t) && el.offsetParent !== null) {
                const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
                if (!disabled) return true;
              }
            }
            return false;
          }
        }), 3000, '检测下一页');
        hasNext = !!(nr && nr[0] && nr[0].result);
      } catch (e) { break; }

      if (!hasNext) break;

      /* 点下一页 */
      try {
        const clicked = await withTimeout(chrome.scripting.executeScript({
          target: { tabId }, world: 'MAIN',
          func: () => {
            const sel = [
              '[class*="pagination"] a[class*="next"]',
              '[class*="next"]',
              'a.offer-pagination-next',
              '.offer-pagination .next',
              'a[aria-label="下一页"]',
              'button[aria-label="下一页"]'
            ];
            for (const s of sel) {
              const el = document.querySelector(s);
              if (el && !el.disabled && el.getAttribute('aria-disabled') !== 'true') {
                el.click(); return true;
              }
            }
            const textEls = document.querySelectorAll('a,button,span,div');
            for (const el of textEls) {
              const t = (el.textContent || '').trim();
              if (/^(下一页|下页|Next|▶|›|»)$/.test(t) && el.offsetParent !== null) {
                el.click(); return true;
              }
            }
            return false;
          }
        }), 5000, '点击下一页');
        const didClick = !!(clicked && clicked[0] && clicked[0].result);
        if (!didClick) break;
        await new Promise(r => setTimeout(r, 2500));
      } catch (e) { break; }
    }

    /* 收集完成 */
    state.shopUrls = Array.from(allOffers.values());
    state.shopFound = state.shopUrls.length;

    if (!state.shopUrls.length) {
      throw new Error('这个页面没扫描到任何商品，请确保在店铺商品列表页（offerlist.htm）');
    }

    /* 问服务端哪些商品已存在 */
    pushProgress('检查哪些商品已在库中…');
    let existingUrls = [];
    try {
      const r = await withTimeout(apiPost('/api/collect/check-existing',
        { urls: state.shopUrls.map(x => x.url) }), 10000, '重复检查');
      if (r && r.ok && r.existingUrls) existingUrls = r.existingUrls;
    } catch (e) {}
    const existingSet = new Set(existingUrls);
    const uniqueOffers = state.shopUrls.filter(x => !existingSet.has(x.url));
    state.shopSkippedExisting = state.shopUrls.length - uniqueOffers.length;
    state.shopUrls = uniqueOffers;
    state.shopUnique = uniqueOffers.length;

    state.phase = 'shop-scan-done';
    state.message = '扫描完成：发现 ' + state.shopFound + ' 款，待采 ' + state.shopUnique + ' 款';
    state.timings.total = Date.now() - state.startedAt;
    saveState();
    broadcast({ type: 'progress', state: publicState() });

    if (cfg.autoCollect && state.shopUnique > 0) {
      pushProgress('扫描完成，立即开始采集 ' + state.shopUnique + ' 款…');
      await new Promise(r => setTimeout(r, 400));
      state.running = false; saveState();
      return runShopCollect({
        concurrency: cfg.concurrency || 4,
        skipExisting: cfg.skipExisting !== false
      });
    }
  } catch (e) {
    state.phase = 'error';
    state.message = '扫描失败：' + (e && e.message ? e.message : e);
    saveState();
    broadcast({ type: 'error', state: publicState() });
  } finally {
    state.running = false;
    saveState();
  }
}

/* ============================================================
   全店采集：采集階段
   ---------------------------------------------------------
   並行打开商品详情页 → 注入解析器 → detail() → 入草稿箱。
   每个商品独立标签页，采完即关闭，避免積壓。
   ============================================================ */
async function runShopCollect(cfg) {
  const urls = state.shopUrls || [];
  /* ★ 默认并发 1（串行，一条一条采），避免 1688 反爬 */
  const concurrency = 1;

  state.running = true;
  state.phase = 'shop-collect';
  state.total = urls.length;
  state.done = 0; state.failed = 0;
  state.imported = 0; state.importFailed = 0;
  state.message = '开始采集 ' + urls.length + ' 款（並发 ' + concurrency + '）…';
  state.startedAt = Date.now();
  state.timings = { inject: 0, scrollParse: 0, import: 0, total: 0, wakeup: 0 };
  saveState();

  let okCount = 0, failCount = 0;
  let idx = 0;

  /* 並行 worker */
  async function worker() {
    while (idx < urls.length) {
      const myIdx = idx++;
      const urlEntry = urls[myIdx];
      const url = typeof urlEntry === 'string' ? urlEntry : (urlEntry.url || '');
      let tab = null;
      try {
        /* ★ active:true 前台打开，避免 1688 后台标签页被反爬拦截 */
        tab = await chrome.tabs.create({ url, active: true });
        const tabId = tab.id;

        /* 等页面加載（加长到 20 秒） */
        await new Promise(res => {
          chrome.tabs.onUpdated.addListener(function listener(id, info) {
            if (id === tabId && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              res();
            }
          });
          setTimeout(res, 20000);
        });
        await new Promise(r => setTimeout(r, 1500));

        /* ★ 验证新标签页是否真的是详情页（防止 404 或 SPA 模板页）*/
        let tabUrl = url;
        try { const tab = await chrome.tabs.get(tabId); tabUrl = tab.url || url; } catch(e) {}
        const isRealDetail = /detail\.1688\.com\/offer\/\d+\.html/i.test(tabUrl);
        if (!isRealDetail) {
          failCount++; state.failed = failCount;
          state.lastError = '被 404/反爬拦截（实际跳转到: ' + tabUrl.substring(0,60) + '）';
          try { if (tab && tab.id) await chrome.tabs.remove(tab.id); } catch(e) {}
          state.done = myIdx + 1;
          state.message = '第 ' + (myIdx + 1) + ' 款跳过：404 反爬（采集中 ' + state.done + '/' + state.total + '）';
          saveState(); broadcast({ type: 'progress', state: publicState() });
          continue;
        }

        /* 等 ERP 引擎就绪 */
        let ready = false;
        for (let i = 0; i < 15 && !ready; i++) {
          try {
            const r = await withTimeout(chrome.scripting.executeScript({
              target: { tabId }, world: 'MAIN',
              func: () => !!(window.__c1688 && typeof window.__c1688.detail === 'function')
            }), 2000, '检查引擎');
            ready = !!(r && r[0] && r[0].result);
          } catch (e) {}
          if (!ready) await new Promise(r => setTimeout(r, 300));
        }
        if (!ready) { failCount++; state.failed = failCount; continue; }

        /* ★ 核心：调 ERP 的 detail() 拿完整数据（含 SKU）*/
        const res = await withTimeout(chrome.scripting.executeScript({
          target: { tabId }, world: 'MAIN',
          func: async () => {
            try {
              window.scrollTo(0, Math.max(300, document.body.scrollHeight * 0.4));
              await new Promise(r => setTimeout(r, 1200));
              const d = window.__c1688.detail();
              return { ok: true, data: d };
            } catch (e) {
              return { ok: false, error: e.message };
            }
          }
        }), 30000, 'ERP 详情解析');

        const r = res && res[0] ? res[0].result : { ok: false, error: '无返回' };

        if (!r || !r.ok || !r.data) {
          failCount++; state.failed = failCount;
          state.lastError = '解析失败: ' + ((r && r.error) || 'detail 无返回');
        } else if (!r.data.title) {
          failCount++; state.failed = failCount;
          state.lastError = '商品标题为空，可能被反爬拦截';
        } else if (!r.data.images || !r.data.images.length) {
          failCount++; state.failed = failCount;
          state.lastError = '图片为空，页面没渲染完';
        } else {
          const d = r.data;
          const draft = {
            name: d.title || '',
            price: Number(d.price) || Number(d.priceMax) || 0,
            stock: 0,
            category: (urlEntry && urlEntry.category) || 'women',
            desc: d.description || '',
            images: Array.isArray(d.images) ? d.images : [],
            url: d.url || url,
            offerId: d.offerId || '',
            attrs: d.attrs && typeof d.attrs === 'object' ? Object.entries(d.attrs).map(([k,v]) => ({name: k, value: Array.isArray(v) ? v.join('/') : String(v)})) : [],
            skuOptions: [],
            skus: Array.isArray(d.skus) ? d.skus : []
          };
          /* 从 attrs 里抽 skuOptions（颜色/款式等选项组）*/
          if (d.attrs && typeof d.attrs === 'object') {
            for (const [k, v] of Object.entries(d.attrs)) {
              if (Array.isArray(v) && v.length >= 2 && /颜色|color|款式|style|尺码|size|图案/i.test(k)) {
                draft.skuOptions.push({ name: k, values: v });
              }
            }
          }
          try {
            const imp = await apiPost('/api/collect/batch', { drafts: [draft] });
            if (imp && imp.ok && (imp.succeeded || 0) > 0) {
              okCount++;
            } else {
              failCount++;
            }
          } catch (e) {
            failCount++;
          }
        }
      } catch (e) {
        failCount++;
      } finally {
        try { if (tab && tab.id) await chrome.tabs.remove(tab.id); } catch (e) {}
      }

      state.done = myIdx + 1;
      state.imported = okCount;
      state.importFailed = failCount;
      state.message = state.lastError
        ? ('第 ' + (myIdx + 1) + ' 款失败：' + state.lastError + '（采集中 ' + state.done + '/' + state.total + '）')
        : ('采集中 ' + state.done + '/' + state.total + ' · 成功 ' + okCount + ' · 失败 ' + failCount);
      saveState();
      broadcast({ type: 'progress', state: publicState() });
    }
  }

  try {
    /* 启动 concurrency 个 worker */
    const workers = [];
    for (let i = 0; i < Math.min(concurrency, urls.length); i++) workers.push(worker());
    await Promise.all(workers);

    state.phase = 'shop-done';
    state.message = '全店采集完成：成功 ' + okCount + ' 款' +
      (failCount ? ('，失敗 ' + failCount + ' 款') : '') + '，已存草稿箱';
    state.finishedAt = Date.now();
    state.timings.total = Date.now() - state.startedAt;
    saveState();
    broadcast({ type: 'done', state: publicState() });
  } catch (e) {
    state.phase = 'error';
    state.message = '采集失敗：' + (e && e.message ? e.message : e);
    saveState();
    broadcast({ type: 'error', state: publicState() });
  } finally {
    state.running = false;
    saveState();
  }
}

function handleCommand(msg, sender) {
  return (async () => {
    switch (msg && msg.type) {
      case 'start': {
        /* 陈旧任务守卫：正常采集几十毫秒~几秒完成；超过 90 秒还在 running
           说明那次任务已经死了（页面被关/浏览器重启/SW 回收），强制解锁。 */
        if (state.running && state.startedAt && Date.now() - state.startedAt > 90000) {
          state.running = false;
          saveState();
        }
        if (state.running) return { ok: false, error: '已有任务在运行' };
        /* ★ 采「点按钮的那个页面」，不是「当前激活标签」：
           content script 随消息带上 location.href + sender.tab.id。
           以前用 active tab，多标签时用户明明在 1688 页点采集，
           SW 却采了碰巧激活的后台管理页，抓到一堆空占位草稿。 */
        const msgUrl = (msg && msg.url) || '';
        const senderTabId = sender && sender.tab ? sender.tab.id : 0;
        let pageUrl = /^https?:\/\//i.test(msgUrl) ? msgUrl : '';
        let tabId = senderTabId;
        if (!pageUrl || !tabId) {
          try {
            const tab = tabId ? await chrome.tabs.get(tabId)
              : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
            if (tab) { if (!pageUrl) pageUrl = tab.url || ''; if (!tabId) tabId = tab.id; }
          } catch (e) {}
        }
        if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return { ok: false, error: '当前不是网页，先打开商品页再采集' };
        runCollect({ url: pageUrl, tabId, limit: Math.max(1, Math.min(200, (msg.cfg && msg.cfg.limit) || 60)), clickAt: msg.clickAt });
        return { ok: true, url: pageUrl };
      }

      /* ★ 一键自动路由：content script 检测完页面类型发这个，
         SW 直接走单页采集或全店扫描 → 自动进入采集（不用用户再点第二次） */
      case 'startAuto': {
        if (state.running && state.startedAt && Date.now() - state.startedAt > 90000) {
          state.running = false; saveState();
        }
        if (state.running) return { ok: false, error: '已有任务在运行' };

        const hint = (msg && msg.hint) || 'single';
        const msgUrl = (msg && msg.url) || '';
        const senderTabId = sender && sender.tab ? sender.tab.id : 0;
        let pageUrl = /^https?:\/\//i.test(msgUrl) ? msgUrl : '';
        let tabId = senderTabId;
        if (!pageUrl || !tabId) {
          try {
            const tab = tabId ? await chrome.tabs.get(tabId)
              : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
            if (tab) { if (!pageUrl) pageUrl = tab.url || ''; if (!tabId) tabId = tab.id; }
          } catch (e) {}
        }
        if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return { ok: false, error: '当前不是网页' };

        if (hint === 'shop') {
          /* 全店：扫描 → 完了自动进采集 */
          runShopScan({ tabId, url: pageUrl, pages: 30, autoCollect: true, concurrency: 4, skipExisting: true });
        } else {
          /* 单页 */
          runCollect({ url: pageUrl, tabId, limit: 60, clickAt: msg.clickAt });
        }
        return { ok: true, url: pageUrl, mode: hint };
      }

      /* ===== 全店采集：扫描階段 ===== */
      case 'shopScan': {
        if (state.running && state.startedAt && Date.now() - state.startedAt > 90000) {
          state.running = false; saveState();
        }
        if (state.running) return { ok: false, error: '已有任务在运行' };

        let tab = null;
        const senderTabId = sender && sender.tab ? sender.tab.id : 0;
        if (senderTabId) { try { tab = await chrome.tabs.get(senderTabId); } catch (e) {} }
        if (!tab) tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
        if (!tab || !tab.id) return { ok: false, error: '找不到当前标签页' };

        const pageUrl = tab.url || '';
        if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return { ok: false, error: '当前不是网页' };

        runShopScan({ tabId: tab.id, url: pageUrl, pages: (msg.cfg && msg.cfg.pages) || 30 });
        return { ok: true };
      }

      /* ===== 全店采集：采集階段 ===== */
      case 'shopCollect': {
        if (state.running && state.startedAt && Date.now() - state.startedAt > 90000) {
          state.running = false; saveState();
        }
        if (state.running) return { ok: false, error: '已有任务在运行' };
        if (!state.shopUrls || !state.shopUrls.length) {
          return { ok: false, error: '还没扫描店铺，请先点扫描' };
        }
        runShopCollect({
          concurrency: (msg.cfg && msg.cfg.concurrency) || 4,
          skipExisting: !!(msg.cfg && msg.cfg.skipExisting)
        });
        return { ok: true };
      }

      case 'getState': return { ok: true, state: publicState() };
      case 'registerBuild': return registerBuild(msg.scope || 'page');
      /* popup 自查：浏览器当前实际跑的 BUILD + 服务端最新版 */
      case 'getBuild': {
        let server = '';
        try { const r = await withTimeout(apiGet('/api/ext/version'), 3000, '版本检查'); server = (r && r.build) || ''; } catch (e) {}
        return { ok: true, local: BUILD, server, stored: (await chrome.storage.local.get(['lum_build'])).lum_build || '' };
      }
      /* 强制更新：清掉防抖存档 + 立刻重载 */
      case 'forceReload': {
        const now = Date.now();
        await chrome.storage.local.set({ lum_build: '', lum_reload_at: now - 10000, lum_reinject_pending: true });
        setTimeout(() => chrome.runtime.reload(), 120);
        return { ok: true };
      }
      case 'checkServer': {
        try {
          const h = await apiGet('/api/health');
          return { ok: !!h.ok, base: API_BASE };
        } catch (e) { return { ok: false, error: e.message, base: API_BASE }; }
      }
      case 'reset': {
        state.phase = ''; state.message = '';
        state.total = 0; state.done = 0; state.failed = 0;
        state.imported = 0; state.importFailed = 0;
        saveState();
        broadcast({ type: 'reset', state: publicState() });
        return { ok: true };
      }
      /* 预热：页面加载 / 鼠标悬停按钮时由 content script 触发。
         MV3 service worker 空闲 30 秒会被回收，下次唤醒要重新加载脚本，
         系统负载高时这一步能到 1~2 秒。提前唤醒，点击时就是热的。 */
      case 'ping': {
        state.lastPing = Date.now();
        /* 顺手做一次异步 IO，让 SW 在这次消息之后多活一会儿 */
        try { chrome.storage.local.get(['lum_build'], () => {}); } catch (e) {}
        return { ok: true, ts: state.lastPing };
      }
    }
    return { ok: false };
  })();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleCommand(msg, sender).then(sendResponse);
  return true;
});

/* ============================================================
   自更新：代码改了自动重载扩展，并把页面上的按钮重新挂上
   ---------------------------------------------------------
   之前 content.js 自己调 chrome.runtime.reload()，结果：
   reload 会让该页面上的 content script 上下文失效，
   按钮还在页面上，但点了毫无反应（死按钮），必须刷新页面。

   ② ★ 改了磁盘代码浏览器不更新 ★
      旧实现拿**运行中旧代码里的 BUILD 常量**跟存档比对 —— 它当然永远等于自己，
      所以永远判定「一致」，改了磁盘文件浏览器也不更新。
      现在改成向服务端问磁盘上的真实版本号：
        服务端从 extension/background.js 里读出 BUILD → 告诉扩展
        扩展发现跟自己不一样 → chrome.runtime.reload() → 加载到新代码
   ============================================================ */
async function registerBuild(scope) {
  try {
    const st = await chrome.storage.local.get(['lum_build', 'lum_reload_at']);
    const now = Date.now();

    /* 向服务端问最新版本（服务端读磁盘上的真实 BUILD） */
    let serverBuild = '';
    try {
      const r = await withTimeout(apiGet('/api/ext/version'), 3000, '版本检查');
      if (r && r.ok && r.build) serverBuild = r.build;
    } catch (e) {
      /* 服务端不通就算了，保持现状，不打断用户 */
      return { ok: true, reloaded: false, reason: 'server-unreachable' };
    }

    /* ★ 只用「正在运行的代码版本」做比对：存档 lum_build 是写完再 reload 的，
       一旦那次 reload 没真正生效，存档就会永久领先于实际代码，导致以后每次
       检查都误判「已是最新」，浏览器一直跑旧 SW（症状：服务端报新版却行为不变）。 */
    const current = BUILD;
    if (serverBuild === current) {
      /* 已是最新，顺手把存档同步成服务端的版本号 */
      if (st.lum_build !== serverBuild) await chrome.storage.local.set({ lum_build: serverBuild });
      return { ok: true, reloaded: false, build: serverBuild };
    }

    /* 版本不一致 → 重载扩展，让浏览器加载磁盘上的新代码 */
    const lastReload = st.lum_reload_at || 0;
    if (now - lastReload < 5000) {
      /* 防抖窗口内：不重复重载。
         ★ 关键：绝不能把 lum_build 同步成新版本！否则下次检查会误判「已是最新」，
         永不 reload —— 浏览器就一直跑旧 SW（症状：服务端报新 BUILD，采集行为却是旧的）。
         保持旧版本号，等窗口过后自然触发重载。 */
      return { ok: true, reloaded: false, reason: 'debounce', build: serverBuild, pending: true };
    }
    await chrome.storage.local.set({ lum_build: serverBuild, lum_reload_at: now, lum_reinject_pending: true });
    chrome.runtime.reload();
    return { ok: true, reloaded: true, from: current, to: serverBuild };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* 把 content.js 重新注入所有网页，让按钮重新可用 */
async function reinjectContent() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  } catch (e) { return 0; }
  let n = 0;
  for (const t of tabs) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] });
      n++;
    } catch (e) { /* 标签页可能已关闭 */ }
  }
  return n;
}

/* service worker 启动时：若有待重新注入的标记，就复活页面按钮 */
(async () => {
  try {
    const st = await chrome.storage.local.get(['lum_reinject_pending']);
    if (st.lum_reinject_pending) {
      await chrome.storage.local.set({ lum_reinject_pending: false });
      const n = await reinjectContent();
      console.log('已重新注入采集按钮到 ' + n + ' 个页面');
    }
  } catch (e) {}

  /* ★ SW 启动时也主动查一次版本 ★
     之前只在 content.js 上报时检查版本 —— 万一某个页面上
     content script 没注入成功（按钮没出现），就永远触发不了更新。
     SW 每次被唤醒都是一次机会，主动问服务端「有没有新版」。 */
  try {
    const st = await chrome.storage.local.get(['lum_build', 'lum_reload_at']);
    const serverBuild = await withTimeout(apiGet('/api/ext/version'), 3000, '版本检查').catch(() => null);
    if (serverBuild && serverBuild.ok && serverBuild.build && serverBuild.build !== (st.lum_build || BUILD)) {
      const now = Date.now();
      if (!st.lum_reload_at || now - st.lum_reload_at > 5000) {
        await chrome.storage.local.set({
          lum_build: serverBuild.build, lum_reload_at: now, lum_reinject_pending: true
        });
        console.log('发现新版本 ' + serverBuild.build + '，自动重载扩展');
        chrome.runtime.reload();
      }
    }
  } catch (e) {}
})();

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([STORAGE_KEY], (r) => { if (!r || !r[STORAGE_KEY]) saveState(); });
});
loadState();
