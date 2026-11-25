/* ============================================================
   LUMIÈRE · 后端核心业务层 (Worker / Node 共用)
   与运行环境无关，只处理纯逻辑 + 数据。
   地理数据来自 geo-data.js（与前端 geo.js 同源生成）
   ============================================================ */

import { GEO, GEO_DEFAULT as GEO_FALLBACK, CURRENCIES as CURRENCY_TABLE, COUNTRY_LIST } from './geo-data.js';

/* 兼容原有导出名 */
const GEO_TABLE = GEO;
const GEO_DEFAULT = GEO_FALLBACK;

/* 默认库存（商品 id → 数量） */
const DEFAULT_STOCK = {
  'LUM-W01':50,'LUM-W02':30,'LUM-W03':40,'LUM-M01':60,'LUM-M02':80,'LUM-M03':120,
  'LUM-C01':25,'LUM-C02':70,'LUM-H01':200,'LUM-H02':150,'LUM-W04':20,'LUM-M04':90
};

export function GEO_ROUTE(country) {
  const g = GEO_TABLE[country] || GEO_DEFAULT;
  const meta = COUNTRY_LIST.find(c => c.code === country);
  return { country, ...g, countryName: meta ? meta.en : country, flag: meta ? meta.flag : '🌐', countries: COUNTRY_LIST.length };
}
export function CURRENCY_ROUTE() {
  return { base: 'CNY', count: Object.keys(CURRENCY_TABLE).length, currencies: CURRENCY_TABLE };
}

/* HMAC 验签（Web Crypto，Worker 与 Node18+ 通用） */
async function verify(secret, payload, signature) {
  if (!secret) return true;               // 未配置密钥时跳过（开发用）
  if (!signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(JSON.stringify(payload)));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === signature;
}

function newId() { return 'LM' + Date.now().toString().slice(-10) + Math.floor(Math.random()*90+10); }

/* ============================================================
   订单状态机
   待审核 → 已审核 → 待付款 → 已付款 → 已发货 → 已完成
   任一阶段都可转「已取消」（未发货前）
   ============================================================ */
export const ORDER_STATUS = {
  pending:    { label: '待审核', next: ['approved', 'cancelled'] },
  approved:   { label: '已审核', next: ['awaiting_payment', 'cancelled'] },
  awaiting_payment: { label: '待付款', next: ['paid', 'cancelled'] },
  paid:       { label: '已付款', next: ['shipped', 'cancelled'] },
  shipped:    { label: '已发货', next: ['completed'] },
  completed:  { label: '已完成', next: [] },
  cancelled:  { label: '已取消', next: [] }
};
const STATUS_KEYS = Object.keys(ORDER_STATUS);

/* 状态流转合法性：只允许按流程前进，或取消 */
function canTransit(from, to) {
  if (from === to) return true;
  const s = ORDER_STATUS[from];
  if (!s) return true;                 /* 未知历史状态，放行 */
  return s.next.includes(to);
}

/* 数据访问：优先 D1，否则内存 */
async function dbGetOrder(env, mem, id) {
  if (env && env.DB) { const r = await env.DB.prepare('SELECT data FROM orders WHERE id=?').bind(id).first(); return r ? JSON.parse(r.data) : null; }
  return mem.orders.get(id) || null;
}
async function dbPutOrder(env, mem, order) {
  if (env && env.DB) {
    await env.DB.prepare('INSERT OR REPLACE INTO orders (id,data,status,created_at) VALUES (?,?,?,?)')
      .bind(order.id, JSON.stringify(order), order.status, order.createdAt).run();
  } else mem.orders.set(order.id, order);
}
async function dbListOrders(env, mem, limit) {
  if (env && env.DB) {
    const r = await env.DB.prepare('SELECT data FROM orders ORDER BY created_at DESC LIMIT ?').bind(limit).all();
    return r.results.map(x => JSON.parse(x.data));
  }
  return Array.from(mem.orders.values()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,limit);
}
async function dbGetStock(env, mem) {
  if (env && env.DB) {
    const r = await env.DB.prepare('SELECT id, qty FROM stock').all();
    if (r.results.length) { const m={}; r.results.forEach(x=>m[x.id]=x.qty); return m; }
  }
  if (mem.stock.size === 0) DEFAULT_STOCK && Object.keys(DEFAULT_STOCK).forEach(k=>mem.stock.set(k,DEFAULT_STOCK[k]));
  const m={}; mem.stock.forEach((v,k)=>m[k]=v); return m;
}
async function dbSetStock(env, mem, id, qty) {
  if (env && env.DB) await env.DB.prepare('INSERT OR REPLACE INTO stock (id,qty) VALUES (?,?)').bind(id,qty).run();
  else mem.stock.set(id, qty);
}

/* ---------- 商品数据访问 ---------- */
/* 规格表归一化：只保留 k/v 均为非空字符串的项，兼容 {k,v} 与 {label,value} 两种写法
   k 使用 spec_* 形式的规格键（如 spec_length），显示时按当前语言翻译标签
   vEn 为可选英文值；缺失时英文站回退中文值（尺寸数字本身通用） */
function normalizeSpecs(input) {
  if (!Array.isArray(input)) return [];
  return input.map(it => {
    if (!it || typeof it !== 'object') return null;
    const k = String(it.k ?? it.label ?? it.key ?? '').trim();
    const v = String(it.v ?? it.value ?? '').trim();
    if (!k || !v) return null;
    const out = { k, v };
    const vEn = String(it.vEn ?? '').trim();
    if (vEn) out.vEn = vEn;
    return out;
  }).filter(Boolean);
}
/* SKU 选项图：{ 规格键: { 选项值: 图片URL } }，后台编辑后随商品一起保存 */
function normalizeSkuImages(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  Object.keys(input).forEach(k => {
    const group = input[k];
    if (!group || typeof group !== 'object' || Array.isArray(group)) return;
    const g = {};
    Object.keys(group).forEach(v => {
      const src = String(group[v] ?? '').trim();
      if (src) g[v] = src;
    });
    if (Object.keys(g).length) out[k] = g;
  });
  return out;
}
/* SKU 组合矩阵：组合名 + 价格 + 库存 + 缩略图
   （1688 采集时一个商品常有多条可售组合，每条自己的价格和库存） */
function normalizeSkus(input) {
  if (!Array.isArray(input)) return [];
  const out = [], seen = {};
  input.forEach(s => {
    if (!s || typeof s !== 'object') return;
    const name = String(s.name || '').trim().slice(0, 60);
    if (!name || seen[name]) return;
    seen[name] = 1;
    out.push({
      name,
      price: Number(s.price) > 0 ? Number(s.price) : 0,
      stock: Number(s.stock) > 0 ? Math.floor(Number(s.stock)) : 0,
      image: typeof s.image === 'string' ? s.image : ''
    });
  });
  return out.slice(0, 60);
}
/* ---------- 多站点（site） ----------
   每条商品 / 草稿 / 订单都带 site 字段；历史数据没有该字段的一律归到默认站点，
   这样以后接第二个、第三个独立站时，只靠 site 字段就能把数据分开。 */
const DEFAULT_SITE = 'lumiere';
function siteOf(rec){ return String((rec && rec.site) || DEFAULT_SITE); }
function inSite(rec, site){ return siteOf(rec) === String(site || DEFAULT_SITE); }

async function dbListProducts(env, mem) {
  if (env && env.DB) {
    const r = await env.DB.prepare('SELECT data FROM products ORDER BY created_at DESC').all();
    return r.results.map(x => JSON.parse(x.data));
  }
  return Array.from((mem.products || (mem.products = new Map())).values())
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
async function dbGetProduct(env, mem, id) {
  if (env && env.DB) { const r = await env.DB.prepare('SELECT data FROM products WHERE id=?').bind(id).first(); return r ? JSON.parse(r.data) : null; }
  return (mem.products || (mem.products = new Map())).get(id) || null;
}
async function dbPutProduct(env, mem, p) {
  if (env && env.DB) {
    await env.DB.prepare('INSERT OR REPLACE INTO products (id,data,title,price,created_at) VALUES (?,?,?,?,?)')
      .bind(p.id, JSON.stringify(p), p.name || '', p.price || 0, p.createdAt || new Date().toISOString()).run();
  } else { (mem.products || (mem.products = new Map())).set(p.id, p); }
}

/* 默认商品（与前端 products.js 一致，首次 GET 时播种） */
const SEED_PRODUCTS = [
  { id:'LUM-W01', name:'丝绒系列 · 静音按摩器', category:'women', badge:'热销', price:399, material:'医用级液态硅胶', size:'全长 18 cm · 直径 3.2 cm', noise:'≤ 40 分贝', waterproof:'IPX7 全身防水', battery:'USB 充电 · 续航 120 分钟', features:['10 档变频','亲肤硅胶','静音设计','全身防水'], desc:'以细腻丝绒触感包裹，10 档频率由轻柔到澎湃。' },
  { id:'LUM-W02', name:'花瓣系列 · 双头按摩棒', category:'women', badge:'新品', price:529, material:'食品级硅胶 + ABS', size:'全长 22 cm', noise:'≤ 45 分贝', waterproof:'IPX7 全身防水', battery:'磁吸充电 · 续航 150 分钟', features:['双头独立控制','可弯曲贴合','磁吸充电'], desc:'双头可独立控制，温柔与力量可同时抵达。' },
  { id:'LUM-W03', name:'月相系列 · 吸吮按摩器', category:'women', badge:'', price:459, material:'医用级硅胶', size:'高 12 cm', noise:'≤ 42 分贝', waterproof:'IPX7 全身防水', battery:'USB 充电 · 续航 90 分钟', features:['脉冲气流','5 档强度','便携轻巧'], desc:'脉冲气流带来全新体验，非接触式设计更温柔。' },
  { id:'LUM-M01', name:'曜石系列 · 飞机杯', category:'men', badge:'', price:349, material:'TPE 安全材质', size:'长 16 cm', noise:'静音', waterproof:'可水洗内腔', battery:'无需电池', features:['立体纹理','可伸缩内腔','附赠润滑'], desc:'立体纹理与可伸缩内腔带来层次丰富的体验。' },
  { id:'LUM-M02', name:'环礁系列 · 震动环', category:'men', badge:'', price:199, material:'食品级硅胶', size:'内径 4.5 cm', noise:'≤ 38 分贝', waterproof:'IPX7 全身防水', battery:'USB 充电 · 续航 60 分钟', features:['7 档震动','弹性贴合','延时设计'], desc:'柔软弹性环身贴合不压迫，7 档震动随心调节。' },
  { id:'LUM-M03', name:'远山系列 · 按摩膏', category:'men', badge:'', price:89, material:'水基配方 · 温和无刺激', size:'容量 100 ml', noise:'—', waterproof:'—', battery:'—', features:['水基易清洗','不黏腻','可搭配玩具'], desc:'水基配方温和不刺激，清爽不黏腻。' },
  { id:'LUM-C01', name:'双人系列 · 遥控按摩器', category:'couples', badge:'', price:599, material:'医用级硅胶', size:'机身 9 cm', noise:'≤ 40 分贝', waterproof:'IPX7 全身防水', battery:'USB 充电 · 续航 180 分钟', features:['无线遥控','双人同享','静音防水'], desc:'无线遥控设计，把主动权交给彼此。' },
  { id:'LUM-C02', name:'共鸣系列 · 情侣按摩油', category:'couples', badge:'', price:189, material:'植物精油复配', size:'容量 50 ml', noise:'—', waterproof:'—', battery:'—', features:['温感配方','植物精油','浪漫香氛'], desc:'温感植物精油配方，轻柔按摩间舒缓身心。' },
  { id:'LUM-H01', name:'净护系列 · 玩具清洁液', category:'health', badge:'', price:69, material:'中性 pH 清洁配方', size:'容量 200 ml', noise:'—', waterproof:'—', battery:'—', features:['中性 pH','快速杀菌','无残留'], desc:'专为成人用品设计的中性清洁液。' },
  { id:'LUM-H02', name:'珍藏系列 · 丝绒收纳袋', category:'health', badge:'', price:79, material:'亲肤绒布 · 抽绳封口', size:'20 × 12 cm', noise:'—', waterproof:'—', battery:'—', features:['遮光防尘','柔软绒布','低调私密'], desc:'柔软绒布内衬，遮光防尘，低调外观。' },
  { id:'LUM-W04', name:'流光系列 · 加温按摩棒', category:'women', badge:'新品', price:629, material:'医用级硅胶', size:'全长 20 cm', noise:'≤ 42 分贝', waterproof:'IPX7 全身防水', battery:'USB 充电', features:['恒温加热','可弯曲机身','8 档震动'], desc:'恒温加热功能，模拟真实体温。' },
  { id:'LUM-M04', name:'绅士系列 · 延时喷剂', category:'men', badge:'', price:159, material:'草本温和配方', size:'容量 15 ml', noise:'—', waterproof:'—', battery:'—', features:['温和配方','自然延时','不麻木'], desc:'草本温和配方，自然舒缓。' }
];

/* 只在库真正「第一次为空」时播种。
   以前是「列表为空就播种」，后台把商品全删掉后，下一次读列表立刻又把 12 个演示商品塞回来，
   用户看到的现象就是「点了全部删除还在」。现在用 settings.seededAt 记一笔：播过一次就不再播。 */
async function ensureSeedProducts(env, mem) {
  const list = await dbListProducts(env, mem);
  if (list.length) {
    /* 有商品就把标记补齐，避免以后删空时又触发播种 */
    const s0 = await dbGetSettings(env, mem);
    if (!s0.seededAt) await dbPutSettings(env, mem, Object.assign({}, s0, { seededAt: new Date().toISOString() }));
    return;
  }
  const s = await dbGetSettings(env, mem);
  if (s && s.seededAt) return;
  for (const p of SEED_PRODUCTS) {
    const item = { ...p, site: DEFAULT_SITE, createdAt: new Date().toISOString(), image: '' };
    await dbPutProduct(env, mem, item);
  }
  await dbPutSettings(env, mem, Object.assign({}, s, { seededAt: new Date().toISOString() }));
}

/* ---------- 站点设置（支付开关 / 联系方式 / 聊天开关） ---------- */
const DEFAULT_SETTINGS = {
  /* 支付总开关：关掉后结账页禁止下单，改为引导联系客服 */
  paymentEnabled: true,
  /* 各支付渠道独立开关（前端按此过滤，地区默认列表作参考） */
  payments: {
    cod:    { enabled: true },
    card:   { enabled: true },
    crypto: { enabled: true }
  },
  /* 站内聊天总开关 */
  chatEnabled: true,
  /* 联系方式（后台可改） */
  contact: {
    email: 'care@lumiere.store',
    whatsapp: '',
    hours: '7×24',
    responseHours: 12,
    wechat: ''
  },
  updatedAt: null
};

function mergeSettings(base, patch) {
  const out = JSON.parse(JSON.stringify(base));
  if (!patch || typeof patch !== 'object') return out;
  Object.keys(patch).forEach(k => {
    if (k === 'payments' && patch.payments && typeof patch.payments === 'object') {
      Object.keys(patch.payments).forEach(ch => {
        out.payments[ch] = Object.assign({}, out.payments[ch] || {}, patch.payments[ch] || {});
        out.payments[ch].enabled = !!out.payments[ch].enabled;
      });
    } else if (k === 'contact' && patch.contact && typeof patch.contact === 'object') {
      out.contact = Object.assign({}, out.contact, patch.contact);
    } else if (k !== 'updatedAt') {
      out[k] = patch[k];
    }
  });
  return out;
}

async function dbGetSettings(env, mem) {
  let saved = null;
  if (env && env.DB) {
    const r = await env.DB.prepare('SELECT data FROM settings WHERE id=?').bind('site').first();
    if (r) saved = JSON.parse(r.data);
  } else {
    saved = mem.settings || null;
  }
  return saved ? mergeSettings(DEFAULT_SETTINGS, saved) : JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}
async function dbPutSettings(env, mem, next) {
  next.updatedAt = new Date().toISOString();
  if (env && env.DB) {
    await env.DB.prepare('INSERT OR REPLACE INTO settings (id,data) VALUES (?,?)').bind('site', JSON.stringify(next)).run();
  } else mem.settings = next;
  return next;
}

/* ---------- 站内聊天 / 留言 ---------- */
function chatId() { return 'CH' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

async function dbListChats(env, mem, limit = 100) {
  if (env && env.DB) {
    const r = await env.DB.prepare('SELECT data FROM chats ORDER BY last_at DESC LIMIT ?').bind(limit).all();
    return r.results.map(x => JSON.parse(x.data));
  }
  return Array.from((mem.chats || (mem.chats = new Map())).values())
    .sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || ''))).slice(0, limit);
}
async function dbGetChat(env, mem, id) {
  if (env && env.DB) { const r = await env.DB.prepare('SELECT data FROM chats WHERE id=?').bind(id).first(); return r ? JSON.parse(r.data) : null; }
  return (mem.chats || (mem.chats = new Map())).get(id) || null;
}
async function dbPutChat(env, mem, c) {
  if (env && env.DB) {
    await env.DB.prepare('INSERT OR REPLACE INTO chats (id,data,last_at) VALUES (?,?,?)').bind(c.id, JSON.stringify(c), c.lastAt || '').run();
  } else (mem.chats || (mem.chats = new Map())).set(c.id, c);
}
async function dbDelChat(env, mem, id) {
  if (env && env.DB) await env.DB.prepare('DELETE FROM chats WHERE id=?').bind(id).run();
  else (mem.chats || (mem.chats = new Map())).delete(id);
}

export async function handleApi({ method, path, body, request, env, mem, site, admin }) {
  const SITE = String(site || DEFAULT_SITE);
  /* ===== 商品管理 ===== */
  /* 商品列表（公开，前端也读它） */
  if (path === '/api/products' && method === 'GET') {
    await ensureSeedProducts(env, mem);
    const all = await dbListProducts(env, mem);
    /* 后台下架的商品（active === false）对顾客不可见：前台列表直接过滤掉；
       后台带 X-Admin-Key 访问则照常返回，方便重新上架 */
    const visible = admin ? all : all.filter(x => x.active !== false);
    /* 后台商品管理的「全部站点」页签：跨站列出，每条带上归属站点 */
    if (SITE === 'all') {
      const allList = visible.map(x => Object.assign({}, x, { site: siteOf(x) }));
      return { data: { total: allList.length, products: allList, site: 'all' } };
    }
    const list = visible.filter(x => inSite(x, SITE));
    return { data: { total: list.length, products: list, site: SITE } };
  }
  /* 创建商品 */
  if (path === '/api/products' && method === 'POST') {
    if (!body || !body.name || !body.category) return { status:400, data:{ error:'需要 name 和 category' } };
    const id = (body.id || ('LUM-' + Date.now().toString().slice(-8))).toUpperCase().replace(/[^A-Z0-9-]/g,'');
    if (await dbGetProduct(env, mem, id)) return { status:409, data:{ error:'SKU 已存在', id } };
    const p = {
      id, name: body.name, nameEn: body.nameEn || '', descEn: body.descEn || '',
      detail: body.detail || '', detailEn: body.detailEn || '',
      gallery: Array.isArray(body.gallery) ? body.gallery.filter(x => typeof x === 'string' && x) : [],
      /* 结构化规格表：[{ k:'长度', v:'19.1 cm' }, ...]，逐项展示每个规格尺寸 */
      specs: normalizeSpecs(body.specs),
      /* SKU 颜色/款式选项对应的真实商品图，后台编辑，前端详情页读取 */
      skuImages: normalizeSkuImages(body.skuImages),
      /* SKU 组合矩阵（可售单元）：组合名 + 价格 + 库存 + 图 */
      skus: normalizeSkus(body.skus),
      /* SKU 销售属性选项组：颜色分类/尺码等，每个组里多个选项 */
      skuOptions: Array.isArray(body.skuOptions) ? body.skuOptions : [],
      /* 采集诊断：SKU 没采到时的页面结构快照 */
      skuDiag: body.skuDiag || null,
      site: body.site || SITE,
      category: body.category, badge: body.badge || '',
      price: Number(body.price) || 0,
      theme: body.theme || '#EEEDFE', fg: body.fg || '#7F77DD', accent: body.accent || '#CECBF6', variant: Number(body.variant)||0,
      image: body.image || '',   /* base64 data URL 或外部 URL，空则前端生成抽象图 */
      material: body.material || '—', size: body.size || '—', noise: body.noise || '—',
      waterproof: body.waterproof || '—', battery: body.battery || '—',
      /* 物流与溯源信息：详情页「规格参数」标签页用 */
      pack: body.pack || '—', weight: body.weight || '—',
      origin: body.origin || '—', packaging: body.packaging || '—',
      features: Array.isArray(body.features) ? body.features : [],
      desc: body.desc || '',
      /* 逐语言字段覆盖，形如 { en: { material:'...', size:'...' } }，
         用于给后台新增商品补外语规格；未填的语言回退中/英字段 */
      i18n: (body.i18n && typeof body.i18n === 'object') ? body.i18n : {},
      /* 采集来源留档：哪个平台链接、什么时候采集入库 */
      sourceUrl: body.sourceUrl || '', collectedAt: body.collectedAt || '',
      createdAt: new Date().toISOString()
    };
    await dbPutProduct(env, mem, p);
    await dbSetStock(env, mem, id, Number(body.stock) || 0);  /* 自动建库存 */
    return { status:201, data:{ ok:true, product:p } };
  }
  /* 更新商品 */
  if (path.startsWith('/api/products/') && method === 'PUT') {
    const id = path.split('/').pop();
    const p = await dbGetProduct(env, mem, id);
    if (!p || !inSite(p, SITE)) return { status:404, data:{ error:'not found' } };
    body = body || {};
    const fields = ['name','nameEn','descEn','detail','detailEn','gallery','specs','category','badge','price','theme','fg','accent','variant','image','material','size','noise','waterproof','battery','features','desc','i18n','pack','weight','origin','packaging','packEn','weightEn','originEn','packagingEn','sourceUrl','collectedAt','active','skuOptions','skuDiag'];
    fields.forEach(f => { if (body[f] !== undefined) p[f] = body[f]; });
    if (body.specs !== undefined) p.specs = normalizeSpecs(body.specs);
    if (body.skuImages !== undefined) p.skuImages = normalizeSkuImages(body.skuImages);
    if (body.skus !== undefined) p.skus = normalizeSkus(body.skus);
    if (body.price !== undefined) p.price = Number(body.price);
    p.updatedAt = new Date().toISOString();
    await dbPutProduct(env, mem, p);
    if (body.stock !== undefined) await dbSetStock(env, mem, id, Math.max(0, Number(body.stock)||0));
    return { data:{ ok:true, product:p } };
  }
  /* 删除商品 */
  if (path.startsWith('/api/products/') && method === 'DELETE') {
    const id = path.split('/').pop();
    const p = await dbGetProduct(env, mem, id);
    if (!p || !inSite(p, SITE)) return { status:404, data:{ error:'not found' } };
    if (env && env.DB) await env.DB.prepare('DELETE FROM products WHERE id=?').bind(id).run();
    else (mem.products || (mem.products = new Map())).delete(id);
    /* 连带清掉该 SKU 的库存，避免删商品后残留孤立库存 */
    if (env && env.DB) await env.DB.prepare('DELETE FROM stock WHERE id=?').bind(id).run();
    else if (mem.stock && mem.stock.delete) mem.stock.delete(id);
    return { data:{ ok:true, id } };
  }

  /* 创建订单（提交订单：进入「待审核」队列，人工审核通过后才生成付款单） */
  if (path === '/api/order' && method === 'POST') {
    if (!body || !body.items || !body.customer || !body.total) return { status:400, data:{ error:'missing fields' } };
    const c = body.customer || {};
    /* 真实邮箱与收货地址：必填项 + 邮箱格式校验 */
    const name = String(c.name || '').trim();
    const email = String(c.email || '').trim();
    const addr = String(c.addr || '').trim();
    const city = String(c.city || '').trim();
    const stateName = String(c.state || '').trim();
    const district = String(c.district || '').trim();
    const country = String(c.country || '').trim();
    const phone = String(c.phone || '').trim();
    if (!name) return { status:400, data:{ error:'name required', field:'name' } };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { status:400, data:{ error:'invalid email', field:'email' } };
    if (!country) return { status:400, data:{ error:'country required', field:'country' } };
    if (!stateName) return { status:400, data:{ error:'state required', field:'state' } };
    if (!city) return { status:400, data:{ error:'city required', field:'city' } };
    /* 中国必须填到区/县三级 */
    if (country === 'CN' && !district) return { status:400, data:{ error:'district required', field:'district' } };
    /* 详细地址至少 6 个字符，必须写到门牌号 */
    if (addr.length < 6) return { status:400, data:{ error:'address too short, include street and house number', field:'addr' } };
    if (!phone) return { status:400, data:{ error:'phone required', field:'phone' } };
    const id = newId();
    const order = {
      id,
      customer: {
        name, email, addr,
        addr2: String(c.addr2 || '').trim(),
        city,
        state: stateName,
        district,
        zip: String(c.zip || '').trim(),
        country,
        countryName: String(c.countryName || '').trim(),
        phone
      },
      items: body.items,
      total: body.total,
      currency: body.currency || 'USD',
      payment: body.payment || 'crypto',
      lang: body.lang || 'en',
      site: body.site || SITE,
      status: 'pending',                /* 待审核 */
      history: [{ status: 'pending', at: new Date().toISOString(), note: '订单已提交，等待审核' }],
      createdAt: new Date().toISOString()
    };
    await dbPutOrder(env, mem, order);
    return { status:201, data:{ ok:true, orderId:id, order } };
  }

  /* 查询单个订单 */
  if (path.startsWith('/api/order/') && method === 'GET') {
    const id = path.split('/').pop();
    const order = await dbGetOrder(env, mem, id);
    if (order && !inSite(order, SITE)) return { status:404, data:{ error:'not found' } };
    return order ? { data: order } : { status:404, data:{ error:'not found' } };
  }

  /* 订单列表（管理）：支持按状态筛选 + 状态计数 */
  if (path === '/api/orders' && method === 'GET') {
    const rawUrl = (request && request.url) || '';
    const qIndex = rawUrl.indexOf('?');
    const query = qIndex >= 0 ? rawUrl.slice(qIndex + 1) : '';
    const params = new URLSearchParams(query);
    const limit = Math.min(parseInt(params.get('limit') || '50', 10), 200);
    const statusFilter = params.get('status') || 'all';
    const all = (await dbListOrders(env, mem, 10000)).filter(o => inSite(o, SITE));
    /* 各状态计数（后台筛选标签用） */
    const counts = {};
    STATUS_KEYS.forEach(k => { counts[k] = 0; });
    all.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
    const orders = (statusFilter === 'all' ? all : all.filter(o => o.status === statusFilter)).slice(0, limit);
    return { data:{ total: all.length, counts, status: statusFilter, orders } };
  }

  /* 支付回调 */
  if (path === '/api/payment/callback' && method === 'POST') {
    const secret = env && env.PAYMENT_SECRET;
    const sig = request.headers.get ? request.headers.get('X-Payment-Signature') : (body && body.signature);
    if (!(await verify(secret, body, sig))) return { status:401, data:{ error:'invalid signature' } };
    const { orderId, status } = body || {};
    if (!orderId) return { status:400, data:{ error:'missing orderId' } };
    const order = await dbGetOrder(env, mem, orderId);
    if (!order) return { status:404, data:{ error:'not found' } };
    order.status = status || 'paid';
    order.paidAt = new Date().toISOString();
    order.history = order.history || [];
    order.history.push({ status: order.status, at: order.paidAt, note: '支付回调' });
    if (order.status === 'paid' && Array.isArray(order.items)) {
      for (const it of order.items) {
        const stock = await dbGetStock(env, mem);
        if (typeof stock[it.id] === 'number') {
          await dbSetStock(env, mem, it.id, Math.max(0, stock[it.id] - (it.qty||1)));
        }
      }
    }
    await dbPutOrder(env, mem, order);
    return { data:{ ok:true, orderId, status: order.status } };
  }

  /* 仪表盘统计（管理） */
  if (path === '/api/stats' && method === 'GET') {
    const orders = (await dbListOrders(env, mem, 10000)).filter(o => inSite(o, SITE));
    const products = (await dbListProducts(env, mem)).filter(x => inSite(x, SITE));
    const allStock = await dbGetStock(env, mem);
    const stock = {};
    Object.keys(allStock).forEach(id => { if (products.some(p => p.id === id)) stock[id] = allStock[id]; });
    const revenue = orders.reduce((s, o) => s + (o.status === 'paid' || o.status === 'shipped' || o.status === 'completed' ? (o.total || 0) : 0), 0);
    const byStatus = {};
    STATUS_KEYS.forEach(k => { byStatus[k] = 0; });
    orders.forEach(o => { if (byStatus[o.status] !== undefined) byStatus[o.status]++; });
    const byCountry = {};
    orders.forEach(o => { const c = (o.customer && o.customer.country) || 'UN'; byCountry[c] = (byCountry[c] || 0) + 1; });
    const lowStock = Object.entries(stock).filter(([, q]) => q <= 30).map(([id, q]) => ({ id, qty: q }));
    return { data: {
      totalOrders: orders.length, byStatus, revenue, revenueCurrency: 'CNY',
      skuCount: Object.keys(stock).length, stockTotal: Object.values(stock).reduce((a, b) => a + b, 0),
      lowStock, byCountry, countries: Object.keys(byCountry).length
    } };
  }

  /* 更新订单状态（管理）：按状态机流转，非法流转直接拒绝 */
  if (path.startsWith('/api/order/') && method === 'PATCH') {
    const id = path.split('/').pop();
    const order = await dbGetOrder(env, mem, id);
    if (!order || !inSite(order, SITE)) return { status: 404, data: { error: 'not found' } };
    const status = body && body.status;
    if (!STATUS_KEYS.includes(status)) return { status: 400, data: { error: 'invalid status', allowed: STATUS_KEYS } };
    const from = order.status || 'pending';
    if (!canTransit(from, status)) {
      return { status: 400, data: { error: 'illegal transition', from, to: status, allowed: (ORDER_STATUS[from] || {}).next || [] } };
    }
    order.status = status;
    const now = new Date().toISOString();
    if (status === 'approved')   order.approvedAt = now;
    if (status === 'awaiting_payment') order.awaitingPaymentAt = now;
    if (status === 'paid')       order.paidAt = order.paidAt || now;
    if (status === 'shipped')    order.shippedAt = now;
    if (status === 'completed')  order.completedAt = now;
    if (status === 'cancelled')  order.cancelledAt = now;
    order.history = order.history || [];
    /* 每次流转都记录说明，后台「状态流转记录」可读；后台可传 note 覆盖 */
    const defaultNote = ({
      pending:    '订单已提交，等待审核',
      approved:   '审核通过，进入待付款',
      awaiting_payment: '等待买家付款',
      paid:       '已收到付款',
      shipped:    '已发货',
      completed:  '订单完成',
      cancelled:  '订单已取消'
    })[status] || '';
    order.history.push({ status, at: now, note: (body && body.note) || defaultNote });
    await dbPutOrder(env, mem, order);
    return { data: { ok: true, id, status } };
  }

  /* 库存查询 */
  if (path === '/api/stock' && method === 'GET') {
    const all = await dbGetStock(env, mem);
    /* SITE === 'all'：后台商品管理跨站视图要所有商品的库存 */
    const ids = new Set((await dbListProducts(env, mem))
      .filter(x => SITE === 'all' || inSite(x, SITE)).map(x => x.id));
    const out = {};
    Object.keys(all).forEach(id => { if (ids.has(id)) out[id] = all[id]; });
    return { data: out };
  }

  /* 设置库存绝对值（管理） */
  if (path.startsWith('/api/stock/') && method === 'PUT') {
    const id = path.split('/').pop();
    const stock = await dbGetStock(env, mem);
    const pr = await dbGetProduct(env, mem, id);
    if (pr && !inSite(pr, SITE)) return { status: 404, data: { error: 'sku not found' } };
    if (typeof stock[id] !== 'number' && !(body && body.create)) return { status: 404, data: { error: 'sku not found' } };
    const qty = Math.max(0, parseInt((body && body.qty) || 0, 10));
    await dbSetStock(env, mem, id, qty);
    return { data: { ok: true, id, qty } };
  }

  /* 库存扣减 */
  if (path.startsWith('/api/stock/') && method === 'PATCH') {
    const id = path.split('/').pop();
    const stock = await dbGetStock(env, mem);
    const pr = await dbGetProduct(env, mem, id);
    if (pr && !inSite(pr, SITE)) return { status:404, data:{ error:'sku not found' } };
    if (typeof stock[id] !== 'number') return { status:404, data:{ error:'sku not found' } };
    const qty = Math.max(0, stock[id] - (body && body.qty || 1));
    await dbSetStock(env, mem, id, qty);
    return { data:{ ok:true, id, qty } };
  }

  /* ===== 站点设置 ===== */
  if (path === '/api/settings' && method === 'GET') {
    return { data: await dbGetSettings(env, mem) };
  }
  if (path === '/api/settings' && method === 'PATCH') {
    const cur = await dbGetSettings(env, mem);
    const next = mergeSettings(cur, body || {});
    await dbPutSettings(env, mem, next);
    return { data: { ok: true, settings: next } };
  }

  /* ===== 站内聊天 / 联系留言 ===== */
  const qs = (() => {
    const raw = (request && request.url) || '';
    const i = raw.indexOf('?');
    return new URLSearchParams(i >= 0 ? raw.slice(i + 1) : '');
  })();

  /* 访客：取某个会话的消息（凭随机 sessionId，无需登录） */
  if (path === '/api/chat/messages' && method === 'GET') {
    const sid = qs.get('sessionId');
    if (!sid) return { status: 400, data: { error: 'missing sessionId' } };
    const c = await dbGetChat(env, mem, sid);
    if (!c) return { data: { sessionId: sid, messages: [], exists: false } };
    return { data: { sessionId: sid, exists: true, type: c.type, messages: c.messages || [], staffRead: !!c.staffRead } };
  }

  /* 访客：发送消息（无 sessionId 则新建会话；带型别 contact 时作为留言工单） */
  if (path === '/api/chat/message' && method === 'POST') {
    if (!body || !body.text || !String(body.text).trim()) return { status: 400, data: { error: 'empty message' } };
    const text = String(body.text).trim().slice(0, 2000);
    let c = body.sessionId ? await dbGetChat(env, mem, body.sessionId) : null;
    const now = new Date().toISOString();
    if (!c) {
      c = {
        id: chatId(),
        type: body.type === 'contact' ? 'contact' : 'chat',
        name: (body.name || '').slice(0, 60),
        email: (body.email || '').slice(0, 120),
        subject: (body.subject || '').slice(0, 120),
        lang: body.lang || 'zh',
        country: body.country || '',
        createdAt: now,
        messages: [],
        unread: 0,
        staffRead: false,
        lastAt: now
      };
    }
    c.messages.push({ from: 'user', text, ts: now });
    c.unread = (c.unread || 0) + 1;
    c.staffRead = false;
    c.lastAt = now;
    if (body.name && !c.name) c.name = String(body.name).slice(0, 60);
    if (body.email && !c.email) c.email = String(body.email).slice(0, 120);
    await dbPutChat(env, mem, c);
    return { status: 201, data: { ok: true, sessionId: c.id, message: c.messages[c.messages.length - 1] } };
  }

  /* 后台：会话列表 */
  if (path === '/api/chat/sessions' && method === 'GET') {
    const list = await dbListChats(env, mem, 200);
    return { data: {
      total: list.length,
      unread: list.reduce((s, c) => s + (c.unread || 0), 0),
      sessions: list.map(c => ({
        id: c.id, type: c.type, name: c.name, email: c.email, subject: c.subject,
        lang: c.lang, country: c.country, unread: c.unread || 0,
        lastAt: c.lastAt, createdAt: c.createdAt,
        last: (c.messages || []).length ? c.messages[c.messages.length - 1].text.slice(0, 80) : ''
      }))
    } };
  }

  /* 后台：取单个会话全部消息 */
  if (path === '/api/chat/session' && method === 'GET') {
    const sid = qs.get('id');
    const c = sid ? await dbGetChat(env, mem, sid) : null;
    if (!c) return { status: 404, data: { error: 'not found' } };
    return { data: c };
  }

  /* 后台：回复 */
  if (path === '/api/chat/reply' && method === 'POST') {
    if (!body || !body.sessionId || !body.text) return { status: 400, data: { error: 'missing fields' } };
    const c = await dbGetChat(env, mem, body.sessionId);
    if (!c) return { status: 404, data: { error: 'not found' } };
    const now = new Date().toISOString();
    c.messages.push({ from: 'staff', text: String(body.text).trim().slice(0, 2000), ts: now });
    c.unread = 0;
    c.lastAt = now;
    await dbPutChat(env, mem, c);
    return { data: { ok: true, sessionId: c.id } };
  }

  /* 后台：标记已读 / 删除会话 */
  if (path === '/api/chat/read' && method === 'PATCH') {
    const c = body && body.sessionId ? await dbGetChat(env, mem, body.sessionId) : null;
    if (!c) return { status: 404, data: { error: 'not found' } };
    c.unread = 0; c.staffRead = true;
    await dbPutChat(env, mem, c);
    return { data: { ok: true } };
  }
  if (path.startsWith('/api/chat/session/') && method === 'DELETE') {
    const id = path.split('/').pop();
    await dbDelChat(env, mem, id);
    return { data: { ok: true, id } };
  }

  return { status:404, data:{ error:'not found' } };
}
