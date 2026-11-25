/* ===== 站点：?site= 预览参数优先，服务端按 Host 兜底 ===== */
/* 存档按域名分开存，避免在 lumiere.store 上预览过 aurora 后，真实访客被串到别的站 */
const SITE = (function(){
  const key = 'lumiere_site:' + location.host;
  try {
    const q = new URLSearchParams(location.search).get('site');
    if (q) { localStorage.setItem(key, q); return q; }
  } catch (e) {}
  try {
    return localStorage.getItem(key) || '';
  } catch (e) {}
  return '';
})();
/* 图片兜底：任何 <img> 加载失败都换成品牌占位图，避免整片破图 */
const IMG_FALLBACK = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#EFEDFD"/><stop offset="1" stop-color="#DCD8FB"/></linearGradient></defs>' +
  '<rect width="600" height="600" fill="url(#g)"/>' +
  '<circle cx="300" cy="300" r="86" fill="none" stroke="#7F77DD" stroke-width="3" opacity="0.55"/>' +
  '<text x="300" y="316" font-family="Georgia,serif" font-size="52" fill="#5b53a8" text-anchor="middle" opacity="0.8">L</text>' +
  '<text x="300" y="392" font-family="Helvetica,Arial,sans-serif" font-size="18" letter-spacing="4" fill="#7F77DD" text-anchor="middle" opacity="0.7">LUMIERE</text>' +
  '</svg>');
document.addEventListener('error', function (e) {
  const t = e.target;
  if (t && t.tagName === 'IMG' && !t.dataset.fallback) { t.dataset.fallback = '1'; t.src = IMG_FALLBACK; }
}, true);

function apiUrl(path){
  if (!SITE || path.indexOf('/api/') !== 0 || /[?&]site=/.test(path)) return path;
  return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'site=' + encodeURIComponent(SITE);
}

/* ============================================================
   LUMIÈRE · 全球化核心引擎
   IP定位 → 语言/货币/支付 → i18n 渲染 → 购物车 → 下单
   ============================================================ */

const Store = {
  get(k, d) { try { const v = localStorage.getItem('lumiere_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('lumiere_' + k, JSON.stringify(v)); } catch (e) {} }
};

const state = {
  lang:     Store.get('lang', null),
  country:  Store.get('country', null),
  currency: Store.get('currency', null),
  pay:      [],
  payRaw:   [],                                  // 地区默认支付列表（未经后台开关过滤）
  settings: null,                                // 后台站点设置（支付开关/联系方式/聊天开关）
  geoSource: Store.get('geoSource', 'auto'),   // auto | manual
  ageVerified: Store.get('ageVerified', false),
  cart: Store.get('cart', [])
};

/* 中文（简体 / 繁体）统一判定：商品中文字段、库存文案等只在这两种语言下启用 */
function isZh() { const l = state.lang; return l === 'zh' || l === 'zh-Hant'; }
/* 繁体界面下，后台录入的简体文案按字表转一遍 */
function zhText(s) {
  if (typeof s !== 'string') return s;
  return (state.lang === 'zh-Hant' && typeof window.s2t === 'function') ? window.s2t(s) : s;
}

/* ---------- 后台站点设置：支付开关 ---------- */
/* 地区默认给出一组支付方式，后台可按渠道开关；总开关关掉则整站停止在线下单 */
function filterPayList(list) {
  const s = state.settings;
  if (!s) return list;
  if (s.paymentEnabled === false) return [];
  return list.filter(m => !(s.payments && s.payments[m] && s.payments[m].enabled === false));
}
function applyPaymentSettings() {
  state.pay = filterPayList(state.payRaw || []);
  if (document.getElementById('pay-methods')) renderPayments();
}
async function loadSettings() {
  try {
    const res = await fetch(apiUrl('/api/settings'), { signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined });
    if (!res.ok) return;
    state.settings = await res.json();
    applyPaymentSettings();
  } catch (e) { /* 静态部署无后端时按地区默认支付方式走 */ }
}

const I18N = window.I18N || {};
/* 合并筛选/排序补丁词条（i18n-extra.js 独立提供，避免改动 41 个语言包） */
(function mergeI18nExtra(){
  const extra = window.I18N_EXTRA || {};
  Object.keys(extra).forEach(lang => {
    if (!I18N[lang]) return;
    I18N[lang].vocab = I18N[lang].vocab || {};
    Object.assign(I18N[lang].vocab, extra[lang]);
  });
})();

/* 合并联系页/站内聊天/支付开关词条（i18n-shell.js 独立提供，41 语言齐备） */
(function mergeShell(){
  const shell = window.I18N_SHELL || {};
  if (!shell.en) return;
  Object.keys(I18N).forEach(lang => {
    I18N[lang].ui = I18N[lang].ui || {};
    /* 先用英文补齐（理论上不会缺），再覆盖成本语言 */
    Object.keys(shell.en).forEach(k => { if (!(k in I18N[lang].ui)) I18N[lang].ui[k] = shell.en[k]; });
    if (shell[lang]) Object.assign(I18N[lang].ui, shell[lang]);
  });
})();

/* ---------- i18n 翻译函数 ---------- */
function t(key) {
  const pack = I18N[state.lang] || I18N.en || I18N.zh;
  return (pack && pack.ui && pack.ui[key]) || (I18N.zh.ui[key]) || key;
}

/* 发货时效：后台「站点设置」里可改截单时间与时效天数区间；
   没配置就用语言包原文。整段自定义文案优先（中/英各一条）。 */
function shipTimeBody() {
  const base = t('ship_time_body');
  const sh = (state.settings && state.settings.shipping) || null;
  if (!sh) return base;
  const custom = (isZh() ? zhText(sh.zh) : sh.en);
  if (custom && String(custom).trim()) return String(custom).trim();
  let out = base;
  const cut = String(sh.cutoff || '').trim();
  if (cut) out = out.replace(/\d{1,2}[:：]\d{2}/, cut);
  const min = Number(sh.minDays), max = Number(sh.maxDays);
  if (min > 0 && max > 0) out = out.replace(/\d+\s*[–—\-~～]\s*\d+/, min + '–' + max);
  return out;
}
function tProduct(id, field) {
  const prod = typeof getProduct === 'function' ? getProduct(id) : null;
  const pack = I18N[state.lang];

  /* 1) 商品自带的多语言覆盖（后台可为某语言单独填） */
  if (prod && prod.i18n && prod.i18n[state.lang] && prod.i18n[state.lang][field]) {
    return prod.i18n[state.lang][field];
  }
  /* 2) 语言包翻译（内置 12 商品有 41 语言） */
  if (pack && pack.products && pack.products[id] && pack.products[id][field]) {
    return pack.products[id][field];
  }
  /* 3) 后台新增商品：按界面语言取中/英字段，其余语言回退英文 */
  if (prod) {
    const enField = field + 'En';
    if (isZh() && prod[field]) return zhText(prod[field]);
    if (prod[enField]) return prod[enField];
    if (prod[field]) return prod[field];
  }
  /* 4) 兜底中文语言包 */
  if (I18N.zh.products[id] && I18N.zh.products[id][field]) return I18N.zh.products[id][field];
  return '';
}
function tv(term) {
  if (!term || term === '—') return term || '';
  const pack = I18N[state.lang];
  if (!pack || !pack.vocab) return term;
  return pack.vocab[term] || (isZh() ? zhText(term) : (I18N.en && I18N.en.vocab[term]) || term);
}
function catName(id) {
  const pack = I18N[state.lang] || I18N.en;
  return (pack.categories[id] && pack.categories[id].name) || '';
}
/* 规格字段取值：商品自带的逐语言覆盖 > 词库翻译 > 原值 */
function specVal(p, field) {
  if (p && p.i18n && p.i18n[state.lang] && p.i18n[state.lang][field]) return p.i18n[state.lang][field];
  return tv(p ? p[field] : '');
}
/* 结构化规格表：逐项返回 { k, label, value }
   k 为 spec_* 规格键，label 按当前语言翻译；value 取商品自带中/英值 */
function productSpecs(p, sku) {
  const rows = [];
  /* SKU 组合（颜色+款式的具体组合）：单独一行，购物车/订单里能看清买的哪一条 */
  if (sku && sku.combo) {
    rows.push({
      k: 'combo',
      label: t('spec_combo') || (isZh() ? zhText('规格') : 'Option'),
      value: (!isZh() && sku.combo.vEn) ? sku.combo.vEn : zhText(sku.combo.v)
    });
  }
  if (!p || !Array.isArray(p.specs)) return rows;
  return rows.concat(p.specs.map(it => {
    const label = t(it.k) || it.k;
    let value = it.v || '';
    /* 用户在详情页选中的 SKU（颜色/款式）覆盖规格表里的可选值 */
    if (sku && sku[it.k]) {
      const pick = sku[it.k];
      value = (!isZh() && pick.vEn) ? pick.vEn : zhText(pick.v);
    } else if (!isZh() && it.vEn) {
      value = it.vEn;
    }
    return { k: it.k, label, value };
  }).filter(x => x.value));
}
/* 颜色名 → 色卡颜色（用于 SKU 颜色选项的圆形色块，不依赖商品图，避免图文不符） */
const COLOR_SWATCH = [
  [/黑|black|墨/i,            '#2b2b30'],
  [/红|red|绯|玫红|酒红/i,     '#c0392b'],
  [/粉|pink|雾粉/i,           '#e8889e'],
  [/薄荷|mint|绿|green/i,     '#a8d5ba'],
  [/象牙|ivory|奶白|cream/i,  '#f4ecd8'],
  [/白|white/i,              '#f5f5f5'],
  [/紫|lilac|purple|浅紫/i,   '#b39ddb'],
  [/透明|clear|transparent/i,'#eef2f6'],
  [/棕|tan|肤|brown|巧克力/i, '#a86b4c'],
  [/蓝|blue/i,               '#5b8fd6'],
  [/金|gold/i,               '#d4af37'],
  [/灰|gray|grey/i,          '#9aa0a6']
];
function colorSwatch(name) {
  const hit = COLOR_SWATCH.find(([re]) => re.test(name));
  return hit ? hit[1] : '#cccccc';
}
/* 颜色选项 → 真实商品图：按商品 id + 中文颜色值映射到相册实拍图 */
const SKU_COLOR_IMG = {
  'LUM-C03': { '黑': '/assets/img/c03-2.webp', '红': '/assets/img/c03.webp', '粉': '/assets/img/c03-3.webp' },
  'LUM-W09': { '粉色': '/assets/img/w09-2.webp', '薄荷绿': '/assets/img/w09.webp' },
  'LUM-W10': { '奶白': '/assets/img/w10-2.webp', '粉': '/assets/img/w10.webp' },
  'LUM-C04': { '浅紫': '/assets/img/c04-3.webp', '透明': '/assets/img/c04-2.webp' },
  'LUM-W08': { '浅紫': '/assets/img/w08.webp', '白': '/assets/img/w08-4.webp' },
  'LUM-W07': { '雾粉': '/assets/img/w07.webp', '象牙白': '/assets/img/w07-3.webp' }
};
/* SKU 可选项：从颜色/款式规格拆出可点选列表（仅在有多个选项时生成） */
const SKU_KEYS = ['spec_color', 'spec_version'];
function skuOptions(p) {
  if (!p) return [];
  /* ① SKU 组合矩阵优先：1688 采集来的真实可售组合，
        每条组合有自己的价格 / 库存 / 图 —— 这才是下单单元 */
  if (Array.isArray(p.skus) && p.skus.length >= 2) {
    return [{
      k: 'combo',
      label: t('spec_combo') || (isZh() ? zhText('规格') : 'Option'),
      isColor: false,
      isCombo: true,
      options: p.skus.slice(0, 60).map(s => ({
        v: s.name,
        vEn: s.nameEn || s.name,
        img: s.image ? String(s.image).replace(/_sum\.jpg$/i, '_400x400.jpg') : null,
        imgSum: s.image || null,
        price: Number(s.price) || 0,
        stock: Number(s.stock) || 0,
        swatch: null
      }))
    }];
  }
  /* ② 旧结构：颜色 / 款式两组枚举（没有组合矩阵的历史商品走这条） */
  if (!Array.isArray(p.specs)) return [];
  const out = [];
  p.specs.forEach(it => {
    if (!SKU_KEYS.includes(it.k) || !it.v) return;
    const zh = it.v.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
    const en = (it.vEn || it.v).split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
    if (zh.length < 2) return;                    // 只有一个选项无需选择器
    const isColor = it.k === 'spec_color';
    /* 图片来源优先级：后台保存的 skuImages > 离线内置兜底 > 旧版硬编码映射 */
    const dataMap = (p.skuImages && typeof p.skuImages === 'object' && p.skuImages[it.k]) || {};
    const legacyMap = isColor ? (SKU_COLOR_IMG[p.id] || {}) : {};
    out.push({
      k: it.k, label: t(it.k) || it.k, isColor,
      options: zh.map((v, i) => ({
        v, vEn: en[i] || v,
        img: dataMap[v] || legacyMap[v] || null,
        swatch: isColor ? colorSwatch(v + ' ' + (en[i] || '')) : null
      }))
    });
  });
  return out;
}
/* 规格摘要：给列表卡片/购物车用，取前两项关键尺寸 */
function specSummary(p, n = 2) {
  const list = productSpecs(p);
  return list.slice(0, n).map(x => x.value).join(' · ');
}
function featVal(p, f) {
  if (p && p.i18n && p.i18n[state.lang]) {
    const arr = p.i18n[state.lang].features;
    if (Array.isArray(arr)) {
      const i = (p.features || []).indexOf(f);
      if (i >= 0 && arr[i]) return arr[i];
    }
  }
  return tv(f);
}
function langMeta() {
  return (I18N[state.lang] && I18N[state.lang].meta) || { dir: 'ltr', native: 'English', flag: '🇬🇧' };
}

/* ---------- IP 定位 ---------- */
async function detectGeo() {
  /* 用户已手动设置过：尊重手动选择 */
  if (state.geoSource === 'manual' && state.country && state.lang && state.currency) {
    applyGeo(state.country, state.lang, state.currency, false);
    return;
  }

  let country = null;
  /* 1) 后端 /api/geo（Cloudflare 提供国家码，最准） */
  try {
    const res = await fetch(apiUrl('/api/geo'), { signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined });
    if (res.ok) {
      const data = await res.json();
      if (data.country) country = data.country;
    }
  } catch (e) {}

  /* 2) 免费 IP 地理 API 兜底（静态部署无 Worker 时） */
  if (!country) {
    try {
      const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined });
      if (res.ok) { const d = await res.json(); if (d.country_code) country = d.country_code; }
    } catch (e) {}
  }

  /* 3) 浏览器语言兜底 */
  if (!country) {
    const bl = (navigator.language || 'en').toLowerCase();
    const map = { zh:'CN', en:'US', de:'DE', fr:'FR', es:'ES', ja:'JP', ko:'KR',
                  th:'TH', vi:'VN', ar:'SA', pt:'BR', ru:'RU', id:'ID' };
    if (/^zh-(hk|mo|tw|hant)/.test(bl)) country = 'HK';      /* 港澳台 → 繁体 */
    else for (const k in map) { if (bl.startsWith(k)) { country = map[k]; break; } }
  }

  if (!country) country = 'US';
  const g = geoFor(country);
  applyGeo(country, g.lang, g.currency, false);
}

function applyGeo(country, lang, currency, manual) {
  state.country = country;
  state.lang = I18N[lang] ? lang : 'en';
  state.currency = CURRENCIES[currency] ? currency : geoFor(country).currency;
  state.payRaw = geoFor(country).pay;
  state.pay = filterPayList(state.payRaw);
  if (manual) state.geoSource = 'manual';

  Store.set('country', state.country);
  Store.set('lang', state.lang);
  Store.set('currency', state.currency);
  Store.set('geoSource', state.geoSource);

  /* RTL 方向 */
  document.documentElement.dir = langMeta().dir;
  document.documentElement.lang = state.lang;

  /* 同步到控件 */
  paintPickers();
  const cur = document.getElementById('currency-select');
  if (cur) cur.value = state.currency;
  const langSel = document.getElementById('language-select');
  if (langSel) langSel.value = state.lang;
  const cSel = document.getElementById('country-select');
  if (cSel) cSel.value = state.country;

  renderAll();
  /* 通知其它组件（站内聊天等）语言已变，需重绘自身文案 */
  try { document.dispatchEvent(new CustomEvent('lumiere:lang', { detail: { lang: state.lang } })); } catch (e) {}
}

/* ---------- 购物车 ---------- */
function saveCart() { Store.set('cart', state.cart); }
function cartCount() { return state.cart.reduce((s, i) => s + i.qty, 0); }
function cartTotal() {
  return state.cart.reduce((s, i) => s + (unitPriceOf(i) * i.qty), 0);
}
/* 单件单价：SKU 组合自带价格时以组合价为准（不同组合不同价），否则用商品主价 */
function unitPriceOf(i) {
  const p = getProduct(i.id);
  if (!p) return 0;
  const c = i.sku && i.sku.combo;
  if (c && Number(c.price) > 0) return Number(c.price);
  return p.price;
}
/* 购物车条目：{id, qty, sku}——sku 为 {spec_color:{v,vEn}, ...}，不同 SKU 视为不同行 */
function cartItems() {
  return state.cart.map(i => {
    const p = getProduct(i.id);
    if (!p) return null;
    return { ...p, qty: i.qty, sku: i.sku, price: unitPriceOf(i) };
  }).filter(Boolean);
}
function skuKey(sku) { return sku ? Object.keys(sku).sort().map(k => k + '=' + (sku[k] && sku[k].v)).join('|') : ''; }
function addToCart(id, qty = 1, sku = null) {
  const key = skuKey(sku);
  const x = state.cart.find(i => i.id === id && skuKey(i.sku) === key);
  if (x) x.qty += qty; else state.cart.push({ id, qty, sku: sku || undefined });
  saveCart();
  const b = document.getElementById('cart-count'); if (b) b.textContent = cartCount();
  toast(t('added_toast'));
}
function updateQty(idx, d) {
  const x = state.cart[idx]; if (!x) return;
  x.qty += d; if (x.qty <= 0) state.cart.splice(idx, 1);
  saveCart();
}
function removeFromCart(idx) { if (state.cart[idx]) state.cart.splice(idx, 1); saveCart(); }

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- 翻译整个静态 DOM ---------- */
function translateDOM() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const v = t(el.getAttribute('data-i18n'));
    if (v) el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const v = t(el.getAttribute('data-i18n-ph'));
    if (v) el.placeholder = v;
  });
  /* 动态文案 */
  const heroEyebrow = document.querySelector('.hero-eyebrow');
  if (heroEyebrow) heroEyebrow.textContent = t('hero_eyebrow');
  const curTitle = document.title || '';
  const suffix = curTitle.indexOf(' · ') >= 0 ? curTitle.split(' · ').pop() : 'LUMIÈRE';
  document.title = suffix + ' · LUMIÈRE';
}

/* 合并商品详情页词条补丁（i18n-detail.js 独立提供，41 语言齐备） */
(function mergeDetail(){
  const det = window.I18N_DETAIL || {};
  if (!det.en) return;
  Object.keys(I18N).forEach(lang => {
    I18N[lang].ui = I18N[lang].ui || {};
    Object.assign(I18N[lang].ui, det[lang] || det.en);
  });
})();

/* 合并订单流程 + 规格标签词条（i18n-order.js 独立提供，41 语言齐备） */
(function mergeOrder(){
  const ord = window.I18N_ORDER || {};
  const spec = window.I18N_SPEC || {};
  if (!ord.en) return;
  Object.keys(I18N).forEach(lang => {
    I18N[lang].ui = I18N[lang].ui || {};
    Object.assign(I18N[lang].ui, ord[lang] || ord.en);
    Object.assign(I18N[lang].ui, spec[lang] || spec.en);
  });
})();

/* ---------- 商品卡片 ---------- */
function productCardHTML(p) {
  const gal = (Array.isArray(p.gallery) && p.gallery.length) ? p.gallery : [p.image];
  const multi = gal.length > 1;
  const hasOrig = p.originalPrice && p.originalPrice > p.price;
  return `<a class="prod-card" href="product.html?id=${p.id}">
    <div class="prod-thumb">
      ${multi
        ? `<img class="pc-img" src="${gal[0]}" data-gal='${JSON.stringify(gal)}' alt="${tProduct(p.id,'name')}" loading="lazy">
           <span class="pc-count">${gal.length}</span>`
        : `<img src="${p.image}" alt="${tProduct(p.id,'name')}" loading="lazy">`}
      ${p.badge ? `<span class="prod-badge">${tv(p.badge)}</span>` : ''}
    </div>
    <div class="prod-body">
      <div class="prod-name">${tProduct(p.id,'name')}</div>
      <div class="prod-cat">${catName(p.category)}${p.origin ? ' · ' + p.origin.replace(/^[^\s]+\s/, '') : ''}</div>
      <div class="prod-foot">
        <div class="prod-price-wrap">
          <span class="prod-price">${fmtMoney(p.price, state.currency)}</span>
          ${hasOrig ? `<span class="prod-price-orig">${fmtMoney(p.originalPrice, state.currency)}</span>` : ''}
        </div>
        <button class="prod-add" data-add="${p.id}" aria-label="add">
          <span class="prod-add-icon">+</span>
          <span class="prod-add-text">加入</span>
        </button>
      </div>
    </div>
  </a>`;
}
/* 卡片悬停时主图轮播（多图商品） */
function bindCardCarousel(scope = document) {
  scope.querySelectorAll('.pc-img').forEach(img => {
    let list = [];
    try { list = JSON.parse(img.getAttribute('data-gal')) || []; } catch (e) { list = []; }
    if (list.length < 2) return;
    let i = 0, timer = null;
    const show = n => { i = n % list.length; img.src = list[i]; };
    const start = () => { if (timer) return; timer = setInterval(() => show(i + 1), 1400); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } show(0); };
    const card = img.closest('.prod-card');
    if (!card) return;
    card.addEventListener('mouseenter', start);
    card.addEventListener('mouseleave', stop);
  });
}
function bindAddButtons(scope = document) {
  scope.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); addToCart(btn.getAttribute('data-add')); });
  });
}

/* ---------- 各页面渲染 ---------- */
function renderHome() {
  const feat = document.getElementById('featured-grid');
  if (feat) {
    /* 优先带标签的，不足 4 个用其它商品补齐，避免后台新增商品无标签时首页空白 */
    const badged = PRODUCTS.filter(p => p.badge);
    const rest = PRODUCTS.filter(p => !p.badge);
    feat.innerHTML = PRODUCTS.length
      ? [...badged, ...rest].slice(0, 4).map(productCardHTML).join('')
      : `<div class="empty-result">${tvLabel('暂无商品')}</div>`;
    bindAddButtons(feat);
    bindCardCarousel(feat);
  }
  const cats = document.getElementById('cat-grid');
  if (cats) {
    cats.innerHTML = CATEGORIES.map(c => {
      const pack = I18N[state.lang] || I18N.en;
      const cc = pack.categories[c.id];
      return `<a class="cat-card" href="category.html?cat=${c.id}">
        <div class="cat-icon" style="background:${c.theme}66">✦</div>
        <h3>${cc ? cc.name : c.name}</h3>
        <div class="en">${cc ? cc.en : c.en}</div>
        <p>${cc ? cc.desc : c.desc}</p>
      </a>`;
    }).join('');
  }
}

/* 分类页筛选状态（跨语言重绘保持） */
const facetState = { cat: null, selected: {}, sort: 'featured' };

function tvLabel(key) {
  /* 先查 vocab（补丁已合并），再退回原文 */
  const pack = I18N[state.lang];
  return (pack && pack.vocab && pack.vocab[key]) || key;
}

function renderCategory() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  const params = new URLSearchParams(location.search);
  if (facetState.cat === null) facetState.cat = params.get('cat') || 'all';

  /* 主分类 chips */
  const chips = document.getElementById('filter-chips');
  if (chips) {
    const all = [{ id: 'all' }, ...CATEGORIES.map(c => ({ id: c.id }))];
    chips.innerHTML = all.map(c =>
      `<button class="filter-chip ${c.id === facetState.cat ? 'active' : ''}" data-cat="${c.id}">${c.id === 'all' ? t('filter_all') : catName(c.id)}</button>`
    ).join('');
    chips.querySelectorAll('[data-cat]').forEach(btn => btn.addEventListener('click', () => {
      facetState.cat = btn.getAttribute('data-cat');
      chips.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); draw();
      history.replaceState(null, '', facetState.cat === 'all' ? location.pathname : '?cat=' + facetState.cat);
    }));
  }

  /* 侧边栏分面筛选 */
  const side = document.getElementById('filter-sidebar');
  if (side && typeof FACETS !== 'undefined') {
    side.innerHTML = `<div class="fs-head">
        <strong>${tvLabel('筛选')}</strong>
        <button type="button" class="fs-clear" id="fs-clear">${tvLabel('清除筛选')}</button>
      </div>` + FACETS.map(f => `
      <div class="fs-group">
        <div class="fs-title">${tvLabel(f.label)}</div>
        <div class="fs-opts">
          ${f.options.map(o => `<label class="fs-opt">
            <input type="checkbox" data-facet="${f.id}" data-key="${o.key}">
            <span class="fs-box"></span><span>${o.render ? o.render() : tvLabel(o.key)}</span>
          </label>`).join('')}
        </div>
      </div>`).join('');

    /* 恢复勾选状态 */
    side.querySelectorAll('[data-facet]').forEach(cb => {
      const k = cb.getAttribute('data-facet') + '|' + cb.getAttribute('data-key');
      cb.checked = !!facetState.selected[k];
      cb.addEventListener('change', () => {
        facetState.selected[k] = cb.checked;
        draw();
      });
    });
    const clearBtn = document.getElementById('fs-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      facetState.selected = {};
      side.querySelectorAll('[data-facet]').forEach(cb => cb.checked = false);
      draw();
    });
  }

  /* 排序下拉 */
  const sortSel = document.getElementById('sort-select');
  const sortLabel = document.getElementById('sort-label');
  if (sortLabel) sortLabel.textContent = tvLabel('排序方式');
  if (sortSel && typeof SORTS !== 'undefined') {
    sortSel.innerHTML = SORTS.map(s => `<option value="${s.id}">${tvLabel(s.label)}</option>`).join('');
    sortSel.value = facetState.sort;
    /* 静态元素：用 onchange 赋值避免重复渲染时监听器累积 */
    sortSel.onchange = () => { facetState.sort = sortSel.value; draw(); };
  }

  function draw() {
    let list = facetState.cat === 'all' ? PRODUCTS.slice() : PRODUCTS.filter(p => p.category === facetState.cat);
    /* 应用分面筛选：同一维度内 OR，不同维度间 AND */
    if (typeof FACETS !== 'undefined') {
      FACETS.forEach(f => {
        const activeKeys = f.options
          .filter(o => facetState.selected[f.id + '|' + o.key])
          .map(o => o.key);
        if (!activeKeys.length) return;
        list = list.filter(p => f.options.some(o => activeKeys.includes(o.key) && o.test(p)));
      });
    }
    /* 排序 */
    if (facetState.sort === 'price_asc') list.sort((a, b) => a.price - b.price);
    else if (facetState.sort === 'price_desc') list.sort((a, b) => b.price - a.price);
    else if (facetState.sort === 'name') list.sort((a, b) => tProduct(a.id, 'name').localeCompare(tProduct(b.id, 'name')));

    grid.innerHTML = list.length ? list.map(productCardHTML).join('')
      : `<div class="empty-result">${tvLabel('暂无匹配商品')}</div>`;
    bindAddButtons(grid);
    bindCardCarousel(grid);
    const cnt = document.getElementById('result-count');
    if (cnt) cnt.textContent = `${tvLabel('共')} ${list.length} ${tvLabel('件商品')}`;
    const bar = document.getElementById('filter-toggle');
    if (bar) bar.textContent = `${tvLabel('筛选')} ▾`;
  }
  draw();
}

/* 商品详情页：多图画廊 + 五标签页 + 相关推荐 */
function detailGalleryHTML(p) {
  const gal = (Array.isArray(p.gallery) && p.gallery.length) ? p.gallery : [p.image];
  const name = tProduct(p.id, 'name');
  const multi = gal.length > 1;
  const thumbs = multi ? `
      <div class="gallery-thumbs">
        ${gal.map((src, i) => `<button class="g-thumb ${i === 0 ? 'active' : ''}" data-src="${src}" data-i="${i}" type="button">
          <img src="${src}" alt="${name} ${i + 1}" loading="lazy"></button>`).join('')}
      </div>` : '';
  return `<div class="detail-gallery">
      <div class="gal-stage">
        <img class="main-img" id="gal-main" src="${gal[0]}" alt="${name}">
        ${multi ? `
        <button class="gal-nav gal-prev" id="gal-prev" type="button" aria-label="prev">‹</button>
        <button class="gal-nav gal-next" id="gal-next" type="button" aria-label="next">›</button>
        <span class="gal-count"><b id="gal-idx">1</b>/${gal.length}</span>` : ''}
      </div>
      ${thumbs}
    </div>`;
}
/* 长描述按空行分段 */
function detailParas(text) {
  return String(text || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
    .map(s => `<p>${s}</p>`).join('');
}
/* 相关推荐：同分类优先，不足用其它补齐 */
function relatedProducts(p) {
  const same = PRODUCTS.filter(x => x.id !== p.id && x.category === p.category);
  const other = PRODUCTS.filter(x => x.id !== p.id && x.category !== p.category);
  return same.concat(other).slice(0, 4);
}
function renderProduct() {
  const wrap = document.getElementById('detail-wrap');
  if (!wrap) return;
  const p = getProduct(new URLSearchParams(location.search).get('id') || new URLSearchParams(location.search).get('sku')) || PRODUCTS[0];
  /* 商品被后台删掉（或整站商品清空）时不要崩，给一张下架提示 */
  if (!p) {
    const cn0 = document.getElementById('crumb-name'); if (cn0) cn0.textContent = '';
    wrap.innerHTML = `<div class="empty-result" style="padding:48px 0">
        <p style="font-size:15px;margin-bottom:14px">商品已下架或不存在</p>
        <a class="btn btn-ghost" href="index.html">返回首页</a>
      </div>`;
    return;
  }
  const cn = document.getElementById('crumb-name'); if (cn) cn.textContent = tProduct(p.id, 'name');
  /* 后台关掉支付（或把所有渠道都关了）时，购买动作整体换成「联系客服」 */
  const payable = state.pay.length > 0;
  const buyArea = payable ? `
      <div class="qty-row">
        <span style="font-size:13px;color:var(--ink-2)">${t('detail_qty')}</span>
        <div class="qty-ctrl"><button id="q-minus">−</button><span id="q-val">1</span><button id="q-plus">+</button></div>
      </div>
      <div class="detail-actions">
        <button class="btn btn-ghost" id="buy-now">${t('checkout_place')}</button>
        <button class="btn btn-primary" id="add-cart">${t('detail_addcart')}</button>
      </div>` : `
      <div class="detail-actions detail-actions--off">
        <a class="btn btn-primary btn-block" href="contact.html" id="contact-cta">${t('pay_unavailable_cta')}</a>
      </div>
      <p class="detail-off-note">${t('pay_unavailable_desc')}</p>`;

  /* —— 规格参数：基础项 + 逐项结构化规格（每个尺寸单独一行） —— */
  const specRows = [
    ['detail_material', specVal(p, 'material')],
    ['detail_size', specVal(p, 'size')],
    ['detail_noise', specVal(p, 'noise')],
    ['detail_waterproof', specVal(p, 'waterproof')],
    ['detail_battery', specVal(p, 'battery')],
    ['detail_pack', tProduct(p.id, 'pack')],
    ['detail_weight', tProduct(p.id, 'weight')],
    ['detail_origin', tProduct(p.id, 'origin')],
    ['detail_packaging', tProduct(p.id, 'packaging')]
  ].filter(r => r[1]);

  /* 逐项规格表：长度 / 直径 / 高度 / 净重 / 包装尺寸 / 颜色 … */
  const specItems = productSpecs(p);
  const specItemRows = specItems.map(s => `<tr><td>${s.label}</td><td>${s.value}</td></tr>`).join('');
  /* 基础项中与逐项规格重复的字段不再单列，避免同款尺寸出现两遍 */
  const dupBase = new Set(['detail_material', 'detail_size', 'detail_weight']);
  const baseRowHTML = (specItems.length ? specRows.filter(r => !dupBase.has(r[0])) : specRows)
    .map(r => `<tr><td>${t(r[0])}</td><td>${r[1]}</td></tr>`).join('');

  const infoCard = (titleKey, bodyKey, bodyText) => `
      <div class="info-card">
        <div class="info-card-t">${t(titleKey)}</div>
        <div class="info-card-b">${bodyText != null ? bodyText : t(bodyKey)}</div>
      </div>`;

  /* SKU 选择器：颜色 / 款式可点选，默认选中第一项 */
  const skuGroups = skuOptions(p);
  const chosenSku = {};
  skuGroups.forEach(g => { chosenSku[g.k] = g.options[0]; });
  const skuPickerHTML = skuGroups.length ? `
    <div class="sku-picker" id="sku-picker">
      ${skuGroups.map(g => `
        <div class="sku-row">
          <div class="sku-label">${g.label}</div>
          <div class="sku-opts" data-sku="${g.k}">
            ${g.options.map((o, i) => `<button type="button" class="sku-opt sku-opt--img${i === 0 ? ' active' : ''}" data-v="${o.v}" data-ve="${o.vEn}" data-img="${o.img || ''}" data-sumimg="${o.imgSum || ''}" data-price="${g.isCombo ? (o.price || 0) : ''}" data-stock="${g.isCombo ? (o.stock || 0) : ''}" title="${!isZh() ? o.vEn : zhText(o.v)}">${o.img ? `<img class="sku-thumb" src="${o.img}" data-sum="${o.imgSum || ''}" referrerpolicy="no-referrer" alt="${o.v}">` : (o.swatch ? `<span class="sku-swatch" style="background:${o.swatch}"></span>` : '')}<span class="sku-opt-txt">${!isZh() ? o.vEn : zhText(o.v)}</span></button>`).join('')}
          </div>
        </div>`).join('')}
    </div>` : '';

  const relList = relatedProducts(p);

  wrap.innerHTML = `
    <div class="detail-top">
      ${detailGalleryHTML(p)}
      <div class="detail-info">
        <div class="prod-cat">${catName(p.category)} · ${p.id}</div>
        <h1>${tProduct(p.id, 'name')}</h1>
        <div class="detail-price" id="detail-price">${fmtMoney((skuGroups[0] && skuGroups[0].isCombo && skuGroups[0].options[0] && skuGroups[0].options[0].price > 0) ? skuGroups[0].options[0].price : p.price, state.currency)}</div>
        <p class="detail-desc">${tProduct(p.id, 'desc')}</p>
        ${skuPickerHTML}
        ${skuGroups.some(g => g.isCombo) ? `<div class="sku-stock-note" id="sku-stock" style="font-size:12px;color:var(--ink-2);margin:-2px 0 10px">${(() => { const o = skuGroups[0].options[0]; return o && o.stock > 0 ? (isZh() ? zhText('库存 ' + o.stock + ' 件') : o.stock + ' in stock') : ''; })()}</div>` : ''}
        ${buyArea}
        <p class="detail-note">${t('detail_shipnote')}</p>
      </div>
    </div>

    <div class="detail-tabs" id="detail-tabs">
      <div class="tab-bar" role="tablist">
        <button class="tab-btn active" data-tab="details" role="tab">${t('detail_tab_details')}</button>
        <button class="tab-btn" data-tab="specs" role="tab">${t('detail_tab_specs')}</button>
        <button class="tab-btn" data-tab="care" role="tab">${t('detail_tab_care')}</button>
        <button class="tab-btn" data-tab="shipping" role="tab">${t('detail_tab_shipping')}</button>
        <button class="tab-btn" data-tab="faq" role="tab">${t('detail_tab_faq')}</button>
      </div>

      <div class="tab-pane active" data-pane="details">
        <div class="pane-detail">${detailParas(tProduct(p.id, 'detail'))}</div>
      </div>

      <div class="tab-pane" data-pane="specs">
        <table class="spec-table spec-table--full">
          ${specItemRows}${baseRowHTML}
        </table>
      </div>

      <div class="tab-pane" data-pane="care">
        <div class="info-grid">
          ${infoCard('care_clean_title', 'care_clean_body')}
          ${infoCard('care_store_title', 'care_store_body')}
          ${infoCard('care_battery_title', 'care_battery_body')}
          ${infoCard('care_lube_title', 'care_lube_body')}
        </div>
      </div>

      <div class="tab-pane" data-pane="shipping">
        <div class="info-grid">
          ${infoCard('ship_pack_title', 'ship_pack_body')}
          ${infoCard('ship_time_title', 'ship_time_body', shipTimeBody())}
          ${infoCard('ship_privacy_title', 'ship_privacy_body')}
        </div>
      </div>

      <div class="tab-pane" data-pane="faq">
        <div class="faq-list">
          ${[1, 2, 3].map(i => `
            <div class="faq-row">
              <div class="faq-q">${t('faq_q' + i)}</div>
              <div class="faq-a">${t('faq_a' + i)}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>

    ${relList.length ? `
    <div class="rel-block">
      <h3 class="rel-title">${t('rel_title')}</h3>
      <div class="rel-grid">${relList.map(productCardHTML).join('')}</div>
    </div>` : ''}`;

  /* 缩略图切换主图 */
  const mainImg = document.getElementById('gal-main');
  const gal = (Array.isArray(p.gallery) && p.gallery.length) ? p.gallery : [p.image];
  const thumbBtns = [...wrap.querySelectorAll('.g-thumb')];
  const idxEl = document.getElementById('gal-idx');
  let galIdx = 0;
  const setGal = i => {
    if (!mainImg || !gal.length) return;
    galIdx = (i + gal.length) % gal.length;
    mainImg.src = gal[galIdx];
    thumbBtns.forEach(b => b.classList.toggle('active', Number(b.getAttribute('data-i')) === galIdx));
    if (idxEl) idxEl.textContent = String(galIdx + 1);
  };
  thumbBtns.forEach(btn => {
    btn.addEventListener('click', () => setGal(Number(btn.getAttribute('data-i'))));
  });
  const prevBtn = document.getElementById('gal-prev');
  const nextBtn = document.getElementById('gal-next');
  if (prevBtn) prevBtn.addEventListener('click', () => setGal(galIdx - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => setGal(galIdx + 1));
  /* 键盘左右方向键切图；renderProduct 可能多次执行，
     用可复用的全局监听器（先解绑旧的）避免回调叠加导致一次按键跳多张 */
  window.__lumiereGalleryKey = e => {
    if (!mainImg || e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') setGal(galIdx - 1);
    else if (e.key === 'ArrowRight') setGal(galIdx + 1);
  };
  document.removeEventListener('keydown', window.__lumiereGalleryKey);
  document.addEventListener('keydown', window.__lumiereGalleryKey);
  /* 标签页切换 */
  wrap.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-tab');
      wrap.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      wrap.querySelectorAll('.tab-pane').forEach(pn => pn.classList.toggle('active', pn.getAttribute('data-pane') === key));
    });
  });
  /* 相关推荐加购 */
  const relGrid = wrap.querySelector('.rel-grid');
  if (relGrid) { bindAddButtons(relGrid); bindCardCarousel(relGrid); }

  if (!payable) {
    /* 有站内聊天就直接唤起，没有再跳联系页 */
    const cta = document.getElementById('contact-cta');
    if (cta) cta.addEventListener('click', e => {
      const fab = document.getElementById('chat-fab');
      if (fab) { e.preventDefault(); fab.click(); }
    });
    return;
  }
  let qty = 1; const qv = document.getElementById('q-val');
  document.getElementById('q-minus').addEventListener('click', () => { if (qty > 1) { qty--; qv.textContent = qty; } });
  document.getElementById('q-plus').addEventListener('click', () => { qty++; qv.textContent = qty; });
  /* SKU 选项点击：更新高亮与当前选中值；组合矩阵下同时切换价格与主图 */
  const picker = document.getElementById('sku-picker');
  if (picker) {
    /* 缩略图 400×400 取不到时退回 60×60 小图（1688 只在部分图上有大图版本） */
    picker.querySelectorAll('.sku-thumb').forEach(im => {
      im.addEventListener('error', () => {
        const sum = im.getAttribute('data-sum');
        if (sum && im.getAttribute('src') !== sum) { im.setAttribute('src', sum); }
        else { im.style.display = 'none'; }
      });
    });
    picker.querySelectorAll('.sku-opts').forEach(row => {
      row.addEventListener('click', e => {
        const btn = e.target.closest('.sku-opt'); if (!btn) return;
        row.querySelectorAll('.sku-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const isCombo = row.getAttribute('data-sku') === 'combo';
        chosenSku[row.getAttribute('data-sku')] = {
          v: btn.getAttribute('data-v'),
          vEn: btn.getAttribute('data-ve'),
          img: btn.getAttribute('data-img') || null,
          swatch: (btn.querySelector('.sku-swatch') || {}).style?.background || null,
          price: isCombo ? Number(btn.getAttribute('data-price')) || 0 : undefined,
          stock: isCombo ? Number(btn.getAttribute('data-stock')) || 0 : undefined
        };
        if (isCombo) {
          const pv = Number(btn.getAttribute('data-price')) || 0;
          const priceEl = document.getElementById('detail-price');
          if (priceEl && pv > 0) priceEl.textContent = fmtMoney(pv, state.currency);
          /* 组合图就是这条组合的实拍图：换主图，并把相册焦点回到第一张 */
          const mi = document.getElementById('gal-main');
          const img = btn.getAttribute('data-img');
          if (mi && img) {
            const sum = btn.getAttribute('data-sumimg');
            mi.removeAttribute('srcset');
            mi.onerror = () => { if (sum && mi.getAttribute('src') !== sum) mi.setAttribute('src', sum); };
            mi.src = img;
          }
          const st = Number(btn.getAttribute('data-stock')) || 0;
          const stockEl = document.getElementById('sku-stock');
          if (stockEl) stockEl.textContent = st > 0 ? (isZh() ? zhText('库存 ' + st + ' 件') : st + ' in stock') : '';
        }
      });
    });
  }
  const curSku = () => Object.keys(chosenSku).length ? { ...chosenSku } : null;
  document.getElementById('add-cart').addEventListener('click', () => addToCart(p.id, qty, curSku()));
  document.getElementById('buy-now').addEventListener('click', () => { addToCart(p.id, qty, curSku()); location.href = 'checkout.html'; });
}

function renderCart() {
  const list = document.getElementById('cart-list');
  const summary = document.getElementById('cart-summary');
  if (!list || !summary) return;
  const items = cartItems();
  if (!items.length) {
    list.innerHTML = `<div class="cart-empty"><h2>${t('cart_empty')}</h2><p>${t('cart_empty_sub')}</p><br><a class="btn btn-primary" href="category.html">${t('cart_empty_btn')}</a></div>`;
    summary.style.display = 'none'; return;
  }
  list.innerHTML = items.map((p, idx) => `
    <div class="cart-item">
      <img src="${p.image}" alt="${tProduct(p.id,'name')}">
      <div>
        <div class="c-name"><a href="product.html?id=${p.id}">${tProduct(p.id,'name')}</a></div>
        <div class="c-meta">${catName(p.category)} · ${t('detail_qty')}
          <button data-dec="${idx}" style="border:none;background:none;color:var(--purple-700)">−</button> ${p.qty}
          <button data-inc="${idx}" style="border:none;background:none;color:var(--purple-700)">+</button>
        </div>
        ${productSpecs(p, p.sku).length ? `<div class="c-specs">${productSpecs(p, p.sku).map(s => `<span>${s.label} ${s.value}</span>`).join('')}</div>` : ''}
      </div>
      <div class="c-price">${fmtMoney(p.price * p.qty, state.currency)}</div>
      <button class="c-remove" data-rm="${idx}">${t('cart_remove')}</button>
    </div>`).join('');
  list.querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => { updateQty(b.getAttribute('data-inc'), 1); renderCart(); initHeader(); }));
  list.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => { updateQty(b.getAttribute('data-dec'), -1); renderCart(); initHeader(); }));
  list.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { removeFromCart(b.getAttribute('data-rm')); renderCart(); initHeader(); toast(t('removed_toast')); }));
  const shipping = 39;
  summary.innerHTML = `
    <h3>${t('cart_summary')}</h3>
    <div class="sum-row"><span>${t('cart_subtotal')}</span><span>${fmtMoney(cartTotal(), state.currency)}</span></div>
    <div class="sum-row"><span>${t('cart_shipping')}</span><span>${fmtMoney(shipping, state.currency)}</span></div>
    <div class="sum-row total"><span>${t('cart_total')}</span><span>${fmtMoney(cartTotal() + shipping, state.currency)}</span></div>
    <button class="btn btn-primary btn-block" id="to-checkout" style="margin-top:18px">${t('cart_checkout')}</button>
    <p style="font-size:11px;color:var(--ink-3);text-align:center;margin-top:12px">${t('cart_secure')}</p>`;
  document.getElementById('to-checkout').addEventListener('click', () => location.href = 'checkout.html');
}

function selectedPayment() {
  const el = document.querySelector('.pay-method.active');
  return el ? el.getAttribute('data-pay') : (state.pay[0] || 'crypto');
}
function renderPayments() {
  const wrap = document.getElementById('pay-methods');
  const card = document.getElementById('pay-card');
  const pob = document.getElementById('place-order');
  if (!wrap) return;
  /* 后台关闭支付功能：整块「支付方式」卡片隐藏，收货信息/订单摘要/提交订单照常 */
  if (!state.pay.length) {
    if (card) card.style.display = 'none';
    if (pob && pob.disabled) { pob.disabled = false; pob.classList.remove('is-disabled'); }
    wrap.innerHTML = '';
    return;
  }
  if (card) card.style.display = '';
  /* 支付可用：解除此前因渠道缺失而设置的禁用（否则按钮永远点不动） */
  if (pob && pob.disabled) { pob.disabled = false; pob.classList.remove('is-disabled'); }
  wrap.innerHTML = state.pay.map((m, i) => {
    const name = t('pay_' + m), desc = t('pay_' + m + '_desc'), badge = m === 'cod' ? t('pay_cod_badge') : '';
    return `<div class="pay-method ${i === 0 ? 'active' : ''}" data-pay="${m}">
      <span class="pay-radio"></span>
      <div style="flex:1"><span class="pm-name">${name}</span>${badge ? `<span class="pm-badge">${badge}</span>` : ''}
      <div class="pm-desc">${desc}</div></div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.pay-method').forEach(el => el.addEventListener('click', () => {
    wrap.querySelectorAll('.pay-method').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
  }));
}
/* ============ 地址级联：全球国家 → 州/省 → 城市/区县 ============
   数据源：window.WORLD_STATES（229 国 5327 州省）、window.CHINA_AREAS（中国 34 省市县三级）
   - 中国：省 → 市 → 区县 三级联动，全部下拉选择
   - 有州省数据的国家：州/省下拉，城市手填
   - 无州省数据的国家：州/省、城市均手填
   无论哪种，详细地址（街道门牌）与客户信息都必填 */
const ADDR_TXT = {
  zh: { sel:'请选择', state:'州 / 省', city:'城市', district:'区 / 县', manual:'（下方手填）', shortAddr:'请填写完整详细地址（街道 + 门牌号，至少 6 个字）' },
  en: { sel:'Select', state:'State / Province', city:'City', district:'District', manual:'(enter below)', shortAddr:'Enter full street address (street + house no., min 6 characters)' }
};
function addrTxt(k) { return (ADDR_TXT[state.lang] || ADDR_TXT.en)[k]; }
function addrSelectOpts(list, placeholder) {
  /* 州省/城市统一显示英文原名（跨境物流通用），中文名作 title 提示；x=[code,英文,中文] */
  return `<option value="">${placeholder}</option>` + list.map(x =>
    `<option value="${String(x[0]).replace(/"/g,'&quot;')}"${x[2] ? ` title="${String(x[2]).replace(/"/g,'&quot;')}"` : ''}>${x[1]}</option>`
  ).join('');
}
/* 通用：把字段重建为 select 或 input。data-mode 记录当前结构，结构未变则不动（保住用户输入） */
function setAddrField(id, mode, opts, ph, force) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (el.getAttribute('data-mode') === mode && !force) {
    /* 结构相同且非强制：用选项数量做签名，数量不同才更新（如省级切换后市级选项数变化） */
    const sig = opts ? String(opts.split('<option').length - 1) : '0';
    if (mode === 'select' && opts !== undefined && el.getAttribute('data-opts') !== sig) {
      const keep = el.value;
      el.innerHTML = opts;
      el.setAttribute('data-opts', sig);
      if (keep && [...el.options].some(o => o.value === keep)) el.value = keep;
      else el.value = '';
    }
    return el;
  }
  const keep = el.value || '';
  let html;
  if (mode === 'select') {
    const sig = opts ? String(opts.split('<option').length - 1) : '0';
    html = `<select id="${id}" data-mode="select" data-opts="${sig}">${opts || ''}</select>`;
  } else {
    html = `<input id="${id}" data-mode="input" placeholder="${ph || ''}">`;
  }
  el.outerHTML = html;
  const neu = document.getElementById(id);
  if (mode === 'select' && neu && keep && [...neu.options].some(o => o.value === keep)) neu.value = keep;
  return neu;
}
/* 国家变化 / 页面渲染时调用：按需重建州省-城市-区县结构 */
function initAddressForm() {
  const cc = state.country;
  const stateEl = document.getElementById('f-state');
  const distField = document.getElementById('district-field');
  const distLabel = document.getElementById('f-district-label');
  if (!stateEl) return;
  if (distLabel) distLabel.textContent = addrTxt('district') + ' *';
  const isCN = cc === 'CN';
  const stList = (typeof WORLD_STATES !== 'undefined' && WORLD_STATES[cc]) || [];
  const mode = isCN ? 'cn' : (stList.length ? 'state' : 'plain');
  /* 结构模式未变 → 不重建，保留用户已填内容 */
  if (stateEl.getAttribute('data-form') === mode) return;

  if (isCN && typeof CHINA_AREAS !== 'undefined') {
    const provs = Object.keys(CHINA_AREAS).map(code => [code, CHINA_AREAS[code].n, CHINA_AREAS[code].n]);
    const pOpts = addrSelectOpts(provs, addrTxt('sel') + ' ' + addrTxt('state'));
    const emptyCity = `<option value="">${addrTxt('sel')} ${addrTxt('city')}</option>`;
    const emptyDist = `<option value="">${addrTxt('sel')} ${addrTxt('district')}</option>`;
    setAddrField('f-state', 'select', pOpts);
    setAddrField('f-city', 'select', emptyCity);
    setAddrField('f-district', 'select', emptyDist);
    if (distField) distField.style.display = '';
    const pSel = document.getElementById('f-state');
    if (pSel) pSel.onchange = () => {
      const prov = CHINA_AREAS[pSel.value];
      const cities = prov ? Object.keys(prov.c).map(code => [code, prov.c[code].n, prov.c[code].n]) : [];
      setAddrField('f-city', 'select', addrSelectOpts(cities, addrTxt('sel') + ' ' + addrTxt('city')), undefined, true);
      setAddrField('f-district', 'select', emptyDist, undefined, true);
      const c = document.getElementById('f-city');
      if (c) c.onchange = () => {
        const pv = CHINA_AREAS[document.getElementById('f-state').value];
        const ct = pv && pv.c[document.getElementById('f-city').value];
        const dists = ct ? Object.keys(ct.d).map(code => [code, ct.d[code], ct.d[code]]) : [];
        setAddrField('f-district', 'select', addrSelectOpts(dists, addrTxt('sel') + ' ' + addrTxt('district')), undefined, true);
      };
    };
  } else {
    setAddrField('f-state', stList.length ? 'select' : 'input',
      stList.length ? addrSelectOpts(stList, addrTxt('sel') + ' ' + addrTxt('state')) : undefined, addrTxt('state'));
    setAddrField('f-city', 'input', undefined, addrTxt('city'));
    if (distField) distField.style.display = 'none';
  }
  /* 重建后在新元素上打模式标记，防止 renderAll 二次调用重复追加选项 */
  const finalState = document.getElementById('f-state');
  if (finalState) finalState.setAttribute('data-form', mode);
}
/* 读取地址字段的值（select 取选中项的显示文本，input 直接取值） */
function addrVal(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  if (el.tagName === 'SELECT') {
    const o = el.options[el.selectedIndex];
    return o && o.value ? (o.textContent || o.value).trim() : '';
  }
  return (el.value || '').trim();
}

function renderOrderSummary() {
  const wrap = document.getElementById('order-items');
  if (!wrap) return;
  const shipping = 39;
  wrap.innerHTML = cartItems().map(p => {
    const specs = productSpecs(p, p.sku);
    return `<div class="sum-row sum-row--item">
      <span>${tProduct(p.id,'name')} × ${p.qty}
        ${specs.length ? `<small class="sum-specs">${specs.map(s => `<span>${s.label} ${s.value}</span>`).join('')}</small>` : ''}
      </span>
      <span>${fmtMoney(p.price * p.qty, state.currency)}</span>
    </div>`;
  }).join('') + `<div class="sum-row"><span>${t('cart_shipping')}</span><span>${fmtMoney(shipping, state.currency)}</span></div>
     <div class="sum-row total"><span>${t('cart_total')}</span><span>${fmtMoney(cartTotal() + shipping, state.currency)}</span></div>`;
}

function renderCheckout() {
  if (!document.getElementById('checkout-box')) return;
  /* 已提交成功的订单页：购物车已清空，此时再触发 renderAll（如切语言/切币种）
     不能把用户踢回购物车；用 lastOrder 重渲染成功页，让动态内容（国家名等）跟随语言更新 */
  const box = document.getElementById('checkout-box');
  if (box.dataset.submitted === '1') {
    const last = Store.get('lastOrder', null);
    if (last) { showSuccess(last); } else { translateDOM(); }
    return;
  }
  const items = cartItems();
  if (!items.length) { location.href = 'cart.html'; return; }
  const cSel = document.getElementById('country-select');
  if (cSel) {
    const lang = state.lang;
    cSel.innerHTML = COUNTRY_LIST.map(c =>
      `<option value="${c.code}" ${c.code === state.country ? 'selected' : ''}>${c.flag} ${c[lang] || c.en}</option>`
    ).join('');
    cSel.onchange = e => {
      const code = e.target.value, g = geoFor(code);
      applyGeo(code, g.lang, g.currency, true);
      updateShipFlag();
    };
    updateShipFlag();
  }
  initAddressForm();
  renderPayments(); renderOrderSummary();
  /* 提交按钮是静态 DOM 元素，而 renderAll 可能被多次触发（首屏 / IP 定位 / 手动切语言），
     用 onclick 赋值（天然幂等）而不是 addEventListener，避免监听器累积导致重复触发 */
  const btn = document.getElementById('place-order');
  if (btn) btn.onclick = placeOrder;
}
function updateShipFlag() {
  const el = document.getElementById('ship-flag'); if (!el) return;
  const c = COUNTRY_LIST.find(x => x.code === state.country);
  el.textContent = c ? `${c.flag} ${c[state.lang] || c.en}` : state.country;
}

/* ---------- 提交订单 ---------- */
/* 真实邮箱校验：前端与后端双重把关 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function placeOrder() {
  const get = id => (document.getElementById(id)?.value || '').trim();
  const name = get('f-name');
  const email = get('f-email');
  const addr = get('f-addr');
  const addr2 = get('f-addr2');
  /* 州省/城市/区县：select 取选中项文本，input 取值 */
  const stateName = addrVal('f-state');
  const city = addrVal('f-city');
  const district = addrVal('f-district');
  const zip = get('f-zip');
  const phone = get('f-phone');
  const country = state.country;
  const countryMeta = COUNTRY_LIST.find(c => c.code === country);
  const countryName = countryMeta ? (isZh() ? zhText(countryMeta.zh) : countryMeta.en) : country;

  /* —— 必填校验：国家 / 州省 / 城市 / 详细地址 / 电话 —— */
  if (!name) { toast(t('fill_required')); focusField('f-name'); return; }
  if (!email) { toast(t('fill_required')); focusField('f-email'); return; }
  if (!EMAIL_RE.test(email)) { toast(t('f_email_invalid')); focusField('f-email'); return; }
  if (!country) { toast(t('fill_required')); focusField('country-select'); return; }
  if (!stateName) { toast(t('fill_required')); focusField('f-state'); return; }
  if (!city) { toast(t('fill_required')); focusField('f-city'); return; }
  /* 中国必须选到区/县三级 */
  if (country === 'CN' && !district) { toast(t('fill_required')); focusField('f-district'); return; }
  /* 详细地址至少 6 字，必须写到门牌号 */
  if (addr.length < 6) { toast(addrTxt('shortAddr')); focusField('f-addr'); return; }
  if (!phone) { toast(t('f_phone_required')); focusField('f-phone'); return; }

  const order = {
    customer: {
      name, email, addr, addr2, city, state: stateName, district, zip, country, countryName, phone
    },
    /* 商品明细带上所选规格尺寸，后台与订单详情逐项可见 */
    items: cartItems().map(p => {
      const specs = productSpecs(p, p.sku);
      return {
        id: p.id, name: tProduct(p.id, 'name'), qty: p.qty, price: p.price,
        sku: p.sku || null,
        specs: specs.map(s => ({ k: s.k, label: s.label, value: s.value }))
      };
    }),
    total: cartTotal() + 39, currency: state.currency,
    /* 支付关闭时无渠道可选，记为「待确认」，后台照常审核订单 */
    payment: state.pay.length ? selectedPayment() : '待确认', lang: state.lang, status: 'pending',
    createdAt: new Date().toISOString()
  };
  Store.set('lastOrder', order);
  const btn = document.getElementById('place-order');
  if (btn) { btn.disabled = true; btn.classList.add('is-disabled'); }
  /* 后端提交（Worker 部署后自动生效，静态环境静默失败不影响演示） */
  fetch(apiUrl('/api/order'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) })
    .then(r => r.json()).then(d => { if (d && d.orderId) { order.id = d.orderId; Store.set('lastOrder', order); } })
    .catch(() => {});
  state.cart = []; saveCart(); showSuccess(order);
}
function focusField(id) {
  const el = document.getElementById(id);
  if (el) { el.focus(); el.style.borderColor = 'var(--rose)'; }
}
function showSuccess(order) {
  const box = document.getElementById('checkout-box'); if (!box) return;
  /* 标记已提交：切语言/切币种再次渲染时保留成功页，不再跳回购物车 */
  box.dataset.submitted = '1';
  const id = order.id || ('LM' + Date.now().toString().slice(-10));
  const c = order.customer || {};
  /* 收货地址完整回显：门牌 / 公寓 / 区县 / 城市 / 州省 / 邮编 / 国家 / 电话 */
  const addrParts = [c.addr, c.addr2, c.district, c.city, c.state, c.zip].filter(Boolean);
  /* 国家名跟随当前界面语言（中文界面显示「中国」而不是 China；国家表只有 zh/en 两套名字） */
  const cInfo = COUNTRY_LIST.find(x => x.code === c.country);
  const countryName = cInfo ? (cInfo.zh && isZh() ? zhText(cInfo.zh) : cInfo.en) : (c.country || '');
  box.innerHTML = `
    <div class="order-success">
      <div class="ok-mark">✓</div>
      <h2 data-i18n="success_title">${t('success_title')}</h2>
      <p style="color:var(--ink-2);font-size:14px"><span data-i18n="success_orderno">${t('success_orderno')}</span> <strong>${id}</strong></p>
      <p style="color:var(--ink-3);font-size:13px;margin-top:8px" data-i18n="success_review">${t('success_review')}</p>

      <div class="success-info">
        <div class="success-info-row">
          <span class="success-info-k" data-i18n="success_email_to">${t('success_email_to')}</span>
          <span class="success-info-v">${c.email || '—'}</span>
        </div>
        <div class="success-info-row">
          <span class="success-info-k" data-i18n="success_addr_to">${t('success_addr_to')}</span>
          <span class="success-info-v">
            ${c.name ? `<strong>${c.name}</strong><br>` : ''}
            ${addrParts.join(' · ')}${countryName ? '<br>' + countryName : ''}
            ${c.phone ? '<br>' + c.phone : ''}
          </span>
        </div>
        <div class="success-info-row">
          <span class="success-info-k" data-i18n="detail_qty">${t('detail_qty')}</span>
          <span class="success-info-v">${(order.items || []).map(i =>
            `${i.name} × ${i.qty}` + (i.specs && i.specs.length ? `<br><small>${i.specs.map(s => `${s.label}：${s.value}`).join(' · ')}</small>` : '')
          ).join('<br>')}</span>
        </div>
      </div>

      <p style="color:var(--ink-3);font-size:12px;margin-top:18px"><span data-i18n="success_note">${t('success_note')}</span><br><span data-i18n="success_contact">${t('success_contact')}</span></p>
      <div style="margin-top:26px;display:flex;gap:12px;justify-content:center">
        <a class="btn btn-ghost" href="index.html" data-i18n="success_back">${t('success_back')}</a>
        <a class="btn btn-primary" href="category.html" data-i18n="success_cont">${t('success_cont')}</a>
      </div>
    </div>`;
}

/* ---------- 头部：语言/货币选择器（全球版：41 语言 / 120+ 货币） ---------- */
/* 语系分组：把 41 种语言归入 optgroup，方便用户快速找到 */
const LANG_GROUPS = [
  { label: '亚洲语言', codes: ['zh','zh-Hant','ja','ko','th','lo','vi','id','ms','tl','km','my','hi','bn','mr','ta','ur'] },
  { label: '欧洲语言', codes: ['en','de','fr','es','pt','it','nl','pl','sv','da','no','fi','cs','sk','sl','hr','bs','sr','mk','sq','bg','hu','ro','el','lt','lv','et','is','lb','ca','ga','mt','fo','uk','ru','tr'] },
  { label: '中东 / 非洲语言', codes: ['ar','he','fa','sw','af'] },
  { label: '中亚语言', codes: ['kk'] }
];

/* 货币分组：按区域归类 */
const CUR_GROUPS = [
  { label: '常用货币', codes: ['USD','EUR','CNY','GBP','JPY','AED','SAR'] },
  { label: '欧洲', codes: ['CHF','SEK','NOK','DKK','PLN','CZK','HUF','RON','BGN','RSD','BAM','MKD','ALL','UAH','BYN','MDL','RUB','ISK','TRY'] },
  { label: '亚太', codes: ['HKD','MOP','TWD','KRW','SGD','MYR','THB','VND','IDR','PHP','KHR','LAK','MMK','BND','INR','PKR','BDT','NPR','LKR','MVR','AFN','IRR','IQD','KZT','UZS','TMT','TJS','KGS','GEL','AMD','AZN','MNT','AUD','NZD','FJD','PGK'] },
  { label: '中东 / 非洲', codes: ['QAR','KWD','BHD','OMR','JOD','TND','EGP','MAD','DZD','LYD','LBP','SYP','YER','NGN','GHS','KES','TZS','UGX','ETB','ZAR','XOF','XAF','CDF','RWF','ZMW','ZWL','MUR','MGA','BWP','NAD','MZN','AOA','MRU','SDG','SOS'] },
  { label: '美洲', codes: ['CAD','MXN','BRL','ARS','CLP','COP','PEN','UYU','PYG','BOB','VES','GYD','SRD','CRC','PAB','GTQ','HNL','NIO','DOP','CUP','JMD','TTD','HTG'] }
];

function currencyOptions() {
  const used = new Set();
  let html = '';
  CUR_GROUPS.forEach(g => {
    const codes = g.codes.filter(c => CURRENCIES[c]);
    codes.forEach(c => used.add(c));
    if (codes.length) html += `<optgroup label="${g.label}">` + codes.map(c =>
      `<option value="${c}">${c} ${CURRENCIES[c].symbol}</option>`).join('') + '</optgroup>';
  });
  /* 兜底：未在分组中列出的货币全部收进“其他” */
  const rest = Object.keys(CURRENCIES).filter(c => !used.has(c));
  if (rest.length) html += `<optgroup label="其他货币">` + rest.map(c =>
    `<option value="${c}">${c} ${CURRENCIES[c].symbol}</option>`).join('') + '</optgroup>';
  return html;
}
function languageOptions() {
  const used = new Set();
  let html = '';
  LANG_GROUPS.forEach(g => {
    const codes = g.codes.filter(c => I18N[c]);
    codes.forEach(c => used.add(c));
    if (codes.length) html += `<optgroup label="${g.label}">` + codes.map(c =>
      `<option value="${c}">${I18N[c].meta.flag} ${I18N[c].meta.native}</option>`).join('') + '</optgroup>';
  });
  const rest = Object.keys(I18N).filter(c => !used.has(c));
  if (rest.length) html += `<optgroup label="其他语言">` + rest.map(c =>
    `<option value="${c}">${I18N[c].meta.flag} ${I18N[c].meta.native}</option>`).join('') + '</optgroup>';
  return html;
}

/* ---------- 国旗下拉组件（语言 / 货币） ---------- */
function flagImg(countryCode, cls) {
  const code = (countryCode || '').toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return '<span class="flag-ph"></span>';
  return `<img class="${cls || 'fg'}" src="https://flagcdn.com/w20/${code}.png" srcset="https://flagcdn.com/w40/${code}.png 2x" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
}
function langFlagCode(l) { return LANG_FALLBACK[l] || 'us'; }
function curFlagCode(c) { return CURRENCY_COUNTRY[c] || 'us'; }

/* 构造下拉面板 HTML：分组 + 国旗 + 名称 */
function buildPickerMenu(type) {
  if (type === 'lang') {
    const used = new Set(); let html = '';
    LANG_GROUPS.forEach(g => {
      const codes = g.codes.filter(c => I18N[c]);
      codes.forEach(c => used.add(c));
      if (!codes.length) return;
      html += `<div class="pk-group">${g.label}</div>` + codes.map(c =>
        `<button type="button" class="pk-opt" data-type="lang" data-val="${c}">
           ${flagImg(langFlagCode(c))}<span class="pk-name">${I18N[c].meta.native}</span>
           <span class="pk-sub">${I18N[c].meta.name}</span><span class="pk-check">✓</span>
         </button>`).join('');
    });
    Object.keys(I18N).filter(c => !used.has(c)).forEach(c => {
      html += `<button type="button" class="pk-opt" data-type="lang" data-val="${c}">
        ${flagImg(langFlagCode(c))}<span class="pk-name">${I18N[c].meta.native}</span>
        <span class="pk-sub">${I18N[c].meta.name}</span><span class="pk-check">✓</span></button>`;
    });
    return html;
  } else {
    const used = new Set(); let html = '';
    CUR_GROUPS.forEach(g => {
      const codes = g.codes.filter(c => CURRENCIES[c]);
      codes.forEach(c => used.add(c));
      if (!codes.length) return;
      html += `<div class="pk-group">${g.label}</div>` + codes.map(c =>
        `<button type="button" class="pk-opt" data-type="cur" data-val="${c}">
           ${flagImg(curFlagCode(c))}<span class="pk-name">${c}</span>
           <span class="pk-sub">${CURRENCIES[c].name} ${CURRENCIES[c].symbol}</span><span class="pk-check">✓</span>
         </button>`).join('');
    });
    Object.keys(CURRENCIES).filter(c => !used.has(c)).forEach(c => {
      html += `<button type="button" class="pk-opt" data-type="cur" data-val="${c}">
        ${flagImg(curFlagCode(c))}<span class="pk-name">${c}</span>
        <span class="pk-sub">${CURRENCIES[c].name} ${CURRENCIES[c].symbol}</span><span class="pk-check">✓</span></button>`;
    });
    return html;
  }
}

/* 更新触发器上显示的国旗 + 文字 */
function paintPickers() {
  const langBtn = document.getElementById('lang-trigger');
  if (langBtn) {
    const code = langFlagCode(state.lang);
    langBtn.innerHTML = flagImg(code, 'fg') + `<span class="pk-label">${I18N[state.lang] ? I18N[state.lang].meta.native : state.lang}</span><span class="pk-caret">⌄</span>`;
  }
  const curBtn = document.getElementById('cur-trigger');
  if (curBtn) {
    const code = curFlagCode(state.currency);
    curBtn.innerHTML = flagImg(code, 'fg') + `<span class="pk-label">${state.currency}</span><span class="pk-caret">⌄</span>`;
  }
  /* 标记选中项 */
  document.querySelectorAll('.pk-opt').forEach(o => {
    const v = o.getAttribute('data-val'), t = o.getAttribute('data-type');
    const chosen = t === 'lang' ? (v === state.lang) : (v === state.currency);
    o.classList.toggle('active', chosen);
  });
}

/* 初始化两个下拉的交互（只绑定一次） */
let pickerBound = false;
function initPickers() {
  const menus = document.querySelectorAll('.pk-menu');
  if (!menus.length || pickerBound) return;
  menus.forEach(menu => {
    const type = menu.getAttribute('data-type') || 'lang';
    menu.innerHTML = buildPickerMenu(type);
    menu.addEventListener('click', e => {
      const opt = e.target.closest('.pk-opt'); if (!opt) return;
      const v = opt.getAttribute('data-val');
      if (type === 'lang') {
        const fb = LANG_FALLBACK[v] || state.country;
        const g = geoFor(fb);
        applyGeo(fb, v, g.currency, true);
      } else {
        applyGeo(state.country, state.lang, v, true);
      }
      closePickers();
    });
  });
  /* 搜索框：每个下拉各自过滤自己的列表 */
  document.querySelectorAll('.pk-search-wrap input').forEach(search => {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      const pop = search.closest('.pk-pop');
      pop.querySelectorAll('.pk-opt').forEach(o => {
        o.style.display = o.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
      /* 分组标题：若整组都被过滤则隐藏 */
      pop.querySelectorAll('.pk-group').forEach(g => {
        let el = g.nextElementSibling, anyVisible = false;
        while (el && !el.classList.contains('pk-group')) {
          if (el.classList.contains('pk-opt') && el.style.display !== 'none') anyVisible = true;
          el = el.nextElementSibling;
        }
        g.style.display = anyVisible ? '' : 'none';
      });
    });
  });
  /* 触发器展开/收起 */
  ['lang-trigger', 'cur-trigger'].forEach(id => {
    const btn = document.getElementById(id); if (!btn) return;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const wrap = btn.closest('.pk');
      const isOpen = wrap.classList.contains('open');
      closePickers();
      if (!isOpen) {
        wrap.classList.add('open');
        const si = wrap.querySelector('.pk-search-wrap input');
        if (si) { si.value = ''; si.dispatchEvent(new Event('input')); }
      }
    });
  });
  document.addEventListener('click', closePickers);
  pickerBound = true;
}
function closePickers() { document.querySelectorAll('.pk.open').forEach(p => p.classList.remove('open')); }

function initHeader() {
  const badge = document.getElementById('cart-count'); if (badge) badge.textContent = cartCount();
  /* 全站导航补「联系我们」入口（各页 HTML 不必重复维护） */
  const nav = document.querySelector('.site-header .nav');
  if (nav && !nav.querySelector('[data-i18n="nav_contact"]')) {
    const a = document.createElement('a');
    a.href = 'contact.html';
    a.setAttribute('data-i18n', 'nav_contact');
    a.textContent = '联系我们';
    nav.appendChild(a);
  }
  initPickers();
  paintPickers();
  /* 兼容旧版原生 select（若某些页面仍保留）；静态元素用 onchange 赋值，避免重复渲染时监听器累积 */
  const cur = document.getElementById('currency-select');
  if (cur) { cur.innerHTML = currencyOptions(); cur.value = state.currency; cur.onchange = e => applyGeo(state.country, state.lang, e.target.value, true); }
  const langSel = document.getElementById('language-select');
  if (langSel) { langSel.innerHTML = languageOptions(); langSel.value = state.lang; langSel.onchange = e => {
    const l = e.target.value, fb = LANG_FALLBACK[l] || state.country;
    applyGeo(fb, l, geoFor(fb).currency, true);
  }; }
  /* 上面新插入的导航项需要补一次翻译 */
  if (typeof translateDOM === 'function') translateDOM();
}

/* ---------- 年龄门 ---------- */
function initAgeGate() {
  const gate = document.getElementById('agegate'); if (!gate) return;
  if (state.ageVerified) { gate.hidden = true; return; }
  gate.hidden = false;
  document.getElementById('age-yes').addEventListener('click', () => {
    state.ageVerified = true; Store.set('ageVerified', true); gate.hidden = true;
  });
  document.getElementById('age-no').addEventListener('click', () => { window.location.href = 'https://www.google.com'; });
}

/* ---------- 全量渲染 ---------- */
function renderAll() {
  translateDOM();
  initHeader();
  renderHome();
  renderCategory();
  renderProduct();
  renderCart();
  renderCheckout();
  const badge = document.getElementById('cart-count'); if (badge) badge.textContent = cartCount();
}

/* ---------- 启动 ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  /* 先用缓存/默认语言立即渲染，避免白屏 */
  const rawLang = (navigator.language || 'en').toLowerCase();
  const bl = rawLang.slice(0, 2);
  const wantsHant = /^zh-(hk|mo|tw|hant)/.test(rawLang);
  if (!state.lang) state.lang = wantsHant ? 'zh-Hant' : (I18N[bl] ? bl : 'en');
  /* 地区默认支付渠道必须无条件初始化：
     回访用户 localStorage 里已有 lang，上面那个 if 不会进，
     若 payRaw 留空则 state.pay 恒为空，前台会误判「支付不可用」并锁死下单按钮 */
  const g0 = geoFor(state.country || 'US');
  state.currency = state.currency || g0.currency;
  state.payRaw = g0.pay;
  state.pay = filterPayList(state.payRaw);
  document.documentElement.dir = langMeta().dir;
  initAgeGate();
  /* 先从后端拉商品（后台管理的商品），再渲染；失败则用本地默认 12 条 */
  await loadProducts();
  await loadSettings();     /* 后台支付开关等，先于首次渲染拿到 */
  renderAll();
  /* 后台 IP 定位，拿到后自动切换 */
  await detectGeo();
});

/* 从后端加载商品；后台增删改后刷新页面即可生效。
   注意：空列表也要替换 —— 后台删空商品后前端不能还留着内置演示商品。 */
async function loadProducts() {
  try {
    const res = await fetch(apiUrl('/api/products'), { signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined });
    if (!res.ok) return;
    const data = await res.json();
    const list = (data && (data.products || data.data && data.data.products)) || (Array.isArray(data) ? data : null);
    if (Array.isArray(list) && typeof replaceProducts === 'function') replaceProducts(list);
  } catch (e) { /* 静态部署无后端时静默用默认商品 */ }
}
