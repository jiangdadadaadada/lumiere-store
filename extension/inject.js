/* ============================================================
   LUMIÈRE 采集器 · 页面解析器（被 background 注入到目标页）
   ---------------------------------------------------------
   这个文件通过 chrome.scripting.executeScript({files:[...]}) 注入，
   在目标页上下文运行 —— 天然带着用户登录 Cookie，同源 fetch 不受 CORS。
   它只负责「把当前页面读成结构化商品数据」，采集调度由 background.js 负责。

   暴露 window.__LUM_COLLECT__ = { list, detail, diag }
   ============================================================ */
(() => {
  'use strict';

  /* ★ 版本化覆盖：OLD 解析器若版本不同就允许新版覆盖它。
     之前这里直接 return，导致同一页面反复采集永远用第一次注入的旧解析器 ——
     扩展版本升到 z、页面里却还是几小时前的代码，改了等于没改。 */
  const INJECT_BUILD = '20261124a';
  if (window.__LUM_COLLECT__ && window.__LUM_COLLECT__.__build === INJECT_BUILD) return;

  /* ---------------- 通用工具 ---------------- */

  /* ★ 必须跑在页面主世界（MAIN world）★★
     隔离世界（ISOLATED world）里 window 是沙箱化的，
     页面主世界的 window.detailData / window.offerData 等内嵌数据**读不到**。
     1688 新版页面的标题/价格/图片大量就放在这些内嵌变量里，
     所以这里靠 background 用 world:'MAIN' 注入来拿到真实数据。
     （本文件不使用任何 chrome.* API，可以安全跑在主世界） */

  /* HTML 实体解码：&amp; → & ，避免 URL 被截断 */
  const decodeEnt = (s) => {
    if (!s || s.indexOf('&') < 0) return s || '';
    return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, g) => {
      if (g[0] === '#') {
        const code = g[1] === 'x' || g[1] === 'X'
          ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
        return isNaN(code) ? m : String.fromCharCode(code);
      }
      const MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
      return MAP[g.toLowerCase()] !== undefined ? MAP[g.toLowerCase()] : m;
    });
  };

  const norm = (u) => {
    u = decodeEnt(String(u || '').trim());
    if (!u) return '';
    if (u.indexOf('//') === 0) u = location.protocol + u;
    try { return new URL(u, location.href).href; } catch (e) { return u; }
  };

  const txt = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const metaOf = (name) => {
    const el = document.querySelector(`meta[property="${name}"],meta[name="${name}"],meta[itemprop="${name}"]`);
    return el ? (el.getAttribute('content') || '') : '';
  };

  /* 价格归一化：0 / 0.00 / 负数 / 带逗号的文本都不算有效价。
     ★ 关键：1688 内嵌对象里常有 price:"0" 占位，旧逻辑一旦读到 "0"
       就因为字符串非空而跳过后面所有兜底，后台价格永远显示 0.00。 */
  const cleanPrice = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return isFinite(v) && v > 0 && v < 1e7 ? String(v) : '';
    const s = String(v).replace(/,/g, '').trim();
    const m = /([\d]+(?:\.\d{1,2})?)/.exec(s);
    if (!m) return '';
    const n = Number(m[1]);
    return isFinite(n) && n > 0 && n < 1e7 ? m[1] : '';
  };

  /* 1688 / 淘宝缩略图 → 原图
     111.jpg_60x60.jpg → 111.jpg ； abc_50x50.jpg → abc.jpg */
  const cleanImg = (u) => {
    u = norm(u);
    if (!u) return '';
    const q = (u.match(/\?.*$/) || [''])[0];
    let p = u.split('?')[0];
    const m = p.match(/^(.*?)_\d+x\d+(xz)?(\.[a-z0-9]{3,4})?$/i);
    if (m) {
      const base = m[1], ext = m[3] || '';
      p = /\.[a-z0-9]{3,4}$/i.test(base) ? base : base + ext;
    } else {
      p = p.replace(/\._(\.[a-z0-9]{3,4})$/i, '$1');
    }
    p = p.replace(/\.(jpg|jpeg|png|webp)\.(jpg|jpeg|png|webp)$/i, '.$1');
    return p + q;
  };

  const pickImgSrc = (el) => {
    if (!el) return '';
    const u = imgUrlOf(el);
    return cleanImg(decodeEnt(u));
  };

  /* 页面内嵌 JSON（1688 detailData / __INIT_DATA__ 等）*/
  const EMBED_VARS = ['detailData', '__INIT_DATA__', 'offerData', '__NEXT_DATA__',
    '__PAGE_DATA__', 'initialData', '__INITIAL_STATE__', '__APOLLO_STATE__', '__NUXT__'];

  function readEmbedded() {
    for (const name of EMBED_VARS) {
      try {
        const v = window[name];
        if (v && typeof v === 'object') return v;
      } catch (e) {}
    }
    /* 从 HTML 文本里抠出来 */
    const html = document.documentElement.outerHTML;
    for (const name of EMBED_VARS) {
      const re = new RegExp('(?:window\\.)?' + name.replace(/\./g, '\\.') + '\\s*=\\s*\\{');
      const m = re.exec(html);
      if (!m) continue;
      const start = html.indexOf('{', m.index);
      let depth = 0, end = -1, inStr = false, q = '';
      for (let i = start; i < html.length && i - start < 4000000; i++) {
        const ch = html.charAt(i);
        if (inStr) { if (ch === '\\') { i++; continue; } if (ch === q) { inStr = false; continue; } }
        if (ch === '"' || ch === "'") { inStr = true; q = ch; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end > 0) {
        try { return JSON.parse(html.slice(start, end)); } catch (e) {}
      }
    }
    return null;
  }

  /* 从任意 JSON 对象递归找字段 */
  function pickField(obj, out, depth) {
    if (!obj || depth > 6 || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const it of obj) pickField(it, out, depth + 1);
      return;
    }
    if (!out.name) {
      const n = obj.title || obj.subject || obj.offerTitle || obj.productTitle || obj.name;
      if (typeof n === 'string' && n.length > 3 && !/^(首页|店铺|全部商品|淘宝网)/.test(n)) out.name = n;
    }
    if (!out.price) {
      /* ★ 1688 新版详情页价格藏在这些字段里，全部试一遍 */
      const PK = ['price', 'minPrice', 'priceRange', 'salePrice', 'salePriceStr', 'unitPrice',
        'lowestPrice', 'priceInfo', 'priceModel', 'promotionPrice', 'tradePrice', 'growPrice',
        'discountPrice', 'priceText', 'priceValue', 'priceStr', 'currentPrice', 'viewPrice'];
      let p;
      for (const k of PK) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') { p = obj[k]; break; }
      /* priceInfo / priceModel 可能是对象，往里再挖一层 */
      if (p && typeof p === 'object') {
        for (const k of ['value', 'price', 'minPrice', 'salePrice', 'priceStr', 'text', 'amount']) {
          if (p[k] !== undefined && p[k] !== null) { p = p[k]; break; }
        }
      }
      const pv = cleanPrice(p);
      if (pv) out.price = pv;
    }
    if (!out.desc && typeof obj.description === 'string' && obj.description.length > 10) {
      out.desc = obj.description;
    }
    if (!out.sku && typeof obj.sku === 'string') out.sku = obj.sku;

    const imgKeys = ['images', 'imageList', 'offerImgList', 'offerImages', 'imgList',
      'image', 'mainPic', 'imageUrl', 'imgUrl'];
    for (const k of imgKeys) {
      const v = obj[k];
      if (!v) continue;
      const arr = Array.isArray(v) ? v : [v];
      for (const s of arr) {
        let u = typeof s === 'string' ? s
          : (s && typeof s === 'object' ? (s.imgUrl || s.url || s.image || s.src || '') : '');
        u = norm(u);
        if (u && u.indexOf('data:') !== 0 && out.images.indexOf(u) < 0) out.images.push(u);
      }
    }
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      if (obj[key] && typeof obj[key] === 'object') pickField(obj[key], out, depth + 1);
    }
  }

  /* ---------------- 商品属性 / 描述提取 ---------------- */

  /* 1688 内嵌数据里的属性字段，常见命名全收 */
  const ATTR_KEYS = ['attributes', 'attrList', 'attributeList', 'props', 'propertyList',
    'productProps', 'offerAttribute', 'offerAttrs', 'specifications', 'specList',
    'skuProps', 'itemProps', 'baseProperty', 'productAttributeList'];

  function attrPair(o) {
    if (!o || typeof o !== 'object') return null;
    const k = o.k || o.key || o.name || o.attrName || o.propName || o.propertyName || o.label || o.title;
    const v = o.v || o.value || o.attrValue || o.propValue || o.propertyValue || o.text || o.content;
    if (k == null || v == null) return null;
    const ks = String(k).replace(/[:：]$/, '').trim();
    let vs = v;
    if (Array.isArray(vs)) vs = vs.map(x => (x && typeof x === 'object') ? (x.name || x.value || x.text || '') : x)
      .filter(Boolean).join(' / ');
    else if (vs && typeof vs === 'object') vs = vs.name || vs.value || vs.text || '';
    vs = String(vs).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!ks || !vs || ks.length > 24 || vs.length > 120) return null;
    return { k: ks, v: vs };
  }

  /* 从内嵌 JSON 递归找属性 */
  function pickAttrs(obj, out, depth) {
    if (!obj || depth > 7 || typeof obj !== 'object') return;
    for (const key of ATTR_KEYS) {
      const v = obj[key];
      if (!v) continue;
      const arr = Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v).map(k => ({ k, v: v[k] })) : []);
      for (const it of arr) {
        const p = attrPair(it);
        if (!p) continue;
        if (!out.some(x => x.k === p.k)) out.push(p);
      }
    }
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      if (obj[key] && typeof obj[key] === 'object') pickAttrs(obj[key], out, depth + 1);
    }
  }

  /* ---------------- SKU 销售属性（颜色 / 款式选项 + 每选项图）----------------
     1688 把「颜色分类」「尺码」等销售选项放在内嵌数据的 skuProps / skuBase.props /
     skuModel 等结构里，形如：
       skuProps:[{ name:'颜色分类', valueList:[{ name:'紫色', imageUrl:'...' }, ...] }]
       skuBase.props:[{ name:'颜色', values:[{ name:'紫色', image:'...' }, ...] }]
     字段名各版本不同，不认字段名，只认「对象含一个选项数组、数组里每项有 name + 图」的结构。 */
  const SKU_PROP_NAME_KEYS = ['name', 'propName', 'title', 'label', 'skuPropName', 'attrName', 'k'];
  const SKU_LIST_KEYS = ['valueList', 'values', 'itemList', 'skuValueList', 'optionList', 'list', 'options', 'items'];
  const SKU_VAL_NAME_KEYS = ['name', 'value', 'text', 'title', 'label', 'skuValue', 'v'];
  const SKU_VAL_IMG_KEYS = ['imageUrl', 'imgUrl', 'image', 'img', 'src', 'picUrl', 'thumbUrl', 'imagePath',
    'url', 'path', 'pic', 'picPath', 'thumb', 'mainPic', 'mainImage', 'smallImage',
    'imageUrlPath', 'imgPath', 'cover', 'coverUrl', 'originalImage', 'bigImage',
    'skuImageUrl', 'skuImage', 'valueImage', 'valueImageUrl', 'propImage', 'propImgUrl',
    'smallPicUrl', 'logoUrl', 'attrImage', 'attrImg', 'colorImage', 'specImage'];

  function skuOptionName(o) {
    if (!o || typeof o !== 'object') return '';
    for (const k of SKU_VAL_NAME_KEYS) {
      const v = o[k];
      if (typeof v === 'string' && v.trim() && v.trim().length <= 30) return v.trim();
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    }
    return '';
  }
  function isImgUrl(s) {
    if (typeof s !== 'string') return false;
    const t = s.trim();
    /* http(s) / // 协议，或 // 开头的相对协议；排除 svg/tps 图标 */
    if (!(/^https?:\/\//i.test(t) || /^\/\//.test(t))) return false;
    if (/\.(svg|tps|gif)(\?|$)/i.test(t)) return false;
    return true;
  }
  function skuOptionImg(o) {
    if (!o || typeof o !== 'object') return '';
    /* ① 顶层已知字段 */
    for (const k of SKU_VAL_IMG_KEYS) {
      const v = o[k];
      if (isImgUrl(v)) return norm(v.trim());
    }
    /* ② 嵌套一层：1688 常见 {img:{url:'...'}} / {image:{uri:'...'}} / {imageUrl:{...}}
       只下钻 2 层、且键名带图片语义，避免把价格/ID 里的数字误当图。 */
    for (const k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      if (!/img|pic|image|thumb|cover|图/i.test(k)) continue;
      const v = o[k];
      if (isImgUrl(v)) return norm(v.trim());
      if (v && typeof v === 'object') {
        for (const k2 in v) {
          if (!Object.prototype.hasOwnProperty.call(v, k2)) continue;
          if (isImgUrl(v[k2])) return norm(v[k2].trim());
        }
      }
    }
    return '';
  }
  function skuPropName(o) {
    if (!o || typeof o !== 'object') return '';
    for (const k of SKU_PROP_NAME_KEYS) {
      const v = o[k];
      if (typeof v === 'string' && v.trim() && v.trim().length <= 16 && !/^https?:/i.test(v)) return v.trim();
    }
    return '';
  }
  /* 递归找「属性名 + 选项数组」结构 */
  function pickSkuFromJson(obj, out, depth, seen) {
    if (!obj || depth > 9 || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const it of obj) pickSkuFromJson(it, out, depth + 1, seen);
      return;
    }
    const pname = skuPropName(obj);
    if (pname) {
      for (const lk of SKU_LIST_KEYS) {
        const list = obj[lk];
        if (!Array.isArray(list) || list.length < 2 || list.length > 200) continue;
        const items = [];
        for (const it of list) {
          const nm = typeof it === 'string' ? it.trim() : skuOptionName(it);
          if (!nm || nm.length > 30) continue;
          items.push({ name: nm, image: skuOptionImg(it) });
        }
        if (items.length >= 2) {
          const sig = pname + '|' + items.map(x => x.name).join(',');
          if (!seen.has(sig)) {
            seen.add(sig);
            out.push({ group: pname, items });
          }
        }
        break;
      }
    }
    for (const k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      const v = obj[k];
      if (v && typeof v === 'object') pickSkuFromJson(v, out, depth + 1, seen);
    }
  }

  /* 1688 新版详情页的 SKU 区：一个 .module-od-sku-selection 容器里竖排 N 行，
     每行 = [缩略图][规格名][¥价格][库存N个]，缩略图与行顺序一一对应。
     内嵌 skuProps 在这版页面上拿不到，只能按「图顺序 + 名称顺序」对齐。 */
  function pickSkuFromOds() {
    const boxes = document.querySelectorAll('[class*="sku-selection"],[class*="skuSelection"]');
    for (const box of boxes) {
      const imgs = [];
      const imEls = box.querySelectorAll('img');
      for (let i = 0; i < imEls.length; i++) {
        const u = imgUrlOf(imEls[i]);
        if (u) imgs.push(u);
      }
      if (!imgs.length) continue;                     /* 纯文字规格：这里没有图，交给别的兜底 */
      const t = txt(box).replace(/\s+/g, ' ').trim()
        .replace(/(库存|已售|销量)\s*\d+\s*(个|件|只|套|笔)?/g, ' ')
        .replace(/^规格\s*/, '');
      const names = t.split(/[¥￥]\s*[\d.]+/).map(s => s.trim()).filter(s => s && s.length <= 32);
      if (names.length < 2) continue;
      const items = names.map((nm, i) => ({ name: nm, image: imgs[i] || imgs[imgs.length - 1] || '' }));
      return [{ group: '颜色分类', items }];
    }
    return [];
  }

  /* DOM 兜底：抓 SKU 选项行（截图里的「樱花点潮笔 紫色 / 粉色 …」带缩略图那块） */
  function pickSkuFromDom() {
    /* 先试新版容器（最准：图与行同序），命中就直接用 */
    try { const ods = pickSkuFromOds(); if (ods.length) return ods; } catch (e) {}
    const out = [];
    const seen = new Set();
    /* 1688 新版 SKU 选项容器：各种 class 变体全试 */
    const containers = document.querySelectorAll(
      '[class*="sku-item"],[class*="skuItem"],[class*="sku-attr"],[class*="skuAttr"],' +
      '[class*="sku-base"],[class*="skuBase"],[class*="prop-item"],[class*="propItem"],' +
      '[class*="value-item"],[class*="valueItem"],[class*="sale-prop"],[class*="saleProp"]');
    for (const box of containers) {
      const rows = box.querySelectorAll('[class*="item"],[class*="value"],li,label,span');
      const items = [];
      for (const r of rows) {
        let nm = '';
        const title = r.getAttribute && (r.getAttribute('title') || r.getAttribute('data-value') || r.getAttribute('aria-label'));
        if (title) nm = title.trim();
        else {
          const t = txt(r).replace(/\s+/g, ' ').trim();
          /* 规格名原本就是「斜纹震动棒(粉色)」这种完整名，短文本直接整段用，别截尾 */
          if (t && t.length <= 24) nm = t;
          else {
            const m = /([\u4e00-\u9fa5A-Za-z0-9]{2,6})\s*$/.exec(t);
            if (m && t.length <= 40) nm = m[1];
          }
        }
        if (!nm || nm.length > 30 || seen.has('D' + nm)) continue;
        const im = r.querySelector ? r.querySelector('img') : null;
        let image = im ? imgUrlOf(im) : '';
        /* 有些版本的 SKU 色块用 background-image 渲染，没有 <img> */
        if (!image && r.querySelectorAll) {
          const nodes = [r].concat(Array.prototype.slice.call(r.querySelectorAll('*')).slice(0, 4));
          for (const nd of nodes) {
            const bg = (nd.style && nd.style.backgroundImage) || (window.getComputedStyle ? (getComputedStyle(nd).backgroundImage || '') : '');
            const mm = /url\(["']?([^"')]+)["']?\)/.exec(bg || '');
            if (mm && isImgUrl(mm[1])) { image = norm(mm[1].trim()); break; }
          }
        }
        items.push({ name: nm, image });
        seen.add('D' + nm);
      }
      if (items.length >= 2) {
        const gl = skuPropName(box) || '颜色分类';
        const sig = gl + '|' + items.map(x => x.name).join(',');
        if (!out.some(g => g.items.map(x => x.name).join(',') === items.map(x => x.name).join(',')))
          out.push({ group: gl, items });
      }
    }
    return out;
  }

  /* 汇总：内嵌数据优先，DOM 兜底。
     ★ 关键：即便内嵌抓到了选项名，也要跑一遍 DOM 兜底补齐图片——
       1688 新版把颜色名放在内嵌 skuProps，缩略图却只渲染在 DOM 里，
       内嵌对象的图片字段名每版都变。只靠内嵌 → 颜色有了、图全空。 */
  function readSkuOptions() {
    let out = [];
    const seen = new Set();
    try {
      const emb = readEmbedded();
      if (emb) pickSkuFromJson(emb, out, 0, seen);
    } catch (e) {}
    let dom = [];
    try { dom = pickSkuFromDom(); } catch (e) {}
    if (!out.length) {
      out = dom;
    } else if (dom.length) {
      /* 按「选项名」把 DOM 里的图片补进内嵌结果 */
      const domImg = {};
      for (const g of dom) for (const it of (g.items || [])) {
        if (it.name && it.image) domImg[it.name] = it.image;
      }
      for (const g of out) for (const it of (g.items || [])) {
        if ((!it.image || !isImgUrl(it.image)) && it.name && domImg[it.name]) it.image = domImg[it.name];
      }
      /* 内嵌完全没有的选项组，直接并入 */
      const have = new Set(out.map(g => g.items.map(x => x.name).join(',')));
      for (const g of dom) {
        const sig = g.items.map(x => x.name).join(',');
        if (!have.has(sig)) { out.push(g); have.add(sig); }
      }
    }
    return out.slice(0, 8);
  }

  /* 从页面 DOM 的属性表 / 参数区提取（1688 新版 od-pc 结构 + 老版 table） */
  function readAttrTable() {
    const out = [];
    const add = (k, v) => {
      const p = attrPair({ k, v });
      if (p && !out.some(x => x.k === p.k)) out.push(p);
    };
    /* 表格型 */
    document.querySelectorAll('tr').forEach(tr => {
      const cells = tr.querySelectorAll('th,td');
      if (cells.length >= 2) add(txt(cells[0]), txt(cells[1]));
    });
    /* dt/dd 型 */
    document.querySelectorAll('dt').forEach(dt => {
      const dd = dt.nextElementSibling;
      if (dd && /dd|value|content/i.test(dd.tagName + ' ' + (dd.className || ''))) add(txt(dt), txt(dd));
    });
    /* 1688 新版属性块：[class*=attribute] / [class*=prop] 内的 label-value 结构 */
    const boxes = document.querySelectorAll('[class*="attribute"],[class*="Attribute"],[class*="prop-item"],[class*="propItem"],[class*="skill"]');
    boxes.forEach(box => {
      let k = '', v = '';
      const l = box.querySelector('[class*="label"],[class*="key"],[class*="name"],[class*="title"]');
      const val = box.querySelector('[class*="value"],[class*="val"],[class*="content"]');
      if (l && val) { k = txt(l); v = txt(val); }
      else { const parts = txt(box).split(/[:：\s]{1,2}/); if (parts.length >= 2) { k = parts[0]; v = parts.slice(1).join(' '); } }
      if (k && v) add(k, v);
    });
    /* ★ 1688 新版「商品属性」是「键+值」直接拼接、无冒号、无子元素：
       "品牌慕川" / "材质硅胶、ABS" / "最大噪音40" / "颜色粉色" / "充电方式针孔"。
       用已知属性名词典（长词优先）匹配开头，剩下即值。 */
    const ATTR_KEYS = [
      '是否跨境出口专供货源', '产品主体材质', '功能及用途', '控制类型', '产品名称', '主体尺寸',
      '是否含润滑剂', '品牌类型', '生产企业', '最大噪音', '产品类别', '是否进口', '保质期', '保修期',
      '加热功能', '连接方式', '使用方式', '充电方式', '适用人群', '供电方式', '外观材质', '主体材质',
      '产品材质', '材质', '颜色', '规格', '品牌', '产地', '货号', '型号', '重量', '净重', '尺寸',
      '长度', '直径', '功能', '人群', '年龄', '噪音', '防水', '包装', '风格', '类型', '电源', '电池'
    ].sort((a, b) => b.length - a.length);
    const addPasted = (text) => {
      const t = String(text || '').replace(/\s+/g, ' ').trim();
      if (!t) return false;
      /* 先统计整串里出现了几个属性名：>1 说明是连写块，必须走切片 */
      let keyCount = 0;
      for (const key of ATTR_KEYS) if (t.indexOf(key) >= 0) keyCount++;
      /* ① 短文本 + 只有一个属性名：单个「键+值」（如「品牌慕川」「最大噪音40」）*/
      if (t.length <= 120 && keyCount <= 1) {
        for (const key of ATTR_KEYS) {
          if (t.indexOf(key) !== 0) continue;
          let v = t.slice(key.length).replace(/^[：:\s]+/, '').trim();
          const nx = /是否含润滑剂|是否进口|是否跨境|产品主体|功能及用途|控制类型|主体尺寸|品牌类型|产品名称/.exec(v);
          if (nx && nx.index > 0) v = v.slice(0, nx.index).trim();
          if (v) { add(key, v.slice(0, 80)); return true; }
        }
      }
      /* ② 长文本 / 连写块：1688 新版把一整块属性连写在同一元素里，
         "控制类型APP控制产品名称小蝌蚪APP跳蛋材质硅胶、ABS是否含润滑剂否功能震动…"
         用属性名词典找出每个「键」的位置，相邻两个键之间的内容即前一个键的值。 */
      const hits = [];
      for (const key of ATTR_KEYS) {
        let from = 0, idx;
        while ((idx = t.indexOf(key, from)) >= 0) {
          hits.push({ idx, key, len: key.length });
          from = idx + key.length;
        }
      }
      hits.sort((a, b) => a.idx - b.idx || b.len - a.len);
      const picked = [];
      for (const h of hits) {
        const last = picked[picked.length - 1];
        /* 位置落在上一个更长属性名内部则跳过：避免「产品主体材质」又被「材质」重复命中 */
        if (last && h.idx < last.idx + last.len) continue;
        picked.push(h);
      }
      for (let i = 0; i < picked.length; i++) {
        const cur = picked[i];
        const end = i + 1 < picked.length ? picked[i + 1].idx : t.length;
        let v = t.slice(cur.idx + cur.len, end)
          .replace(/^[：:\s,，、|]+|[：:\s,，、|]+$/g, '').trim();
        if (v && v.length <= 80) add(cur.key, v);
      }
      return picked.length > 0;
    };
    /* 遍历所有可能是属性项的元素（含 1688 新版 class 变体）*/
    document.querySelectorAll('[class*="attr"],[class*="Attr"],[class*="prop"],[class*="Prop"],' +
      '[class*="parameter"],[class*="spec-item"],tr,dt').forEach(el => {
      const t = txt(el);
      if (t) addPasted(t);
    });
    /* ★ 整块属性区文本也喂给切片：1688 新版把所有属性连写在一个容器里，
       单个子元素文本可能只是片段，只有整块文本才包含完整的「键+值+键+值」链。 */
    document.querySelectorAll('[class*="attribute"],[class*="Attribute"],[class*="prop-list"],' +
      '[class*="spec-list"],[class*="parameter"],[class*="detail-param"]').forEach(box => {
      const t = txt(box);
      /* 只处理中等长度的属性块，避免把整页正文（几千字）当属性切片 */
      if (t && t.length >= 20 && t.length <= 600) addPasted(t);
    });
    /* 纯文本「材质：硅胶」这类行 */
    const detail = document.querySelector('[class*="detail"],[class*="Detail"],[id*="detail"]');
    if (detail) {
      const lines = txt(detail).split(/[；;\n]/);
      lines.forEach(line => {
        const m = /^\s*([^\s:：]{2,12})\s*[:：]\s*(.{1,80})\s*$/.exec(line);
        if (m) add(m[1], m[2]);
      });
    }
    return out.slice(0, 40);
  }

  /* 详情描述：优先页面内嵌 description，其次详情区正文 */
  function readDescText() {
    const box = document.querySelector('[class*="detail-desc"],[class*="desc"],[class*="Desc"],[id*="desc"]');
    let s = box ? txt(box) : '';
    if (s.length < 12) {
      const body = document.querySelector('article,[class*="detail-content"],[class*="rich-text"]');
      s = body ? txt(body) : '';
    }
    return s.slice(0, 2000);
  }

  /* 图片打分：把真实商品图排到「跨境」占位图前面 */
  const BAD_IMG = /(placeholder|noimage|noimg|defaultimg|blank|loading|crossborder|kuajing|kjd|跨境|占位|默认图)/i;
  /* ★ 小图标 / SVG：these are UI decorations (tps-15-8.svg / 15x14 icons), never product photos.
     Cross-border pages are full of them; one ranked #1 as the main image and broke white-bg. */
  const ICON_IMG = /\.svg([?#]|$)|[-_]tps[-_]|[-_](15|16|20|24|32)[-_]\d+\.|icon|logo|arrow|star|flag|crown|vip|badge/i;
  function scoreImg(el, url) {
    /* ★ 图标 / SVG 一律负分到底，绝不能排到主图 */
    if (ICON_IMG.test(url)) return -100;
    let score = 0;
    const cls = String(el.className || '');
    const parentCls = String((el.parentElement && el.parentElement.className) || '');
    /* ★ 详情长图（描述区里那些介绍图）不算商品主图：整块降权，一律挤到 5 张之外 */
    try {
      if (typeof el.closest === 'function'
          && el.closest('[class*="detail-desc"],[class*="detail-content"],[class*="desc-module"],[class*="description"],[class*="rich-text"],[id*="desc"]')) score -= 60;
    } catch (e) {}
    if (/gallery|Gallery|thumb|Thumb|mainPic|mainpic|imageList/i.test(cls + ' ' + parentCls)) score += 12;
    /* ★ 1688 商品主图标志：-cib.jpg / /img/ibank/ / bao/uploaded —— 最高优先 */
    if (/-cib\.(jpg|jpeg|png|webp)/i.test(url)) score += 30;
    if (/\/img\/ibank\/|\/bao\/uploaded\//i.test(url)) score += 12;
    /* 缩略图后缀：_60x60 / _sum / _q90 是小图，降权 */
    if (/_\d+x\d+|_sum\b|_sq\b|_60x|_80x/i.test(url)) score -= 15;
    if (BAD_IMG.test(url)) score -= 40;
    if ((el.alt || '').length > 3) score += 2;
    const w = parseInt((el.getAttribute && el.getAttribute('width')) || '0', 10);
    const h = parseInt((el.getAttribute && el.getAttribute('height')) || '0', 10);
    if (w && h && Math.max(w, h) < 200) score -= 25;
    if (el.naturalWidth && el.naturalWidth >= 400) score += 5;
    return score;
  }

  /* ---------------- 非商品页拦截 ----------------
     peixun.1688.com 是「1688 学习中心」，网址形如 /space/xxx/detail/yyy，
     看起来像详情页，实际是文章页。之前解析器把文章标题当商品名、
     把文章占位图当主图，采进来的全是垃圾。这里直接拦掉并说清原因。 */
  const NON_PRODUCT_HOST = /(^|\.)(peixun|club|bbs|school|doc|help|learning?|study)\.1688\.com$/i;
  function nonProductReason() {
    let host = '', href = '', title = '';
    try { host = location.hostname; href = location.href; title = document.title || ''; } catch (e) {}
    /* ★ 反爬拦截页优先识别：URL 带 _____tmd_____/punish、x5secdata、x5step、capslide，
       或页面标题是「验证码拦截」。这类页面没有任何商品数据，且采集器会在上面干等到超时，
       必须第一时间明确报错，让用户知道是被风控、需要手动过验证，而不是「采集慢/失败」。 */
    if (/_____tmd_____|\/punish\b|x5secdata|x5step|capslide|baxia|\/page\/feedback/i.test(href)
        || /验证码拦截|滑动验证|安全验证|访问验证|请拖动|拖动滑块|下拉刷新验证/.test(title)) {
      return '1688 触发了滑块验证码（反爬风控）。请在浏览器里手动打开这条链接、完成一次滑块验证后，再回来点采集。';
    }
    if (NON_PRODUCT_HOST.test(host)) return '当前是 1688 内容/学习中心页面（' + host + '），不是商品详情页';
    const meta = (metaOf('keywords') || '') + ' ' + (document.title || '');
    const isRealOffer = /\/offer\/\d+\.html/i.test(location.href) || /[?&]offerId=\d{6,}/i.test(location.href);
    if (!isRealOffer && /(1688培训|学习中心|帮助中心|开店经验|阿里巴巴商学院)/.test(meta))
      return '当前页面是平台文章/帮助页，请打开 1688 商品详情页（offer 链接）再采集';
    return '';
  }

  /* ---------------- 列表页解析 ---------------- */

  /* 商品链接识别：各家平台路径不同，这里用启发式而不是硬编码站点。
     判定信号（命中任意一条即认为是商品页）：
       · 路径含 offer / product / item / detail / dp / goods / sku 等语义段
       · 查询串带 offerId / itemId / productId / id= 等参数
       · 同页出现 ≥3 个这样的链接（列表页特征） */
  const PRODUCT_PATH = /\/(offer|product|item|detail|dp|goods|sku|p|prod|listing)[/.]/i;
  const PRODUCT_QUERY = /[?&](offerId|itemId|productId|product_id|item_id|goodsId|goods_id|skuId|sku_id|spuId|spu_id|commodity_id|id)=/i;
  const PRODUCT_HASH = /#\/?(offer|product|item|detail|dp)\//i;

  function isProductLink(href) {
    if (!href) return false;
    const h = decodeEnt(href);
    if (/(^|\/)cart(\/|\?|$)/i.test(h)) return false;
    if (/(^|\/)(login|register|search|list|category|shop|home)(\/|\?|$)/i.test(h) &&
        !PRODUCT_QUERY.test(h)) return false;
    return PRODUCT_PATH.test(h) || PRODUCT_QUERY.test(h) || PRODUCT_HASH.test(h);
  }

  /* 提取商品 ID（用于去重）*/
  function offerIdOf(href) {
    const h = decodeEnt(href || '');
    const m = /offer\/(\d{6,})\.html/i.exec(h) || /offerId[=/](\d{6,})/i.exec(h) ||
      /item\/(\d{6,})/i.exec(h) || /product\/([\w-]{4,})/i.exec(h) ||
      /[?&]id=(\d{4,})/i.exec(h) || /[?&]id=([\w-]{4,})/i.exec(h) ||
      /\/p\/(\d{6,})/i.exec(h) || /dp\/(\d{6,})/i.exec(h);
    return m ? m[1] : '';
  }

  function findOfferLinks() {
    const seen = {}, out = [];
    const as = document.querySelectorAll('a[href]');
    for (const a of as) {
      const href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) continue;
      if (!isProductLink(href)) continue;
      const url = norm(decodeEnt(href));
      const id = offerIdOf(href);
      const key = id || url;
      if (seen[key]) continue;
      seen[key] = 1;
      out.push({ offerId: id, url, el: a });
    }
    return out;
  }

  /* ============================================================
     质量闸门：判断一个文本/图片是不是「商品标题 / 商品图」
     ---------------------------------------------------------
     1688 列表页上混着店铺名、公司名、图标 alt、导航词，
     不做过滤就会把「东莞市XX有限公司」「关注图标」当成商品名入库。
     ============================================================ */

  /* 明显不是商品名的文本（只匹配整串相等，避免误杀含「新品」「推荐」的真商品名） */
  const BAD_NAME_EXACT = /^(首页|店铺|店铺首页|全部商品|所有商品|商品|更多|搜索|登录|注册|收藏|购物车|客服|淘宝|天猫|阿里巴巴|我的|返回|上一页|下一页|全部|筛选|排序|价格|销量|综合|起批|关注|收藏店铺|进店|旺铺|热销|新品上市|新品推荐|推荐|广告|全部商品|更多商品|查看全部|查看详情|立即购买|立即下单|马上抢|限时特价|包邮)$/;
  /* 名称里出现这些词说明是功能按钮/导航，不是商品标题 */
  const BAD_NAME_HAS = /(全部商品$|更多商品$|查看全部|查看详情|立即购买|立即下单|马上抢|点击查看|进店看看|收藏店铺|店铺首页)/;
  /* 公司 / 店铺名：以「有限公司」「厂」「店」结尾，或含地域+组织形式 */
  const COMPANY_NAME = /(有限公司|股份有限公司|有限责任公司|集团有限公司|个体工商户|合作社|商行|商贸公司|贸易公司|科技公司|电子厂|玩具厂|工厂|旗舰店|专营店|专卖店|直营店|体验店|服务店|经营部)/;
  /* 明显是图标/按钮类 alt */
  const BAD_ALT = /(图标|logo|LOGO|Icon|图片|头像|二维码|微信|支付宝|客服|收藏|分享|返回|顶部|底部|菜单|搜索|购物车|关注|店铺)/i;

  function isBadName(s) {
    if (!s) return true;
    const t = String(s).trim();
    if (t.length < 4 || t.length > 160) return true;
    if (BAD_NAME_EXACT.test(t)) return true;
    if (BAD_NAME_HAS.test(t)) return true;
    if (COMPANY_NAME.test(t)) return true;
    /* 以「图标」「图片」「logo」等结尾 —— 是图标 alt 不是商品名 */
    if (/(图标|图片|标志|LOGO|Logo|logo)$/.test(t)) return true;
    /* 纯数字、纯符号 */
    if (!/[\u4e00-\u9fa5A-Za-z]/.test(t)) return true;
    /* 「XX公司」类短名：≤12 字且含公司后缀 */
    if (t.length <= 12 && COMPANY_NAME.test(t)) return true;
    return false;
  }

  /* 商品图必须够大，排除 15×14 这类小图标 */
  function isProductImg(raw, w, h) {
    if (!raw) return false;
    if (BAD_ALT.test(raw)) return false;
    if (/^data:/i.test(raw)) return false;
    /* URL 里的尺寸标记：xxx_60x60.jpg / tps-15-14.svg / small_60-60.jpg
       注意：必须「宽和高都」小于阈值才判为图标。
       电商图床常见 ..._!!600-55-tps-400-400.jpg 这类分段数字，
       用「任一小于 120」会把正常商品图误杀。 */
    const m = raw.match(/(\d{1,4})[xX-](\d{1,4})\./);
    if (m && parseInt(m[1]) < 120 && parseInt(m[2]) < 120) return false;
    /* 尺寸属性：同样要求两边都小（单边小常见于懒加载占位，不能据此判死） */
    if (w && h && w < 120 && h < 120) return false;
    if (/\.svg(\?|$)/i.test(raw)) return false;   /* 图标矢量图，不是商品图 */
    if (/logo|icon|avatar|blank|loading|placeholder|badge|qrcode|sprite|arrow|caret/i.test(raw)) return false;
    return true;
  }

  /* 取图片地址：兼容 srcset / 各种懒加载属性 */
  function imgUrlOf(im) {
    if (!im) return '';
    const direct = im.getAttribute('data-src') || im.getAttribute('data-lazyload') ||
      im.getAttribute('data-ks-lazyload') || im.getAttribute('data-original') ||
      im.getAttribute('data-lazy-src') || im.getAttribute('data-echo') ||
      im.getAttribute('data-image') || im.getAttribute('data-img') ||
      im.getAttribute('data-original-src') || im.getAttribute('data-url');
    if (direct) return direct;
    /* srcset：取最后一个（通常是最大尺寸） */
    const ss = im.getAttribute('srcset') || im.getAttribute('data-srcset');
    if (ss) {
      const parts = String(ss).split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
    return im.getAttribute('src') || '';
  }

  /* 卡片信息：标题 / 价格 / 图 */
  function cardInfo(a) {
    const info = { name: '', price: '', image: '' };

    /* ① 容器：往上找到「含价格」的那层（先定容器，后取图，避免抓到图标） */
    let box = a, best = null;
    for (let d = 0; d < 6 && box; d++) {
      if (box.querySelector && box.querySelector('[class*="price"],[class*="Price"]')) { best = box; break; }
      box = box.parentElement;
    }
    if (!best) {
      box = a;
      for (let e = 0; e < 3 && box && box.parentElement; e++) box = box.parentElement;
    }

    /* ② 名称：只认真实标题元素，不从 alt / 链接全文乱兜底 */
    const TITLE_SEL = '[class*="title"],[class*="Title"],[class*="subject"],[class*="Subject"],[class*="offer-title"],[class*="goods-title"],[class*="item-title"],[title]';
    const titleNodes = [];
    if (box) {
      box.querySelectorAll(TITLE_SEL).forEach(n => titleNodes.push(n));
    }
    /* 链接自身的 title 属性 */
    const aTitle = (a.getAttribute('title') || '').trim();
    if (aTitle) titleNodes.unshift(a);

    for (const n of titleNodes) {
      let cand = '';
      if (n === a) cand = aTitle;
      else {
        cand = (n.getAttribute && (n.getAttribute('title') || n.getAttribute('alt') || '')) || '';
        if (!cand) cand = txt(n);
      }
      cand = String(cand).replace(/\s+/g, ' ').trim();
      if (cand && !isBadName(cand)) { info.name = cand.slice(0, 160); break; }
    }

    /* ③ 图片：在容器内找「够大的」商品图 */
    const imgs = [];
    if (box) box.querySelectorAll('img').forEach(im => imgs.push(im));
    if (a.querySelector('img')) imgs.unshift(a.querySelector('img'));
    for (const im of imgs) {
      const raw = imgUrlOf(im);
      const w = parseInt(im.getAttribute('width') || '0', 10) || (im.naturalWidth || 0);
      const h = parseInt(im.getAttribute('height') || '0', 10) || (im.naturalHeight || 0);
      const abs = decodeEnt(raw);
      if (!isProductImg(abs, w, h)) continue;
      const u = cleanImg(abs);
      if (u) { info.image = u; break; }
    }

    /* ④ 价格：只从价格元素取，跳过划线原价 */
    const BADPRICE = /old|strik|was|origin|before|market|line|origin-price/i;
    const priceOf = (node) => {
      const c = node.className || '';
      if (BADPRICE.test(c)) return '';
      const kids = node.querySelectorAll('[class*="price"],[class*="Price"]');
      if (kids.length) {
        for (const k of kids) { const v = priceOf(k); if (v) return v; }
        return '';
      }
      const m = /([\d]+(?:\.\d+)?)/.exec(txt(node));
      return m ? m[1] : '';
    };
    if (box) {
      const ps = box.querySelectorAll('[class*="price"],[class*="Price"]');
      for (const p of ps) { const v = priceOf(p); if (v) { info.price = v; break; } }
    }

    /* ④b 价格兜底：只认带 ¥ 的数字，不拿件数/销量当价格 */
    if (!info.price && box) {
      const bt = txt(box);
      const m1 = /[¥￥]\s*([\d]+(?:\.\d+)?)/.exec(bt);
      if (m1) info.price = m1[1];
    }

    /* ⑤ 容器内文字兜底（仅当它不像店铺名/图标词时） */
    if (!info.name && box) {
      const cand = txt(box).slice(0, 160);
      if (!isBadName(cand)) info.name = cand;
    }

    return info;
  }

  /* 滚动加载（懒加载列表）
     优化点：
       · 不用固定 sleep 死等 —— 每次滚动后轮询「商品链接数是否增长」，一涨就走
       · 连续 2 轮没增长就认为到底，提前结束
       · 已经凑够 limit 条就直接停，不再多滚
     这样把原来「12 × 350ms = 4.2 秒固定成本」变成按实际加载速度走。 */
  /* 商品链接计数（按商品 ID 去重）。
     真实页面里一个商品常被多层 <a> 包裹，数 DOM 元素会放大好几倍，
     "够数就停"的判断就失真了 —— 所以必须按 ID 去重。 */
  const productIdSet = new Set();
  function scanProductLinks() {
    productIdSet.clear();
    const as = document.querySelectorAll('a[href]');
    for (let i = 0; i < as.length; i++) {
      const href = as[i].getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) continue;
      if (!isProductLink(href)) continue;
      const id = offerIdOf(href);
      productIdSet.add(id || href.split('?')[0]);
    }
    return productIdSet.size;
  }
  const countProductLinks = scanProductLinks;

  /* 等新商品渲染出来：用 MutationObserver 监听新增 <a>，
     比反复全页扫描快一个数量级（真实页面几千个链接）。 */
  function watchProductGrowth(before, budget) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (grew) => {
        if (done) return;
        done = true;
        try { obs.disconnect(); } catch (e) {}
        clearTimeout(timer);
        resolve(grew);
      };
      const obs = new MutationObserver(() => {
        /* 节流：DOM 变化很频繁，每 120ms 查一次就够 */
        if (Date.now() - lastCheck < 120) return;
        lastCheck = Date.now();
        if (scanProductLinks() > before) finish(true);
      });
      let lastCheck = Date.now();
      const timer = setTimeout(() => finish(scanProductLinks() > before), budget || 700);
      try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
    });
  }

  async function autoScroll(maxTimes, delayMs, needCount) {
    const budget = delayMs || 700;
    /* 页面初始就够采的话，一秒都不滚 —— 真实 1688 店铺页常常首屏就有全部商品 */
    if (needCount && countProductLinks() >= needCount) return;
    let stall = 0;
    for (let i = 0; i < maxTimes; i++) {
      const before = countProductLinks();
      if (needCount && before >= needCount) break;   /* 已经够采了 */
      window.scrollTo(0, document.body.scrollHeight);
      /* 等这一屏的新卡片渲染出来：一涨就立刻继续，不白等 */
      const grew = await watchProductGrowth(before, budget);
      if (!grew) {
        stall++;
        if (stall >= 2) break;   /* 连续两轮没新内容 = 到底了 */
      } else stall = 0;
    }
    window.scrollTo(0, 0);
  }

  /* 清理 URL 追踪参数：只保留商品标识，落库链接要干净可直达 */
  const TRACK_PARAMS = /^(traceId|spm[a-zA-Z_-]*|from|utm_[a-z]+|ali_trackid|scm[a-zA-Z-]*|pvid|sk|clickid|sdkPref|bd_vid|bft_.*|pvid|refer_site|homeTp|sref|cookie2|bid|d_kw|traceid)$/i;
  function cleanUrl(u) {
    try {
      const x = new URL(u);
      const keep = [];
      x.searchParams.forEach((v, k) => { if (!TRACK_PARAMS.test(k)) keep.push(k); });
      /* 只保留商品 id 类参数 */
      const keepIds = [];
      x.searchParams.forEach((v, k) => {
        if (!TRACK_PARAMS.test(k) && /offerid|itemid|productid|skuid/i.test(k)) keepIds.push(k);
      });
      const base = x.origin + x.pathname;
      if (keepIds.length) {
        const q = keepIds.map(k => k + '=' + x.searchParams.get(k)).join('&');
        return base + '?' + q;
      }
      /* 路径里已含 offer id 就只留路径 */
      if (/\/(offer|item|product|dp)\/\d+/i.test(x.pathname)) return base;
      const rest = [];
      x.searchParams.forEach((v, k) => { if (!TRACK_PARAMS.test(k)) rest.push(k + '=' + v); });
      return base + (rest.length ? '?' + rest.join('&') : '');
    } catch (e) { return u; }
  }

  /* 列表模式：返回 [{offerId,url,name,price,image}] */
  async function list(opts) {
    opts = opts || {};
    const blocked = nonProductReason();
    if (blocked) return { ok:false, error:blocked, total:0, items:[], url:location.href, pageTitle:document.title };
    const limit = opts.limit || 60;

    /* ★ 详情页不要空滚 ★
       URL 本身就是 /offer/<数字>.html → 这是单个商品详情页，
       页面里没有商品列表，滚 12 次也滚不出商品，纯白等 4 秒多。
       直接跳过滚动，让 background 走详情页解析。 */
    const isDetailPage = /\/(offer|item|detail|dp|product)\/\d+(\.html)?/i.test(location.pathname + location.search);
    if (opts.scroll !== false && !isDetailPage) {
      await autoScroll(opts.scrollTimes || 25, opts.scrollDelay || 700, limit);
    }

    const links = findOfferLinks();
    const items = [];
    const skipped = { badName: 0, noImage: 0, dup: 0 };
    /* 丢弃样本：失败时要能告诉用户「到底是链接没认出来，还是标题/图没抓到」 */
    const samples = { badName: [], noImage: [] };
    for (const l of links) {
      if (items.length >= limit) break;
      const c = cardInfo(l.el);
      /* 质量闸门：名称不合格直接丢弃 */
      if (isBadName(c.name)) {
        skipped.badName++;
        if (samples.badName.length < 3) samples.badName.push({ url: l.url, name: String(c.name || '').slice(0, 40) });
        continue;
      }
      /* 必须有商品图（无图的条目入库后是占位符，等于垃圾） */
      if (!c.image) {
        skipped.noImage++;
        if (samples.noImage.length < 3) samples.noImage.push({ url: l.url, name: String(c.name || '').slice(0, 40) });
        continue;
      }
      const d = {
        offerId: l.offerId, url: cleanUrl(l.url),
        name: c.name, price: c.price || '', image: c.image,
        images: [c.image]
      };
      items.push(d);
    }
    return {
      ok: true, kind: 'list', total: items.length, items, skipped, samples,
      /* 诊断：页面上一共多少链接、认出多少商品链接 */
      linkCount: links.length,
      totalLinks: document.querySelectorAll('a[href]').length,
      pageTitle: document.title,
      isDetailPage: isDetailPage,
      url: location.href
    };
  }

  /* ---------------- SKU 组合矩阵（1688 新版详情页「规格」区）----------------
     1688 把「可售单元」直接渲染成一行一行：组合名 + 价格 + 库存 + 缩略图，
     容器 class 形如 module-od-sku-selection。这里按行读成
       { name:'小蝌蚪跳蛋（紫色）袋装', price:13, stock:12284, image:'https://…' }
     一维「规格」和多维「颜色 + 尺码」都适用：每一行就是一个可售组合。
     ★ 注意：这类页面内嵌 JSON 里没有 sku* 结构（诊断实测 skuPaths=0），只能读 DOM。 */
  function readSkuMatrix() {
    const out = [], seen = {};
    const boxes = document.querySelectorAll(
      '[class*="sku-selection"],[class*="skuSelection"],[class*="sku-selector"],' +
      '[class*="skuSelector"],[class*="module-od-sku"]');
    for (const box of boxes) {
      const rows = [];
      for (const el of box.querySelectorAll('*')) {
        const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 140) continue;
        if (!(/[¥￥]/.test(t) || /库存/.test(t))) continue;
        if (el.querySelectorAll('img').length !== 1) continue;
        /* 只取最内层：子孙里若还有「一张图 + 价格/库存」的块，说明这层只是包装 */
        let deeper = false;
        for (const c of el.querySelectorAll('*')) {
          const ct = (c.innerText || '').replace(/\s+/g, ' ').trim();
          if (ct && ct.length <= 140 && (/[¥￥]/.test(ct) || /库存/.test(ct)) &&
              c.querySelectorAll('img').length === 1) { deeper = true; break; }
        }
        if (!deeper) rows.push(el);
      }
      for (const r of rows) {
        const t = (r.innerText || '').replace(/\s+/g, ' ').trim();
        const im = r.querySelector('img');
        let img = im ? imgUrlOf(im) : '';
        /* 1688 有些组合把缩略图挂成 CSS 背景（或 img 只是懒加载占位），兜底读 background-image */
        if (!img || /^data:/i.test(img)) {
          for (const c of [r].concat(Array.from(r.querySelectorAll('*')))) {
            const st = c.getAttribute('style') || '';
            const m = /background(?:-image)?\s*:[^;]*url\((['"]?)([^'")\s]+)\1\)/i.exec(st);
            if (m && /^http/.test(m[2])) { img = m[2]; break; }
          }
        }
        /* 名称 = 去掉价格段和库存段之后剩下的那句 */
        let name = t
          .replace(/[¥￥]\s*\d+(?:\.\d+)?(?:\s*[-–~]\s*\d+(?:\.\d+)?)?/g, ' ')
          .replace(/库存\s*\d+[^ ]*/g, ' ')
          .replace(/已售\s*\d+[^ ]*/g, ' ')
          .replace(/\s+/g, ' ').trim();
        if (!name || name.length < 2 || name.length > 60) continue;
        if (seen[name]) continue;
        seen[name] = 1;
        const pm = /[¥￥]\s*(\d+(?:\.\d+)?)/.exec(t);
        const sm = /库存\s*(\d+)/.exec(t);
        out.push({
          name: name,
          price: pm ? Number(pm[1]) : 0,
          stock: sm ? Number(sm[1]) : 0,
          image: img || ''
        });
      }
    }
    /* 兜底：部分商品的规格选项没有缩略图（imgCount=0），按行匹配会全军覆没。
       这类页面整块文本是「名称 ¥价格 库存N」顺序排列的，直接按这个顺序切。
       实测样例（offer 1089763965062）：
         "规格 跳弹（不含内裤，不含遥控） ¥13 库存23211个 无线遥控跳弹（不含内裤） ¥18 库存23123个 …" */
    if (out.length < 2) {
      for (const box of boxes) {
        const raw = (box.innerText || '').replace(/\s+/g, ' ').trim();
        if (!raw) continue;
        /* 该块里的图，用于按顺序配给每一行（数量对不上就不配，交给后台手动上传） */
        const boxImgs = Array.from(box.querySelectorAll('img'))
          .map(imgUrlOf).filter(u => u && !/^data:/i.test(u));
        const re = /([^¥￥]{2,80}?)\s*[¥￥]\s*(\d+(?:\.\d+)?)(?:\s*[-–~]\s*\d+(?:\.\d+)?)?\s*(?:库存|已售|销量)\s*(\d+)/g;
        let m;
        while ((m = re.exec(raw))) {
          let name = m[1]
            .replace(/^[个件只套笔]\s*/, '')                       /* 上一行 "库存N个" 的尾字 */
            .replace(/^(规格|选择|颜色|尺寸|款式)\s*/, '')
            .replace(/[¥￥]\s*\d+/g, ' ')
            .replace(/\s+/g, ' ').trim();
          if (!name || name.length < 2 || name.length > 60) continue;
          if (seen[name]) continue;
          seen[name] = 1;
          out.push({
            name: name,
            price: Number(m[2]) || 0,
            stock: Number(m[3]) || 0,
            image: ''
          });
        }
        /* 图数与行数一致才按顺序贴图，避免张冠李戴 */
        if (boxImgs.length && out.length && boxImgs.length === out.length) {
          out.forEach((row, i) => { if (!row.image) row.image = boxImgs[i]; });
        }
      }
    }

    /* 只有 1 行说明那只是默认规格，不是可售矩阵 —— 交给属性表处理 */
    return out.length >= 2 ? out.slice(0, 60) : [];
  }

  /* ---------------- 详情页解析 ---------------- */
  function parseDetail() {
    const out = { url: location.href, name: '', price: '', desc: '', images: [], attrs: [], offerId: '', sku: '', skuOptions: [], skus: [] };

    const om = /offer\/(\d{6,})\.html/i.exec(location.href) || /offerId[=/](\d{6,})/i.exec(location.href);
    if (om) out.offerId = om[1];

    /* ① JSON-LD */
    const lds = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of lds) {
      try {
        const j = JSON.parse(s.textContent);
        const nodes = Array.isArray(j) ? j.slice() : [j];
        if (j && j['@graph']) nodes.push(...j['@graph']);
        for (const n of nodes) {
          if (!n || !/Product/i.test(String(n['@type'] || ''))) continue;
          if (!out.name && n.name) out.name = String(n.name);
          if (!out.desc && n.description) out.desc = String(n.description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (!out.sku && n.sku) out.sku = String(n.sku);
          const ims = n.image ? (Array.isArray(n.image) ? n.image : [n.image]) : [];
          for (const x of ims) {
            const u = norm((x && typeof x === 'object') ? (x.url || '') : x);
            if (u && out.images.indexOf(u) < 0) out.images.push(u);
          }
          const of = Array.isArray(n.offers) ? n.offers[0] : n.offers;
          if (!out.price && of) { const pv = cleanPrice(of.price); if (pv) out.price = pv; }
        }
      } catch (e) {}
    }

    /* ② 页面内嵌 JSON（1688 detailData 等）*/
    try {
      const emb = readEmbedded();
      if (emb) { pickField(emb, out, 0); pickAttrs(emb, out.attrs, 0); }
    } catch (e) {}

    /* ③ meta 兜底
       1688 新版详情页的标题不是 h1 而是 div.title-text，
       og:title 又常带「- 阿里巴巴」后缀，这里按站点常见结构逐个试。 */
    if (!out.name) {
      const tn = document.querySelector('[class*="title-text"],[class*="d-title"],[class*="offer-title"],' +
        '[class*="product-title"],[class*="item-title"],[class*="subject"],[class*="main-title"]');
      out.name = (metaOf('og:title') || txt(tn) || txt(document.querySelector('h1')) || document.title || '').trim();
      /* 去掉平台附加的后缀，别把「商品名 - 阿里巴巴」整条当商品名 */
      out.name = out.name.replace(/\s*[-|｜]\s*(阿里巴巴|1688\.com|1688|淘宝网|阿里旺铺)\s*$/, '').trim();
    }
    if (!out.price) { const pv = cleanPrice(metaOf('product:price:amount')); if (pv) out.price = pv; }
    if (!out.desc) out.desc = (metaOf('og:description') || metaOf('description') || '').trim();
    /* 商品属性表：1688 详情页的「商品属性 / 规格参数」 */
    try {
      for (const p of readAttrTable()) if (!out.attrs.some(x => x.k === p.k)) out.attrs.push(p);
    } catch (e) {}
    /* ★ SKU 销售属性（颜色/款式选项 + 每选项图）：1688 存在 skuProps 结构里，
       普通属性表读不到，必须单独抓。这是「SKU 规格采不过来」的正解。 */
    try {
      out.skuOptions = readSkuOptions();
      /* 同时把每个选项组写进 attrs，让 normalizeSpecs 也能映射成 spec_color */
      for (const g of out.skuOptions) {
        if (!g.items || g.items.length < 2) continue;
        const joined = g.items.map(x => x.name).join(' / ');
        const isColor = /颜色|色系|color/i.test(g.group);
        const key = isColor ? '颜色' : (/尺寸|尺码|size/i.test(g.group) ? '尺码' : '款式');
        if (!out.attrs.some(x => x.k === key)) out.attrs.push({ k: key, v: joined });
      }
    } catch (e) {}
    /* ★ SKU 组合矩阵：真实可售单元（组合名 + 价格 + 库存 + 缩略图）。
       有它就以它为准；1688 常把整条组合枚举塞在「规格」属性里，
       那种枚举不能再当成「颜色」写进 specs。 */
    try {
      out.skus = readSkuMatrix();
      if (out.skus.length) {
        const ps = out.skus.map(s => Number(s.price)).filter(p => p > 0);
        if (ps.length && !(Number(out.price) > 0)) out.price = String(Math.min.apply(null, ps));
      }
    } catch (e) {}
    /* 描述：meta 太短就用详情页正文 */
    if (out.desc.length < 12) { const d = readDescText(); if (d.length >= 12) out.desc = d; }
    out.attrs = out.attrs.slice(0, 40);

    /* ④ 页面内商品图 */
    if (!out.images.length) {
      const oi = metaOf('og:image:secure_url') || metaOf('og:image') || metaOf('twitter:image');
      if (oi) out.images.push(norm(oi));
    }
    const imgs = document.querySelectorAll('img');
    const cands = [], seenImg = {};
    for (const el of imgs) {
      const u = imgUrlOf(el);
      if (!u) continue;
      const raw = decodeEnt(u);
      if (/^data:/i.test(raw)) continue;
      if (ICON_IMG.test(raw)) continue;   /* ★ SVG / tps 小图标直接排除 */
      if (/logo|icon|avatar|blank|loading|placeholder|badge|qrcode|sprite/i.test(raw)) continue;
      /* 图片判定：带图片扩展名，或属于已知图片 CDN / 图片服务域名 */
      const hasExt = /\.(jpg|jpeg|png|webp|gif|bmp|avif)([?#]|$)/i.test(raw);
      const knownCdn = /alicdn|taobaocdn|tmall\.com|\.com\/image\/|images?\.|cdn\.|img\.|pics?\.|photo/i.test(raw);
      if (!hasExt && !knownCdn) continue;
      const au = cleanImg(norm(u));
      if (!au || seenImg[au]) continue;
      seenImg[au] = 1;
      cands.push({ url: au, score: scoreImg(el, au) });
    }
    /* 内嵌 JSON 里的图片一起参与排序 */
    for (const u of out.images) {
      if (ICON_IMG.test(u)) continue;   /* ★ 内嵌 JSON 里的 SVG 图标也排除 */
      if (seenImg[u]) continue;
      seenImg[u] = 1;
      cands.push({ url: u, score: scoreImg({}, u) });
    }
    cands.sort((a, b) => b.score - a.score);
    /* ★ 只保留有效分（>=0）的商品图；图标已被排除，负分不再混进来。
       ★ 后台主图最多 5 张：这里直接只取前 5 张，详情长图已在评分时降权到负数被过滤掉 */
    out.images = cands.filter(x => x.score >= 0).slice(0, 5).map(x => x.url);

    /* ⑤ 价格：详情页专有 class
       1688 新版：span.price-text（可能带 ¥ 与「起」）
       1688 老版：.price-value / .price-original
       注意要避开划线原价，优先取第一个非原价的元素。 */
    if (!out.price) {
      /* ★ 1688 新版价格在 [class*=price] 里，但第一个匹配元素常是空壳/标签。
         遍历全部候选：优先「到手价/预估价」，再取任意带 ¥ 的价格。
         价格后常粘连数量（如 ¥13.501个起批），故小数最多取 2 位。 */
      const priceTexts = [];
      try {
        document.querySelectorAll('[class*="price"],[class*="Price"]').forEach(el => {
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (t && t.length < 90 && /\d/.test(t) && priceTexts.indexOf(t) < 0) priceTexts.push(t);
        });
      } catch (e) {}
      const grab = (text, anchor) => {
        let s = text;
        if (anchor) { const i = s.indexOf(anchor); if (i >= 0) s = s.slice(i); }
        const m = /[¥￥]\s*([\d]+(?:\.\d{1,2})?)/.exec(s);
        return m ? m[1] : '';
      };
      /* ① 含「到手价/预估/成交」的文本，从该词之后取价 */
      for (const t of priceTexts) {
        if (!/到手价|预估|成交价|促销价/.test(t)) continue;
        const am = /到手价|预估(?:到手)?价|成交价|促销价/.exec(t);
        const p = grab(t, am ? am[0] : '');
        if (p && Number(p) > 0) { out.price = p; break; }
      }
      /* ② 任意带 ¥ 的价格 */
      if (!out.price) for (const t of priceTexts) {
        const p = grab(t);
        if (p && Number(p) > 0) { out.price = p; break; }
      }
      /* ③ 纯数字兜底（老版无 ¥ 符号） */
      if (!out.price) for (const t of priceTexts) {
        const m = /([\d]+(?:\.\d{1,2})?)/.exec(t);
        if (m && Number(m[1]) > 0) { out.price = m[1]; break; }
      }
    }

    /* ⑥ 最后的兜底：从正文可见文本里找 ¥ 价格 / 「起批价…数字」。
       1688 有些活动页把价格放在 Shadow DOM 或非常规 class 里，
       前几种结构化取法会全落空，这里再捞一次。 */
    if (!out.price) {
      const body = ((document.body && document.body.innerText) || '').replace(/\u00a0/g, ' ');
      const lines = body.split(/\n/).map(s => s.trim()).filter(Boolean).slice(0, 400);
      const rules = [
        /[¥￥]\s*([\d]+(?:\.\d{1,2})?)/,
        /(?:到手价|批发价|起批价|单价|价格)[^\d]{0,10}([\d]+(?:\.\d{1,2})?)/
      ];
      for (const re of rules) {
        for (const line of lines) {
          const m = re.exec(line);
          const pv = cleanPrice(m && m[1]);
          if (pv) { out.price = pv; break; }
        }
        if (out.price) break;
      }
    }

    out.name = (out.name || '').trim().slice(0, 160);
    out.desc = (out.desc || '').slice(0, 2000);
    if (!out.image && out.images.length) out.image = out.images[0];
    if (!out.offerId) {
      const m = /offer\/(\d{6,})\.html/i.exec(location.href);
      if (m) out.offerId = m[1];
    }
    return out;
  }

  /* 采集现场快照：价格/属性抓不到时，把页面里到底有什么带回去，
     服务端诊断会记录，下次就能对着真实结构补规则，不再盲猜。 */
  function detailProbe(deep) {
    const p = { href: location.href, title: document.title };
    /* 价格候选：所有 class 带 price 的元素的文本 */
    p.priceTexts = [];
    try {
      const ns = document.querySelectorAll('[class*="price"],[class*="Price"],[class*="Price"] *');
      for (let i = 0; i < ns.length && p.priceTexts.length < 25; i++) {
        const t = (ns[i].textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length < 60 && /\d/.test(t) && p.priceTexts.indexOf(t) < 0) p.priceTexts.push(t);
      }
    } catch (e) {}
    /* 内嵌变量顶层键 + 疑似价格字段 */
    p.embeds = {};
    try {
      const emb = readEmbedded();
      if (emb && typeof emb === 'object') {
        p.embeds.keys = Object.keys(emb).slice(0, 30);
        p.embeds.priceKeys = [];
        const found = {};
        (function walk(o, dep) {
          if (!o || dep > 5 || typeof o !== 'object') return;
          for (const k in o) {
            if (/price|Price|价/.test(k) && o[k] !== null && typeof o[k] !== 'object') {
              const v = String(o[k]).slice(0, 60);
              const sig = k + '=' + v;
              if (p.embeds.priceKeys.length < 25 && !found[sig]) { found[sig] = 1; p.embeds.priceKeys.push(sig); }
            } else if (o[k] && typeof o[k] === 'object') walk(o[k], dep + 1);
          }
        })(emb, 0);
      }
    } catch (e) { p.embeds.err = e.message; }
    /* 属性表候选 */
    p.attrs = [];
    try {
      const trs = document.querySelectorAll('tr,dt,[class*="attr"],[class*="prop"]');
      for (let i = 0; i < trs.length && p.attrs.length < 25; i++) {
        const t = (trs[i].textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length < 120 && p.attrs.indexOf(t) < 0) p.attrs.push(t);
      }
    } catch (e) {}
    /* ★ SKU 结构探测：确认 1688 规格选项里到底有没有图片字段、选项名长什么样。
       只上报结构（键名 + 前 3 项的 name/image/url 候选），不传全量，避免诊断过大。 */
    p.sku = [];
    if (deep) try {
      const emb = readEmbedded();
      const seenSku = new Set();
      /* 节点预算：1688 的内嵌数据是几 MB 的大对象，无上限递归会把采集拖到超时 */
      let budget = 1200;
      (function walk(o, dep) {
        if (!o || dep > 6 || typeof o !== 'object' || p.sku.length >= 6 || budget <= 0) return;
        budget--;
        if (Array.isArray(o)) { for (const it of o) walk(it, dep + 1); return; }
        for (const lk of ['skuProps', 'skuBase', 'valueList', 'skuMap', 'saleProps']) {
          const list = o[lk];
          if (!Array.isArray(list) || list.length < 2) continue;
          const first = list[0];
          const keys = first && typeof first === 'object' ? Object.keys(first).slice(0, 18) : [];
          const sample = list.slice(0, 3).map((it) => {
            if (!it || typeof it !== 'object') return { raw: String(it).slice(0, 24) };
            const urls = [];
            (function deep(v, d) {
              if (!v || d > 3 || urls.length >= 3) return;
              if (typeof v === 'string') { if (isImgUrl(v)) urls.push(v.slice(0, 100)); return; }
              if (typeof v === 'object') for (const kk in v) deep(v[kk], d + 1);
            })(it, 0);
            return { name: (skuOptionName(it) || '').slice(0, 26), img: (skuOptionImg(it) || '').slice(0, 100), keys: Object.keys(it).slice(0, 14), urls };
          });
          const sig = lk + '|' + keys.join(',');
          if (!seenSku.has(sig)) { seenSku.add(sig); p.sku.push({ at: lk, keys, sample }); }
        }
        for (const k in o) if (o[k] && typeof o[k] === 'object') walk(o[k], dep + 1);
      })(emb, 0);
    } catch (e) { p.skuErr = e.message; }
    /* 解析器最终产出的 SKU 组（后台按这个落库，出问题一眼能看出是解析还是落库丢的） */
    if (deep) try {
      p.skuOpts = readSkuOptions().map(g => ({
        group: g.group,
        names: g.items.map(x => x.name),
        imgs: g.items.map(x => x.image || '').filter(Boolean).length
      }));
    } catch (e) { p.skuOptsErr = e.message; }
    return p;
  }

  /* ★ 等属性区渲染：1688 新版「商品属性/规格参数」是异步填充的，
     首屏 0.2 秒抓不到，等 DOM 里出现属性块再重解析。
     用 MutationObserver 一出现就返回，最快；定时兜底防不触发。
     只在首帧确实没抓到属性时才等，正常页零额外开销。 */
  function waitForAttrs(budgetMs) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; try { obs.disconnect(); } catch (e) {} clearTimeout(timer); resolve(); };
      const hasAttr = () => {
        /* 命中任意属性名词典的可见文本，或标准属性容器里有内容 */
        const sels = '[class*="attribute"],[class*="Attribute"],[class*="prop-list"],[class*="spec-list"],[class*="detail-param"],tr,dt';
        const nodes = document.querySelectorAll(sels);
        for (let i = 0; i < nodes.length; i++) {
          const t = (nodes[i].textContent || '').replace(/\s+/g, ' ').trim();
          if (t.length >= 4 && /(材质|颜色|规格|尺寸|长度|直径|重量|净重|品牌|型号|产地|噪音|防水|充电|功能|最大|是否)/.test(t)) return true;
        }
        return false;
      };
      if (hasAttr()) { resolve(); return; }
      let obs;
      try { obs = new MutationObserver(() => { if (hasAttr()) finish(); }); obs.observe(document.body, { childList: true, subtree: true, characterData: true }); } catch (e) {}
      const timer = setTimeout(finish, budgetMs || 1200);
    });
  }

  async function detail() {
    const blocked = nonProductReason();
    if (blocked) return { ok:false, error:blocked, total:0, items:[], url:location.href };
    let d = parseDetail();
    /* 价格和图秒读，但属性 / SKU 规格区靠 DOM 异步渲染 —— 缺了就等它渲染出来再解析一次 */
    if (!d.attrs || !d.attrs.length || !d.skus || !d.skus.length) {
      await waitForAttrs(1200);
      const d2 = parseDetail();
      if ((d2.attrs && d2.attrs.length) || (d2.skus && d2.skus.length)) d = d2;
    }
    /* 只有 SKU 没抓到、或抓到了却没有选项图时才跑结构探测 —— 正常页零额外开销 */
    const needSkuProbe = !(d.skuOptions && d.skuOptions.length &&
      d.skuOptions.some(g => (g.items || []).some(i => i.image)));
    return { ok: true, kind: 'detail', total: 1, items: [d], url: location.href, probe: detailProbe(needSkuProbe) };
  }

  /* 诊断：把页面结构信息回传，便于针对具体站点调解析器 */
  function diag() {
    const links = findOfferLinks();
    const info = {
      href: location.href, title: document.title,
      linkCount: links.length,
      linkSamples: links.slice(0, 5).map((l) => l.url),
      imgSamples: []
    };
    const ims = document.querySelectorAll('img');
    for (let i = 0; i < ims.length && info.imgSamples.length < 8; i++) {
      info.imgSamples.push({
        cls: (ims[i].className || '').slice(0, 80),
        dataSrc: ims[i].getAttribute('data-src') || '',
        src: (ims[i].getAttribute('src') || '').slice(0, 160),
        alt: (ims[i].getAttribute('alt') || '').slice(0, 60)
      });
    }
    return { ok: true, kind: 'diag', total: 0, items: [], diag: info };
  }

  /* ---------------- 临时诊断：SKU 结构快照 ----------------
     只回答一个问题：颜色/款式选项的「缩略图」在页面里到底以什么形式存在
     （<img>？CSS background-image？还是在某个 skuInfoMap 里），
     以及内嵌 JSON 里 sku* 结构长什么样。
     采集时顺带调用一次，不影响采集结果；拿到结构就删掉这段。 */
  function skuDump() {
    const out = { ok: true, url: location.href, build: INJECT_BUILD, vars: {}, skuPaths: [], dom: [], colorChain: null, colorHTML: '' };
    const VARS = ['detailData', '__INIT_DATA__', 'offerData', '__NEXT_DATA__', '__PAGE_DATA__',
      'initialData', '__INITIAL_STATE__', '__APOLLO_STATE__', '__NUXT__', '__ICE_APP_CONTEXT__'];
    for (const n of VARS) {
      try {
        const v = window[n];
        if (v && typeof v === 'object') out.vars[n] = Array.isArray(v)
          ? ('array(' + v.length + ')')
          : ('obj: ' + Object.keys(v).slice(0, 25).join(','));
      } catch (e) {}
    }

    /* 在内嵌数据里找所有 sku* 键，记录路径 + 形状 + 一小段样本 */
    const seen = new Set();
    const MAXP = 40;
    const walk = (o, p, d) => {
      if (!o || typeof o !== 'object' || d > 7 || out.skuPaths.length >= MAXP) return;
      if (seen.has(o)) return; seen.add(o);
      if (Array.isArray(o)) {
        for (let i = 0; i < Math.min(o.length, 3); i++) walk(o[i], p + '[' + i + ']', d + 1);
        return;
      }
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (/sku/i.test(k) && out.skuPaths.length < MAXP) {
          const rec = { path: (p ? p + '.' : '') + k };
          if (Array.isArray(v)) {
            rec.type = 'array'; rec.len = v.length;
            rec.firstKeys = (v[0] && typeof v[0] === 'object') ? Object.keys(v[0]).slice(0, 20) : [];
            rec.sample = JSON.stringify(v[0] || null).slice(0, 300);
          } else if (v && typeof v === 'object') {
            rec.type = 'object'; rec.keys = Object.keys(v).slice(0, 12);
            const fk = Object.keys(v)[0];
            if (fk) { const tmp = {}; tmp[fk] = v[fk]; try { rec.sample = JSON.stringify(tmp).slice(0, 260); } catch (e) {} }
          } else { rec.type = typeof v; rec.value = String(v).slice(0, 50); }
          out.skuPaths.push(rec);
        }
        walk(v, (p ? p + '.' : '') + k, d + 1);
      }
    };
    for (const n of VARS) { try { walk(window[n], n, 0); } catch (e) {} }

    /* DOM：SKU 容器里的图是 <img> 还是 background-image */
    try {
      const cands = document.querySelectorAll('[class*="sku"],[class*="Sku"],[class*="prop"],[class*="Prop"]');
      let cnt = 0;
      for (const el of cands) {
        if (cnt >= 18) break;
        if (!el.children || !el.children.length) continue;
        const imgs = el.querySelectorAll('img');
        const bg = [];
        const scan = el.querySelectorAll('div,span,i,img');
        for (let i = 0; i < scan.length && bg.length < 3; i++) {
          const bi = getComputedStyle(scan[i]).backgroundImage || '';
          if (bi && bi !== 'none' && bi.indexOf('url') >= 0) bg.push({ cls: String(scan[i].className || '').slice(0, 50), bg: bi.slice(0, 150) });
        }
        const tx = (el.innerText || '').replace(/\s+/g, ' ').slice(0, 120);
        if (!tx && !imgs.length && !bg.length) continue;
        out.dom.push({
          tag: el.tagName, cls: String(el.className || '').slice(0, 70), imgCount: imgs.length,
          imgs: Array.from(imgs).slice(0, 3).map(im => ({
            src: (im.getAttribute('src') || '').slice(0, 100),
            dataSrc: (im.getAttribute('data-src') || '').slice(0, 100)
          })),
          bg, text: tx
        });
        cnt++;
      }
    } catch (e) {}

    /* 颜色词所在元素的祖先链 + outerHTML（看缩略图挂在谁身上） */
    try {
      let hit = null;
      const wk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      while (wk.nextNode()) {
        const nn = wk.currentNode;
        if (/紫色|玫红|粉色|黑色|蓝色/.test(nn.nodeValue || '')) { hit = nn.parentElement; break; }
      }
      if (hit) {
        const chain = []; let e = hit;
        for (let d = 0; d < 6 && e; d++) {
          chain.push({
            tag: e.tagName, cls: String(e.className || '').slice(0, 60),
            bg: (getComputedStyle(e).backgroundImage || '').slice(0, 100),
            imgs: e.querySelectorAll ? e.querySelectorAll('img').length : 0
          });
          e = e.parentElement;
        }
        out.colorChain = chain;
        out.colorHTML = (hit.parentElement ? hit.parentElement.outerHTML : '').slice(0, 1200);
      }
    } catch (e) {}
    return out;
  }

  /* ============================================================
     全店採集 · 掃描店鋪頁的商品鏈接
     ---------------------------------------------------------
     複用 findOfferLinks() 已有的商品鏈接識別邏輯，
     同時返回「有沒有下一頁」+「下一頁 URL」。
     支持多種店鋪平台的分頁：
       - 1688: shop*.1688.com 店鋪頁有 ?beginPage= 或 ?page= 參數
       - 淘寶/天貓: 店鋪頁 ?page=
       - 京東: ?page=
       - 通用: 找 .pagination / .pager / .next / .next-page 之類的下一頁按鈕
     ============================================================ */
  /* ============ 1688 店鋪頁特徵 ============ */
  /* 新版 shopXXXX.1688.com 和舊版 xxx.1688.com 都算 */
  const IS_1688_SHOP = (() => {
    try {
      const h = location.hostname.toLowerCase();
      if (!h.endsWith('.1688.com')) return false;
      /* 排除 detail / offer / alicdn 等非店鋪子域 */
      if (/^(detail|offer|offers|upload|img|cbu01|cbu02|s\.alicdn|.*\.alicdn)\./.test(h)) return false;
      return true;
    } catch (e) { return false; }
  })();

  const IS_1688_SPA = IS_1688_SHOP && (
    /\/(page\/)?offerlist(\.html|\.htm)?(\?|$)/i.test(location.pathname + location.search)
    || /\/(page\/)?search(\.html|\.htm)?(\?|$)/i.test(location.pathname + location.search)
    || /\/page\/offerlist/i.test(location.pathname)
    || !location.pathname || location.pathname === '/'
  );

  async function shopLinks() {
    const blocked = nonProductReason();
    if (blocked) return { ok: false, error: blocked, urls: [], hasNext: false, nextUrl: '', isSpaMode: false, is1688: false };

    if (IS_1688_SHOP) {
      try { await autoScroll(18, 500, 30); } catch (e) {}
    } else {
      try {
        for (let i = 0; i < 8; i++) { window.scrollBy(0, window.innerHeight * 2); await new Promise(r => setTimeout(r, 200)); }
        window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 150));
      } catch (e) {}
    }

    const links = findOfferLinks();
    const urls = links.map(l => cleanUrl(l.url));

    let hasNext = false, nextUrl = '', isSpaMode = IS_1688_SPA;

    try {
      const u = new URL(location.href);
      const PAGE_PARAMS = ['beginPage', 'page', 'page_index', 'pageNo', 'pageno', 'curPage'];
      let pageParam = null, curPage = 0;
      for (const p of PAGE_PARAMS) {
        if (u.searchParams.has(p)) { pageParam = p; curPage = parseInt(u.searchParams.get(p) || '1', 10) || 1; break; }
      }
      if (!pageParam) {
        const m = location.pathname.match(/\/page(\d+)(?:\.html)?$/i);
        if (m) { curPage = parseInt(m[1], 10); pageParam = '__path_page__'; }
      }

      if (pageParam && curPage > 0) {
        let maxPage = curPage;
        for (const p of PAGE_PARAMS) {
          document.querySelectorAll('a[href*="' + p + '="]').forEach(a => {
            try {
              const pp = new URL(a.href, location.href).searchParams.get(p);
              const pn = parseInt(pp, 10);
              if (pn > maxPage && pn < 9999) maxPage = pn;
            } catch (e) {}
          });
        }
        const PAGER_SELECTORS = [
          '[class*="pagination"] a', '[class*="Pagination"] a',
          '[class*="pager"] a', '[class*="Pager"] a',
          '[class*="page-num"] a', '[class*="pageNum"] a',
          '[class*="od-pagination"] a', '[class*="odPagination"] a',
          '.pagination li a', '.pager li a', '.pages li a'
        ];
        for (const sel of PAGER_SELECTORS) {
          document.querySelectorAll(sel).forEach(a => {
            const txt = (a.textContent || '').trim();
            const pn = parseInt(txt, 10);
            if (pn > maxPage && pn < 9999) maxPage = pn;
            try {
              const href = a.getAttribute('href') || '';
              for (const p of PAGE_PARAMS) {
                const pm = new RegExp('[?&]' + p + '=(\\d+)', 'i').exec(href);
                if (pm) { const hpn = parseInt(pm[1], 10); if (hpn > maxPage && hpn < 9999) maxPage = hpn; }
              }
              const pmp = /\/page(\d+)(?:\.html)?$/.exec(href);
              if (pmp) { const hpn = parseInt(pmp[1], 10); if (hpn > maxPage && hpn < 9999) maxPage = hpn; }
            } catch (e) {}
          });
        }

        if (curPage < maxPage) {
          if (pageParam === '__path_page__') {
            nextUrl = location.href.replace(/\/page\d+(?:\.html)?$/i, '/page' + (curPage + 1) + '.html');
          } else {
            const next = new URL(location.href);
            next.searchParams.set(pageParam, String(curPage + 1));
            nextUrl = next.href;
          }
          hasNext = true;
        }
      }

      if (!hasNext) {
        const NEXT_SELECTORS = [
          '[class*="pagination"] [class*="next"]',
          '[class*="Pagination"] [class*="next"]',
          '[class*="od-pagination"] [class*="next"]',
          '[class*="odPagination"] [class*="next"]',
          'a.next', 'a[class*="next-page"]', 'a[class*="page-next"]',
          'button.next', 'button[class*="next-page"]', 'button[class*="page-next"]',
          'li.next a', 'li[class*="next"] a',
          '.pagination .next a', '.pager .next a', '.pages .next',
          'a[rel="next"]', 'button[rel="next"]'
        ];
        for (const sel of NEXT_SELECTORS) {
          const n = document.querySelector(sel);
          if (n) {
            const disabled = n.disabled || n.classList.contains('disabled')
              || n.classList.contains('next-disabled') || n.getAttribute('aria-disabled') === 'true';
            if (disabled) break;
            const href = n.getAttribute('href');
            if (href && href !== '#' && !isSpaMode && !/^javascript:/i.test(href)) {
              nextUrl = norm(href); hasNext = !!nextUrl; break;
            }
            hasNext = true; isSpaMode = true; break;
          }
        }
      }

      if (!hasNext) {
        for (const a of document.querySelectorAll('a, button, span')) {
          const txt = (a.textContent || '').replace(/\s+/g, '').trim();
          if (!txt) continue;
          if (/^(下一页|下一页|下一页|下页|Next|NEXT|next|›|»)$/.test(txt)) {
            const disabled = a.disabled || a.classList.contains('disabled')
              || a.classList.contains('next-disabled') || a.getAttribute('aria-disabled') === 'true';
            if (disabled) break;
            const href = a.getAttribute ? a.getAttribute('href') : '';
            if (href && href !== '#' && !/^javascript:/i.test(href) && !isSpaMode) {
              nextUrl = norm(href); hasNext = !!nextUrl;
            } else if (!disabled) { hasNext = true; isSpaMode = true; }
            break;
          }
        }
      }
    } catch (e) {}

    return { ok: true, urls, hasNext, nextUrl, isSpaMode, is1688: IS_1688_SHOP };
  }

  async function shopWaitPageChange(oldUrlCount) {
    if (IS_1688_SPA) {
      return new Promise((resolve) => {
        let done = false;
        const finish = () => { if (done) return; done = true; try { obs.disconnect(); } catch (e) {} resolve(true); };
        setTimeout(() => { if (scanProductLinks() !== oldUrlCount) finish(); }, 300);
        const obs = new MutationObserver(() => {
          if (Date.now() - (obs._last || 0) < 120) { obs._last = Date.now(); return; }
          obs._last = Date.now();
          if (scanProductLinks() !== oldUrlCount) finish();
        });
        try { obs.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
        setTimeout(finish, 10000);
      });
    }
    await new Promise(r => setTimeout(r, 1200));
    return true;
  }

  async function shopClickNext() {
    const NEXT_SELECTORS = [
      '[class*="pagination"] [class*="next"]',
      '[class*="Pagination"] [class*="next"]',
      '[class*="od-pagination"] [class*="next"]',
      '[class*="odPagination"] [class*="next"]',
      'a.next', 'a[class*="next-page"]', 'a[class*="page-next"]',
      'button.next', 'button[class*="next-page"]', 'button[class*="page-next"]',
      'li.next a', 'li[class*="next"] a',
      '.pagination .next a', '.pager .next a', '.pages .next',
      'a[rel="next"]', 'button[rel="next"]'
    ];
    for (const sel of NEXT_SELECTORS) {
      const n = document.querySelector(sel);
      if (n) {
        const disabled = n.disabled || n.classList.contains('disabled')
          || n.classList.contains('next-disabled') || n.getAttribute('aria-disabled') === 'true';
        if (disabled) continue;
        try {
          n.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          n.click();
          n.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        } catch (e) {}
        return true;
      }
    }
    const allClicky = document.querySelectorAll('a, button, span, div');
    for (const a of allClicky) {
      const txt = (a.textContent || '').replace(/\s+/g, '').trim();
      if (!txt) continue;
      if (/^(下一页|下一页|下一页|下页|Next|NEXT|next|›|»)$/.test(txt)) {
        const disabled = a.disabled || a.classList.contains('disabled')
          || a.classList.contains('next-disabled') || a.getAttribute('aria-disabled') === 'true';
        if (disabled) continue;
        const href = a.getAttribute ? a.getAttribute('href') : '';
        if (!href && typeof a.onclick !== 'function') continue;
        try { a.click(); } catch (e) {}
        return true;
      }
    }
    return false;
  }

  window.__LUM_COLLECT__ = { __build: INJECT_BUILD, list, detail, diag, skuDump, parseDetail, cardInfo, findOfferLinks, shopLinks, shopClickNext, shopWaitPageChange };

})();
