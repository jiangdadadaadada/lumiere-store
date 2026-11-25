/* 页面主世界（MAIN world）采集脚本




   注入到 1688 页面上下文里执行，可以直接读页面 JS 变量、用页面登录态发请求。




   对外只暴露 window.__c1688 = { list, detail, probe }




   —— 选择器/内嵌数据都没法离线验证，「探针」就是拿来校准的：面板点「探针」把真实结构贴给我，我再按真实字段改。 */




(function () {




  // 🔧 2026-11-01 自动联动: ERP 基地址从 chrome.storage 读取(由 background 的 discoverErp 写入),
  //   不再硬编码 127.0.0.1:3100 —— 跨机场景(ERP 在服务器)也能正确回传 /api/classify
  let ERP_BASE = 'http://127.0.0.1:3100';
  try { if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get({ erp: 'http://127.0.0.1:3100' }, (r) => { if (r && r.erp) ERP_BASE = String(r.erp).replace(/\/+$/, ''); });
  } } catch (e) {}

  /* ── ⓪ 响应钩子（document_start 注入，必须在页面发请求之前装好）──




     1688 店铺页的商品数据走 h5api.m.1688.com/h5/mtop.* 接口，请求带 sign 签名（算不出来）。




     所以不自己发请求，而是在页面上下文里把 fetch / XHR 的**响应原文**抄一份下来，




     再从 JSON 里抽商品 —— 这也正是妙手那类插件的取数思路。 */




  window.__c1688cap = window.__c1688cap || { items: [], on: false };




  if (!window.__c1688cap.on) {




    window.__c1688cap.on = true;




    // ⚠ 只截接口响应：排除 .js/.css/字体/图片 和 CDN 打包文件（曾把 400KB 的 lib-mtop.js 误当响应塞满缓存）




    const isStatic = (u) => /\.(js|css|json|png|jpg|jpeg|gif|webp|svg|woff2?|ttf)(\?|$)/i.test(String(u)) ||




      /g\.alicdn\.com|alicdn\.com\/odt|mmstat\.com/i.test(String(u));




    const WANT_ok = (u) => !isStatic(u) && /mtop|moduledata|shop\.data|offerlist|offer_list|skuInfo|skuModel|skuPanel|od-panel|1688\.com\/offer|api-gw|\/v2\/(offer|sku|product)|alibaba\.offer|ali.*offer.*spec|ali.*offer.*price/i.test(String(u));




    const MAXB = 400000;




    const push = (url, body) => {




      try {




        if (!body) return;




        const s = String(url);




        const b = String(body);




        const keep = (tag) => {




          window.__c1688cap.items.push({ url: s.slice(0, 300), body: b.slice(0, MAXB), ts: Date.now(), tag });




          if (window.__c1688cap.items.length > 60) window.__c1688cap.items.shift();




        };




        // 🔒 根治（江少「sku规格只采到尺码」）：响应体含 skuModel 结构 → 强制保留（颜色轴关键），




        //    绕过 isStatic 的 .json 误杀与 WANT_ok 关键词漏网。




        if (/skuModel|propValues|skuInfos|skuProps|specValues|valueList/i.test(b)) { keep('sku'); return; }




        // 🔴 2026-10-27 根治（江少「noon 类目/属性/尺寸重量不能一比一」）：noon 是 CSR SPA，




        //   官方类目码不在页面 HTML 里，而在 noon 的商品 API（fetch/POST GraphQL）响应里。




        //   页面探针已证实：json_scripts 空、无 __NEXT_DATA__、JSON-LD 无 category → 官方码只能在




        //   接口响应里。这里扩大 noon 抓取：任何 JSON 形态响应里含商品类目标识关键词的强制保留




        //   （category/catalog/offer/nsm/digitalProduct），绕开 noon API 端点未知、纯 1688 关键词漏网。




        if (/category|offercatalog|digitalproduct|productlist|productdetail|\.p\?o=|wog\/|\/grp\//i.test(s) && /^\s*[[{]/.test(b) && b.length > 200) { keep('nooncat'); return; }




        // 其它商品接口（mtop/moduledata/shop.data.get/offerlist 等）




        if (!isStatic(s) && WANT_ok(s)) { keep('api'); return; }




        // 🎯 取证兜底：详情页上任何 JSON 形态、非静态的响应都留一份（最多 60 条），




        //    这样 1688 真实返回什么结构能直接落库给我看，不再盲猜、不再让你反复试。




        if (!isStatic(s) && /^\s*[[{]/.test(b) && b.length > 200) keep('json');




      } catch (e) { /* 忽略 */ }




    };




    try {




      const _fetch = window.fetch;




      if (typeof _fetch === 'function') {




        window.fetch = function (...a) {




          const url = (typeof a[0] === 'string') ? a[0] : (a[0] && a[0].url) || '';




          return _fetch.apply(this, a).then((res) => {




            try {




              const clone = res.clone();




              clone.text().then((t) => push(url, t)).catch(() => { });




            } catch (e) { /* 忽略 */ }




            return res;




          });




        };




      }




    } catch (e) { /* 忽略 */ }




    try {




      const _open = XMLHttpRequest.prototype.open;




      const _send = XMLHttpRequest.prototype.send;




      XMLHttpRequest.prototype.open = function (m, url, ...rest) {




        this.__c1688url = url;




        return _open.call(this, m, url, ...rest);




      };




      XMLHttpRequest.prototype.send = function (...a) {




        try {




          this.addEventListener('load', function () {




            try {




              // 🔴 2026-10-27 增强：不限 responseType，noon 的 GraphQL/POST 常以 json/arraybuffer 返回，




              //   旧代码只捕 text/'' → noon 商品 API 全漏。这里 text/''/json 都能读 responseText。




              const rt = this.responseType || '';




              if (rt === '' || rt === 'text' || rt === 'json') push(this.__c1688url, this.responseText || '');




            } catch (e) { /* 忽略 */ }




          });




        } catch (e) { /* 忽略 */ }




        return _send.apply(this, a);




      };




    } catch (e) { /* 忽略 */ }




  }




  if (window.__c1688) return;




  const OFFER_RE = /\/offer\/(\d+)\.html/i;




  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  // 1688 offer_details 有时混入图片热区配置，不是买家可读的商品描述。
  const cleanDescription = (s) => clean(s).replace(/\{\s*["']?styleType["']?\s*:\s*["']?offer-type-\d+["']?[\s\S]*?["']?usemap["']?\s*:\s*["']?_sdmap_\d+["']?\s*\}/gi, ' ').replace(/\s+/g, ' ').trim();




  const num = (s) => {




    const m = clean(s).match(/[\d]+(?:[.,]\d+)?/);




    return m ? m[0].replace(/,/g, '') : '';




  };




  // 🔒 2026-10-24 江少「价格是0的怎么还这样」：'0' 是 truthy，会把所有兜底挡死




  //   （实测 1089119388225 接口给 price:'0'，¥ 兜底/接口补价/重扫补价全被它挡住）。0 不算价。




  const hasP = (v) => { const n = num(v); return n !== '' && +n > 0; };




  // 🔒 2026-10-25 江少「价格被四舍五入（13.44→13）」：1688 常把价格拆成两个元素——




  //   「¥13」整元大字 +「.44」角分小字分开放，只取价格元素自己的 textContent 就丢小数。




  //   取到价格元素后向后看最多 3 个兄弟节点：以 ./, + 1-2 位数字开头（角分后缀）→ 拼回完整价。




  const priceTextOf = (el) => {




    if (!el) return '';




    let t = clean(el.textContent);




    let sib = el.nextElementSibling, guard = 0;




    while (sib && guard++ < 3) {




      const st = clean(sib.textContent || '');




      if (/^[.,]\s*\d{1,2}$/.test(st)) { t += st.replace(/\s+/g, ''); sib = sib.nextElementSibling; }




      else break;




    }




    return t;




  };




  const absUrl = (u) => {




    if (!u) return '';




    u = String(u);




    if (/^https?:/i.test(u)) return u;




    if (u.startsWith('//')) return location.protocol + u;




    if (u.startsWith('/')) return location.origin + u;




    return u;




  };




  // 🔴 2026-10-25 江少 noon 品牌馆扫描「主图不对」实证：noon 卡片 <img> 的 src 是




  //   media-placeholder.svg（懒加载占位），真图在 srcset/srcset 或 data-src 里；




  //   旧 pickImg 直接取 src → 50 条队列 49 条主图全是占位图（库实锤）。




  //   修：候选属性全试一遍（懒加载属性 → srcset 最大档 → src），占位/icon/svg 一律跳过。




  const pickImg = (img) => {




    if (!img) return '';




    const cands = [];




    const push = (v) => { const s = String(v || '').trim(); if (s && !cands.includes(s)) cands.push(s); };




    push(img.getAttribute('data-lazy-src'));




    push(img.getAttribute('data-src'));




    push(img.getAttribute('data-ks-lazyload'));




    // srcset/data-srcset："url 120w, url2 240w" → 取最后（最大）那档




    for (const k of ['srcset', 'data-srcset', 'imagesrcset']) {




      const ss = img.getAttribute(k) || '';




      if (ss) { const best = ss.split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean).pop(); push(best); }




    }




    push(img.getAttribute('src'));




    for (const c of cands) {




      const u = absUrl(c).split('?')[0].replace(/_\.webp$/i, '');




      if (u && !/(tps-\d+-\d+|icon|logo|sprite|banner|placeholder|\.svg)/i.test(u)) return u;




    }




    return '';




  };




  // 图片候选打分：带 !! 身份段的完整 URL 优先，裸径（O1CN01xxx_，实测 404）排最后




  const imgScore = (u) => (String(u).includes('!!') ? 2 : 0) + (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(u) ? 1 : 0);




  // 卡片背景图兜底：有些模板主图是 div 的 background-image 而不是 <img>




  // 🔴 2026-10-25 noon 品牌馆实证：looksLikeImg 只认 alicdn/1688 域名，f.nooncdn.com




  //   背景图全被否 → 这里对非 1688 域加一条宽松候选（http 图扩展名 + 排占位/icon）




  const bgOf = (el) => {




    if (!el || !el.style) return '';




    const m = String(el.style.backgroundImage || '').match(/url\(["']?([^"')]+)["']?\)/i);




    if (!m) return '';




    let u = looksLikeImg(m[1]);




    if (!u) {




      const s = String(m[1] || '').trim();




      if (/^https?:\/\/\S+\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(s) && !/(?:icon|logo|sprite|banner|placeholder|\.svg)/i.test(s)) u = s.split('?')[0];




    }




    return u || '';




  };




  const txt = (el) => (el ? clean(el.textContent) : '');

  // 店铺列表的商品链接可能包住整张卡片；直接取 a.textContent 会把评分、价格、销量
  // 一起拼成标题（如“4.6 ¥5.50售7400+件商品名”）。剥离卡片头部的展示元数据。
  const cleanOfferListTitle = (value) => {
    let s = clean(value).replace(/\s+/g, ' ').trim();
    s = s.replace(/^\d(?:\.\d+)?\s*(?:分|★|☆)?\s*(?=[¥￥])/i, '');
    s = s.replace(/^[¥￥]\s*\d[\d,.]*(?:\s*[-~—至]\s*[¥￥]?\s*\d[\d,.]*)?\s*/i, '');
    s = s.replace(/^(?:已售|售)\s*[\d,.+万千亿]*\s*(?:件|笔|人)?\s*/i, '');
    s = s.replace(/^\d(?:\.\d+)?\s*(?:分|★|☆)\s*/i, '');
    return s.replace(/^[\s|｜·•,，;；:：-]+/, '').trim();
  };
  const isStoreOrSupplierTitle = (value) =>
    /(?:有限责任公司|有限公司|服装厂|针织厂|制衣厂|纺织厂|加工厂|鞋厂|贸易商行|商贸公司|工厂直供)/i.test(String(value || '').trim());




  const OFFER_KEYS = ['offerId', 'offer_id', 'offerid', 'offerID', 'id'];




  const TITLE_KEYS = ['subject', 'title', 'offerTitle', 'name', 'itemTitle', 'offerName'];




  const PRICE_KEYS = ['price', 'priceDisplay', 'salePrice', 'promotionPrice', 'priceStr', 'priceText',




    'minPrice', 'maxPrice', 'offerPrice', 'discountPrice', 'priceVal', 'amount', 'value', 'priceNum'];




  const IMG_KEYS = ['offerImages', 'imageList', 'images', 'imgs', 'imageUrl', 'imgUrl', 'picUrl',




    'mainImage', 'picPath', 'image', 'img', 'pic', 'imgPath', 'photoUrl', 'mainPicUrl', 'indexPicUrl',




    'summImage', 'titleImage', 'itemImg', 'offerImg'];




  const firstVal = (o, keys) => {




    for (const k of keys) { const v = o[k]; if (v != null && typeof v !== 'object') return v; }




    return '';




  };




  const IMG_RE = /(alicdn\.com|1688\.com)\/[^"'\s]+\.(jpg|jpeg|png|webp|gif)/i;




  // ⚠ tps-176-56.png 是平台徽标横幅（不是商品图），svg/icon/logo/sprite/banner 一律排掉




  const BAD_IMG = /(tps-\d+-\d+|icon|logo|sprite|banner|placeholder|\.svg)/i;




  // 键名带这些字的多半是店铺 logo/二维码/推荐位，不是商品主图（深搜兜底时跳过）




  const BAD_KEY = (k) => /logo|icon|sprite|banner|placeholder|qr|avatar|vip|star|level|agent|company|seller|supplier|store|shop/i.test(k);




  // 无域名相对图径：1688 商品图标准路径 img/ibank/…、详情描述图 imgextra/…




  const IMG_PATH_RE = /^\/{0,2}(img\/ibank|imgextra)\/.+\.(jpg|jpeg|png|webp)/i;




  // 有些接口只给图片 ID（O1CN01xxxx.jpg），按 ibank 标准路径补全




  const IMG_ID_RE = /^O1CN0[0-9a-zA-Z_-]{6,}(\.(jpg|jpeg|png|webp))?$/i;




  /* 认一个值是不是商品图：是 → 规范化 URL（绝对化/补域名/去缩放参数），否 → ''




     ⚠ 必须幂等：deepOffers 里会对挖到的结果再规范化一次，规范化产物不能再被否掉。




     ⚠ 2026-10-23 实测（curl 四种形态）：!!2221174228178-0-cib.jpg 是图片"身份段"不是




        尺寸后缀——剥掉就变裸径 O1CN01xxx_（404 裂图，转存也失败）。只剥「!!400x400.jpg」




        这种纯尺寸后缀；.jpg_.webp 是 webp 适配格式，还原成原始扩展名。 */




  function looksLikeImg(v) {




    const s = String(v == null ? '' : v).trim();




    if (s.length < 12 || s.length > 600 || /[\s"'<>]/.test(s)) return '';




    if (BAD_IMG.test(s)) return '';




    let u = '';




    if (/^https?:\/\/[^\s"'<>]+\.(?:alicdn|1688)\.com\//i.test(s)) u = s;                     // 已是绝对地址




    else if (IMG_RE.test(s)) u = absUrl(s);                                                   // 任意带域名的图 URL




    else if (IMG_PATH_RE.test(s)) u = 'https://cbu01.alicdn.com/' + s.replace(/^\/+/, '');    // 无域名图径




    else if (IMG_ID_RE.test(s)) u = 'https://cbu01.alicdn.com/img/ibank/' + s;                 // 纯图片 ID




    else return '';




    u = u.replace(/!!\d+(?:x\d+)?\.(?:jpg|jpeg|png|webp)(?=$|\?)/i, '');   // 只剥纯尺寸后缀（!!400x400.jpg）




    u = u.replace(/_\.webp$/i, '');                                        // .jpg_.webp → .jpg




    return u.split('?')[0];




  }




  /* 按"值的特征"深搜：键名对不上时（url/src/picPath 各种叫法），直接认图片 URL / 价格串 */




  function digAny(o, pred, depth, budget) {




    if (!o || typeof o !== 'object') return '';




    const stack = [[o, 0]];




    const seen = new Set();




    let n = 0;




    while (stack.length && n < (budget || 300)) {




      n++;




      const [cur, d] = stack.pop();




      if (!cur || typeof cur !== 'object' || seen.has(cur) || d > (depth || 4)) continue;




      seen.add(cur);




      try {




        for (const k of Object.keys(cur)) {




          let v = null;




          try { v = cur[k]; } catch (e) { continue; }




          if (v == null) continue;




          if (typeof v === 'string' || typeof v === 'number') {




            if (pred(k, String(v))) return String(v);




          } else if (typeof v === 'object') stack.push([v, d + 1]);




        }




      } catch (e) { /* 跳过 */ }




    }




    return '';




  }




  /* 价格/主图经常是嵌套对象或数组（{priceText:"¥3.2"} / [{price:...}]），往下挖两层 */




  const digVal = (o, keys, depth) => {




    if (!o || typeof o !== 'object') return '';




    const d = depth == null ? 3 : depth;




    const direct = firstVal(o, keys);




    if (direct !== '' && direct != null) return direct;




    if (d <= 0) return '';




    // 价格/主图常被包在 priceInfo{} / imageList[] 之类容器里 —— 遍历所有子对象继续找




    for (const k of Object.keys(o)) {




      let v = null;




      try { v = o[k]; } catch (e) { continue; }




      if (!v || typeof v !== 'object') continue;




      if (Array.isArray(v)) {




        for (const it of v) {




          const got = digVal(it, keys, d - 1);




          if (got) return got;




        }




      } else {




        const got = digVal(v, keys, d - 1);




        if (got) return got;




      }




    }




    return '';




  };




  /* 挖主图（结构化）：先认图片专用键，容忍 字符串 / [字符串] / [{imageUrl}] / {list:[…]} / Map 各种形态。




     ⚠ 老的 digVal 挖不动"数组里的字符串"（digVal 见字符串就返回空），offerImages: ["https://…jpg"]




        这种最常见形态反而抽不到——所以主图单独走这套。 */




  function digImg(o, depth) {




    if (!o || typeof o !== 'object' || depth < 0) return '';




    for (const k of IMG_KEYS) {




      let v = null;




      try { v = o[k]; } catch (e) { continue; }




      const got = imgFromVal(v, depth);




      if (got) return got;




    }




    return '';




  }




  function imgFromVal(v, depth) {




    if (v == null) return '';




    if (typeof v === 'string' || typeof v === 'number') return looksLikeImg(v);




    if (typeof v === 'object' && depth > 0) {




      if (Array.isArray(v)) {




        for (const it of v) { const got = imgFromVal(it, depth - 1); if (got) return got; }




        return '';




      }




      return digImg(v, depth - 1);




    }




    return '';




  }




  /* ── 多图版（2026-10-24 江少：主图采太多还混吉祥物）──




     digImg 只取第一个命中值，官方图列 offerImages:[…10 张] 白白丢掉 9 张，




     主图列只能靠 DOM 全页扫凑数 → 吉祥物/推荐位/描述长图全混进来。




     digImages 把 IMG_KEYS 命中的**整组数组**都收进来（去重），官方图列优先。 */




  function digImages(o, depth, out) {




    if (!o || typeof o !== 'object' || depth < 0 || out.size > 30) return;




    for (const k of IMG_KEYS) {




      let v = null;




      try { v = o[k]; } catch (e) { continue; }




      imgsFromVal(v, depth, out);




    }




    if (out.size > 30) return;




    for (const k of Object.keys(o)) {




      let v = null;




      try { v = o[k]; } catch (e) { continue; }




      if (v && typeof v === 'object' && !Array.isArray(v)) digImages(v, depth - 1, out);




    }




  }




  function imgsFromVal(v, depth, out) {




    if (v == null || out.size > 30) return;




    if (typeof v === 'string' || typeof v === 'number') { const u = looksLikeImg(v); if (u) out.add(u); return; }




    if (typeof v === 'object' && depth > 0) {




      if (Array.isArray(v)) { for (const it of v) imgsFromVal(it, depth - 1, out); return; }




      digImages(v, depth - 1, out);




    }




  }




  const offerIdOf = (o) => {




    for (const k of OFFER_KEYS) {




      const v = o[k];




      if (v != null && /^\d{6,}$/.test(String(v).trim())) return String(v).trim();




    }




    return '';




  };




  /* 类目/导航对象误判防护：1688 店铺页 window 里的 OfferCategory（有 id + name，




     无价格无图片）会被 offerIdOf + TITLE_KEYS('name') 误认成商品 —— 凭 Java 类名认出来 */




  const isNavLike = (o) => {




    try {




      const c = o.class || o['@type'] || o.type || '';




      return /categor|catagory|menu|nav|tab|banner|channel|floor/i.test(String(c));




    } catch (e) { return false; }




  };




  /* ── 规格名（SKU 值）工具：详情接口 / SKU 面板 / DOM 三路共用 ── */




  // 属性名不是规格值（"颜色""尺码"这种单独出现的词要挡掉）




  const ATTR_NAME_RE = /^(颜色|色系|尺码|大小|尺寸|规格|型号|款式|图案|材质|性别|适用性别|季节|年份|版本|味道|香型|重量|容量|长度|宽度|高度|厚度|数量|套装|组合|分类|类别|风格|面料|产地|功能|包装|口味|形状|件数|默认|默认款式|适用尺寸|适用机型|适用型号|适合尺寸|屏幕尺寸|规格尺寸|规格型号|尺码号|鞋码|主色|配色|颜色分类|尺寸规格|尺寸分类|规格分类|机型|尺码规格|适用平台|适用品牌|型号规格|尺寸款式|适用年龄|适用对象|规格类型)$/;




  /* 认一个字符串能不能用作规格值：短词、非价格/库存/起批语境、非属性名、非纯长数字。




     ⚠ 不单独挡「件」——「137件套」「108件套」是真实规格（不同件套），只有「1件起批」




        这种起批语境和裸「2件」起批量才挡 */




  const skuNameOk = (t) => {




    // 🔒 2026-10-25 江少「只采集一个sku」实测：1688 规格值普遍很长——




    //   「◆修女邀约◆（裙子+项链+手袖+头饰+领子+T裤）」24 字，12 字上限把 6 个颜色全扔了。




    //   放宽到 40（容器文本几十上百字，仍挡得住；真正的垃圾有下面一堆语境过滤兜着）。




    if (!t || t.length < 1 || t.length > 40) return false;




    if (/[¥￥]/.test(t)) return false;




    if (/起批|起订|起售|库存|售出|已售|月销|运费|定金/.test(t)) return false;




    if (/^\d+\s*件$/.test(t) || /^\d+\+$/.test(t)) return false;   // 裸起批量 / 销量




    if (ATTR_NAME_RE.test(t)) return false;




    if (/^[\d.,]+$/.test(t) && t.length > 4) return false;         // 纯长数字串（价格/ID），尺码 2XL/XL 放行




    if (/[<>"']/.test(t)) return false;




    // 店铺统计 / 发布时间（实测误采：「2023年6月」开店时间、「3250m」访客、「80台」成交、「34人」采购数）




    if (/\d\s*[年月日号]/.test(t)) return false;                   // 日期串




    if (/^\d+(?:\.\d+)?\s*(?:台|人|元|次|笔|单|万|千|%|位|名|种|类|款|号)$/.test(t)) return false;  // 裸数值+统计单位




    if (/^\d{3,}(?:\.\d+)?\s*m$/i.test(t)) return false;           // 大数访客「3250m」（「1.5m」长度规格放行）




    if (/^(?:19|20)\d{2}$/.test(t)) return false;                  // 裸年份「2023」




    // 🔴 2026-10-28 江少「一个规格分成3个」根治：1688 营销/免责文案（实测




    //   "20(仅供出口销售，禁止国内销售，购买者等同默认免责申明)"）被当规格值采入 →




    //   ERP 前端按顿号拆成 3 行假规格。营销/免责/占位文案一律挡（与 extension 插件 isJunkSpecValue 同口径）。




    if (/(仅供出口|禁止国内销售|免责申明|仅供外贸|出口销售|跨境出口|外贸单|跨境现货|介意勿拍|勿拍|不卖|不拍|不售|默认免责|禁售|境外销售|仅限海外|限售)/i.test(t)) return false;




    return true;




  };




  /* 拦截响应 body → JSON：1688 mtop 是 jsonp（mtopjsonp1({...})），先剥壳再 parse */




  function parseBody(body) {




    const s = String(body == null ? '' : body);




    if (!s) return null;




    try { return JSON.parse(s); } catch (e) { /* 不是纯 JSON，按 jsonp 剥 */ }




    const m = s.match(/^\s*[^(]*\(\s*([\s\S]*?)\s*\)\s*;?\s*$/);




    if (m) { try { return JSON.parse(m[1]); } catch (e2) { /* 壳里也不是 JSON */ } }




    return null;




  }




  /* 从对象树里抽规格值名，覆盖 1688 详情接口的真实结构：




     skuModel.skuProps[] = {propName:"颜色", propValues:[{name:"黑色", imageUrl}]}




     skus[] = {props:"颜色:黑色;尺码:M"}  / {name:"…"}




     specValues / skuValues / valueList / values 同构数组




     ⚠ 结构上必须「像规格组」才抽：值数组的父对象要带属性名（propName/prop）或数组项带




        SKU 标记（imageUrl/price/skuId/props）；props 串只认已知属性名的键。




        实测教训：店铺卡片/模块 props 的 {key:"访客",value:"3250m"}、{name:"2023年6月"}




        会被无脑挖进来当规格（江少截图：规格 9 个 = 5 尺码 + 2023年6月/3250m/80台/34人） */




  function skuNamesInto(v, out, depth, seen) {




    if (!v || typeof v !== 'object' || depth < 0 || seen.has(v)) return;




    seen.add(v);




    if (Array.isArray(v)) { for (const it of v) skuNamesInto(it, out, depth - 1, seen); return; }




    for (const k of Object.keys(v)) {




      let c = null;




      try { c = v[k]; } catch (e) { continue; }




      if (c == null || typeof c !== 'object') continue;




      if (/propValues|specValues|skuValues|valueList|^values$/i.test(k) && Array.isArray(c)) {




        // 只认「属性组」结构：父对象带属性名（skuProps[] = {propName:"颜色", propValues:[…]}），




        // 或数组项自带 SKU 标记。模块 props / 店铺统计的 {key,value,name} 数组两者都不满足 → 跳过




        const parentHasAttr = v.propName != null || v.prop != null || v.skuName != null || v.specName != null;




        const itemsHaveMarker = c.some(it => it && typeof it === 'object' &&




          (it.imageUrl || it.imageUri || it.price != null || it.skuId != null || it.props || it.propValues));




        if (parentHasAttr || itemsHaveMarker) {




          for (const it of c) {




            const nm = it && typeof it === 'object' ? clean(firstVal(it, ['name', 'skuName', 'specName', 'value', 'text'])) : clean(it);




            if (nm) out.add(nm);




          }




        }




      } else if (/^(?:skuProps|props|skuList|skus|skuInfos?)$/i.test(k) && Array.isArray(c)) {




        for (const it of c) {




          if (!it || typeof it !== 'object') continue;




          // props 串 "颜色:黑色;尺码:M" → 只取「已知属性名」键的值段（"上市时间:2023年6月" 挡掉）




          const ps = it.props || it.skuProps || it.prop || '';




          if (typeof ps === 'string' && ps.includes(':')) {




            for (const seg of ps.split(/[;；]/)) {




              const m2 = seg.match(/^\s*([^:：]+)[:：]\s*(.*)$/);




              if (!m2) continue;




              if (!ATTR_NAME_RE.test(clean(m2[1]))) continue;




              const vv = clean(m2[2]);




              if (vv) out.add(vv);




            }




          }




          // name/skuName 直接取值：数组项必须带 SKU 标记，防模块 props / 店铺统计误采




          const hasMarker = it.skuId != null || it.price != null || it.imageUrl || it.imageUri ||




            it.props || it.propValues || it.skuName || it.specName;




          if (hasMarker) {




            const nm = clean(firstVal(it, ['skuName', 'specName', 'name', 'value']));




            if (nm) out.add(nm);




          }




        }




      }




      skuNamesInto(c, out, depth - 1, seen);   // 全树递归（靠结构认，不靠键名全匹配）




    }




  }




  /* 🔒 2026-10-25 江少「sku规格没有全部采集过来」：上面 skuNamesInto 把 skuModel 扁平成




     **单个规格值**——多轴商品（颜色×尺码）的组合被打散：颜色值、尺码值各自单独成一条变体，




     且统一塞进「规格」键（库里实测 options 全是 {"规格":"黑色"}）——Noon 侧既拿不到组合、




     也分不出哪个是颜色哪个是尺码。这里把 skuList/skus 的 props 串还原成**完整组合**，




     按轴名映射官方键（颜色→Color、尺码→Size…），并带上该组合自己的价格与图。 */




  const AXIS_KEY = { 颜色: 'Color', 色系: 'Color', 颜色分类: 'Color', 主色: 'Color', 配色: 'Color',




    尺码: 'Size', 大小: 'Size', 尺寸: 'Size', 码数: 'Size', 规格型号: 'Size',




    款式: 'Style', 型号: 'Model', 材质: 'Material', 图案: 'Pattern', 花型: 'Pattern',




    香型: 'Scent', 口味: 'Flavor', 容量: 'Capacity', 套装: 'Set', 件数: 'Pack' };




  function comboFromProps(ps) {




    if (typeof ps !== 'string' || !ps.includes(':')) return null;




    const o = {};




    for (const seg of String(ps).split(/[;；]/)) {




      const m = seg.match(/^\s*([^:：]+)[:：]\s*(.+)$/);




      if (!m) continue;




      const axis = clean(m[1]), val = clean(m[2]);




      // 数字轴名 = 属性 ID（如 "20513:xxx"）；非规格轴（"上市时间:2023年6月"）一律挡




      if (!val || !axis || /^\d+$/.test(axis) || !ATTR_NAME_RE.test(axis)) continue;




      o[AXIS_KEY[axis] || axis] = val;




    }




    return Object.keys(o).length ? o : null;




  }




  function deepSkuCombos(offerId) {




    const cap = window.__c1688cap || { items: [] };




    if (!cap._skuCombo) cap._skuCombo = {};




    if (offerId && cap._skuCombo[offerId]) return cap._skuCombo[offerId].slice();




    // 🔴 2026-10-29 江少「尺寸规格怎么都拆开」根治：1688 详情页会加载**推荐位/相似/榜单**接口，




    //    这些响应同样含 skuModel，旧逻辑「含 skuModel 就强制参与、不过滤 offerId」→ 别家商品的




    //    规格（实测混入【春秋薄款150g】适合15~20℃… 等整套别家尺码）被当成自家规格 →




    //    尺码轴值暴涨、看起来像同一个规格被"拆开"。




    const RECOMMEND_URL_RE = /recommend|relation|similar|widget|guessyoulike|guess_you_like|hotoffer|hot_offer|rank|alsobuy|also_buy|crosssell|cross_sell/i;




    // 🔴 2026-10-29 二次根治（实测仍有 4 条【春秋薄款150g】…别家规格混入）：




    //    别家推荐位数据常与本品**混在同一个响应 body** 里 → bodyHit 为 true → 旧过滤放行。




    //    改为两轮：strict=明确关联本商品(URL 或 body 含 offerId)；loose=仅"含 skuModel"的可疑响应。




    //    strict 非空就**只用 strict**，一个都没有才回退 loose（兼容 cbu 加密串导致 body 无数字 offerId）。




    const strict = []; const loose = [];




    for (const it of cap.items) {




      const url = String(it.url || '');




      const body = String(it.body || '');




      let j = null;




      try { j = parseBody(it.body); } catch (e) { j = null; }




      if (!j) continue;




      if (!offerId) { strict.push(j); continue; }




      const urlHit = url.indexOf(String(offerId)) !== -1;




      const bodyHit = body.indexOf(String(offerId)) !== -1;




      const hasSku = /skuModel|"skuProps"|skuInfos|propValues|specValues/i.test(body);




      if (RECOMMEND_URL_RE.test(url) && !urlHit) continue;      // 推荐位接口：别家，跳过




      if (urlHit || bodyHit) { strict.push(j); continue; }      // 明确关联本商品




      if (hasSku) loose.push(j);                                // 仅含 skuModel → 可疑，降级




    }




    const roots = strict.length ? strict : loose;




    // ① 先建「属性ID/值ID → 名称」映射：1688 的 skuModel 组合串大量是**数字 ID 形态**




    //    （props: "1627207:28314;20509:28315"），名称只在 skuProps[].propValues[] 里。




    //    不还原这层 → 组合全被当噪声挡掉（实测：多轴商品只剩扁平的「规格:值」）。




    const idMap = {}; const axisById = {};




    for (const root of roots) {




      const st = [root]; const sn = new Set(); let n = 0;




      while (st.length && n < 4000) {




        n++;




        const cur = st.shift();




        if (!cur || typeof cur !== 'object' || sn.has(cur)) continue;




        sn.add(cur);




        try {




          for (const k of Object.keys(cur)) {




            let v = null;




            try { v = cur[k]; } catch (e) { continue; }




            if (!v || typeof v !== 'object') continue;




            if (/propValues|specValues|skuValues|valueList|^values$/i.test(k) && Array.isArray(v)) {




              const axis = clean(cur.propName || cur.prop || cur.skuName || cur.specName || cur.name || '');




              const pid = cur.propId != null ? String(cur.propId) : (cur.pid != null ? String(cur.pid) : (cur.fid != null ? String(cur.fid) : ''));




              if (axis && pid) axisById[pid] = axis;




              for (let vi = 0; vi < v.length; vi++) {




                const pv = v[vi];




                if (!pv || typeof pv !== 'object') continue;




                const nm = clean(firstVal(pv, ['name', 'value', 'skuName', 'specName', 'text']));




                // 🔒 2026-10-28 治本（探针实锤）：新版 1688 skuModel 结构 skuProps=[{fid,prop,value:[{name,imageUrl}]}]




                //   value 项没有 valueId/vid/id → idMap 建不全 → skuInfoMap 的数字ID组合串还原失败(combos=0)，




                //   区间价/每SKU图/多轴组合全丢。无 vid 时回退用数组索引（dataList 的 valueKey 也是用索引）。




                let vid = firstVal(pv, ['valueId', 'vid', 'id']);




                if (vid == null) vid = vi;




                let im = '';




                try { if (pv.imageUrl) im = looksLikeImg(pv.imageUrl) || ''; } catch (e) { im = ''; }




                if (nm && vid != null) idMap[String(vid)] = { name: nm, axis: axis, image: im };




              }




            }




            st.push(v);




          }




        } catch (e) { /* 单个对象出错不影响整体 */ }




      }




    }




    const out = []; const seen = new Set();




    for (const root of roots) {




      const stack = [root]; const seenObj = new Set(); let n = 0;




      while (stack.length && n < 6000 && out.length < 60) {




        n++;




        const cur = stack.shift();




        if (!cur || typeof cur !== 'object' || seenObj.has(cur)) continue;




        seenObj.add(cur);




        try {




          const ps = cur.props || cur.skuProps || cur.specAttrs || cur.attributes;




          if (typeof ps === 'string' && /[:：]/.test(ps)) {




            const o = {}; let img = ''; let any = false;




            for (const seg of String(ps).split(/[;；]/)) {




              const m = seg.match(/^\s*([^:：]+)[:：]\s*(.+)$/);




              if (!m) continue;




              let axis = clean(m[1]); let val = clean(m[2]);




              let resolved = false;




              if (/^\d+$/.test(axis) && /^\d+$/.test(val)) {   // ID 形态 → 还原成名称




                const hit = idMap[val];




                if (!hit || !hit.name) continue;




                val = hit.name; axis = hit.axis || axisById[axis] || '';




                if (hit.image && !img) img = hit.image;




                resolved = true;                              // 真属性轴，不再按词表挡




              }




              if (!val || !axis) continue;




              if (!resolved && !ATTR_NAME_RE.test(axis)) continue;   // 字面形态：非规格轴挡掉




              o[AXIS_KEY[axis] || axis] = val; any = true;




            }




            if (any) {




              const key = Object.entries(o).map(([k, v]) => k + '=' + v).sort().join('|');




              if (!seen.has(key)) {




                seen.add(key);




                // 同对象自带该组合的价格/图 —— 区间价商品的真实 per-SKU 价就在这里




                const pr = clean(firstVal(cur, ['discountPrice', 'promotionPrice', 'price', 'skuPrice', 'priceStr', 'salePrice']));




                let im2 = img;




                if (!im2) { try { if (cur.imageUrl) im2 = looksLikeImg(cur.imageUrl) || ''; } catch (e) { im2 = ''; } }




                out.push({ options: o, price: hasP(pr) ? num(pr) : '', image: im2 });




              }




            }




          }




          for (const k of Object.keys(cur)) {




            let v = null;




            try { v = cur[k]; } catch (e) { continue; }




            if (v && typeof v === 'object') stack.push(v);




          }




        } catch (e) { /* 单个对象出错不影响整体 */ }




      }




    }




    // 🔴 2026-10-28 江少「sku规格还是没全部采集」：1688 的 SKU 组合真正存在 skuInfoMap




    //   （{ "1627207:28314;20509:28315": {price,stock,...} }，键=属性ID串，名称只在 skuProps[].propValues[]），




    //   上一版只解析 props/skuProps 字符串、没碰 skuInfoMap → 多轴商品（颜色×尺码）组合永远是 0，




    //   颜色整轴丢失、只剩扁平的尺码。这里补第二路：把 skuInfoMap 每个组合串用 idMap 还原成 颜色×尺码 名称。




    for (const root of roots) {




      const st2 = [root]; const sn2 = new Set(); let n2 = 0;




      while (st2.length && n2 < 6000 && out.length < 60) {




        n2++; const cur = st2.shift();




        if (!cur || typeof cur !== 'object' || sn2.has(cur)) continue; sn2.add(cur);




        try {




          for (const k of Object.keys(cur)) {




            let v = null; try { v = cur[k]; } catch (e) { continue; }




            if (!v || typeof v !== 'object' || Array.isArray(v)) continue;




            const isComboMap = /(skuInfoMap|skuMap|skuInfo|skusByProps|propMap|skuInfoList)/i.test(k);




            if (isComboMap) {




              for (const [comboStr, cv] of Object.entries(v)) {




                if (!cv || typeof cv !== 'object') continue;




                const o = {}; let img = '';




                for (const seg of String(comboStr).split(/[;；]/)) {




                  const m = seg.match(/^\s*(\d+)\s*:\s*(\d+)\s*$/);   // pid:vid 数字ID形态




                  if (!m) continue;




                  const hit = idMap[m[2]];




                  if (!hit || !hit.name) continue;




                  const axis = hit.axis || '';




                  if (!axis) continue;




                  o[AXIS_KEY[axis] || axis] = hit.name;




                  if (hit.image && !img) img = hit.image;




                }




                if (Object.keys(o).length >= 2) {   // 至少双轴才是组合（颜色×尺码）；单轴仍走 skus/扁平路）




                  const key = Object.entries(o).map(([a, b]) => a + '=' + b).sort().join('|');




                  if (!seen.has(key)) {




                    seen.add(key);




                    const pr = clean(firstVal(cv, ['discountPrice', 'price', 'salePrice', 'priceStr', 'skuPrice', 'priceValue']));




                    let im = img;




                    if (!im) { try { if (cv.imageUrl) im = looksLikeImg(cv.imageUrl) || ''; } catch (e) { im = ''; } }




                    out.push({ options: o, price: hasP(pr) ? num(pr) : '', image: im });




                  }




                }




              }




            }




            st2.push(v);




          }




        } catch (e) { /* 单个对象出错不影响整体 */ }




      }




    }




    const res = out.slice(0, 60);




    if (offerId) cap._skuCombo[offerId] = res;




    return res.slice();




  }




  /* 深度扫描页面 JS 对象里的商品数据（1688 店铺页是模块异步渲染，DOM 里没链接）




     ⚠ 必须防炸：页面里有 DOM 节点 / React 内部对象 / 循环引用，遍历不当会抛异常或卡死，




        探针一旦抛异常 executeScript 就拿不到 result（表现为 frames: []）。 */




  const isSafeObj = (v) => {




    if (!v || typeof v !== 'object') return false;




    if (typeof v.nodeType === 'number') return false;            // DOM 节点




    if (typeof Element !== 'undefined' && v instanceof Element) return false;




    try {




      const cn = (v.constructor && v.constructor.name) || '';




      if (/^(Window|HTML|Node|Element|Document|CSS)/.test(cn)) return false;




    } catch (e) { return false; }




    return true;




  };




  function deepOffers(budget = 8000, onlyRoots = null) {




    const out = [];




    const seen = new Set();




    const stack = [];




    if (Array.isArray(onlyRoots)) {




      for (const r of onlyRoots) if (isSafeObj(r)) stack.push(r);




    } else {




      for (const k of Object.keys(window)) {




        if (/^(webpack|core|jquery|react|vue|_)/i.test(k)) continue;




        try { const v = window[k]; if (isSafeObj(v)) stack.push(v); } catch (e) { /* 取值抛错就跳过 */ }




      }




    }




    let n = 0;




    while (stack.length && n < budget && out.length < 500) {




      n++;




      let cur = null;




      // 🔒 2026-10-24 江少（为什么从最底下开始采）：pop 是栈遍历（后进先出），




      //   列表数组里压进去的商品被倒着弹出 → 队列顺序整个反了、从页面底部开始采。




      //   改 shift（先进先出）= 按页面从上到下的顺序入队。对象集合不变，只正顺序。




      try { cur = stack.shift(); } catch (e) { break; }




      if (!isSafeObj(cur) || seen.has(cur)) continue;




      seen.add(cur);




      try {




        const id = offerIdOf(cur);




        const title = id ? clean(firstVal(cur, TITLE_KEYS)) : '';




        if (id && title) {




          let rawPrice = digVal(cur, PRICE_KEYS);




          // 键名对不上 → 退而求其次：键名含 price 且值是数字串




          if (!rawPrice) rawPrice = digAny(cur, (k, v) => /price|价格/i.test(k) && /[\d]/.test(v), 4, 250);




          // 🔒 2026-10-24 江少「为什么还有没采集到价格的」：价格常是**对象形态**




          //   （{priceRange:{min,max}} / {priceInfo:{price}}）—— PRICE_KEYS 只认叶子数字键，




          //   对象值会整个漏掉（实测 1089119388225 扫出来 price 空、队列显示 0）。




          //   这里对对象形态专门挖一次：下限当 price，上限当 priceMax。




          let pmxObj = '';




          if (!rawPrice) {




            const po = digVal(cur, ['priceRange', 'priceInfo', 'tradePrice', 'spuPrice', 'priceModel'], 3);




            if (po && typeof po === 'object') {




              rawPrice = po.min ?? po.low ?? po.priceMin ?? po.startPrice ?? po.price ?? '';




              pmxObj = po.max ?? po.high ?? po.priceMax ?? po.priceRangeMax ?? '';




            } else if (po != null && po !== '') rawPrice = po;




          }




          // 🔒 0 不算价：'0' 是 truthy 会挡死 parseCaptured 等后续兜底




          if (rawPrice != null && !(+num(rawPrice) > 0)) rawPrice = '';




          // 主图三级策略：① 图片专用键结构化挖 ② 任意键的值是完整图片 URL ③ 无域名图径/图片 ID




          let img = digImg(cur, 4);




          if (!img) img = digAny(cur, (k, v) => !BAD_KEY(k) && IMG_RE.test(v) && !BAD_IMG.test(v), 4, 400);




          if (!img) img = digAny(cur, (k, v) => !BAD_KEY(k) && (IMG_PATH_RE.test(v) || IMG_ID_RE.test(v)), 4, 400);




          img = looksLikeImg(img);   // 统一规范化（绝对化/补域名/去参数）




          // 无价无图的"商品"不是商品（类目/导航对象混进来的），采了也没法回传 ERP；




          // isNavLike 再挡一道（class 是 OfferCategory/Menu 之类）




          if ((rawPrice || img) && !isNavLike(cur)) {




            // 🔒 2026-10-24 江少（1688 自己有类目为什么不能一比一）：列表接口的商品对象




            //   普遍带类目字段（搜索页类目筛选栏的数据源），之前只取标题/价格/图全扔了。




            //   现在挖出来随行回传 → ERP 一比一映射的原料。




            // 🔒 2026-10-24 二版：一级类目（如"塑料工艺品"）对一比一映射太粗 ——




            //   多键去重拼成路径（rootCategoryName>categoryName…），尽量拿到最细那级




            let cat = '';




            const catParts = [];




            for (const ck of ['rootCategoryName', 'rootCatName', 'categoryName', 'catName', 'categoryDisp', 'category', 'cateName', 'subCategoryName', 'leafCategoryName', 'postCategoryName']) {




              const v = digVal(cur, [ck], 2);




              if (typeof v === 'string' && /[\u4e00-\u9fa5]/.test(v) && v.length < 40 && !catParts.includes(v)) catParts.push(v);




            }




            if (catParts.length) cat = catParts.join('>');




            if (!cat) cat = digAny(cur, (k, v) => /categ|catname|catpath|bread/i.test(k) && typeof v === 'string' && /[\u4e00-\u9fa5]/.test(v) && v.length < 60 && !/<|http/.test(v), 3, 150);




            if (!cat) {




              const cp = firstVal(cur, ['categoryPath', 'catPath', 'crumbPath']);




              if (Array.isArray(cp)) {




                const arr = cp.map(x => (x && (x.name || x.value || x.text)) || '').filter(Boolean);




                if (arr.length && arr.length < 8) cat = arr.join('>');




              }




            }




            out.push({




              offerId: id,




              title: title,




              url: (typeof cur.detailUrl === 'string' && cur.detailUrl) ? absUrl(cur.detailUrl)




                : (typeof cur.url === 'string' && /offer/i.test(cur.url)) ? absUrl(cur.url)




                  : 'https://detail.1688.com/offer/' + id + '.html',




              image: img || '',




              price: rawPrice ? num(rawPrice) : '',




              // 区间价上限（mmga 响应里是 maxPrice/priceRangeMax，单 SKU 商品没有就空）




              priceMax: num(digVal(cur, ['priceMax', 'maxPrice', 'maxSalePrice', 'priceRangeMax'])) || num(pmxObj) || '',




              category: cat ? String(cat).slice(0, 200) : '',




              currency: 'CNY'




            });




          }




        }




        const keys = Object.keys(cur);




        for (const k of keys) {




          let v = null;




          try { v = cur[k]; } catch (e) { continue; }   // getter 抛错




          if (isSafeObj(v)) stack.push(v);




        }




      } catch (e) { /* 单个对象出错不影响整体 */ }




    }




    return out;




  }




  /* ── ① 列表页：只扫 offerId / 标题 / 主图 / 价格（快，不进详情） ── */




  function list() {




    const seen = new Set();




    const out = [];

    // 🔴 2026-11-07 江少「单条商品链接扫描采集出一堆乱链接」根治：在商品详情页(PDP, URL 形如 /offer/<id>.html)
    //   扫描时，页面「相似推荐/看了又看/猜你喜欢」全是同形态 /offer/<id>.html 链接，会被全扫进队列；实测只想采当前这一个。
    //   检测到当前是 PDP 时只保留 URL 自身的 offerId，其余跳过（店铺/搜索列表页不受影响）。
    // 🔶 2026-11-08 江少「noon 链接扫不出」根治：list() 原本死写 1688 的 OFFER_RE(/offer/\d+.html)，
    //   noon 商品链接是 /p-XXXX（/uae-en/p-593742/）或 /p/XXXX 形态，完全扫不到 → 平台化商品链接正则 + PDP 自检。
    const PLAT = (typeof PLATFORM_OF === 'function') ? PLATFORM_OF(location.hostname) : (/\bnoon\.com$/i.test(location.hostname) ? 'noon' : '1688');
    const IS_NOON = PLAT === 'noon';
    // noon 商品形态：/uae-en/p-593742/ 或 /p/593742/（覆盖新连字符与旧斜杠形态）；1688 仍走 OFFER_RE
    const PROD_RE = IS_NOON ? /\/p[-\/]([A-Za-z0-9]+)(?:\/(?:\?|#|$))?|\/([A-Z][A-Z0-9]{5,})\/p(?:\/|\?|$)/ : OFFER_RE;
    const CUR_of = IS_NOON ? 'AED' : 'CNY';
    // 🔴 2026-11-07 江少「单条商品链接扫描采集出一堆乱链接」根治：在商品详情页(PDP, URL 形如 /offer/<id>.html 或 /p-XXXX)
    //   扫描时，页面「相似推荐/看了又看/猜你喜欢」全是同形态链接，会被全扫进队列；实测只想采当前这一个。
    //   检测到当前是 PDP 时只保留 URL 自身的商品码，其余跳过（店铺/搜索列表页不受影响）。
    const pageOffer = (() => { try { if (IS_NOON) { const m = location.pathname.match(/\/p[-\/]([A-Za-z0-9]+)/); return m ? m[1] : ''; } const m = location.href.match(/\/offer\/(\d+)\.html/i); return m ? m[1] : ''; } catch (e) { return ''; } })();




    // 新版 1688 店铺把大量商品卡片放在开放 Shadow DOM；普通 document 查询
    // 只会看到少数外层链接，导致“页面 118 件、ERP 只扫到 2/3 条”。
    const roots = [document], rootSeen = new Set([document]), nodes = [];
    for (let ri = 0; ri < roots.length && roots.length < 500; ri++) {
      const root = roots[ri];
      try {
        nodes.push(...root.querySelectorAll(IS_NOON ? 'a[href*="/p"]' : 'a[href*="/offer/"]'));
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot && !rootSeen.has(el.shadowRoot)) { rootSeen.add(el.shadowRoot); roots.push(el.shadowRoot); }
        }
      } catch (e) { /* 已卸载的 shadow root 跳过 */ }
    }




    for (const a of nodes) {




      const href = a.getAttribute('href') || '';




      const m = href.match(PROD_RE);




      if (!m) continue;




      const id = (m[1] || m[2] || '');
      // 🔶 2026-11-08 noon 落地页/分类活动页（/p-XXXX/fashion/...）不是商品，排除（江少最烦队列垃圾）
      if (IS_NOON) { try { const pu = new URL(a.href, location.href).pathname; const after = pu.split(/\/p[-\/][A-Za-z0-9]+/).pop(); if (/^\/[a-z]/i.test(after)) continue; } catch (e) {} }
      if (pageOffer && id !== pageOffer) continue;   // 🔴 PDP 只采自身：排除相似推荐/看了又看/猜你喜欢等一切非自身 /offer/ 链接




      const card = a.closest('[class*="item"]') || a.closest('li') ||




        a.closest('[class*="offer"]') || a.parentElement || a;




      const img = card.querySelector('img');




      const priceEl = card.querySelector('[class*="price"]') || card.querySelector('[class*="Price"]');




      const titleEl = card.querySelector('[class*="title"]') || card.querySelector('[class*="Title"]');




      // 🔒 2026-10-24 江少「为什么还有没采集到价格的」：有的卡片价格元素类名不含 price、




      //   或价格是「¥1.10-1.50」区间文本 → 统一兜底：整卡文本里找 ¥/￥ 数字。




      //   区间取下限当 price、上限进 priceMax（ERP 定价算成本用下限更稳）。




      let pTxt = priceEl ? priceTextOf(priceEl) : '';




      let pMax = '';




      const rm = clean(pTxt).match(/([\d.]+)\s*[-~—至]\s*([\d.]+)/);




      if (rm) { pMax = rm[2]; }




      const fm = txt(card).match(/[¥￥]\s*([\d.]+)(?:\s*[-~—至]\s*([\d.]+))?/);




      // 没价 / 价是 0 / 「1件起批」话术（会被 num() 误当价格 1）→ 用整卡里的 ¥ 价




      if (fm && +fm[1] > 0 && (!hasP(pTxt) || (/起批/.test(clean(pTxt)) && !/[¥￥]/.test(clean(pTxt))))) {




        pTxt = fm[1]; if (fm[2] && !pMax) pMax = fm[2];




      }




      const title = cleanOfferListTitle(
        a.getAttribute('title') || (titleEl ? txt(titleEl) : '') || txt(a) || ''
      );
      // 只有详情页 offer 链接才入队；商品卡片仅有 ID/评分/价格而无商品名时跳过，
      // 避免把卡片元信息当成可采商品标题。
      if (!title || title.length < 4) continue;
      // 🔴 2026-11-07 江少「服务器端第一条链接没有价格」：同一 offer 在店铺页可能渲染两张卡
      //   （列表首位「当前查看/推荐」卡 + 正常列表卡，DOM 结构不同，前者常取不到价）。
      //   旧逻辑 seen 命中直接 continue → 先到的无价卡占位，后面带价的卡被整条丢弃。
      //   现在命中重复只做字段补全（价/价上限/主图/标题），位置仍按首次出现，不打乱顺序。
      if (seen.has(id)) {
        const ex = out.find(x => x.offerId === id);
        if (ex) {
          if (!hasP(ex.price) && hasP(pTxt)) ex.price = num(pTxt);
          if (!ex.priceMax && pMax) ex.priceMax = pMax;
          if (!ex.image) ex.image = pickImg(img) || bgOf(card);
          if ((!ex.title || ex.title === '(无标题)') && title) ex.title = title;
        }
        continue;
      }
      seen.add(id);
      out.push({




        offerId: id,




        title,




        url: absUrl(a.href || href),




        image: pickImg(img) || bgOf(card),




        price: hasP(pTxt) ? num(pTxt) : '',




        priceMax: pMax,




        currency: CUR_of




      });




    }




    // 兜底①：DOM 里没链接时，深度扫页面 JS 对象（店铺页异步渲染就走这条路）




    if (!out.length) {




      for (const r of deepOffers()) {




        if (seen.has(r.offerId)) continue;




        seen.add(r.offerId);




        out.push(r);




      }




    }




    // 兜底②：有些模板用 data-offer-id 而不是链接




    document.querySelectorAll('[data-offer-id]').forEach((el) => {




      const id = String(el.getAttribute('data-offer-id') || '').trim();




      if (!id || seen.has(id)) return;




      seen.add(id);




      const a = el.querySelector('a[href]') || el.closest('a[href]');




      const img = el.querySelector('img');




      // 同上：价格元素类名不含 price / 区间文本 → 整块文本找 ¥ 兜底




      let pTxt2 = priceTextOf(el.querySelector('[class*="price"]'));




      let pMax2 = '';




      const rm2 = clean(pTxt2).match(/([\d.]+)\s*[-~—至]\s*([\d.]+)/);




      if (rm2) pMax2 = rm2[2];




      const fm2 = txt(el).match(/[¥￥]\s*([\d.]+)(?:\s*[-~—至]\s*([\d.]+))?/);




      if (fm2 && +fm2[1] > 0 && (!hasP(pTxt2) || (/起批/.test(clean(pTxt2)) && !/[¥￥]/.test(clean(pTxt2))))) {




        pTxt2 = fm2[1]; if (fm2[2] && !pMax2) pMax2 = fm2[2];




      }




      const title = cleanOfferListTitle(
        el.querySelector('[class*="title"]')?.getAttribute('title') ||
        txt(el.querySelector('[class*="title"]')) || (a ? (a.getAttribute('title') || txt(a)) : '')
      );
      if (!title || title.length < 4 || !a || !OFFER_RE.test(a.getAttribute('href') || '')) return;
      out.push({




        offerId: id,




        title,




        url: a ? absUrl(a.href) : '',




        image: pickImg(img) || bgOf(el),




        price: hasP(pTxt2) ? num(pTxt2) : '',




        priceMax: pMax2,




        currency: 'CNY'




      });




    });




    // 兜底③（最全）：拦截到的 mtop 接口响应 JSON —— 带价格/主图，优先用它的字段补全




    try {




      for (const r of parseCaptured()) {




        const old = out.find(x => x.offerId === r.offerId);




        if (old) {




          if (!hasP(old.price) && hasP(r.price)) old.price = r.price;




          if (!old.image && r.image) old.image = r.image;




          if ((!old.title || isStoreOrSupplierTitle(old.title)) && r.title && !isStoreOrSupplierTitle(r.title)) old.title = r.title;




          if (!old.url && r.url) old.url = r.url;




          if (!old.category && r.category) old.category = r.category;




        } else { seen.add(r.offerId); out.push(r); }




      }




    } catch (e) { /* 解析失败不影响前面结果 */ }




    // 最终校验统一覆盖 DOM、接口和深度扫描三种来源：只放行数字 offerId + 商品名，
    // 并生成标准 1688 详情 URL，防止店铺/推广链接或卡片元信息进入待采队列。
    return out.map((r) => {
      const offerId = String(r && r.offerId || '').trim();
      return { ...r, offerId, title: cleanOfferListTitle(r && r.title),
        url: /^\d{8,20}$/.test(offerId) ? `https://detail.1688.com/offer/${offerId}.html` : '' };
    }).filter(r => /^\d{8,20}$/.test(r.offerId) && r.title.length >= 4 && !!r.url && !isStoreOrSupplierTitle(r.title));




  }




  /* 把一个真实商品对象的**原始结构** dump 出来 —— 只有看到真实字段名，才能把价格/主图抽对 */




  function offerShape() {




    const shapes = [];




    const seen = new Set();




    const visit = (o) => {




      if (!o || typeof o !== 'object' || seen.has(o)) return;




      const id = offerIdOf(o);




      const t = id ? clean(firstVal(o, TITLE_KEYS)) : '';




      if (id && t && t.length > 8 && shapes.length < 3) {




        seen.add(o);




        let s = '';




        try { s = JSON.stringify(o); } catch (e) { s = '[不可序列化]'; }




        // 图片字段单独 dump：主 JSON 只截 1800 字符，常被截在 offerImages 前面，看不到里面到底长啥样




        const imgKeys = {};




        for (const k of Object.keys(o)) {




          if (!/image|img|pic/i.test(k)) continue;




          let v = null;




          try { v = o[k]; } catch (e) { continue; }




          let vs = '';




          try { vs = JSON.stringify(v); } catch (e) { vs = '[不可序列化]'; }




          imgKeys[k] = (typeof v) + ':' + vs.slice(0, 600);




        }




        shapes.push({ keys: Object.keys(o).slice(0, 60), json: s.slice(0, 1800), imgKeys });




        return;




      }




      seen.add(o);




      for (const k of Object.keys(o)) { try { visit(o[k]); } catch (e) { /* 跳过 */ } }




    };




    for (const it of (window.__c1688cap || { items: [] }).items) {




      const j = parseBody(it.body);




      if (j) visit(j);




      if (shapes.length >= 3) break;




    }




    return shapes;




  }




  /* 拦截到的接口响应清单（看抓到了哪些 mtop 接口） */




  function captured() {




    const cap = window.__c1688cap || { items: [] };




    return cap.items.map(it => ({ url: it.url, len: it.body.length }));




  }




  /* 🩺 探针专用（2026-10-25）：SKU 结构证据 —— 哪些拦截响应里含 skuModel/propValues，




     截命中片段（探针诊断「颜色轴为什么丢」的决定性数据：有 = 解析该还原出组合；无 = 拦截漏了） */




  function capSku() {




    const cap = window.__c1688cap || { items: [] };




    const items = [];




    for (const it of cap.items) {




      const b = String(it.body || '');




      const m = b.match(/skuModel|propValues|skuInfos|skuProps|specId|valueList/);




      items.push({




        url: it.url,




        len: b.length,




        hasSku: !!m,




        sample: m ? b.slice(Math.max(0, (m.index || 0) - 120), (m.index || 0) + 2400) : ''




      });




    }




    return { total: cap.items.length, items: items.slice(0, 30) };




  }




  /* 从拦截到的响应里抽商品：先 JSON.parse，失败再按 jsonp(...) 剥壳，然后深度扫




     ⚠ 增量解析：无限滚动页一个响应 100KB+、几十个，每轮全量重解析会把扫描拖死；




        解析过的 item 打 _p 标记只啃新增的，结果累积在 cap._parsed（老 item 被




        shift 淘汰也不丢——扫描中途每轮 list() 都要调它，out 不能每轮重建） */




  function parseCaptured() {




    const cap = window.__c1688cap || { items: [] };




    if (!cap._parsed) cap._parsed = [];




    const out = cap._parsed;




    const seen = new Map(out.map(r => [r.offerId, r]));




    for (const it of cap.items) {




      if (it._p) continue;




      it._p = true;




      const j = parseBody(it.body);




      if (!j) continue;




      let rows = [];




      try { rows = deepOffers(8000, [j]); } catch (e) { rows = []; }




      // 同一 offerId 可能出现在多个响应里（翻页/推荐/不同的 mtop 接口）→ 合并补全，




      // 别让先到的"没图"行把后到的"有图"行挡掉




      for (const r of rows) {




        const ex = seen.get(r.offerId);




        if (!ex) { seen.set(r.offerId, r); out.push(r); continue; }




        if (!ex.image && r.image) ex.image = r.image;




        if (!hasP(ex.price) && hasP(r.price)) ex.price = r.price;




        if (!ex.priceMax && r.priceMax) ex.priceMax = r.priceMax;




        if (!ex.title && r.title) ex.title = r.title;




        if (!ex.url && r.url) ex.url = r.url;




      }




    }




    return out;




  }

  // 店铺列表用了虚拟卡片时，DOM 同一时刻只挂载视口附近的少量商品。
  // 在滚动过程中逐屏采集并按 offerId 合并，避免滚回顶部后只留下最后一次渲染的卡片。
  async function listAcrossScroll(steps = 12) {
    const limit = Math.max(4, Math.min(30, Number(steps) || 12));
    const merged = new Map();
    const addVisible = () => {
      // 2026-10-31 回归修复：主扫描曾恒走 1688 的 list()（只认 /offer/ 链接），
      // 导致 noon/亚马逊/速卖通/Shein 等平台列表扫描恒返回 0 条。
      // 非 1688 平台改走通用解析器 listG()；1688 仍严格走 list()，采集→落库全流程零改动。
      // 🔵 2026-11-08 亚马逊单独一路：走 listAmazon()（专为 amazon 卡片结构写的独立解析器）。
      //   1688 仍走 list()、noon/其他仍走 listG()，两条老链路一行未动。
      const rows = (CUR_PLATFORM === 'amazon' && window.__amzApi && typeof window.__amzApi.list === 'function') ? window.__amzApi.list()
        : (CUR_PLATFORM !== '1688' && typeof listG === 'function') ? listG() : list();
      for (const row of rows) {
        const old = merged.get(row.offerId) || {};
        merged.set(row.offerId, {
          ...old, ...row,
          image: row.image || old.image || '',
          price: row.price || old.price || '',
          priceMax: row.priceMax || old.priceMax || '',
          title: row.title || old.title || ''
        });
      }
    };
    const originalY = window.scrollY;
    const scrollers = (() => {
      // 🔴 2026-11-08 19:2x 同上卡死修复（此处在扫描主路径上，更致命）
      const out = [];
      const t0 = Date.now();
      for (const el of document.querySelectorAll('div,section,main,article,ul,ol')) {
        if (Date.now() - t0 > 600) break;
        try {
          if (el === document.body || el === document.documentElement) continue;
          if (el.clientHeight <= 200) continue;
          if (el.scrollHeight <= el.clientHeight + 100) continue;
          if (!/auto|scroll/.test(getComputedStyle(el).overflowY)) continue;
          out.push(el);
        } catch (_) { /* 已卸载节点跳过 */ }
      }
      return out.sort((a, b) => (b.scrollHeight * b.clientHeight) - (a.scrollHeight * a.clientHeight)).slice(0, 2);
    })();
    const originalTops = scrollers.map(el => el.scrollTop);
    addVisible();
    for (let i = 0; i < limit; i++) {
      window.scrollBy(0, Math.max(300, Math.round(window.innerHeight * 0.72)));
      for (const el of scrollers) {
        try { el.scrollTop = Math.min(el.scrollHeight, el.scrollTop + Math.max(250, Math.round(el.clientHeight * 0.7))); } catch (_) {}
      }
      await new Promise(resolve => setTimeout(resolve, 450));
      addVisible();
      const windowEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
      const containersEnd = scrollers.every(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
      if (windowEnd && containersEnd) break;
    }
    scrollers.forEach((el, i) => { try { el.scrollTop = originalTops[i] || 0; } catch (_) {} });
    window.scrollTo(0, originalY);
    return [...merged.values()];
  }




  /* ── ② 详情页：优先读页面内嵌数据，读不到再退回 DOM ── */




  function detail() {




    // 🔒 2026-10-25 江少「颜色轴丢失根治」：子帧 sku-panel.html 的 URL 是 ?offerId=xxxx 形态，




    //   旧 OFFER_RE 只匹配 /offer/xxxx.html → 子帧 offerId 提取失败、deepSkuCombos/Names 过滤错乱。




    //   这里同时支持 path 形态与 query 形态，子帧也能拿到正确 offerId。




    const _om = location.href.match(OFFER_RE) || location.href.match(/[?&]offer[_]?[iI][dD]=(\d+)/i);




    const d = {




      offerId: (_om && _om[1]) || '',




      title: '', price: '', priceMax: '', currency: 'CNY',




      images: [], skus: [], attrs: {}, category: '', description: '', url: location.href,




      // 🔒 2026-10-25 江少「颜色轴丢失」：标记本帧身份，探针/诊断一眼看出颜色落在主帧还是 air.1688.com 子帧




      frameUrl: location.href,




      isIframe: (typeof top !== 'undefined' && top !== window)




    };




    // 🔒 根治：每轮 detail 都向所有 sku 子帧（air.1688.com / taobao）发起跨域 SKU 请求；




    //    子帧回传是异步的，由引擎多轮补抓在后续轮次经 mergeFrameSku 合并进来。




    requestFrameSku();




    // 标题：优先 document.title（"8801高腰收腹内裤… - 阿里巴巴"），h1 在详情页常是公司名




    d.title = clean((document.title || '').split(/\s+-\s+/)[0]);




    const h1 = document.querySelector('h1') || document.querySelector('[class*="title"]');




    if (!d.title) d.title = txt(h1);




    // 🔒 2026-10-25 江少「验证码拦截的怎么也进采集箱」：详情页被 1688 风控时 document.title




    //    就是「验证码拦截」——打上 captcha 标记，引擎据此判失败不推送（以前把验证码页当商品收）。




    try {




      const pgT = clean(document.title || '');




      let bodyHead = '';




      try { bodyHead = clean((document.body && document.body.innerText) || '').slice(0, 200); } catch (e2) {}




      if (/验证码|安全验证|访问过于频繁/.test(pgT) || /^(验证码拦截|拖动滑块|安全验证)/.test(bodyHead)) d.captcha = true;




    } catch (e) { /* 识别失败按正常页走，引擎还有标题兜底 */ }




    // 价格（DOM 兜底）：[class*=price] 里混着「1件起批」的起批量和输入框 →




    // 只认「纯价格形态」元素（¥41 / 41.00 / ¥41-50），按文档序取第一个（价格区在 DOM 前部），




    // 起批/库存/运费语境先排掉（实测踩坑：priceMax 被「1件起批」污染成 1）




    const PRICE_TXT_RE = /^[¥￥\s]*\d+(?:[.,]\d+)?(?:\s*[-~—]\s*\d+(?:[.,]\d+)?)?[¥￥\s]*$/;




    // 🔒 2026-10-25 江少「价格被四舍五入（13.44→13）」：1688 常把价格拆成两个元素——




    //   「¥13」整元大字 +「.44」角分小字分开放，只取第一个纯价格元素就丢小数。




    //   取到价格元素后向后看最多 3 个兄弟节点：以 ./, + 1-2 位数字开头（角分后缀）→ 拼回完整价。




    let pMain = '';




    for (const e of document.querySelectorAll('[class*="price"],[class*="Price"]')) {




      let t = priceTextOf(e);




      if (!t || !PRICE_TXT_RE.test(t) || /起批|起订|起售|最小|库存|运费|计价|批发|定金|优惠|券/.test(t)) continue;




      pMain = t;




      break;




    }




    if (pMain) {




      const mm = pMain.match(/(\d+(?:[.,]\d+)?)\s*[-~—]\s*(\d+(?:[.,]\d+)?)/);




      const pv = num(mm ? mm[1] : pMain);




      if (hasP(pv)) d.price = pv;   // 0 不算价：'0' 会挡死后面 deepOffers/拦截响应的真价回填




      d.priceMax = mm ? num(mm[2]) : '';




    }




    // ── 主图三层（2026-10-24 江少：主图采太多还混进平台吉祥物/推荐图）──




    //   ① 结构化图列 offerImages/imageList（拦截响应里本商品的官方主图序列，最可信、顺序即页面画廊）




    //   ② DOM 兜底：只认商品图标准路径 img/ibank —— 吉祥物/客服图/徽标/推荐位不在此路径，天然过滤




    //   ③ 详情描述长图（offer_details.content）降级垫底且限量 3 张 —— Noon 主图用不上 promo 长图




    const set = new Set();          // ② DOM 商品图




    const descSet = new Set();      // ③ 描述长图




    document.querySelectorAll('img').forEach(img => {




      const u = pickImg(img);




      // 旧版只排 icon/logo/svg，结果全页 20 张连牛头吉祥物都进来；现在只认 ibank 商品图路径




      if (u && /alicdn|1688/.test(u) && /img\/ibank\//i.test(u) &&




          !BAD_IMG.test(u) && !/\.svg($|\?)/i.test(u)) set.add(u);




    });




    // 详情描述长图（offer_details.content 里全是 cbu01 大图）→ 降级到 descSet




    try {




      const html = (window.offer_details && window.offer_details.content) || '';




      const re = /src=["']([^"']+cbu01\.alicdn\.com[^"']+\.(?:jpg|jpeg|png))["']/gi;




      let m; while ((m = re.exec(html)) && descSet.size < 5) descSet.add(absUrl(m[1]).split('?')[0]);




      // 描述正文：同一份 HTML 剥标签取文字（详情页文案只在 offer_details 里，DOM 不渲染）




      if (!d.description && html) {




        const t = cleanDescription(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')




          .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/gi, ' '));




        if (t.length > 20) d.description = t.slice(0, 2000);




      }




    } catch (e) { /* 忽略 */ }




    d.images = [...set].slice(0, 12);




    // 规格（DOM 兜底）：只收"叶子"规格项——容器元素（里面还套着同类项）会把




    // 「颜色黑灰白」整块文本抓进来；纯属性名（颜色/尺码）和长串文本也不是 SKU 值




    // 选择器放宽：1688 各模板类名不一（sku-item / obj-sku 的 value / prop-item / data-sku）




    const skuSel = '[class*="sku"] [class*="item"],[class*="sku-item"],[class*="prop"] [class*="item"],[data-sku],[class*="sku"] [class*="value"],[class*="spec"] [class*="item"]';




    const skuSet = new Set();




    let skuDomCand = 0;   // 🔒 诊断：DOM 候选/保留计数（回传 ERP 存档，下次一眼看出是漏采还是页面没有）




    // 店铺卡片/属性表/导航里的统计行（访客 3250m、成交 80台、采购 34人、开店 2023年6月）




    // 类名常带 prop/item，会被上面选择器误抓 → 命中这些容器直接跳过




    const NOT_SKU_BOX = '[class*="shopcard"],[class*="shop-card"],[class*="attribute"],[class*="attr-"],[class*="param"],[class*="nav"],[class*="crumb"],[class*="breadcrumb"],[class*="banner"],[class*="header"],[class*="footer"],[class*="company"],[class*="store"]';




    document.querySelectorAll(skuSel).forEach(el => {




      if (el.querySelector(skuSel)) return;               // 容器 → 跳过（值在它的叶子后代里）




      if (el.closest(NOT_SKU_BOX)) return;                // 店铺统计/属性表容器 → 跳过




      // 🔒 2026-10-25 江少「颜色轴丢失」：1688 颜色选项常是**图片色块**（<span class="sku-item" style="background-image:...">），




      //   txt(el) 拿到空串 → 被 if(!t) 跳过，尺码（纯文字）进了、颜色全没。现除文本外，




      //   依次回退读 data-value / data-sku / title / alt（色块名常挂在属性上）。




      const t = clean(el.getAttribute('data-value') || el.getAttribute('data-sku') ||




        el.getAttribute('title') || el.getAttribute('alt') || el.textContent);




      if (!t) return;




      skuDomCand++;                                       // 🔒 诊断：候选数（过滤前）




      if (t.length > 40) return;                          // 规格值放宽到 40 字（颜色名普遍很长）；超长是容器/描述文本




      if (!skuNameOk(t)) return;                          // 价格/起批/库存语境、属性名、长数字串、日期统计值统一挡




      skuSet.add(t);




    });




    d.skus = [...skuSet].slice(0, 60);




    // 属性表：跳过"上市年份":"上市年份"这种占位对；过滤交易杂讯键（发布时间/代发热度等，




    // 2026-10-23：这些不是商品规格，留着污染规则识别——重量/尺寸/材质才是有用的）




    const JUNK_ATTR_RE = /发布时间|代发|分销商|起批|浏览|收藏|成交|采购|开店|成立|注册资本|访客|回复率|好评率|近\d+天|交易|保障|服务|运费说明|库存/;




    // 价格行过滤：变体价格表（「粉色51粒 纸塑袋:4」）值是纯数字/带币符——不是规格值（2026-10-23）




    const PRICE_VAL_RE = /^[¥￥$€]?\s*\d+(\.\d+)?\s*(元|块|美元)?$/;




    // 🔴 2026-10-24 江少（要智能自动识别重量/尺寸，而不是抓一堆变体价格行回来）：




    //   属性采集改成**规格白名单制**——只有键名像"真规格"才收（重量/尺寸/材质/容量/型号…），




    //   其余（变体名:价格 之类）一律不收。此前"抓到什么算什么"导致库里 40/40 条属性全是




    //   「玫粉40粒/片（纸塑袋）:12.80」这类价格行 → 重量/尺寸无原料可识别，只能填默认 1kg。




    const SPEC_KEY_RE = /重量|净重|毛重|克重|净含量|含量|容量|材质|尺寸|规格|型号|功率|电压|产地|装箱|包装|厚度|直径|长度|宽度|高度|货号|品牌|颜色|适用|风格|工艺|功能|用途|承重|克|千克|ml|升|cm|mm/i;




    // "颜色分类"这类是**变体表头**（实测库里它的值是"重量(g)"这种残值），不是规格 → 排除




    // 🔒 2026-10-24 江少：放开「发货」——此前为挡"发货地/发货时间"把整词过滤，但误伤了合法包装键




    //   「发货尺寸/发货重量」。SPEC_KEY_RE 不含"发货"，故"发货地/发货时间/发货方式"等噪声键本就




    //   因无规格词而不命中 SPEC_KEY_RE 被过滤；放开后仅"发货尺寸(含尺寸)/发货重量(含重量)"这类真包装键被捕获。




    const NOT_SPEC_KEY_RE = /分类|价格|起批|批发价|零售价|库存|销量|成交|运费|代发|混批|优惠|促销|服务|保障|快递|物流|卖家|店铺|评价|回头率/i;




    const isSpecKey = (k) => !!(k && SPEC_KEY_RE.test(k) && !NOT_SPEC_KEY_RE.test(k) && String(k).length <= 14);




    document.querySelectorAll('table tr, [class*="attribute"] li, [class*="param"] li').forEach(tr => {




      const cells = tr.querySelectorAll('td,th,span,div');




      if (cells.length >= 2) {




        const k = txt(cells[0]); const v = txt(cells[1]);




        if (k && v && k !== v && k.length < 30 && v.length < 80 && isSpecKey(k) && !PRICE_VAL_RE.test(v)) d.attrs[k] = v;




      }




    });




    // 新版 1688 详情页规格参数不是 <table>，是 div/li 列表："材质：不锈钢" 整段一个文本节点




    // → 按 "k：v" / "k:v" 拆（2026-10-23：此前只扫 table，真规格参数全漏；2026-10-24：同样只收白名单键）




    document.querySelectorAll('[class*="param"] li,[class*="Param"] li,[class*="attribute"] li,[class*="Attr"] li,[class*="spec"] li,[class*="attr-item"],[class*="attr-item"],[class*="param"] div,[class*="attribute"] span').forEach(el => {




      const t = txt(el);




      const m = t && t.match(/^(.{1,14}?)\s*[:：]\s*(.{1,80})$/);




      if (m && m[1] !== m[2] && isSpecKey(m[1]) && !PRICE_VAL_RE.test(m[2]) && !d.attrs[m[1]]) d.attrs[m[1]] = m[2];




    });




    // 面包屑类目（1688 原始类目 → ERP 映射层的最高精度原料）




    // 选择器加宽 + 排除"首页/阿里巴巴"导航噪音；新版页面类名大小写不一（crumb/Crumb）




    const crumb = [...document.querySelectorAll('[class*="crumb"] a, [class*="Crumb"] a, [class*="breadcrumb"] a, [class*="Breadcrumb"] a, #navigation-path a, nav[class*="path"] a, [class*="category-path"] a')]




      .map(txt).filter(t => t && !/^首页$|^阿里巴巴$|^1688$|^登录$/.test(t));




    // 🔴 2026-10-24 江少（每批都有无法识别的根因②）：分隔符必须统一为 '>'，




    //   与列表页 deepOffers(用 '>') 和 server 端 catLeafKey/matchNisCategory 拆分口径一致。




    //   之前用 '|' 连 → server 端按 '>' 拆整条当一坨 → 映射表查不到/叶子取错 → 无法识别。




    d.category = crumb.join('>');




    // 兜底：面包屑常异步渲染，detail() 是同步一次抓 —— 从拦截响应/深度对象里再找一层




    if (!d.category) {




      try {




        const hit = deepOffers().concat(parseCaptured()).filter(x => x.offerId === d.offerId);




        const hc = hit.find(x => x.category);




        if (hc) d.category = String(hc.category).slice(0, 200);




      } catch (e) { /* 忽略 */ }




    }




    // 兜底②：深搜拦截 JSON —— 1688 详情数据里类目键名不统一（catPath/categoryName/breadcrumb…）




    // 找第一个「类目样」值：中文字符串或字符串数组（面包屑各级），拼成 a>b>c（2026-10-23）




    if (!d.category) {




      let found = '';




      const walk = (o, depth) => {




        if (found || !o || typeof o !== 'object' || depth > 8) return;




        for (const k of Object.keys(o)) {




          if (found) return;




          const v = o[k];




          if (/categ|catPath|breadcrumb|catName|navPath/i.test(k)) {




            if (typeof v === 'string' && v.length > 1 && v.length < 120 && /[\u4e00-\u9fa5]/.test(v)) { found = v; return; }




            if (Array.isArray(v) && v.length && v.length < 8 && v.every(x => typeof x === 'string' && x.length < 40)) { found = v.join('>'); return; }




            // 🔴 2026-10-24：新版接口类目是对象数组（[{id,name},{id,name}…]），字符串判定直接漏掉——




            //    提取每级的 name/value/text 拼回路径




            if (Array.isArray(v) && v.length >= 2 && v.length < 8 && v.every(x => x && typeof x === 'object')) {




              const names = v.map(x => (x && (x.name || x.value || x.text || x.catName)) || '').filter(s => s && /[\u4e00-\u9fa5]/.test(s));




              if (names.length === v.length) { found = names.join('>'); return; }




            }




          }




          if (v && typeof v === 'object') walk(v, depth + 1);




        }




      };




      try { deepOffers().concat(parseCaptured()).forEach(x => walk(x, 0)); } catch (e) { /* 忽略 */ }




      if (found) d.category = found.slice(0, 200);




    }




    // 兜底③：全 window 全局扫描（2026-10-24）——1688 改版后数据全局键名不固定，不再只盯 7 个候选键。




    // 遍历 window 自有键的纯对象，串化后先粗筛含类目关键词，再深搜类目键的中文值/中文数组




    if (!d.category) {




      try {




        let gfound = '';




        for (const k of Object.keys(window)) {




          if (gfound) break;




          let v;




          try { v = window[k]; } catch (e) { continue; }




          if (!v || typeof v !== 'object' || Array.isArray(v) || v.nodeType) continue;




          let s;




          try { s = JSON.stringify(v); } catch (e) { continue; }




          if (!s || s.length > 3e6 || !/[\u4e00-\u9fa5]/.test(s)) continue;




          if (!/categ|catPath|breadcrumb|catName|navPath|crumb/i.test(s)) continue;




          const walk2 = (o, depth) => {




            if (gfound || !o || typeof o !== 'object' || depth > 8) return;




            for (const k2 of Object.keys(o)) {




              if (gfound) return;




              const v2 = o[k2];




              if (/categ|catPath|breadcrumb|catName|navPath|crumb/i.test(k2)) {




                if (typeof v2 === 'string' && v2.length > 1 && v2.length < 120 && /[\u4e00-\u9fa5]/.test(v2) && !/<|http/.test(v2)) { gfound = v2; return; }




                if (Array.isArray(v2) && v2.length && v2.length < 8 && v2.every(x => typeof x === 'string' && x.length < 40 && /[\u4e00-\u9fa5]/.test(x))) { gfound = v2.join('>'); return; }




                // 🔴 2026-10-24：对象数组类目（[{id,name}…]）支持，同兜底②口径




                if (Array.isArray(v2) && v2.length >= 2 && v2.length < 8 && v2.every(x => x && typeof x === 'object')) {




                  const names = v2.map(x => (x && (x.name || x.value || x.text || x.catName)) || '').filter(s => s && /[\u4e00-\u9fa5]/.test(s));




                  if (names.length === v2.length) { gfound = names.join('>'); return; }




                }




              }




              if (v2 && typeof v2 === 'object') walk2(v2, depth + 1);




            }




          };




          try { walk2(v, 0); } catch (e) {}




        }




        if (gfound) d.category = gfound.slice(0, 200);




      } catch (e) { /* 全局扫描失败不影响主流程 */ }




    }




    // 🔍 面包屑诊断（2026-10-24）：三层全 miss 时记录页面实况随行回传——面包屑 0/123 全空，




    //    没有线索没法修 selector，这坨数据就是下一轮的抓手




    if (!d.category) {




      try {




        const diag = { sel: {}, globals: [] };




        for (const sel of ['[class*="crumb"]', '[class*="Crumb"]', '[class*="breadcrumb"]', '#navigation-path', 'nav[class*="path"]', '[class*="category-path"]', '.position-crumbs', '[class*="category"]']) {




          const n = document.querySelectorAll(sel).length;




          if (n) diag.sel[sel] = n;




        }




        for (const k of ['__INIT_DATA__', '__init_data__', 'g_page_config', '__DATA__', '__PAGE_DATA__', 'offerDetailData', '__INIT_PROPS__', 'window.__AURORA__']) { try { if (window[k]) diag.globals.push(k); } catch (e) {} }




        diag.docTitle = (document.title || '').slice(0, 40);




        try { diag.captured = (parseCaptured() || []).length; } catch (e) {}




        d.catDiag = JSON.stringify(diag).slice(0, 500);




      } catch (e) { /* 诊断失败不影响主流程 */ }




    }




    // 🎯 一次性根治（2026-10-24 江少：改了两天还没弄好）：插件不再猜类目解析规则——




    //    把拦截接口/全局数据岛里所有「类目样键」的原始片段原样回传，ERP 侧解析+存档。




    //    接口再改版，改 ERP 解析端即可，插件永远不动。收集上限 4 条 × 800 字节，防 payload 爆炸。




    if (!d.category) {




      try {




        const CATKEY = /categ|catPath|breadcrumb|catName|navPath|crumb/i;




        const raws = [];




        const grab = (o) => {




          const out = [];




          const walk = (obj, depth) => {




            if (out.length >= 4 || !obj || typeof obj !== 'object' || depth > 8) return;




            for (const k of Object.keys(obj)) {




              if (out.length >= 4) return;




              const v = obj[k];




              if (CATKEY.test(k) && v != null) {




                let s = '';




                try { s = JSON.stringify(v); } catch (e) {}




                if (s && s.length > 2 && s.length < 3000 && /[\u4e00-\u9fa5]/.test(s)) out.push('{' + JSON.stringify(k) + ':' + s.slice(0, 800) + '}');




              }




              if (v && typeof v === 'object') walk(v, depth + 1);




            }




          };




          walk(o, 0);




          return out;




        };




        // ① 拦截捕获的接口数据




        try { (parseCaptured() || []).slice(0, 40).forEach(x => { if (raws.length < 4) raws.push(...grab(x)); }); } catch (e) {}




        // ② window 全局数据岛（带键名前缀，ERP 可溯源）




        try {




          for (const k of Object.keys(window)) {




            if (raws.length >= 4) break;




            let v; try { v = window[k]; } catch (e) { continue; }




            if (!v || typeof v !== 'object' || v.nodeType || Array.isArray(v)) continue;




            let s; try { s = JSON.stringify(v); } catch (e) { continue; }




            if (!s || s.length > 3e6 || !CATKEY.test(s)) continue;




            raws.push(...grab(v).map(x => '[' + k + ']' + x));




          }




        } catch (e) {}




        // ③ React fiber props 挖掘（2026-10-24 妙手适配调研抄作业）：




        //    1688 全站是 React 应用，接口响应/数据岛里没有的数据可能仍留在组件 props 里




        //    （渲染前的完整数据）。妙手列表页 offerId 就是遍历 fiber 树挖 memoizedProps 拿的。




        //    手法：DOM 元素键找 __reactFiber$ / __reactInternalInstance$ → return 爬到根 →




        //    栈遍历整棵树 → memoizedProps 顶层类目样键交 grab 深挖。raws 满 4 条即停。




        try {




          const seen = new Set();




          for (const el of document.querySelectorAll('body > div')) {




            if (raws.length >= 4) break;




            if (!el || seen.has(el)) continue; seen.add(el);




            let fiber = null;




            for (const k of Object.keys(el)) {




              if (k.includes('__reactFiber$') || k.includes('__reactInternalInstance$')) { fiber = el[k]; break; }




            }




            if (!fiber) continue;




            for (; fiber.return; ) fiber = fiber.return;




            const fstack = [fiber];




            while (fstack.length && raws.length < 4) {




              const f = fstack.shift();




              if (!f) continue;




              const props = f.memoizedProps;




              if (props && typeof props === 'object') {




                for (const k of Object.keys(props)) {




                  if (raws.length >= 4) break;




                  const v = props[k];




                  if (!v || typeof v !== 'object' || !CATKEY.test(k)) continue;




                  raws.push(...grab(v).map(x => '[fiber:' + k + ']' + x));




                }




              }




              if (f.child) fstack.push(f.child);




              if (f.sibling) fstack.push(f.sibling);




            }




          }




        } catch (e) { /* fiber 挖掘失败不影响主流程 */ }




        if (raws.length) d.rawCat = JSON.stringify([...new Set(raws)].slice(0, 4)).slice(0, 6000);




      } catch (e) { /* 失败不影响主流程 */ }




    }




    // 内嵌数据（1688/淘宝系常见全局对象）—— 命中就用它覆盖上面 DOM 的结果




    try {




      const cand = ['__INIT_DATA__', '__init_data__', 'g_page_config', '__DATA__', '__PAGE_DATA__', 'offerDetailData'];




      for (const k of cand) {




        const v = window[k];




        if (!v) continue;




        const s = JSON.stringify(v);




        if (!/"(?:offer|item|sku|price)/i.test(s)) continue;




        const str = (o, keys) => { for (const kk of keys) { if (o && o[kk] != null && typeof o[kk] !== 'object') return clean(o[kk]); } return ''; };




        const t = str(v, ['title', 'subject', 'offerTitle']);




        if (t) d.title = t;




        const pr = str(v, ['price', 'priceDisplay', 'salePrice']);




        if (hasP(pr)) d.price = num(pr);   // 0 不算价




        break;




      }




    } catch (e) { /* 内嵌数据结构未知，忽略，继续用 DOM 结果 */ }




    // 兜底：深度扫页面 JS 对象 + 拦截响应，找本条 offerId 对应的数据（真实字段：offerUrl/price/imageUrl/title）




    try {




      const hit = deepOffers().concat(parseCaptured()).filter(x => x.offerId === d.offerId);




      // 接口价优先：DOM 兜底价常是「1件起批」的起批量（实测 price=1，真实价 27.5 在拦截响应里）




      //   hasP：接口里 price:'0' 的行不算数，别拿 0 覆盖 DOM 抓到的真价




      const hp = hit.find(x => hasP(x.price));




      if (hp && hasP(hp.price)) d.price = hp.price;




      // 区间上限也从接口补：DOM 拆 span / 被起批量污染时 priceMax 不可信（实测污染成 1）




      const hpMax = hit.find(x => x.priceMax && +x.priceMax > 1);




      if (hpMax && (!d.priceMax || +d.priceMax <= 1)) d.priceMax = hpMax.priceMax;




      const h = hit.find(x => x.image) || hit[0];




      if (h) {




        if (h.image && !d.images.some(u => u === h.image)) d.images.unshift(h.image);   // 主图放最前




        if (h.title && (d.title.length < 8 || /公司/.test(d.title))) d.title = h.title;




      }




      // 规格三路合并：DOM 叶项 + 接口 skuModel（深扫拦截响应）+ SKU 面板 iframe，互去重——




      // DOM 常只采到一半（模板类名不匹配 / 面板在跨域 iframe 里），接口响应里才是完整的




      const deep = deepSkuNames(d.offerId);




      if (deep.length) d.skus = [...new Set([...d.skus, ...deep])].slice(0, 60);




      // 🔴 2026-10-28 江少「区间价统一」：接口 skus 数组各 SKU 自带价格 → 采「规格名→价」map，




      //    engine 扁平路径按名透传，区间价不再全落首价。




      try { d.sku_price_map = deepSkuPrices(d.offerId); } catch (e3d) { d.sku_price_map = {}; }
      // 🔴 2026-10-30 官方完整 SKU 矩阵透传给上层（skuId/specId/轴名:值/展示价/批发价/真实库存/官方区间价）
      try {
        const _om = window.__c1688_orig_sku;
        if (_om && (_om.rows.length || _om.priceScale)) {
          if (_om.rows.length) d.sku_matrix = _om.rows;
          if (_om.priceScale) d.sku_price_scale = _om.priceScale;
          d.sku_matrix_source = _om.source || '';
        }
      } catch (eOm) { /* 无 window 环境或读取失败均不影响 */ }




      // 🔴 2026-10-28 治本（探针 904111948166 实锤）：主页面 module-od-sku-selection 的 feature-item




      //   含「轴名 值 ¥价 库存N包」。单轴商品(颜色)combos=0 是正常(无组合)，但 SKU 变体+各自价格全在这。




      //   skuFromSpecTable 只认双轴矩阵表把单轴漏了 → 这里补全 skus + 还原区间价(price/priceMax) + 每SKU价map。




      try {




        const feat = skuFromFeature();




        if (feat.skus.length) {




          d.skus = [...new Set([...d.skus, ...feat.skus])].slice(0, 60);




          if (!hasP(d.price) && feat.priceMin !== '') d.price = feat.priceMin;




          if ((!d.priceMax || +d.priceMax <= 1) && feat.priceMax !== '') d.priceMax = feat.priceMax;




          d.sku_price_map = d.sku_price_map || {};




          for (const it of feat.items) if (it.value && it.price !== '') d.sku_price_map[it.value] = it.price;




        }




      } catch (e3e) { /* 无规格区则忽略 */ }




            // 🔴 2026-10-29 治本：页面展示价（expand-view-item）最后覆盖 sku_price_map，最高优先于接口价。
      //   但仅当页面价「不高于已采价且落在区间价内」才覆盖——页面展示价(display)≤接口批发价(wholesale)，
      //   防 expand-view 误抓批发高价(如 22.4)反把正确展示价(19.8)污染。
      try {
        const _exP = skuExpandPrices();
        if (Object.keys(_exP).length) {
          const _lo = hasP(d.price) ? num(d.price) : 0;
          const _hi = hasP(d.priceMax) ? num(d.priceMax) : 0;
          d.sku_price_map = d.sku_price_map || {};
          for (const _k in _exP) {
            const _p = num(_exP[_k]);
            if (!hasP(_p)) continue;
            const _cur = num(d.sku_price_map[_k]);
            // SKU 面板逐项价是当前规格的直接报价，不能用商品总区间过滤：
            // d.price 有时先被接口中的另一档价格填入，过滤会误删低价规格。
            if (!hasP(_cur) || _p <= _cur) d.sku_price_map[_k] = _exP[_k];
          }
        }
      } catch (eE) { /* 兜底不影响 */ }

      // 🔴 治本（江少「价格不对」根因）：DOM 渲染文本权威展示价，覆盖 skuInfoMap 批发原价。
      //    domSkuPrices 在子帧也能跑(子帧看得到 iframe 内 SKU DOM)，批发价泄漏从源头被掐断。
      //    展示价恒≤批发价，仅在 DOM 价更低(或同键尚无价)时覆盖。
      try {
        const _dom = domSkuPrices();
        if (Object.keys(_dom).length) {
          d.sku_price_map = d.sku_price_map || {};
          for (const _k in _dom) {
            const _dp = _dom[_k];
            const _cur = num(d.sku_price_map[_k]);
            if (!hasP(_cur) || _dp <= _cur) d.sku_price_map[_k] = _dp;
          }
        }
      } catch (eD) { /* 忽略 */ }

      // 🔴 2026-10-31 官方矩阵兜底回填（江少「所有变体一个价」根治·展示价优先）：
      //    mtop 批发阶梯价会以同键覆盖页面展示价（3D龙 913670348263：展示 1.3/2.5/5.7/10.5 被批发 4.3/5.5/8.7/13.5 盖掉）。
      //    官方 sku_matrix 里两套价并存 —— 这里把矩阵里每个**纯规格值**的最低价回填进 sku_price_map，
      //    展示价恒≤批发价，取 min 即收敛到展示价。只补价格键，不动键名结构/图片/规格轴。
      try {
        const _mxRows = Array.isArray(d.sku_matrix) ? d.sku_matrix : [];
        if (_mxRows.length) {
          d.sku_price_map = d.sku_price_map || {};
          for (const _r of _mxRows) {
            if (!_r || !_r.axes || typeof _r.axes !== 'object') continue;
            const _rp = num(_r.discountPrice) > 0 ? num(_r.discountPrice) : num(_r.price);
            if (!(_rp > 0)) continue;
            for (const _av of Object.values(_r.axes)) {
              const _k = String(_av == null ? '' : _av).trim();
              if (!_k || _k.indexOf(':') >= 0) continue;   // 只补纯值键，不制造结构化键
              const _cur = num(d.sku_price_map[_k]);
              if (!hasP(_cur) || _rp < _cur) d.sku_price_map[_k] = _rp;
            }
          }
        }
      } catch (eMx) { /* 忽略 */ }


      if (d.skus.length < 2) d.skus = [...new Set([...d.skus, ...skuPanelNames()])].slice(0, 60);




      // ── ① 结构化图列合并（2026-10-24 江少：主图采太多还混吉祥物）──




      //    拦截响应里本商品的 offerImages/imageList 是官方画廊（顺序即页面展示顺序），




      //    放最前；DOM 兜底图紧随其后去重；描述长图垫底限量。全列上限 12。




      try {




        const gal = new Set();




        const cap2 = window.__c1688cap || { items: [] };




        for (const it of cap2.items) {




          if (d.offerId && !String(it.body || '').includes(String(d.offerId))) continue;




          const j = parseBody(it.body);




          if (j) digImages(j, 5, gal);




        }




        if (gal.size) {




          const merged = [...gal, ...d.images.filter(u => !gal.has(u)), ...[...descSet].filter(u => !gal.has(u) && !d.images.includes(u))];




          d.images = merged.slice(0, 12);




        } else {




          d.images = [...d.images, ...[...descSet]].slice(0, 12);




        }




      } catch (e2) { /* 合并失败保底用 DOM 结果 */ }




      // ── SKU 专属图（2026-10-24 江少：sku图怎么没有）──




      //    skuModel.propValues[].{name,imageUrl} 是 1688 每个规格的缩略图，




      //    按「规格值→图」映射回传，引擎组装变体行时优先用它（没有才落主图第一张）。




      try {




        const _ci = domColorImages();




        d.sku_images = Object.assign({}, deepSkuImages(d.offerId), _ci);




        d._colorImgs = _ci;   // 🔒 探针取证：DOM 颜色图命中几个




      } catch (e3) { d.sku_images = {}; d._colorImgs = {}; }




      // 🔒 2026-10-25 江少「颜色轴丢失」根治：① 优先解析页面 SKU 矩阵表（颜色×尺码完整组合，




      //    探针已证实 mtop skuModel 常进不了采集器、但矩阵表必渲染 → 这条最稳）；




      //    ② 拿不到矩阵表再退回 mtop skuModel（deepSkuCombos）；③ 跨域子帧回传合并兜底。




      try { d.sku_combos = skuFromSpecTable(); } catch (e3a) { d.sku_combos = []; }




      if (!d.sku_combos.length) {




        try { d.sku_combos = deepSkuCombos(d.offerId); } catch (e3b) { d.sku_combos = []; }




      }




      // 🔒 根治：合并跨域子帧（air.1688.com / taobao sku-panel）回传的 SKU —— 颜色轴双保险




      try { mergeFrameSku(d); } catch (e3c) { /* 忽略 */ }

      // ═══════════════════════════════════════════════════════════════════════════════════════════
      // 🔴🔴🔴 2026-10-29 终极路径：直接从 DOM expand-view-item 解析带价格的 combos
      // 1688 新版 SPA skuModel 闭包锁闭包、network 拦截 captured=0 → deepSkuCombos 全空
      // cartesian 积从 sku_price_map 查价也 miss（key 不匹配）→ 变体价全 basePrice
      //
      // 但 DOM 永远渲染完整：feature-item-label 是轴名，expand-view-item 里
      // item-label 是规格值，item-price-stock 就是这个规格值的独立价格！
      //
      // 这条路径是主力（直接拿到值+价格组合），deepSkuCombos/skuFromSpecTable 做补全
      // ═══════════════════════════════════════════════════════════════════════════════════════════
      (function parseDomPriceCombos() {
        try {
          const COLOR_WORDS_RE = /(黑色|白色|肉色|肤色|奶白|红色|蓝色|绿色|黄色|粉色|紫色|灰色|棕色|金色|银色|杏色|卡其|酒红|藏青|浅灰|深灰|宝蓝|湖蓝|米色|香槟|咖啡|驼色|橙色|五彩|花色|咖色)/g;
          const _parsePrice = (t) => { if (!t) return ''; const m = String(t).match(/[¥￥]\s*(\d+(?:\.\d+)?)/); return m ? m[1] : ''; };

          // 1. 扫 feature-item 容器 → 抽出所有轴 + 值+价格对
          const features = document.querySelectorAll('[class*="feature-item"]');
          const axes = [];
          for (const fi of features) {
            const label = fi.querySelector('[class*="feature-item-label"]');
            if (!label) continue;
            const axisName = (label.textContent || '').trim();
            if (!axisName || axisName.length > 6) continue;  // 短词过滤掉长文本

            const pairs = [];
            // expand-view-item 行（主路径：值+价格+库存）
            const rows = fi.querySelectorAll('[class*="expand-view-item"]');
            for (const row of rows) {
              const valEl = row.querySelector('[class*="item-label"], [class*="sku-filter-button"]');
              let val = (valEl?.textContent || '').trim();
              let price = '';
              const priceEls = row.querySelectorAll('[class*="item-price-stock"], [class*="price"]');
              for (const pe of priceEls) {
                const t = (pe.textContent || '').trim();
                const pp = _parsePrice(t);
                if (pp && !/库存|起批|双$/i.test(t)) { price = pp; break; }
              }
              if (val) pairs.push({ val, price });
            }
            // 老版：没有 expand-view-item
            if (rows.length === 0) {
              const lbls = fi.querySelectorAll('[class*="item-label"], [class*="sku-filter-button"]');
              for (const lbl of lbls) { const v = (lbl.textContent || '').trim(); if (v) pairs.push({ val: v, price: '' }); }
            }
            // 🔴 2026-10-31 江少「净含量怎么没有了」：灰甲喷雾749475616580 的「30ml」按钮不带
            //    item-label/sku-filter-button 类 → 上面两路都抓不到 → 净含量轴整轴丢失（深层
            //    combos 也只有颜色轴）→ 叶子文本兜底：轴容器内的短文本叶子，排除轴名自身/
            //    价格/库存文案后作为规格值（只在前面两路颗粒无收时才走）。
            if (pairs.length === 0) {
              const _seenV = new Set();
              for (const _el of fi.querySelectorAll('span,div,li,button,a,p')) {
                if (_el.children && _el.children.length > 2) continue;
                const _t = (_el.textContent || '').trim();
                if (!_t || _t === axisName || _seenV.has(_t)) continue;
                if (_t.length > 30) continue;
                if (/¥|库存|起批|代发|老客价|包邮|发货|运费|浏览|收藏|件起批/i.test(_t)) continue;
                _seenV.add(_t);
                pairs.push({ val: _t, price: '' });
              }
            }
            if (pairs.length >= 1) axes.push({ name: axisName, pairs });
          }
          // 🔴 2026-10-31 记录「页面真实渲染的轴名」：engine 单值轴剔除只删页面没渲染的幻影轴
          //    （海盗帽 10273000801 尺码轴页面真渲染了「均码」单值 → 必须保留；卡牌幻影"规格"页面没有 → 剔除）。
          try { d.panel_axes = axes.map(a => String(a.name || '').trim()).filter(Boolean); } catch (ePa) { /* 忽略 */ }
          // 🔴 2026-10-31 江少「sku规格你怎么自动加字进去了」：记录页面真实渲染的规格值原文。
          //    买家在 1688 页面看到的值（如「1.5米…」）可能与官方 SKU 属性值（如「颗1.5米…」）差
          //    量词前缀——重复轴折叠时以页面展示文字为映射权威（panelMap: nz2 → 原文）。
          try {
            d.panel_vals = [];
            for (const a of axes) for (const p of (a.pairs || [])) { const t = String(p && p.val || '').trim(); if (t) d.panel_vals.push(t); }
          } catch (ePv) { /* 忽略 */ }

          // 2. 找颜色轴和尺码轴
          const domColor = axes.find(a => /颜色|色系/i.test(a.name));
          // 🔴 2026-10-31 补「尺寸」：树屋商品(1063716046987)轴名就是"尺寸"，旧正则 /尺码|规格/ 匹配不到
          //    → sizePairs 空 → 两轴商品被压成 4 个单颜色 combo 并覆盖规格表的 8 个双轴 combo（尺寸轴整列丢失）。
          const domSize  = axes.find(a => /尺码|尺寸|规格/i.test(a.name));

          // 颜色列表：优先 DOM（Layout B），没 DOM 补 readColorAxisValues（Layout A）
          const colorsClean = [];
          if (!domColor || domColor.pairs.length === 0) {
            const rawC = typeof readColorAxisValues === 'function' ? readColorAxisValues() : [];
            for (const c of rawC) {
              const value = String(c).trim();
              if (value) colorsClean.push(value);
            }
          } else {
            for (const p of domColor.pairs) {
              const value = String(p.val).trim();
              if (value) colorsClean.push(value);
            }
          }
          // 🔴 2026-10-29 加轴名黑名单过滤：防止 DOM 直接把轴名当值
          const _AXIS_BAD = /^(颜色|色系|主色|配色|颜色分类|颜色规格|规格|尺码|尺寸)$/i;
          const colorsSet = new Set(colorsClean.filter(c => c && !_AXIS_BAD.test(c)));
          let sizePairs = domSize ? domSize.pairs.filter(p => p && p.val && !_AXIS_BAD.test(p.val)) : [];
          // 🔴 2026-11-09 江少「怎么自动生成 12 个 SKU」：1688 展开视图里
          //    「库存72163PCS / 库存7574PCS」这类库存文本与紧邻的规格名粘连，被当成第二根轴，
          //    生成 PCS吊坠（带扣子）/PCS钥匙扣1/PCS钥匙扣2 三个幻影值 → 4 色 × 3 幻影 = 12 个
          //    根本不存在的组合（[OFFICIAL_SPEC] 只有一根颜色轴、distinctVariantImages=4）。
          //    判据极保守：非颜色轴的值**全部**以 PCS 开头，且去掉前缀后命中颜色轴值 → 整轴判为幻影。
          //    只丢幻影轴、不删/不改任何规格文字；清空后 domCombos 走「仅颜色轴」分支生成 4 条并在
          //    下方覆盖 d.sku_combos，正常双轴商品不受影响。
          if (sizePairs.length >= 2 && colorsSet.size) {
            const _cset = new Set([...colorsSet].map(c => String(c).trim()));
            const _allPcs = sizePairs.every(p => /^PCS/i.test(String(p.val || '').trim()));
            const _pcsHit = sizePairs.filter(p => {
              const v = String(p.val || '').trim();
              return /^PCS/i.test(v) && _cset.has(v.replace(/^PCS/i, '').trim());
            }).length;
            if (_allPcs && _pcsHit >= Math.ceil(sizePairs.length / 2)) {
              sizePairs = [];
              try { console.log('[parseDomPriceCombos] 剔除库存PCS粘连生成的幻影规格轴'); } catch (_) {}
            }
          }

          // 3. 组装 combos（带 DOM 独立价）
          let domCombos = [];
          if (colorsSet.size >= 2 && sizePairs.length >= 2) {
            for (const col of colorsSet) {
              for (const sz of sizePairs) {
                // 🔴 2026-10-31 保留页面真实轴名（尺寸/尺码/规格），不再硬编码"尺码"
                domCombos.push({ options: { 颜色: col, [domSize.name || '尺码']: sz.val }, price: sz.price || '', image: '' });
              }
            }
          } else if (sizePairs.length >= 2) {
            const axisName = domSize?.name || '规格';
            for (const sz of sizePairs) { domCombos.push({ options: { [axisName]: sz.val }, price: sz.price || '', image: '' }); }
          } else if (colorsSet.size >= 2) {
            for (const col of colorsSet) { domCombos.push({ options: { 颜色: col }, price: '', image: '' }); }
          } else if (colorsSet.size >= 1 || axes.some(a => a && a.pairs && a.pairs.length)) {
            // 🔴 2026-10-31 江少「部分没有抓取规格」：两轴都只有 1 个值的商品（灰甲喷雾 749475616580：
            //    净含量:30ml × 颜色分类:1 个申明值）—— 旧分支全要求 ≥2 值才建组合 → domCombos=0
            //    → 变体清空落「默认」。每根轴取其唯一值组成一条 combo（价格取轴上带价的值）；
            //    只有单根非颜色轴（如 净含量:30ml）同样兜住。
            const _opts = {};
            let _pr = '';
            if (colorsSet.size >= 1) {
              const _cv = [...colorsSet][0];
              if (_cv && !_AXIS_BAD.test(_cv)) _opts[domColor ? domColor.name : '颜色'] = _cv;
            }
            for (const _a of axes) {
              if (domColor && _a.name === domColor.name) continue;   // 颜色轴已用 colorsSet 的值
              if (!_a || !_a.pairs || !_a.pairs.length) continue;
              const _v0 = String(_a.pairs[0].val || '').trim();
              if (!_v0 || _AXIS_BAD.test(_v0)) continue;
              if (!_opts[_a.name]) _opts[_a.name] = _v0;
              if (!_pr && _a.pairs[0].price) _pr = _a.pairs[0].price;
            }
            if (Object.keys(_opts).length) domCombos.push({ options: _opts, price: _pr, image: '' });
          }

          // 4. 覆盖！DOM 带价 combos 比任何接口路径都准

          // 4. 灌 sku_price_map —— engine.js 的 skpPriceOf 从这查价
          // DOM item-label + item-price-stock 就是最准的 值→价格 映射
          const _domPriceMap = {};
          for (const sz of sizePairs) { if (sz.price) _domPriceMap[sz.val] = sz.price; }
          for (const cc of domCombos) {
            if (cc.price) { const k = Object.values(cc.options).join(";"); _domPriceMap[k] = cc.price; }
          }
          // 不覆盖已有 sku_price_map（避免丢 deepSkuCombos 的批发阶梯价）
          d.sku_price_map = Object.assign({}, d.sku_price_map || {}, _domPriceMap);

          // 🔴 2026-10-31 覆盖条件：DOM combos 轴数比现有更全（或现有为空）时覆盖 —— 灰甲喷雾
          //    749475616580 深层路径给的 2 条 combos 都只有颜色轴（净含量没进任何 combo），
          //    DOM 抓到双轴时必须以 DOM 为准；其余情况维持原判。
          const _exCombos = Array.isArray(d.sku_combos) ? d.sku_combos : [];
          const _exMaxAxes = _exCombos.reduce((m, c) => Math.max(m, c && c.options ? Object.keys(c.options).length : 0), 0);
          const _domMaxAxes = domCombos.reduce((m, c) => Math.max(m, c && c.options ? Object.keys(c.options || {}).length : 0), 0);
          if (domCombos.length >= 2 || (domCombos.length >= 1 && (_exCombos.length === 0 || _domMaxAxes > _exMaxAxes))) {
            const oldCount = Array.isArray(d.sku_combos) ? d.sku_combos.length : 0;
            const newPriceHit = domCombos.filter(c => c && c.price).length;
            d.sku_combos = domCombos.slice(0, 300);
            console.log(`[parseDomPriceCombos] 覆盖: ${oldCount} → ${domCombos.length} (${newPriceHit} 有价)`);
          }
        } catch (e) { /* 忽略 */ }
      })();

      // 🔴 2026-10-31 官方矩阵优先重建 combos（江少「尺寸呢？区间价呢？」根治）：
      //    青蛙 916245049351：页面 SKU 面板只渲染出 10cm 一个尺寸值，20cm 只在接口/矩阵里
      //    → 16 个 SKU（8色×2尺寸，10cm=2.9/20cm=5.7）被压成 8 个单颜色变体，价被批发价 5.9/8.7 污染。
      //    sku_matrix 是官方逐 SKU 权威数据（axes+skuId+discountPrice），矩阵覆盖 ≥2 个轴时以它为准
      //    重建 sku_combos；同行重复（展示价+批发价两行）按规格签名去重只留低价。
      //    combos 带 skuId → engine _matrixPriceOf 按 skuId 精确命中，区间价与页面一致。
      try {
        const _mrows = Array.isArray(d.sku_matrix) ? d.sku_matrix : [];
        if (_mrows.length) {
          const _mCombos = [];
          const _sigIdx = new Map();
          for (const _r of _mrows) {
            if (!_r || !_r.axes || typeof _r.axes !== 'object') continue;
            const _opts = {};
            for (const [_ak, _av0] of Object.entries(_r.axes)) {
              const _av = String(_av0 == null ? '' : _av0).trim();
              if (!_av || /^(颜色|色系|颜色分类|颜色规格|规格|尺码|尺寸)$/.test(_av)) continue;  // 轴名当值 → 丢
              _opts[String(_ak).trim() || '规格'] = _av;
            }
            if (!Object.keys(_opts).length) continue;
            const _sig = Object.keys(_opts).sort().map(k => k + '=' + _opts[k]).join('|');
            const _dp = (() => { const a = num(_r.discountPrice); if (a > 0) return a; const b = num(_r.price); return b > 0 ? b : 0; })();
            const _skuId = String(_r.skuId ?? _r.sku_id ?? _r.specId ?? '').trim();
            if (_sigIdx.has(_sig)) {
              // 同一规格签名出现多行（展示价/批发价双写）→ 只留低价行的价与 skuId
              const _ex = _mCombos[_sigIdx.get(_sig)];
              if (_dp > 0 && (!hasP(_ex.price) || _dp < num(_ex.price))) {
                _ex.price = String(_dp);
                if (_skuId) _ex.skuId = _skuId;
              }
              continue;
            }
            _sigIdx.set(_sig, _mCombos.length);
            _mCombos.push({ options: _opts, price: _dp > 0 ? String(_dp) : '', image: '', skuId: _skuId || undefined });
          }
          const _mAxes = new Set();
          for (const _c2 of _mCombos) for (const _k2 of Object.keys(_c2.options)) _mAxes.add(_k2);
          // 🔴 2026-10-31 江少「9×21=189 SKU 爆炸」根治（树顶星 990808752457）：卖家把同批规格值
          //    挂了两个属性（「颜色」带空格 9 值 ⊆「规格」无空格 19 值），逐行重建会把重复轴当真两轴
          //    → 笛卡尔网格。归一化（去空白/去括号段）后一轴值集是另一轴子集（≥80%）→ 判定重复轴，
          //    折叠成单轴并按剩余规格去重（行内两轴值一致的真实配对行优先、有价者优先）；
          //    面板只有一个轴名时以面板轴名命名。单值轴不参与折叠（另有剔除逻辑）。
          try {
            const _nzA = (s) => String(s == null ? '' : s).replace(/[【\[（(][^】\]）)]*[】\]）)]/g, '').replace(/\s+/g, '');
            // 二级归一化：剥量词前缀字（颗1.5米 vs 1.5米）+ 通用后缀匹配 _sfxEq（官方值 = 页面值
            // + 任意短前缀，长度差 ≤2，不限字表——朵/盒/桶/串等枚举永远漏）
            const _nzA2 = (s) => _nzA(s).replace(/^[颗个只条款枚粒件套张支根条朵盒桶串瓶袋包罐盘卷对]/, '');
            const _sfxEq = (x, y) => {
              const a = _nzA(x), b = _nzA(y);
              if (!a || !b) return false;
              if (a === b) return true;
              const la = a.length, lb = b.length;
              if (la > lb && lb >= 2 && la - lb <= 2 && a.endsWith(b)) return true;
              if (lb > la && la >= 2 && lb - la <= 2 && b.endsWith(a)) return true;
              return false;
            };
            const _axList2 = [..._mAxes];
            const _axVals2 = new Map();
            const _axRaw2 = new Map();   // nz2(原文) → 原文（用于折叠后把值映射回丢弃轴的页面展示文字）
            for (const _k2 of _axList2) { _axVals2.set(_k2, new Set()); _axRaw2.set(_k2, new Map()); }
            for (const _c2 of _mCombos) for (const _k2 of Object.keys(_c2.options)) {
              const _raw = String(_c2.options[_k2] == null ? '' : _c2.options[_k2]);
              _axVals2.get(_k2).add(_nzA(_raw));
              const _m3 = _axRaw2.get(_k2), _key3 = _nzA2(_raw);
              if (!_m3.has(_key3) || _m3.get(_key3).length > _raw.length) _m3.set(_key3, _raw);
            }
            const _drop2 = new Map();
            for (const _a of _axList2) for (const _b of _axList2) {
              if (_a === _b || _drop2.has(_a) || _drop2.has(_b)) continue;
              const _sa = _axVals2.get(_a), _sb = _axVals2.get(_b);
              if (_sa.size < 2 || _sb.size < 2 || _sa.size > _sb.size) continue;
              let _h2 = 0; for (const _v of _sa) if (_sb.has(_v)) _h2++;
              if (_h2 / _sa.size < 0.8) {
                _h2 = 0; for (const _v of _sa) { for (const _w of _sb) { if (_sfxEq(_v, _w)) { _h2++; break; } } }
              }
              if (_h2 / _sa.size >= 0.8) _drop2.set(_a, _b);
            }
            for (const [_a, _b] of _drop2) if (_drop2.has(_b)) _drop2.set(_a, _drop2.get(_b));
            if (_drop2.size) {
              const _kept2 = _axList2.filter(_k2 => !_drop2.has(_k2));
              const _pName2 = (Array.isArray(d.panel_axes) && d.panel_axes.length === 1 && _kept2.length === 1) ? String(d.panel_axes[0]).trim() : '';
              const _bySig2 = new Map();
              for (const _c2 of _mCombos) {
                const _o2 = { ..._c2.options };
                let _cons2 = 1;
                for (const [_a, _b] of _drop2) {
                  if (_a in _o2) { const _va = _o2[_a], _vb = _o2[_b] || ''; if (_nzA2(_va) !== _nzA2(_vb) && !_sfxEq(_va, _vb)) _cons2 = 0; delete _o2[_a]; }
                }
                // 🔴 2026-10-31 江少「sku规格你怎么自动加字进去了」：官方 SKU 属性原文可能带「颗」等
                //    量词前缀（颗1.5米…），而页面展示值不带（1.5米…）。以页面真实渲染值为映射权威：
                //    panelMap(nz2 → 页面原文) 命中且原文不同 → 用页面原文。无面板值数据则一字不动。
                //    在轴重命名之前做（此时键还是原始轴名）。
                {
                  let _pMap3 = null;
                  try {
                    const _pv = [].concat(Array.isArray(d.panel_vals) ? d.panel_vals : [], Array.isArray(d._colorAxis) ? d._colorAxis : []);
                    if (_pv.length) {
                      _pMap3 = new Map();
                      for (const _t of _pv) { const _s = String(_t == null ? '' : _t).trim(); if (_s) { const _k5 = _nzA2(_s); if (!_pMap3.has(_k5) || _pMap3.get(_k5).length > _s.length) _pMap3.set(_k5, _s); } }
                    }
                  } catch (ePm) { /* 忽略 */ }
                  if (_pMap3) {
                    for (const [_da, _kb] of _drop2) {
                      const _old = _o2[_kb];
                      if (!_old) continue;
                      const _hit3 = _pMap3.get(_nzA2(_old));
                      if (_hit3 && _hit3 !== _old) _o2[_kb] = _hit3;
                    }
                  }
                }
                if (_pName2 && _kept2.length === 1 && _kept2[0] !== _pName2 && (_kept2[0] in _o2)) { _o2[_pName2] = _o2[_kept2[0]]; delete _o2[_kept2[0]]; }
                const _s2 = Object.keys(_o2).sort().map(k => k + '=' + _o2[k]).join('|');
                const _score2 = _cons2 * 2 + (hasP(_c2.price) ? 1 : 0);
                const _ex2 = _bySig2.get(_s2);
                if (!_ex2 || _score2 > _ex2._score) _bySig2.set(_s2, { price: _c2.price, skuId: _c2.skuId, options: _o2, _score: _score2 });
              }
              const _before2 = _mCombos.length;
              _mCombos.length = 0;
              for (const _e2 of _bySig2.values()) _mCombos.push({ options: _e2.options, price: _e2.price, image: '', skuId: _e2.skuId });
              _mAxes.clear();
              for (const _c2 of _mCombos) for (const _k2 of Object.keys(_c2.options)) _mAxes.add(_k2);
              console.log('[sku_matrix] 重复轴折叠: [' + _axList2.join('/') + '] 丢弃[' + [..._drop2.keys()].join('/') + '] 行 ' + _before2 + ' → ' + _mCombos.length);
            }
          } catch (eCol) { /* 折叠失败不影响原有链路 */ }
          // 🔴 2026-10-31 放宽（江少「规格怎么是净含量」842581306288）：单轴矩阵（净含量30ml/50ml）
          //    原条件 _mAxes>=2 不触发 → 面板截断+深层键污染时 combos=0 → 轴名当值兜底。
          //    现在：矩阵 combos 比现有 sku_combos 多（现有路径采漏）也重建；矩阵全时不多不少则不覆盖。
          // 🔴 20:40 再放宽（江少「净含量怎么没有了」749475616580）：单 SKU 商品矩阵去重后只有 1 条
          //    combo（≥2 条件永不满足）——但矩阵带双轴+skuId+权威价。只要矩阵轴数比现有 combos
          //    更全（现有 combos 轴数 < 矩阵轴数），就以矩阵重建（探针实证：现有2条都只有颜色轴）。
          const _exCombosM = Array.isArray(d.sku_combos) ? d.sku_combos : [];
          const _exAxesMaxM = _exCombosM.reduce((m, c) => Math.max(m, c && c.options ? Object.keys(c.options).length : 0), 0);
          // 🔴 2026-10-31 23:4x 江少「这个价格也不是代发价格」（袜子 896849222832）：页面 18 个 SKU
          //    展示价（1.54~2.45）全部命中 priceMap，但官方矩阵行数≥2 且有两轴 → 无条件覆盖 DOM
          //    combos，矩阵里挂的是「铺货分销价」（1.86~2.95，比页面贵约 20%）→ 入库价虚高。
          //    修复：DOM combos 已够齐（条数 ≥ 矩阵、全部有价、轴数不少）时**不重建**，矩阵只留给
          //    服务端按 skuId/axes-key 回填 skuId/库存/批发参考层。
          const _exNoPriceM = _exCombosM.filter(c => !hasP(c && c.price)).length;
          // DOM 全场同价但矩阵有多个不同价 → DOM 逐SKU价没采准，仍用矩阵重建
          const _exPricesM = [...new Set(_exCombosM.map(c => +c.price).filter(p => p > 0))];
          const _mPricesM = [...new Set(_mCombos.map(c => +c.price).filter(p => p > 0))];
          const _domUniformM = _exCombosM.length >= 4 && _exPricesM.length === 1 && _mPricesM.length >= 2;
          const _domSufficientM = !_domUniformM && _exCombosM.length > 0 && _exCombosM.length >= _mCombos.length
            && _exNoPriceM === 0 && _exAxesMaxM >= _mAxes.size;
          if (!_domSufficientM && (_mCombos.length >= 2 && (_mAxes.size >= 2 || _exCombosM.length < _mCombos.length)
            || (_mCombos.length >= 1 && _mAxes.size >= 2 && _mAxes.size > _exAxesMaxM))) {
            d.sku_combos = _mCombos.slice(0, 400);
            console.log('[sku_matrix] 以官方矩阵重建 combos:', _mCombos.length, '轴:', [..._mAxes].join('/'), '(DOM combos:', _exCombosM.length, '缺价:', _exNoPriceM, ')');
          } else if (_domSufficientM) {
            console.log('[sku_matrix] DOM combos 完整（', _exCombosM.length, '行全有价 ），保留页面展示价，不采用矩阵价格层');
          }
        }
      } catch (eMc) { /* 矩阵重建失败不影响原有路径 */ }

      // 🔴 2026-10-29 江少「颜色轴丢失」修复：补读颜色 feature-item 的值，组合 颜色×尺码。




      //    仅当读到的颜色 >1（确有多色）且已有尺码时才组合；颜色≤1（单色）不组合，保持原逻辑。




      //    价格取 sku_price_map 的尺码价（同规格同价；若后续发现不同色不同价再遍历点选校准）。




      try {




        const colors = readColorAxisValues();

        // 🔴 2026-10-29 防御：readColorAxisValues 源头已过滤，但这里再兜一次
        // （防止 Layout A fallback 路径还漏了 "规格"/"尺码" 等跨轴污染值）
        const _cAxisBad = /^(颜色|色系|主色|配色|颜色分类|颜色规格|规格|尺码|尺寸)$/i;
        const _colorsClean = colors.filter(c => c && !_cAxisBad.test(String(c).trim()));




        const _base = d.sku_price_map || {};




        const _sz = d.skus || [];

        // 🔴 2026-10-29 江少「颜色规格 重复 + 变体价统一」根治：
        // 1688 新版 SPA 把颜色和尺码按钮混在一个 feature-item 容器里。readColorAxisValues() 从
        // 按钮标签里挑出颜色轴（带"色"字的），d.skus 是所有按钮值（颜色+尺码混一起）。
        //
        // 正确的两轴判断：
        //   ① d.skus 里是否有 colors **之外**的独立值？（比如 连脚/踩脚 不在颜色列表里）
        //     有 → 颜色轴 × 尺码轴 → 做笛卡尔积 ✅（这是 12色×2尺码=24变体 的真实两轴商品）
        //   ② colors 和 d.skus 完全相同（或 colors 是 d.skus 的超集）？
        //     是 → 单轴商品（颜色=规格）→ **跳过笛卡尔积** ✅（这是"无缝档镂空款黑色"只有一个轴的商品）
        //   ③ colors 是 d.skus 的子集（colors ⊂ d.skus）但 d.skus 有额外值？
        //     → 两轴商品 → 做笛卡尔积
        //
        // 关键：原来的"重叠率 < 50%"太粗暴——12色×2尺码 商品的 colors(12) 与 d.skus(14) 重叠率=86%，
        // 完全跳过了笛卡尔积 → 丢失了尺码轴 → 只剩 2 个变体且变体价全是 basePrice。
        const _colorSet = new Set(_colorsClean.map(x => String(x).trim()));
        const _extraInSz = _sz.filter(s => !_colorSet.has(String(s).trim()));
        const _szEqualsColors = _sz.length === _colorsClean.length && _sz.every(s => _colorSet.has(String(s).trim()));
        const _hasSecondAxis = _extraInSz.length >= 1;   // d.skus 有独立于 colors 的值 = 第二轴

        // 第二轴名自动判断（防硬编码"规格"→出现"尺码规格"这种尴尬名）
        const _sizeTokenRe = /连脚|踩脚|踩跟|九分|七分|无跟|M码|L码|XL码|2XL|3XL|4XL|5XL|均码|加大|加肥|短款|长款|中长款|薄款|厚款|加厚|加绒|不加绒|不加厚|120D|150D|180D|200D|300D|80D|100D/i;
        const _secondAxisName = _extraInSz.filter(s => _sizeTokenRe.test(String(s))).length > _extraInSz.length / 2 ? '尺码' : '规格';

        if (_colorsClean.length > 1 && _sz.length && !_szEqualsColors && _hasSecondAxis) {




          const combo2 = [];




          for (const _col of _colorsClean) {




            for (const _s of _sz) {




              // 第二轴只取 colors 之外的值 —— 跳过与颜色轴重叠的值（防同值重复）
              if (_colorSet.has(String(_s).trim())) continue;

              // 🔴 2026-10-29 根治：sku_price_map 查询多策略（与 engine.js skpPriceOf 同口径）
              // skuExpandPrices 返回的 key 是 DOM item-label 全文（"200g厚绒款【适合5~20】"），
              // 但 _s 是 d.skus 的值（"200g厚绒款"）→ 精确匹配必 miss。
              // 依次：精确 → 去空格 → 前缀命中 → key 包含 _s
              let _p = '';
              const _sTrim = String(_s).trim();
              if (hasP(_base[_sTrim])) _p = _base[_sTrim];
              else {
                const _sNospace = _sTrim.replace(/\s+/g, '');
                if (_sNospace !== _sTrim && hasP(_base[_sNospace])) _p = _base[_sNospace];
                else {
                  for (const _k of Object.keys(_base)) {
                    const _kC = String(_k).trim();
                    if (_kC.indexOf(_sTrim) === 0 && hasP(_base[_kC])) { _p = _base[_kC]; break; }
                    if (_sTrim.indexOf(_kC) === 0 && hasP(_base[_kC])) { _p = _base[_kC]; break; }
                  }
                  if (!_p) {
                    for (const _k of Object.keys(_base)) {
                      if (String(_k).indexOf(_sTrim) !== -1 && hasP(_base[_k])) { _p = _base[_k]; break; }
                    }
                  }
                }
              }
              // 🔴 2026-10-31 补上缺失的 push：这段循环算完 _p 却从未入列（死循环体），
              //   两轴笛卡尔积永远产出空 → DOM 解析失败的多轴商品只剩单轴变体。
              combo2.push({ options: { 颜色: String(_col).trim(), [_secondAxisName]: _sTrim }, price: _p, image: '' });

            }




          }




          // 追加而非覆盖：deepSkuCombos 先跑，inject 笛卡尔积补第二轴缺失的；两边可能有同组合
          // （deepSkuCombos 从 skuInfoMap 拿的单轴 + inject 补的两轴）→ 覆盖会丢 deepSkuCombos 里的批发价
          if (combo2.length) d.sku_combos = [...(d.sku_combos || []), ...combo2].slice(0, 400);




        }




        d._colorAxis = _colorsClean;

        // 不得按商品区间等比例改写 SKU 价：页面区间可能是起批量/促销区间，
        // 与 SKU 面板逐项价口径不同；改写会制造页面上不存在的价格。
        // 价格保留采集源原值，由 engine 按规格精确匹配并记录来源。





      } catch (e3f) { /* 颜色读取/组合失败不影响其余 */ }




      // 🔒 2026-10-25 江少「sku图都变成同一张」：把 DOM 抓到的颜色图回填到每个 combo（按颜色轴名匹配），




      //   不再让引擎把所有变体都落主图第一张。




      try {




        const ci = d._colorImgs || {};




        for (const c of (d.sku_combos || [])) {




          if (c && !c.image) {




            for (const v of Object.values(c.options || {})) if (v && ci[v]) { c.image = ci[v]; break; }




          }




        }




      } catch (e) { /* 忽略 */ }




      // 矩阵表的各轴值也并入扁平 skus（面板/兜底展示更全：颜色+尺码都在）




      if (d.sku_combos && d.sku_combos.length) {




        const extra = new Set(d.skus);




        for (const c of d.sku_combos) for (const v of Object.values(c.options || {})) if (v) extra.add(v);




        d.skus = [...extra].slice(0, 60);




      }




    } catch (e) { /* 深度扫描失败不影响 DOM 结果 */ }




    // 🔒 2026-10-25 江少「sku规格又少了」：各路采集数量存档回传（ERP 存进 raw_diag），




    //    下次读一眼就能分清：是 DOM 没命中、接口没数据、还是子帧被丢了。




    try {




      d.skuDiag = {




        dom: skuDomCand || 0, domKept: skuSet ? skuSet.size : 0,




        deep: (d.skus || []).length, combos: Array.isArray(d.sku_combos) ? d.sku_combos.length : 0,




        // 🔴 2026-10-28 区间价诊断：priceMapCount=采到各SKU价格数；priceSample=接口skus原始结构




        priceMapCount: Object.keys(d.sku_price_map || {}).length,




        // 🔴 2026-10-29 矩阵表取证：表头（一眼看出有没有「价格」列）+ combos 实际命中价的条数




        tableHead: _lastTableHead || [],








        colorAxis: (Array.isArray(d._colorAxis) ? d._colorAxis.slice(0, 20) : []),




        comboPriceHit: (Array.isArray(d.sku_combos) ? d.sku_combos.filter(c => c && hasP(c.price)).length : 0),

        // 🔴 2026-10-29 统一根治：清理所有 combo 的颜色/尺码轴值 + 轴名黑名单 + 整体去重
        // Bug 根因: cartesian 积从 readColorAxisValues() 拿到脏值 "颜色"(轴名本身)；
        //          parseDomPriceCombos 也没拦截轴名；两边叠加导致重复 × 2 + 轴名污染。
        _colorSanitized: (function() {
          const CW = /(黑色|白色|肉色|肤色|奶白|红色|蓝色|绿色|黄色|粉色|紫色|灰色|棕色|金色|银色|杏色|卡其|酒红|藏青|浅灰|深灰|宝蓝|湖蓝|米色|香槟|咖啡|驼色|橙色|五彩|花色|咖色)/g;
          // 所有可能被当值的轴名 → 一律丢弃
          const AXIS_BLACKLIST = /^(颜色|色系|主色|配色|颜色分类|颜色规格|规格|尺码|尺寸)$/i;
          const COLOR_AX = /颜色|色系|主色|配色/i;
          const SIZE_AX = /尺码|尺寸/i;

          const arr = Array.isArray(d.sku_combos) ? d.sku_combos : [];
          for (const cc of arr) {
            if (!cc || !cc.options) continue;
            for (const [k, v] of Object.entries(cc.options)) {
              if (typeof v !== 'string') continue;
              // 🔴 2026-10-31 规格值洗尾：1688 面板把 skuId 以「 -- V10016」尾巴贴在规格值后
              //    （睡眠贴 916557417761 面板值「30贴/袋装 -- V10016」）→ 去掉的是采集器自身产生的
              //    skuId 尾巴，不是卖家规格文字。
              // 🔴 19:30 江少明确「不要删减规格文字，说了多少次了」：此前加的免责申明洗除全部撤销 ——
              //    规格值忠实保留原文（含【】申明全文）。碎片变体问题由前端「含括号/申明词不拆分」
              //    守卫解决（catalog.html 2026-10-31），采集端一律不动卖家的文字。
              const vv = v.trim().replace(/\s+--\s*V\d+\s*$/i, '').trim();
              if (!vv || /^(?:购买等同|等同默认|默认免责|禁止国内|本店商品|免责)/.test(vv)) { cc.options[k] = ''; continue; }
              // ① 轴名本身 → 清空（最严重的污染）
              if (AXIS_BLACKLIST.test(vv)) { cc.options[k] = ''; continue; }
              // ② 颜色规格值保留完整原文。1688 常把款式/颜色/连脚方式放在同一个颜色值里；
              //    只保留“黑色”会把不同款式压成同一个 SKU，并让图片和规格串款。
              if (COLOR_AX.test(k)) {
                cc.options[k] = vv;
              }
              // ③ 尺码轴 → 过滤掉看起来像颜色/营销词的值
              if (SIZE_AX.test(k)) {
                const colorHit = vv.match(CW);
                if (colorHit && !/码|均码|加大|加肥|短|长|九分|七分|连脚|踩脚|克|D$|加绒|加厚/.test(vv)) {
                  cc.options[k] = '';  // 纯颜色词放在尺码轴里 → 清空
                }
              }
            }
          }
          // 去掉被清空所有轴的 combo（无效条目）
          d.sku_combos = arr.filter(cc => {
            if (!cc || !cc.options) return false;
            // 至少有一个有效 option 值
            return Object.values(cc.options).some(v => typeof v === 'string' && v.trim().length > 0);
          });

          // 整体去重：按 options 的值拼接 key 去重
          const seenCombo = new Set();
          d.sku_combos = d.sku_combos.filter(cc => {
            if (!cc || !cc.options) return false;
            const key = Object.entries(cc.options)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([k, v]) => `${k}=${String(v).trim()}`)
              .join('|');
            if (seenCombo.has(key)) return false;
            seenCombo.add(key);
            return true;
          });

          return true;
        })(),




        // 🔴 2026-10-29 江少「就要区间价」—— 静态三源(接口/全局变量/矩阵表)已证死，




        //    唯一可靠路径 = 逐个点选规格组合 + 读页面实时价。为不瞎猜选择器，先取证两件事：




        //    ① priceProbe = 价格区候选(点完读哪里)  ② skuBtnProbe = 规格按钮结构(点哪里)




        //    只取证不改逻辑，拿到真实结构后即可写死交互取价。




        priceProbe: (() => {




          try {




            const out = [];




            const all = document.querySelectorAll('[class*="price"],[class*="Price"],[id*="price"],[id*="Price"]');




            for (const el of all) {




              const t = clean(el.textContent);




              if (!t || t.length > 60 || !/[\d¥￥]/.test(t)) continue;




              out.push({ cls: String(el.className || '').slice(0, 70), tag: el.tagName, txt: t.slice(0, 40) });




              if (out.length >= 12) break;




            }




            return out;




          } catch (e) { return []; }




        })(),




        skuBtnProbe: (() => {




          try {




            const SEL = '[class*="sku"] [class*="item"],[class*="sku-item"],[data-sku],[class*="obj-sku"] [class*="value"]';




            const items = [...document.querySelectorAll(SEL)].filter(el => !el.querySelector(SEL)).slice(0, 15);




            return items.map(el => ({




              cls: String(el.className || '').slice(0, 60), tag: el.tagName,




              val: clean(el.getAttribute('data-value') || el.getAttribute('data-sku') ||




                el.getAttribute('title') || el.textContent).slice(0, 28),




              parentCls: el.parentElement ? String(el.parentElement.className || '').slice(0, 60) : ''




            }));




          } catch (e) { return []; }




        })(),




        priceSample: (() => { try { return skuPriceSample(d.offerId); } catch (e) { return ''; } })(),




        // 🔴 2026-10-28 江少「颜色+尺码两轴商品只采到尺码、combos=0」：记录接口规格捕获情况




        //   skuResp=拦截到含skuModel/propValues的响应数；skusSample=第一个skus数组原始结构(字段名)




        specDiag: (() => { try {




          const cap = window.__c1688cap || { items: [] };




          const skuResp = cap.items.filter(it => /skuModel|propValues|skuInfos|skuProps/i.test(String(it.body || ''))).length;




          let skusSample = '';




          for (const it of cap.items) {




            const j = parseBody(it.body); if (!j) continue;




            const st = [j], sn = new Set(); let n = 0, found = '';




            while (st.length && n < 4000 && !found) {




              n++; const c = st.pop();




              if (!isSafeObj(c) || sn.has(c)) continue; sn.add(c);




              for (const k of Object.keys(c)) {




                let v = null; try { v = c[k]; } catch (e) { continue; }




                if (!v || typeof v !== 'object') continue;




                if (/^(skuList|skus|skuInfos?)$/i.test(k) && Array.isArray(v) && v.length) {




                  found = JSON.stringify(v.slice(0, 2)).slice(0, 700); break;




                }




                if (isSafeObj(v)) st.push(v);




              }




            }




            if (found) { skusSample = found; break; }




          }




          // 🔴 2026-10-28 江少「规格丢颜色轴」：补接口 skuModel 结构概貌（顶层keys / skuInfoMap组合串 / skuProps轴），




          //   一眼确认接口到底是 skuInfoMap 还是 skus 数组，据此校准组合解析。




          let skuModelShape = '';




          let skuSample = '';




          for (const it of cap.items) {




            if (!/skuModel|"skuProps"|skuInfoMap|skuInfos|propValues/i.test(String(it.body || ''))) continue;




            if (!skuSample) skuSample = String(it.body || '').slice(0, 600);   // 原始响应样本，定位接口真实结构




            const j = parseBody(it.body); if (!j) continue;




            const st = [j], sn = new Set(); let n = 0, shape = '';




            while (st.length && n < 3000 && !shape) {




              n++; const c = st.pop();




              if (!isSafeObj(c) || sn.has(c)) continue; sn.add(c);




              for (const k of Object.keys(c)) {




                let v = null; try { v = c[k]; } catch (e) { continue; }




                if (!v || typeof v !== 'object') continue;




                if (/^skuModel$/i.test(k) && isSafeObj(v)) {




                  const s = { keys: Object.keys(v).slice(0, 12) };




                  if (v.skuInfoMap && typeof v.skuInfoMap === 'object') s.skuInfoMap = Object.keys(v.skuInfoMap).slice(0, 3);




                  if (Array.isArray(v.skuProps)) s.skuProps = v.skuProps.slice(0, 8).map(p => ({ propName: p.propName || p.name || p.prop || p.skuName, vals: (p.propValues || []).length, first: (p.propValues && p.propValues[0] && (p.propValues[0].name || p.propValues[0].value)) || '' }));




                  if (Array.isArray(v.skus)) s.skusLen = v.skus.length;




                  shape = JSON.stringify(s).slice(0, 800); break;




                }




                if (isSafeObj(v)) st.push(v);




              }




            }




            if (shape) { skuModelShape = shape; break; }




          }




          return JSON.stringify({ skuResp, skusSample, skuModelShape, skuSample });




        } catch (e) { return ''; } })()




      };




    } catch (e) { /* 诊断失败不影响主流程 */ }




    // 🔒 2026-10-27 江少「1688 重量尺寸采不到」：属性表常只给表头残值（"重量(g)"/"长(cm)"），




    //   真实重量/尺寸在规格/包装文本行里（"毛重：0.5kg"、"包装尺寸：30x22x12cm"…），且容器类名各异。




    //   这里做页面级按行扫描兜底：只在「短行 + 明确重量/尺寸单位模式」时抓，避免误抓导航/评论长文本。




    //   抓到的是原料（m1688_weight_raw/m1688_dims_raw），单位换算与可信度校验仍由服务端 autoFillDims 兜底。




    try {




      const bodyTxt = (document.body && document.body.innerText) || '';




      for (const rawLine of bodyTxt.split('\n')) {




        const l = rawLine.trim();




        if (!l || l.length < 2 || l.length > 120) continue;




        if (!d.m1688_weight_raw) {




          const wm = l.match(/(?:重量|毛重|净重|克重|净含量|商品重量|product\s*weight|weight)\s*[:：=]?\s*([\d.]+)\s*(kg|千克|公斤|g|克)/i);




          if (wm) { d.m1688_weight_raw = wm[1] + ' ' + wm[2]; }




        }




        if (!d.m1688_dims_raw) {




          const dm = l.match(/(?:尺寸|规格|包装尺寸|长宽高|外形尺寸|dimension|package\s*size)\s*[:：=]?\s*([\d.]+)\s*[x×*]\s*([\d.]+)(?:\s*[x×*]\s*([\d.]+))?\s*(cm|mm|厘米|毫米)?/i);




          if (dm) { d.m1688_dims_raw = l; }




        }




        if (d.m1688_weight_raw && d.m1688_dims_raw) break;




      }




    } catch (e) { /* 扫描失败不影响主流程 */ }




    // 🔴 2026-10-28 江少「所有采集改动以批量采集插件为主」：1688 采集时调服务端 /api/classify




    //   一次拿回 noon 类目码 + 重量 + 尺寸（规则单一源在服务端，插件不内置 → 不双处漂移），




    //   回传 ERP 落库即用。不改 d.category（保留 1688 面包屑作 source_category）；服务端 trust




    //   类目码时会自己拼 noon 显示串。服务端不可达/超时 → 保留原始数据，落库由服务端兜底识别。




    try {




      if (!d.noon_category_code) {




        const _x = new XMLHttpRequest();




        _x.open('GET', ERP_BASE + '/api/classify?title=' + encodeURIComponent(d.title || '') +




          '&source_category=' + encodeURIComponent(d.category || '') + '&source=1688', false);




        _x.timeout = 6000;




        _x.send(null);




        if (_x.status === 200) {




          const r = JSON.parse(_x.responseText);




          if (r && r.ok && r.noon_category_code) {




            d.noon_category_code = r.noon_category_code;




            if (r.category_cn) d._noon_category_cn = r.category_cn;




            if (r.actual_weight_kg != null) d.actual_weight_kg = r.actual_weight_kg;




            if (r.length_cm != null) { d.length_cm = r.length_cm; d.width_cm = r.width_cm; d.height_cm = r.height_cm; }




          }




        }




      }




    } catch (e) { /* 服务端不可达/超时 → 走服务端落库兜底 */ }




    return d;




  }




  /* 深度扫 SKU 名：window 全局对象 + 拦截到的接口响应双路。




     详情页数据走 mtop 异步接口（mmga.offerdetail.service 里才有完整 skuModel），




     window 全局基本是空的——所以拦截响应那一路才是主力。




     offerId 非空时只认本条商品的响应（推荐接口里别家商品的 sku 不能混进来）。 */




  function deepSkuNames(offerId, budget = 8000) {




    const cap = window.__c1688cap || { items: [] };




    if (!cap._sku) cap._sku = {};




    // 同一条 offer 重复采（重试/复采）→ 直接命中缓存，不再全量扫一遍所有大响应




    if (offerId && cap._sku[offerId]) return cap._sku[offerId].slice();




    const names = new Set();




    const seenSet = new Set();




    const stack = [];




    const capRoots = [];   // 拦截响应 JSON（第二路结构化抽名只扫它——window 全局树太大，不扫）




    for (const k of Object.keys(window)) {




      try { const v = window[k]; if (isSafeObj(v)) stack.push(v); } catch (e) { /* 跳过 */ }




    }




    for (const it of cap.items) {




      const j = parseBody(it.body);




      if (!j) continue;




      if (offerId) {




        // 响应里出现的 offerId 不含本条 → 是推荐/别家接口的数据，跳过




        const ids = (String(it.body).match(/"offer_?[Ii][dD]"\s*:\s*"?(\d{6,})"?/g) || [])




          .map(s => (s.match(/(\d{6,})/) || [, ''])[1]).filter(Boolean);




        if (ids.length && !ids.includes(String(offerId))) continue;




      }




      stack.push(j); capRoots.push(j);




    }




    let n = 0;




    while (stack.length && n < budget && names.size < 60) {




      n++;




      let cur = null;




      try { cur = stack.pop(); } catch (e) { break; }




      if (!isSafeObj(cur) || seenSet.has(cur)) continue;




      seenSet.add(cur);




      try {




        for (const k of Object.keys(cur)) {




          let v = null;




          try { v = cur[k]; } catch (e) { continue; }




          if (!v || typeof v !== 'object') continue;




          // 只认 SKU 相关键（sku/spec/prop），排掉模块/布局/组件容器——winport 的




          // pageData.moduleSpecs、shopcard 的 props 数组会把店铺统计拖进来




          // （实测误采「2023年6月/3250m/80台/34人」）




          if (/(sku|spec|prop)/i.test(k) && !/module|layout|component|config/i.test(k)) {




            const arr = Array.isArray(v) ? v : (Array.isArray(v.list) ? v.list : null);




            if (arr) for (const it of arr) {




              if (!it || typeof it !== 'object') continue;




              // 只取 skuName/specName/name——'value'/'title' 是店铺统计/模块 props 的字段




              const nm = clean(firstVal(it, ['skuName', 'specName', 'name']));




              if (nm) names.add(nm);




            }




          }




          if (isSafeObj(v)) stack.push(v);




        }




      } catch (e) { /* 单个对象出错不影响整体 */ }




    }




    // 第二路：结构化抽名——专挖 skuProps[].propValues[].name 嵌套和 props:"颜色:黑色;尺码:M" 串




    const bag = new Set();




    for (const root of capRoots) skuNamesInto(root, bag, 7, new Set());




    for (const t of bag) if (skuNameOk(t)) names.add(t);




    const result = [...names].filter(skuNameOk).slice(0, 60);




    if (offerId) cap._sku[offerId] = result;   // 按 offerId 缓存（重试/复采不重扫）




    return result.slice();




  }




  /* 🔴 2026-10-28 江少「区间价变成统一价」根治 v2：不再假设 skus 元素就是 {name,price}。




     1688 实际形态多样：




       - skus 元素 {name/specName/… + price}




       - skus 元素只有 {props:"颜色:xx;款:yy" 串 + price}（名字藏在 props 串里）




       - 价格在 propValues 项里（每个规格值自带价 {name, price}）




       - 价格字段名不固定（price/promotionPrice/salePrice/priceStr…），或嵌在子对象




     这里把「规格名→价格」从上述所有形态采回，engine 组装变体行时按名透传各 SKU 真实价。




     offerId 过滤与 deepSkuCombos 同口径（含 skuModel 的响应强制参与；其余按 offerId 挡别家）。 */




  /* 🔴 2026-10-29 区间价治本（江少反复「还是没区间价」根因）：




     旧版 deepSkuPrices 只搜拦截响应(__c1688cap.items) + 只处理 skus 数组/propValues，




     漏了 1688 最主流的逐 SKU 价源 skuInfoMap（{ "pid:vid;...": {price} }）——




     且 skuInfoMap 常内嵌在页面全局变量 __INIT_DATA__（拦截响应抓不到）→ priceMapCount 恒 0。




     新版：① roots 增加全局变量源(__INIT_DATA__/g_page_config/...) ② 先建 ID→名称 idMap




     ③ 处理 skuInfoMap（ID组合→价）/skus 数组(props串+价)/propValues(name+价) ④ key 规范化




     （按规格值排序 join，忽略轴名差异）与 engine combos 路径 normComboKey 对齐。 */





  // 🔴🔴 2026-10-30 GitHub 调研实锤（jiyun/1688 + apify/ecomscrape + superjack2050/1688-cli 三方一致）：
  //   1688 页面同时存在两份 SKU 数据包：
  //     · skuInfoMap          —— 精简版，value ≈ 只有一个 price（我们此前唯一在读的）
  //     · skuInfoMapOriginal  —— 完整版，value 含 skuId / specAttrs / discountPrice / canBookCount / saleCount
  //   只读前者 → 官方 SKU ID 拿不到、展示价与批发价混成一个、库存只能写死 100、
  //   轴名丢失后价格键只能靠 5-7 层 fallback 反猜（这就是「改规格坏价格」的总病根）。
  //   本函数读后者，一次拿全：skuId / specId / 轴名:值 / 展示价 / 批发价 / 库存 / 官方区间价(skuPriceScale)。
  function readSkuInfoMapOriginal(roots) {
    const out = { rows: [], priceScale: '', source: '' };
    if (!Array.isArray(roots) || !roots.length) return out;
    const isPlainObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

    // 通用 BFS 找第一个满足 pred 的对象（限深限节点数，防止大页面卡死）
    const findFirst = (root, pred, maxDepth) => {
      const st = [[root, 0]]; const seen = new Set(); let n = 0;
      while (st.length && n++ < 6000) {
        const cur = st.pop();
        const obj = cur[0], d = cur[1];
        if (!obj || typeof obj !== 'object' || seen.has(obj)) continue;
        seen.add(obj);
        try { if (pred(obj)) return obj; } catch (e) { /* 单个对象判断出错不影响 */ }
        if (d >= (maxDepth || 9)) continue;
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (v && typeof v === 'object') st.push([v, d + 1]);
        }
      }
      return null;
    };

    // 1) 定位 skuInfoMapOriginal（驼峰 + 下划线两种写法都认）
    let sim = null;
    for (const r of roots) {
      sim = findFirst(r, (o) => isPlainObj(o.skuInfoMapOriginal) && Object.keys(o.skuInfoMapOriginal).length > 0, 9);
      if (!sim) sim = findFirst(r, (o) => isPlainObj(o.sku_info_map_original) && Object.keys(o.sku_info_map_original).length > 0, 9);
      if (sim) break;
    }
    if (!sim) return out;
    const rawMap = sim.skuInfoMapOriginal || sim.sku_info_map_original;
    out.source = 'skuInfoMapOriginal';

    // 2) 官方区间价 skuPriceScale："2.50-7.50"（同行口径：直接读，不再用变体价反推）
    try {
      const sc = findFirst(sim, (o) => typeof o.skuPriceScale === 'string' && o.skuPriceScale.indexOf('-') > 0, 3)
              || findFirst(sim, (o) => typeof o.sku_price_scale === 'string' && o.sku_price_scale.indexOf('-') > 0, 3);
      if (sc) out.priceScale = String(sc.skuPriceScale || sc.sku_price_scale).trim();
    } catch (eS) { /* 区间价缺失不影响 */ }

    // 3) skuProps → 轴顺序 + vid→{轴名,值名} + pid→轴名 + 值名→轴名（兜底反查）
    const axisOrder = []; const vidMap = {}; const pidAxis = {}; const valToAxis = {};
    try {
      const po = findFirst(sim, (o) => Array.isArray(o.skuProps) && o.skuProps.length > 0, 4)
              || findFirst(sim, (o) => Array.isArray(o.sku_props) && o.sku_props.length > 0, 4);
      const props = po ? (po.skuProps || po.sku_props) : [];
      for (const grp of props) {
        if (!isPlainObj(grp)) continue;
        const pname = String(grp.propName || grp.name || grp.prop || '').trim();
        const pid = String(grp.propId || grp.pid || grp.id || '').trim();
        if (pname) { axisOrder.push(pname); if (pid) pidAxis[pid] = pname; }
        const vals = grp.values || grp.valueList || grp.propValues || grp.specValues || grp.skuValues || [];
        for (const val of (Array.isArray(vals) ? vals : [])) {
          if (!isPlainObj(val)) continue;
          const vid = String(val.valueId ?? val.id ?? val.vid ?? val.specValueId ?? '').trim();
          const vname = String(val.valueName ?? val.name ?? val.value ?? val.specValue ?? val.text ?? '').trim();
          if (vid && vname) vidMap[vid] = { axis: pname, value: vname };
          if (vname && pname && !valToAxis[vname]) valToAxis[vname] = pname;
        }
      }
    } catch (eP) { /* skuProps 缺失则走值串兜底 */ }

    // 4) specAttrs 解析：支持 JSON 数组 / "pid:vid;pid:vid" / "值1>值2" / "值1;值2"
    const numOrNull = (v) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; };
    const intOrNull = (v) => { const n = parseInt(v, 10); return isFinite(n) && n >= 0 ? n : null; };
    // skuInfoMapOriginal.specAttrs is sometimes HTML-escaped (e.g. "颜色&gt;尺码").
    // Decode before splitting on the axis separator; otherwise the "&gt" suffix leaks
    // into the color value and every official SKU lookup misses its corresponding combo.
    const decodeSpecEntities = (v) => String(v == null ? '' : v)
      .replace(/&gt;|&#0*62;|&#x0*3e;/gi, '>')
      .replace(/&lt;|&#0*60;|&#x0*3c;/gi, '<')
      .replace(/&quot;|&#0*34;|&#x0*22;/gi, '"')
      .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
      .replace(/&amp;/gi, '&');
    const parseAxes = (raw) => {
      const axes = {};
      let r = raw;
      if (Array.isArray(r)) {
        for (const a of r) {
          if (!isPlainObj(a)) continue;
          const k = String(a.attrName || a.name || a.propName || a.key || '').trim();
          const v = decodeSpecEntities(a.attrValue || a.value || a.valueName || '').trim();
          if (k && v) axes[k] = v;
        }
        return axes;
      }
      r = decodeSpecEntities(r).trim();
      if (!r) return axes;
      if (r.charAt(0) === '[' || r.charAt(0) === '{') {
        try {
          const j = JSON.parse(r);
          if (Array.isArray(j)) return parseAxes(j);
          if (isPlainObj(j)) { for (const k of Object.keys(j)) { const v = decodeSpecEntities(j[k]).trim(); if (v) axes[decodeSpecEntities(k).trim()] = v; } return axes; }
        } catch (e) { /* 不是 JSON，按值串处理 */ }
      }
      // "pid:vid;pid:vid" —— 官方规格组合串，pid 查轴名、vid 查值名
      if (/:/.test(r)) {
        const segs = r.split(/[;；]/);
        let hit = 0;
        for (const seg of segs) {
          const m = String(seg).split(':');
          if (m.length < 2) continue;
          const pid = String(m[0]).trim(), vid = String(m[1]).trim();
          const ax = pidAxis[pid] || (vidMap[vid] && vidMap[vid].axis) || '';
          const vl = (vidMap[vid] && vidMap[vid].value) || '';
          if (ax && vl) { axes[ax] = vl; hit++; }
        }
        if (hit) return axes;
      }
      // 纯值串：优先按 skuProps 轴顺序配对；否则按值名反查轴名
      const vs = r.split(/\s*[>|;；]\s*/).map(x => x.trim()).filter(Boolean);
      if (!vs.length) return axes;
      if (vs.length === axisOrder.length && axisOrder.length) {
        for (let i = 0; i < vs.length; i++) axes[axisOrder[i]] = vs[i];
        return axes;
      }
      for (let i = 0; i < vs.length; i++) {
        const ax = valToAxis[vs[i]] || axisOrder[i] || ('规格' + (i + 1));
        axes[ax] = vs[i];
      }
      return axes;
    };

    for (const specId of Object.keys(rawMap)) {
      const it = rawMap[specId];
      if (!isPlainObj(it)) continue;
      const axes = parseAxes(it.specAttrs ?? it.spec_attrs ?? it.skuName ?? it.name ?? it.specName ?? '');
      const price = numOrNull(it.price ?? it.priceStr ?? it.wholeSalePrice);
      const discount = numOrNull(it.discountPrice ?? it.discount_price ?? it.promotionPrice ?? it.promoPrice ?? it.consignPrice);
      const stock = intOrNull(it.canBookCount ?? it.can_book_count ?? it.quantity ?? it.amountOnSale ?? it.stock);
      const saleCount = intOrNull(it.saleCount ?? it.sale_count ?? it.soldCount);
      out.rows.push({
        specId: String(specId || '').trim(),
        skuId: String(it.skuId ?? it.sku_id ?? it.id ?? '').trim(),
        specAttrs: String(it.specAttrs ?? it.spec_attrs ?? '').trim(),
        axes: axes,
        price: price,
        discountPrice: discount,
        stock: stock,
        saleCount: saleCount,
      });
    }
    return out;
  }

  function deepSkuPrices(offerId) {




    // 括号平衡提取：从 str[start]（'{' 处）截到匹配的 '}'




    const extractBalanced = (str, start) => {




      let depth = 0;




      for (let i = start; i < str.length; i++) {




        const c = str[i];




        if (c === '{') depth++;




        else if (c === '}') { depth--; if (depth === 0) return str.slice(start, i + 1); }




      }




      return null;




    };




    const cap = window.__c1688cap || { items: [] };




    // 🔴 2026-10-29 与 deepSkuCombos 同口径：排除推荐位/相似/榜单接口（别家商品规格与价格），




    //    避免别家 SKU 的价混进本商品的 sku_price_map（会导致区间价/规格整体错位）。




    const RECOMMEND_URL_RE = /recommend|relation|similar|widget|guessyoulike|guess_you_like|hotoffer|hot_offer|rank|alsobuy|also_buy|crosssell|cross_sell/i;




    // 🔴 与 deepSkuCombos 同口径：strict（明确关联本商品）优先，避免别家价格混入本商品 sku_price_map




    const strict = []; const loose = [];




    for (const it of cap.items) {




      const url = String(it.url || '');




      const body = String(it.body || '');




      const j = parseBody(it.body);




      if (!j) continue;




      if (!offerId) { strict.push(j); continue; }




      const urlHit = url.indexOf(String(offerId)) !== -1;




      const bodyHit = body.indexOf(String(offerId)) !== -1;




      const hasSku = /skuModel|"skuProps"|skuInfos|propValues|specValues/i.test(body);




      if (RECOMMEND_URL_RE.test(url) && !urlHit) continue;




      if (urlHit || bodyHit) { strict.push(j); continue; }




      if (hasSku) loose.push(j);




    }




    const roots = strict.length ? strict : loose;




    // ① 全局变量源：1688 PC 详情页把 skuModel/skuInfoMap 内嵌在首屏 script 的全局变量里，




    //    不经 mtop、XHR 拦截器常抓不到。




    //    🔴 2026-10-29 参考 TradeMind(source1688/browser-extract-1688) 补源：




    //    detailData/iDetailConfig/OFFER_DETAIL/window.context 同样内嵌 skuInfoMap，




    //    多源叠加提高每 SKU 价/区间价命中（跨浏览器版本/类目模板更稳）。




    for (const gk of ['__INIT_DATA__', 'g_page_config', '__DATA__', '__PAGE_DATA__', 'offerDetailData', '__INITIAL_STATE__',




                      'detailData', 'iDetailData', 'iDetailConfig', 'OFFER_DETAIL']) {




      try { const v = window[gk]; if (v && typeof v === 'object') roots.push(v); } catch (e) { /* 无此全局变量 */ }




    }




    try { if (window.context && typeof window.context === 'object') roots.push(window.context); } catch (e) { /* 无 context */ }




    // 🔴 2026-10-29 江少「区间价治本·老 webpack 页面盲区」：1688 老详情页(offer 99 开头等)把




    //    skuInfoMap/skuMapOriginal/skuProps 内联在首屏 <script> 里（webpack 闭包，无全局变量名、




    //    无 fetch 接口 —— 拦截 captured 恒 0、globals 恒空）。现有四源全读不到 → 区间价/各 SKU 价全丢。




    //    这里直接扫 document 所有 <script>，提内联 skuInfoMap/skuProps 字面量 JSON 并入 roots。




    //    只匹配含 skuInfoMap 等字面量的 script；JSON.parse 失败则跳过（不影响现有逻辑，稳）。




    try {




      const _scs = (typeof document !== 'undefined' && document.querySelectorAll) ? document.querySelectorAll('script') : [];




      for (const _sc of _scs) {




        const _t = _sc.textContent || '';




        if (!/(skuInfoMap|skuMapOriginal|skuMap|skuProps)\s*[:=]\s*[\{\[]/.test(_t)) continue;




        for (const _kw of ['skuInfoMap', 'skuMapOriginal', 'skuMap']) {




          const _m = _t.match(new RegExp(_kw + '\\s*[:=]\\s*\\{'));




          if (_m) {




            const _start = _t.indexOf('{', _m.index);




            const _obj = extractBalanced(_t, _start);




            if (_obj) { try { const _o = JSON.parse(_obj); if (_o && typeof _o === 'object') roots.push({ __inline_sku: _o }); } catch (e2) { /* 内联非标准 JSON，跳过 */ } }




          }




        }




        const _mp = _t.match(/skuProps\s*[:=]\s*\{/);




        if (_mp) {




          const _start = _t.indexOf('{', _mp.index);




          const _obj = extractBalanced(_t, _start);




          if (_obj) { try { const _o = JSON.parse(_obj); if (_o && typeof _o === 'object') roots.push({ __inline_props: _o }); } catch (e2) { /* 跳过 */ } }




        }




      }




    } catch (e) { /* HTML 内联源异常不影响主逻辑 */ }




    // 规格值名规范化：只取各轴值排序拼接，忽略轴名（中文"颜色"/英文"Color"都兼容，与 engine normComboKey 同口径）




    const normKey = (opts) => Object.keys(opts || {}).map(k => String(opts[k]).trim()).filter(Boolean).sort().join('|');
    // 🔴 2026-10-30 根治：价格键带上轴名 → "颜色:黑色|尺码:M"，下游可精确按轴取价，
    //    不再需要「颜色×尺码双序 / 前缀 / 颜色正则」等一堆模糊猜测（那些就是价格反复出错的根因）。
    //    v0/v1 占位键（无轴名时）不参与，避免污染；纯值键 normKey 继续写，保证旧链路 100% 兼容。
    const axisKey = (opts) => Object.keys(opts || {})
      .map(k => [String(k).trim(), String(opts[k] == null ? '' : opts[k]).trim()])
      .filter(([k, v]) => v && !/^v\d+$/.test(k))
      .map(([k, v]) => k + ':' + v).sort().join('|');
    const putPrice = (map, opts, p) => {
      map[normKey(opts)] = p;
      const ak = axisKey(opts);
      if (ak) map[ak] = p;
    };




    // ② 建「属性值 ID → 名称」映射（skuInfoMap 的组合串是 ID，名称只在 skuProps 里）
    // 🔴 2026-10-30 根治「价/规格互相改坏」的源头：本函数原只建 vid→值名，把组合键里的 pid（轴ID）丢弃，
    //    规格值被塞进 v0/v1/v2 占位键 → 轴名永久丢失。后果二连：
    //      ① engine.js 的 _colorKeyOf 用 /颜色|色系|颜色分类/ 匹配键名判颜色轴 → 键是 v0/v1 时永远判不出
    //         （这就是「颜色轴被吞」的真因，之前靠 DOM 兜底反复补丁都治不好）；
    //      ② 价格键 normKey 只用值排序 → "黑色|M" 分不清谁是颜色谁是尺码 → 只能靠双序/前缀模糊猜价。
    //    现与 deepSkuCombos 同口径补 axisById（pid→轴名）+ axisOfVid（vid→轴名，组合键只给 vid 时兜底）。




    const idMap = {}; const axisById = {}; const axisOfVid = {};




    const st0 = roots.slice(); const seen0 = new Set(); let n0 = 0;




    while (st0.length && n0 < 8000) {




      n0++; const cur = st0.pop();




      if (!isSafeObj(cur) || seen0.has(cur)) continue; seen0.add(cur);

      // 🔴 2026-10-30 通用轴名采集（与 deepSkuCombos 2316 行同口径）：遍历树上任意对象，
      //    只要有 propName + propId/pid/fid 就登记轴名。比只在 skuProps 的 grp 上取更稳，
      //    覆盖"轴定义散落在不同层级"的页面结构。
      try {
        const _a0 = clean(cur.propName || cur.prop || cur.skuName || cur.specName || cur.name || '');
        const _p0 = cur.propId != null ? String(cur.propId) : (cur.pid != null ? String(cur.pid) : (cur.fid != null ? String(cur.fid) : ''));
        if (_a0 && _p0) axisById[_p0] = _a0;
      } catch (eA) { /* 不影响主流程 */ }




      try {




        for (const k of Object.keys(cur)) {




          let v = null; try { v = cur[k]; } catch (e) { continue; }




          if (!v || typeof v !== 'object') continue;




          if (Array.isArray(v) && v.length && v.every(x => x && typeof x === 'object' &&




              (x.values || x.valueList || x.propValues || x.specValues || x.skuValues || x.skuProps || x.propName || x.specId))) {




            for (const grp of v) {




              // 🔴 2026-10-30 轴名采集（与 deepSkuCombos 同口径）：skuProps 每个 grp = 一个规格轴，
              //    propName=轴名("颜色"/"尺码")、propId/pid/fid=轴ID；其下每个 val 都归属该轴。
              const _axisG = clean(grp.propName || grp.prop || grp.skuName || grp.specName || grp.name || '');
              const _pidG = grp.propId != null ? String(grp.propId) : (grp.pid != null ? String(grp.pid) : (grp.fid != null ? String(grp.fid) : ''));
              if (_axisG && _pidG) axisById[_pidG] = _axisG;
              const vals = grp.values || grp.valueList || grp.propValues || grp.specValues || grp.skuValues ||




                (grp.skuProps && grp.skuProps.values) || [];




              for (const val of (Array.isArray(vals) ? vals : [])) {




                const vid = String(val.valueId ?? val.id ?? val.vid ?? val.specValueId ?? val.skuId ?? '');




                const vname = clean(val.valueName ?? val.name ?? val.value ?? val.specValue ?? val.text ?? '');




                if (vid && vname) {
                  idMap[vid] = vname;
                  if (_axisG) axisOfVid[vid] = _axisG;   // 兜底：组合键只给 vid 不给 pid 时反查轴名
                }




              }




            }




          }




          if (isSafeObj(v)) st0.push(v);




        }




      } catch (e) { /* 单对象出错不影响整体 */ }




    }




    const map = {};




    const stack = roots.slice(); const seen = new Set(); let n = 0;




    while (stack.length && n < 12000) {




      n++; const cur = stack.pop();




      if (!isSafeObj(cur) || seen.has(cur)) continue; seen.add(cur);




      try {




        for (const k of Object.keys(cur)) {




          let v = null; try { v = cur[k]; } catch (e) { continue; }




          if (!v || typeof v !== 'object') continue;




          // ③-a skuInfoMap / skuMap / skuInfo：{ "pid:vid;...": {price,...} } —— 1688 主流逐 SKU 价源




          if (!Array.isArray(v) && /(skuInfoMap|skuMap|skuInfo|skusByProps|propMap|skuInfoList)/i.test(k)) {




            for (const [comboStr, cv] of Object.entries(v)) {




              if (!cv || typeof cv !== 'object') continue;




              const opts = {}; let idx = 0;




              for (const seg of String(comboStr).split(/[;；]/)) {




                const m = seg.match(/^\s*(\d+)\s*[:：]\s*(\d+)/);




                if (m) {




                  const nm = idMap[m[2]];




                  if (!nm) continue;




                  // 🔴 2026-10-30 根治：原来这里丢弃 m[1](pid) 只用 m[2](vid)，值被塞进 v0/v1 占位键。
                  //    现在用真实轴名做键（"颜色":"黑色"），pid 查不到时回退 vid 反查，都没有才用占位键。
                  opts[axisById[m[1]] || axisOfVid[m[2]] || ('v' + idx)] = nm;
                  idx++;




                  continue;




                }




                // 🔴 2026-10-29 无 pid:vid 的兜底（参考 TradeMind parseComboKey）：个别接口




                //    skuInfoMap 键直接是「名称:值」或可读值（不传 ID），idMap 解析不到名字会整组跳过漏价。




                //    取冒号后的值；无冒号则整段作为规格值（仅当段是短可读文本，避免把 JSON 数字/长串塞进来）。




                const kv = seg.match(/^\s*([^:：]{1,20})[#:：]\s*(.+)$/);




                // 🔴 2026-10-30 根治：kv[1] 就是轴名（"颜色"/"尺码"），原来丢弃后塞进 v0/v1。现用真实轴名。
                if (kv) { const val = kv[2].trim(); if (val) { opts[clean(kv[1]) || ('v' + idx)] = val; idx++; } continue; }




                const vv = seg.trim();




                if (vv && vv.length >= 2 && vv.length <= 80 && !/^\d+$/.test(vv)) opts['v' + (idx++)] = vv;




              }




                            if (Object.keys(opts).length >= 1) {
                // 🔴 2026-10-29 江少「价格不对」治本：同 combo 常有多价字段(price=批发阶梯参考价偏高 / discountPrice·promotionPrice=页面展示价偏低)。
                //   逐 SKU 取最小正数价=页面展示价(display≤wholesale)，根治批发高价压过展示价(22.4 vs 19.8)。
                const _cand = [];
                for (const _f of ['discountPrice', 'promotionPrice', 'promoPrice', 'salePrice', 'activityPrice', 'showPrice', 'displayPrice', 'minPrice', 'consolidationPrice', 'finalPrice', 'price', 'skuPrice', 'priceValue', 'priceStr']) {
                  const _v = clean(cv[_f]);
                  if (hasP(_v)) { const _n = num(_v); if (_n > 0) _cand.push(_n); }
                }
                if (_cand.length) putPrice(map, opts, Math.min.apply(null, _cand));
              }




            }




            continue;




          }




          // ③-b skus / skuList 数组：每项 {name 或 props串 + price}




          if (Array.isArray(v) && v.length && /^(skuList|skus|skuInfos?|skuModels?)$/i.test(k)) {




            for (const s of v) {




              if (!s || typeof s !== 'object') continue;




              const opts = {}; let idx = 0;




              const nm = clean(firstVal(s, ['skuName', 'specName', 'name', 'value']));




              if (!nm) {




                const ps = s.props || s.skuProps || s.specAttrs || s.attributes;




                if (typeof ps === 'string' && /[:：]/.test(ps)) {




                  for (const x of ps.split(/[;；]/)) {




                    const mm = x.match(/^\s*([^:：]+)[:：]\s*(.+)$/);




                    // 🔴 2026-10-30 根治：mm[1] 是轴名、mm[2] 是值；原来只留值塞进 v0/v1，现保留轴名。
                    if (mm) { opts[clean(mm[1]) || ('v' + idx)] = clean(mm[2]); idx++; }




                  }




                }




              } else { opts['v' + (idx++)] = nm; }




              const pr = pickSkuPrice(s);




              if (Object.keys(opts).length && hasP(pr)) putPrice(map, opts, num(pr));




            }




            continue;




          }




          // ③-c propValues / specValues / valueList / values：每项 {name, price?}




          if (Array.isArray(v) && v.length && /^(propValues|specValues|skuValues|valueList|values|skuProps)$/i.test(k)) {




            for (const pv of v) {




              if (!pv || typeof pv !== 'object') continue;




              const nm = clean(firstVal(pv, ['name', 'value', 'skuName', 'specName', 'text']));




              const pr = pickSkuPrice(pv);




              if (nm && hasP(pr)) map[normKey({ v0: nm })] = num(pr);




            }




            continue;




          }




          if (isSafeObj(v)) stack.push(v);




        }




      } catch (e) { /* 单个对象出错不影响整体 */ }




    }





    // 🔴 2026-10-30 官方完整 SKU 矩阵优先：命中即用官方数据覆盖（展示价优先于批发价），
    //   并把 skuId / specId / 库存 / 官方区间价 交给上层（不再靠变体价反推区间、库存不再写死 100）。
    try {
      const _orig = readSkuInfoMapOriginal(roots);
      if (_orig.rows.length) {
        for (const _r of _orig.rows) {
          const _p = hasP(_r.discountPrice) ? _r.discountPrice : (hasP(_r.price) ? _r.price : null);
          if (_p != null) {
            putPrice(map, _r.axes, _p);                       // 轴名键（精确）+ 纯值键（兼容旧链路）
            if (_r.skuId) map['skuid:' + _r.skuId] = _p;      // 官方 SKU ID 键（最稳定）
          }
        }
        try { window.__c1688_orig_sku = { rows: _orig.rows, priceScale: _orig.priceScale, source: _orig.source }; } catch (eW) { /* 无 window 环境 */ }
      } else if (_orig.priceScale) {
        try { window.__c1688_orig_sku = { rows: [], priceScale: _orig.priceScale, source: _orig.source }; } catch (eW) { /* 无 window 环境 */ }
      }
    } catch (eO) { /* 官方矩阵异常不影响既有链路 */ }

    return map;




  }




  /* 从对象里找 SKU 价格：先直取常见字段，再递归找任意 price-like 字段。




     只在该对象内部递归（不会串到别的商品/起批量）。 */




  function pickSkuPrice(o) {




    const direct = clean(firstVal(o, ['discountPrice', 'promotionPrice', 'promoPrice', 'salePrice', 'price',




      'listPrice', 'skuPrice', 'currentPrice', 'priceStr', 'priceText']));




    if (hasP(direct)) return direct;




    const stack = [o]; const seen = new Set(); let n = 0;




    while (stack.length && n < 300) {




      n++;




      const c = stack.pop();




      if (!c || typeof c !== 'object' || seen.has(c)) continue;




      seen.add(c);




      try {




        for (const k of Object.keys(c)) {




          let v = null; try { v = c[k]; } catch (e) { continue; }




          if (!v) continue;




          if (typeof v === 'object') { if (isSafeObj(v)) stack.push(v); continue; }




          if (/price|价/i.test(k)) {




            const p = clean(v);




            if (hasP(p)) return p;




          }




        }




      } catch (e) { /* 单对象出错不影响 */ }




    }




    return '';




  }




  /* 🔴 2026-10-28 区间价诊断：把 1688 接口里 skus 数组的**原始结构**（字段名+前几个样本）存进




     raw_diag，供查各 SKU 价格的真实字段（价格可能在 price/skuPriceInfo/priceRange/props…）。




     deepSkuPrices 采不到时靠它看真实结构，避免盲改。 */




  function skuPriceSample(offerId) {




    const cap = window.__c1688cap || { items: [] };




    for (const it of cap.items) {




      const body = String(it.body || '');




      if (!/skuModel|"skus"|skuInfos|skuList/i.test(body)) continue;




      const j = parseBody(it.body);




      if (!j) continue;




      const stack = [j]; const seen = new Set(); let n = 0;




      while (stack.length && n < 4000) {




        n++; const cur = stack.pop();




        if (!isSafeObj(cur) || seen.has(cur)) continue; seen.add(cur);




        try {




          for (const k of Object.keys(cur)) {




            let v = null; try { v = cur[k]; } catch (e) { continue; }




            if (!v || typeof v !== 'object') continue;




            if (/^(?:skuList|skus|skuInfos?|skuModels?)$/i.test(k) && Array.isArray(v) && v.length) {




              const samp = v.slice(0, 3).map(s => {




                const o = {};




                for (const kk of Object.keys(s)) { try { o[kk] = String(s[kk]).slice(0, 90); } catch (e) { o[kk] = '[?]'; } }




                return o;




              });




              return JSON.stringify({ key: k, count: v.length, sample: samp }).slice(0, 700);




            }




            if (isSafeObj(v)) stack.push(v);




          }




        } catch (e) { /* 单对象出错不影响 */ }




      }




    }




    return '';




  }




  /* 深度扫 SKU 专属图（2026-10-24 江少：sku图怎么没有）：




     拦截响应里 skuModel.propValues[] 每个规格值自带 imageUrl（1688 规格面板缩略图）。




     返回 { 规格值: 图URL } 映射；引擎组装变体行时优先用它，变体图才不是"全是同一张主图"。




     offerId 过滤与 deepSkuNames 同口径（推荐接口里别家商品的图不能混进来）。 */




  function deepSkuImages(offerId) {




    const cap = window.__c1688cap || { items: [] };




    if (!cap._skuImg) cap._skuImg = {};




    if (offerId && cap._skuImg[offerId]) return cap._skuImg[offerId];




    const map = {};




    const stack = [];




    for (const it of cap.items) {




      if (offerId) {




        const ids = (String(it.body || '').match(/"offer_?[Ii][dD]"\s*:\s*"?(\d{6,})"?/g) || [])




          .map(s => (s.match(/(\d{6,})/) || [, ''])[1]).filter(Boolean);




        if (ids.length && !ids.includes(String(offerId))) continue;




      }




      const j = parseBody(it.body);




      if (j) stack.push(j);




    }




    let n = 0;




    while (stack.length && n < 6000 && Object.keys(map).length < 60) {




      n++;




      let cur = null;




      try { cur = stack.pop(); } catch (e) { break; }




      if (!cur || typeof cur !== 'object') continue;




      try {




        // 对象同时带「规格值名 + 图」→ 记映射（propValues 项的标准形态 {name,imageUrl}）




        const nm = (typeof cur.name === 'string' && cur.name) || (typeof cur.skuName === 'string' && cur.skuName) || '';




        const iu = (typeof cur.imageUrl === 'string' && cur.imageUrl) || (typeof cur.imageUri === 'string' && cur.imageUri) || '';




        if (nm && iu) { const u = looksLikeImg(iu); if (u) map[clean(nm)] = u; }




        for (const k of Object.keys(cur)) {




          let v = null;




          try { v = cur[k]; } catch (e) { continue; }




          if (v && typeof v === 'object') stack.push(v);




        }




      } catch (e) { /* 单个对象出错不影响整体 */ }




    }




    if (offerId) cap._skuImg[offerId] = map;




    return map;




  }




  /* SKU 面板兜底：新版详情页把规格面板放 air.1688.com 的 iframe（主文档跨域读不到 DOM）。




     🔒 根治：旧实现用 XHR GET 子帧 src → 跨域必被 CORS 挡死（死路）。现改为优先用




     postMessage 已回传的子帧 SKU（window.__c1688frameSku，见文件末尾 message 监听），




     原 XHR 仅作同域兜底（air.1688.com 与主帧同 1688 域时偶尔不被 CORS 挡、可补）。 */




  function skuPanelNames() {




    const out = new Set();




    try {




      // ① 优先：postMessage 已回传的子帧 SKU（跨域正解，颜色轴主力回传通道）




      const fs = window.__c1688frameSku || [];




      for (const p of fs) { for (const t of (p.skus || [])) if (skuNameOk(t)) out.add(t); }




      if (out.size) return [...out];




    } catch (e) { /* 忽略 */ }




    // ② 兜底：同域 XHR（air.1688.com 与主帧同 1688 域时可能不被 CORS 挡）




    try {




      for (const f of document.querySelectorAll('iframe')) {




        const src = f.src || f.getAttribute('src') || '';




        if (!/sku-panel|sku_panel|skupanel/i.test(src)) continue;




        let html = '';




        try {




          const xhr = new XMLHttpRequest();




          xhr.open('GET', src, false);




          xhr.send(null);




          html = xhr.responseText || '';




        } catch (e) { continue; }   // 跨域被 CORS 挡 → 静默




        if (!html) continue;




        let doc = null;




        try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (e) { continue; }




        if (!doc) continue;




        doc.querySelectorAll('[class*="sku"] [class*="item"],[class*="sku-item"],[data-sku],[class*="item"][data-value],[class*="value"]').forEach(el => {




          const t = clean(el.textContent) || clean(el.getAttribute('data-value') || '');




          if (skuNameOk(t)) out.add(t);




        });




        if (out.size) break;




      }




    } catch (e) { /* 整体失败静默 */ }




    return [...out];




  }




  /* ── ③ 探针：把页面里可用的数据源 + 实际抓到的字段 dump 出来，用来校准上面两个函数 ── */




  /* 🔍 详情快照（2026-10-28 复用 detail 主图/价格逻辑：只认 img/ibank 商品图 + 纯价格正则，排除占位小图/起批量） */




  function snapShot() {




    const doc = document;




    let title = (doc.title || '').replace(/\s+/g, ' ').trim();




    if (!title && doc.querySelector('h1')) title = (doc.querySelector('h1').textContent || '').replace(/\s+/g, ' ').trim();




    let image = '';




    const imgs = [];




    document.querySelectorAll('img').forEach(img => {




      const u = pickImg(img);




      if (u && /alicdn|1688/.test(u) && /img\/ibank\//i.test(u) && !BAD_IMG.test(u) && !/\.svg($|\?)/i.test(u)) imgs.push(u);




    });




    if (imgs.length) image = imgs[0];




    if (!image) {




      // 🔴 2026-10-31 23:5x 江少「单条链接扫描怎么没有主图」：详情页主图大量懒加载/换 CDN 路径，
      //    DOM img 扫描常落空 → 先取 og:image 元标签（1688 详情页恒有、即买家看到的主图），
      //    再退 HTML 正则兜底（并支持 //cbu01.alicdn.com 协议相对地址）。
      try {
        const _og = doc.querySelector('meta[property="og:image"], meta[name="og:image"], meta[itemprop="image"], meta[name="twitter:image"]');
        const _ogU = _og ? String(_og.getAttribute('content') || '').trim() : '';
        if (_ogU && /alicdn|1688/i.test(_ogU) && !/\.svg($|\?)/i.test(_ogU) && !BAD_IMG.test(_ogU)) {
          image = _ogU.startsWith('//') ? 'https:' + _ogU : _ogU;
        }
      } catch (eOg) { /* og 标签异常继续兜底 */ }




      const mm = doc.documentElement.innerHTML.match(/(?:https?:)?\/\/[^"'\s]+?alicdn\.com[^"'\s]*\/img\/ibank\/[^"'\s]*\.(?:jpg|jpeg|png)/i);




      if (mm) image = mm[0].startsWith('//') ? 'https:' + mm[0] : mm[0];




    }




    let price = '';




    const PRICE_TXT_RE = /^[¥￥\s]*\d+(?:[.,]\d+)?(?:\s*[-~—]\s*\d+(?:[.,]\d+)?)?[¥￥\s]*$/;




    for (const e of document.querySelectorAll('[class*="price"],[class*="Price"]')) {




      const t = priceTextOf(e);




      if (!t || !PRICE_TXT_RE.test(t) || /起批|起订|起售|最小|库存|运费|计价|批发|定金|优惠|券/.test(t)) continue;




      const mm = t.match(/(\d+(?:[.,]\d+)?)\s*[-~—]\s*(\d+(?:[.,]\d+)?)/);




      price = mm ? (num(mm[1]) + '-' + num(mm[2])) : (hasP(num(t)) ? num(t) : '');




      break;




    }




    return { title, image, price, url: location.href };




  }




  function probe() {




    const globals = [];




    for (const k of Object.keys(window)) {




      if (!/^(data|init|page|__|g_|offer|item|sku|product|_)/i.test(k)) continue;




      let v = null;




      try { v = window[k]; } catch (e) { continue; }




      if (!v || typeof v !== 'object') continue;




      let s = '';




      try { s = JSON.stringify(v).slice(0, 260); } catch (e) { s = '[不可序列化]'; }




      globals.push({ key: k, type: Object.prototype.toString.call(v), keys: Object.keys(v).slice(0, 14), sample: s });




    }




    const safe = (o) => { try { return JSON.stringify(o).slice(0, 1200); } catch (e) { return '[不可序列化]'; } };




    // 每段独立 try：任何一段抛错都不能让整个 probe 没返回值（否则面板看到 frames: []）




    const T = (fn, fb) => { try { return fn(); } catch (e) { return { error: String(e && e.message || e), fallback: fb }; } };




    const deep = T(() => deepOffers(), []);




    const deepArr = Array.isArray(deep) ? deep : [];




    return {




      url: location.href,




      title: clean(document.title),




      loggedIn: !/login|登录/.test(location.href + document.title),




      hrefs: T(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).slice(0, 40), []),




      pageData: T(() => window.pageData ? safe({




        layoutLen: (window.pageData.layout || []).length,




        globalDataKeys: Object.keys(window.pageData.globalData || {}).slice(0, 30),




        globalData: window.pageData.globalData,




        moduleSpecs: Object.keys(window.pageData.moduleSpecs || {}).slice(0, 20),




        components: Object.keys(window.pageData.components || {}).slice(0, 30)




      }) : null, null),




      flowSdk: T(() => window.__flow_sdk__ ? safe({




        status: window.__flow_sdk__.status,




        dataLen: (window.__flow_sdk__.data || []).length,




        dataSample: (window.__flow_sdk__.data || []).slice(0, 2),




        nodeList: (window.__flow_sdk__.node_list || []).slice(0, 10)




      }) : null, null),




      globals: globals.slice(0, 20),




      deepOffersCount: deepArr.length,




      deepOffersSample: deepArr.slice(0, 3),




      deepOffersError: Array.isArray(deep) ? null : deep,




      skuSample: T(() => deepSkuNames().slice(0, 10), []),




      listSample: T(() => list().slice(0, 3), []),




      colorImgs: T(() => domColorImages(), {}),




      detailSample: T(() => { const d = detail(); d.images = d.images.slice(0, 3); d.skus = d.skus.slice(0, 6); return d; }, null)




    };




  }




  /* ── ④ 诊断：扫不到东西时，看页面到底长啥样（iframe？登录墙？滑块？） ── */




  function diag() {




    const bodyTxt = (document.body ? document.body.textContent : '') || '';




    let memberId = '';




    try { memberId = (window.__pcWorkbenchSearchConfig__ && window.__pcWorkbenchSearchConfig__.message &&




      window.__pcWorkbenchSearchConfig__.message.model && window.__pcWorkbenchSearchConfig__.message.model.memberId) || ''; } catch (e) { /* 忽略 */ }




    return {




      url: location.href,




      title: clean(document.title),




      offerLinks: document.querySelectorAll('a[href*="offer"]').length,




      allLinks: document.querySelectorAll('a[href]').length,




      imgs: document.images.length,




      pageHeight: Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement ? document.documentElement.scrollHeight : 0),




      memberId: memberId,




      iframes: [...document.querySelectorAll('iframe')].map(f => absUrl(f.src)).filter(Boolean).slice(0, 8),




      needLogin: /请登录|登录后|login/i.test(document.title + bodyTxt.slice(0, 500)),




      slider: /验证|滑块|拖动滑块|安全验证/.test(bodyTxt.slice(0, 2000)),




      bodyHead: bodyTxt.replace(/\s+/g, ' ').slice(0, 180)




    };




  }




  /* ── 属性表探针：dump 页面里所有可能被当成属性表的容器结构 ──




     用途：定位 detail() 属性采集串位的根因（哪个容器在往 attrs 里塞垃圾）。




     与 detail() 属性采集同口径的选择器，每个容器输出：命中选择器 / 标签 / class /




     直接子元素结构 / 含多少行 k:v / 文本样本；按 k:v 行数排序（真属性表特征）。




     附带 detail() 当前实际采到的属性对照，方便验证"采到了什么 vs 页面有什么"。 */




  function dumpAttrTable() {




    const out = { url: location.href, title: clean(document.title), boxes: [] };




    const sels = ['table', '[class*="attribute"]', '[class*="attr-"]', '[class*="attrs"]',




      '[class*="param"]', '[class*="property"]', '[class*="prop"]', '[class*="spec"]', '[class*="sku"]'];




    const seen = new Set();




    for (const sel of sels) {




      let list = [];




      try { list = document.querySelectorAll(sel); } catch (e) { continue; }




      for (const el of list) {




        if (seen.has(el)) continue;




        seen.add(el);




        const kids = [...el.children].slice(0, 8).map(k => ({




          tag: k.tagName, cls: String(k.className || '').slice(0, 36), txt: txt(k).slice(0, 36)




        }));




        const rows = el.querySelectorAll('tr, li');




        let kvRows = 0;




        const kvSample = [];




        for (const r of rows) {




          const cells = [...r.querySelectorAll('td,th,span,div')];




          if (cells.length >= 2) {




            const ck = txt(cells[0]), cv = txt(cells[1]);




            if (ck && cv && ck !== cv && ck.length < 30 && cv.length < 80) {




              kvRows++;




              if (kvSample.length < 12) kvSample.push({ k: ck, v: cv });




            }




          }




        }




        out.boxes.push({




          sel, tag: el.tagName, cls: String(el.className || '').slice(0, 50),




          kids, kvRows, kvSample, sample: txt(el).replace(/\s+/g, ' ').slice(0, 200)




        });




      }




    }




    out.boxes.sort((a, b) => b.kvRows - a.kvRows);   // k:v 行多的排前面（真属性表特征）




    out.boxes = out.boxes.slice(0, 40);




    try { out.currentAttrs = Object.keys(detail().attrs || {}).slice(0, 20); } catch (e) {}




    return out;




  }




  /* 🔒 2026-10-25 江少「颜色轴丢失」根治（决定性证据：探针 capSku 显示 mtop 的 skuModel 全没进




     采集器，但页面规格矩阵表 attrTable.boxes[0] 完整含 颜色×尺码 组合）。




     这条路径直接解析页面渲染的 SKU 矩阵表（<table> 含「颜色」「尺码」双轴表头 + 每行一个组合），




     还原成完整 sku_combos。比依赖 mtop skuModel 更稳——接口拦不到，页面渲染了就有。 */




  /* 🔒 2026-10-25 江少「sku图都变成同一张」：从 1688 规格选择区 DOM 抓每个颜色/款式的专属缩略图。




     1688 颜色 SKU 常是图片色块（<span class="sku-item" style="background-image:url(...)">）或内嵌 <img>，




     之前只抓了颜色文字名、没抓图 → 引擎只能把所有变体回退主图第一张（全同一张）。




     按「颜色名→图URL」回传映射，回填到 sku_combos.image 与 sku_images。只认颜色轴（排除尺码/纯数字）。 */




  function domColorImages() {




    const map = {};




    const SEL = '[class*="sku-item"],[class*="sku"] [class*="item"],[data-sku],[class*="prop"] [class*="value"],[class*="spec"] [class*="item"],[class*="sku"] [class*="value"],[class*="color"] [class*="item"]';




    const NOT = '[class*="shopcard"],[class*="shop-card"],[class*="attribute"],[class*="attr-"],[class*="param"],[class*="nav"],[class*="crumb"],[class*="banner"],[class*="header"],[class*="footer"],[class*="company"],[class*="store"]';




    const isSize = (t) => /码$|尺寸|均码|中码|大码|小码|加大|^[XSML]+\d*码?$|^\d+(\.\d+)?(kg|cm|g|ml|寸|厘米)?$/i.test(t);




    const grab = (el) => {




      let img = '';




      try { const im = el.querySelector('img'); if (im) img = pickImg(im); } catch (e) {}




      if (!img) {




        const bg = el.getAttribute('style') || '';




        const m = bg.match(/background-image\s*:\s*url\(["']?([^"')]+)["']?\)/i);




        if (m) img = looksLikeImg(m[1]) || '';




      }




      if (!img) {




        try {




          const sub = el.querySelector('[style*="background-image"]');




          if (sub) { const m = (sub.getAttribute('style') || '').match(/background-image\s*:\s*url\(["']?([^"')]+)["']?\)/i); if (m) img = looksLikeImg(m[1]) || ''; }




        } catch (e) {}




      }




      return img;




    };




    document.querySelectorAll(SEL).forEach(el => {




      if (el.querySelector(SEL)) return;            // 容器跳过，值在其叶子后代




      if (el.closest(NOT)) return;                  // 店铺统计/属性表容器跳过




      const name = clean(el.getAttribute('data-value') || el.getAttribute('data-sku') ||




        el.getAttribute('title') || el.getAttribute('alt') || el.textContent);




      if (!name || name.length > 40 || isSize(name) || !/[一-龥A-Za-z]/.test(name)) return;




      if (/[¥￥$€]|\d+(\.\d+)?\s*(元|块|美元)/.test(name)) return;   // 价格行不要




      const img = grab(el);




      if (img && !map[name]) map[name] = img;




    });




    return map;




  }




  /* 🔴 2026-10-28 治本（探针 904111948166 实锤）：SKU 规格区 module-od-sku-selection 的




     feature-item 含「轴名 值 ¥价 库存N包」——主页面 DOM 就有完整规格+每SKU价格，不依赖接口/iframe。




     单轴商品(颜色)combos=0 是正常(无组合)，但 SKU 变体+各自价格全在这里（区间价 2.92~4 实证）。




     skuFromSpecTable 只认双轴矩阵表，单轴全漏 → 这里抓 feature-item 补全 skus + 还原区间价。 */




  function skuFromFeature() {




    const out = { skus: [], items: [], priceMin: '', priceMax: '' };




    const AXIS_RE = /^(颜色|色系|颜色分类|尺码|大小|尺寸|规格|型号|码数|款式)/;




    let items = [];




    try { for (const z of document.querySelectorAll('.module-od-sku-selection, [class*="sku-selection"], [class*="module-od-sku"], [class*="od-sku"]')) items = items.concat([...z.querySelectorAll('[class*="feature-item"], [class*="sku-item"]')]); } catch (e) { }




    if (!items.length) { try { for (const z of document.querySelectorAll('[class*="sku"]')) items = items.concat([...z.querySelectorAll('[class*="feature-item"], [class*="sku-item"]')]); } catch (e) { } }




    const seen = new Set();




    for (const fi of items) {




      try {




        const raw = (fi.textContent || '').replace(/\s+/g, '');




        if (!raw || raw.indexOf('¥') === -1) continue;




        // 🔴 2026-10-28 feature-item 是「容器」（含全部颜色，文本连排：




        //   "颜色A¥2.92库存1056840包颜色B¥3库存8671161包..."）。按「库存N」切分，逐段提取 值+价+库存。




        const segs = raw.split(/库存\s*([\d.]+)/);




        for (let i = 0; i < segs.length; i += 2) {




          const seg = segs[i]; if (!seg) continue;




          const stock = (i + 1 < segs.length) ? Number(segs[i + 1]) : '';




          const pIdx = seg.lastIndexOf('¥');




          if (pIdx <= 0) continue;




          const price = Number(seg.slice(pIdx + 1).replace(/[^\d.]/g, '')) || '';




          let val = seg.slice(0, pIdx);




          const am = val.match(AXIS_RE);




          let axis = am ? am[1] : '';




          if (am) val = val.slice(am[0].length);




          // 后续段开头是前一个库存的单位字（包/件/个/套…），去掉 + 去尾部残留




          val = val.replace(/^(包|件|个|套|只|双|条|支|瓶)+/, '').replace(/^(包|件|个|套|只|双|条|支|瓶)+$/, '').trim();




          if (!val || seen.has(val)) continue;




          seen.add(val);




          out.skus.push(val);




          if (price !== '') {




            if (out.priceMin === '' || price < out.priceMin) out.priceMin = price;




            if (price > out.priceMax) out.priceMax = price;




          }




          out.items.push({ axis: axis, value: val, price: price, stock: stock });




        }




      } catch (e) { /* 单个 item 出错跳过 */ }




    }




    return out;




  }




  // 🔴 治本（移植上游 parse1688SkuBlob）：从当前帧 SKU 区渲染文本直接抠「名称¥价库存」，
  //    这就是页面展示价——结构上不可能采到 skuInfoMap 批发原价（批发原价只在 JSON 里，不在渲染文本旁）。
  //    在子帧(iframe)里也能跑：子帧能看到 SKU 区 DOM。返回 { 选项名: 展示价 }，调用方按
  //    「展示价≤批发价」原则合并进 sku_price_map，从根上覆盖批发原价（江少「价格不对」真因）。
  function domSkuPrices() {
    const out = {};
    try {
      const SELS = ['.module-od-sku-selection', '[class*="sku-selection"]', '[class*="sku-panel"]',
                    '[class*="od-sku"]', '[class*="sku-prop"]', '[class*="sku-list"]', '[class*="sku-module"]', '[class*="offer-sku"]'];
      let box = null;
      for (const s of SELS) { try { const el = document.querySelector(s); if (el) { box = el; break; } } catch (e) {} }
      if (!box) { try { box = document.querySelector('[class*="sku"]'); } catch (e) {} }
      if (!box) return out;
      const text = (box.innerText || box.textContent || '').replace(/\s+/g, '');
      // 单轴：轴名 值¥价库存（单位字可选，否则整段采不到）
      const re = /([^¥]+?)¥\s*([\d.]+)\s*库存\s*(\d+)\s*(?:个|条|件|双|套|只|对)?/g;
      let m;
      while ((m = re.exec(text))) {
        let name = m[1].replace(/^(?:颜色分类|颜色|尺码|尺寸|型号|规格|套餐|版本|容量|款式|类型)[:：]?/, '').trim();
        if (!name) continue;
        // 双轴段(如"颜色黑色尺码M")→ 清掉所有轴名标签，留末段值
        name = name.replace(/(?:颜色分类|颜色|尺码|尺寸|型号|规格|套餐|版本|容量|款式|类型)[:：]?/g, ' ').replace(/\s+/g, ' ').trim();
        if (!name) continue;
        const price = parseFloat(m[2]);
        if (!(price > 0)) continue;
        if (!(name in out) || price < out[name]) out[name] = price;
      }
    } catch (e) { /* 忽略 */ }
    return out;
  }

  // 🔴 2026-10-29 治本「货源价用页面展示价」：展开视图 item-label(尺码名) 与 item-price-stock(¥价)
  //    是相邻兄弟列（label 在前），不是 expand-view-item 的子元素。旧版读 expand-view-item 内含
  //    item-label 采不到（label 在 v-flex 列）→ 页面价没覆盖、仍落接口批发价。
  //    改为按 DOM 顺序配对：item-label 记当前尺码名，紧跟的 item-price-stock 取价写入 map；
  //    feature-item-label(轴名) 用精确类名排除，不误配。所有商品通用，采不到时走原接口价兜底。
  function skuExpandPrices() {
    const map = {};
    try {
      const isItemLabel = (c) => (c || '').split(/\s+/).some(x => x === 'item-label' || /^item-label(?=[\s-]|$)/i.test(x));
      const SEL = '[class*="item-label"],[class*="item-price-stock"]';
      let curName = '';
      for (const el of document.querySelectorAll(SEL)) {
        const cls = String(el.className || '');
        if (isItemLabel(cls)) {
          curName = clean((el.textContent || '').trim());
          if (!curName || curName.length > 40) curName = '';
        } else if (cls.indexOf('item-price-stock') !== -1) {
          const m = (el.textContent || '').match(/[¥￥]\s*([\d.]+)/);
          if (m && curName) map[curName] = m[1];
          curName = '';
        }
      }
    } catch (e) { /* 忽略 */ }
    return map;
  }



  // 🔴 2026-10-29 江少「颜色轴丢失」修复：读颜色 feature-item 的所有值（通用定位，不依赖精确选择器）。




  //    skuFromFeature 只采到含¥库存的尺码段，颜色值（纯值无价格库存）被过滤 → 颜色轴整体丢失。




  //    这里从「轴名含颜色」的 feature-item 里读所有值元素（直接子元素优先，多选择器候选兜底），




  //    供 detail() 组合 颜色×尺码。颜色≤1（单色）时 detail 不组合，保持原单轴逻辑不破坏。




  // 🔴 2026-10-29 二次修复（676743888518 实锤）：旧逻辑读 fi.children → 拿到 feature-item-sku




  //    容器本身，其 textContent 把「黑色肉色白色」合并成 1 个值 → colors.length=1 → 颜色×尺码组合




  //    被跳过 → 颜色轴整体丢失（丝袜/连裤袜类目颜色都是 黑色/肉色/白 这种结构，整批中招）。




  //    改为：只取「值元素」自身文本，绝不读容器 textContent；单个节点仍合并多色时按常见色词拆开。




  const COLOR_WORDS_RE = /(黑色|白色|肉色|肤色|奶白|透肉|红色|蓝色|绿色|黄色|粉色|紫色|灰色|棕色|金色|银色|杏色|卡其|酒红|藏青|浅灰|深灰|宝蓝|湖蓝|米色|香槟|咖啡|驼色|橙色|五彩|花色|豹纹|格子|条纹|波点)/g;




  const SINGLE_COLOR_RE = /^(黑|白|红|蓝|绿|黄|粉|紫|灰|棕|金|银|肉|肤|杏|橙)$/;




  
  // 保留 sku_combos 中商家填写的完整颜色/款式值，不截成单个颜色词。
  function sanitizeSkuComboColors(combos) {
    const AX = /颜色|色系|主色|配色/i;
    for (const c of combos) {
      if (!c || !c.options) continue;
      for (const [k, v] of Object.entries(c.options)) {
        if (typeof v !== 'string' || !AX.test(k)) continue;
        c.options[k] = v.trim();
      }
    }
  }
function readColorAxisValues() {




    const out = []; const seen = new Set();




    try {




      const fis = document.querySelectorAll('[class*="feature-item"]');




      for (const fi of fis) {




        const lb = fi.querySelector('[class*="feature-item-label"]');




        const axis = clean(lb ? lb.textContent : '');




        if (!/颜色|色系|颜色分类/.test(axis)) continue;




        // 优先取值元素本身（item-label/sku-item/value/data-value 及其直接子），不碰容器文本




        const valEls = fi.querySelectorAll('[class*="item-label"],[class*="sku-item"],[class*="value"],[class*="feature-item-sku"] > *,[data-value]');




        const nodes = valEls.length ? valEls : fi.children;




        for (const c of nodes) {




          if (c === lb) continue;




          let t = clean(c.textContent) || clean(c.getAttribute('data-value') || '');




          // 🔴 2026-10-29 加轴名黑名单：不只是 t===axis，还要过滤所有通用轴名
          // （1688 新版 SPA 有时把多个轴的 label 混在同一个 feature-item 容器里）
          if (!t || t === axis) continue;
          if (/^(颜色|色系|主色|配色|颜色分类|颜色规格|规格|尺码|尺寸)$/i.test(t)) continue;

          // 选项节点文本就是商家规格原文；即使包含多个描述词也不拆、不缩写。
          // 颜色轴值按页面原文保留；只排除明显不是规格值的纯数字。




          if (t.length < 2 && !SINGLE_COLOR_RE.test(t)) continue;




          if (seen.has(t)) continue;




          if (/^[-\d.,\s]+$/.test(t)) continue;




          seen.add(t); out.push(t);




        }




        if (out.length) break;




      }




    } catch (e) {}

    // 🔴 兜底（江少「颜色轴丢失」）：feature-item 未命中时，扫主帧 SKU 选项块补颜色轴
    //    （新版 1688 颜色不在 feature-item 结构时触发；仅兜底，已有 feature-item 命中不受影响）
    if (!out.length) {
      try {
        const _els = document.querySelectorAll('[class*="sku-item"],[class*="sku-selector-item"],[data-sku-name]');
        for (const el of _els) {
          const _t = clean(el.getAttribute('title') || el.getAttribute('data-sku-name') || el.textContent);
          if (!_t || _t.length < 2) continue;
          if (/^(颜色|色系|主色|配色|颜色分类|颜色规格|规格|尺码|尺寸)$/i.test(_t)) continue;
          if (/^[-\d.,\s]+$/.test(_t)) continue;
          if (!seen.has(_t)) { seen.add(_t); out.push(_t); }
        }
      } catch (e2) {}
    }

    return out;




  }




  let _lastTableHead = [];   // 🔒 取证：skuFromSpecTable 命中的矩阵表真实表头（落 raw_diag，一眼看出有没有价格列）




  function skuFromSpecTable() {




    const combos = [];




    const seen = new Set();




    // 只认「定义 SKU 的轴」（颜色/尺码/尺寸/规格…），重量/材质等不算轴（避免把重量列当第三轴、纯数字值误伤组合）




    const AXIS = ['颜色', '色系', '颜色分类', '尺码', '大小', '尺寸', '规格', '型号', '码数', '款式'];




    const isAxisName = (t) => !!t && (AXIS.indexOf(t) >= 0 ||




      /^(颜色|色系|颜色分类|尺码|大小|尺寸|规格|型号|码数|款式)$/.test(t));




    const tables = [...document.querySelectorAll('table')];




    for (const tbl of tables) {




      const t0 = txt(tbl).replace(/\s+/g, '');




      // 必须是 SKU 矩阵表：同时含颜色轴 + 另一轴（尺码/尺寸/规格），排除普通参数表




      if (!/颜色|色系/.test(t0) || !/尺码|尺寸|规格|大小|码数/.test(t0)) continue;




      // 读表头映射「列序号→轴名」：thead>tr 优先，否则首行 tr




      const headRow = tbl.querySelector('thead tr') || tbl.querySelector('tr');




      const headCells = headRow ? [...headRow.querySelectorAll('th,td')] : [];




      const colAxis = {};




      // 🔴 2026-10-29 江少「区间价还是没解决」取证 + 修复：1688 新版详情页数据既不走可拦截 XHR




      //    （诊断 captured=0）也不在全局变量（globals=[]）——唯一稳定来源就是 DOM 的 SKU 矩阵表。




      //    旧版只映射「轴名」列（颜色/尺码），**完全忽略价格列** → combos 的 price 恒为空 →




      //    区间价永远采不到。这里补价格列识别（价格/单价/price/金额/报价/拿货价/批发价）。




      const colPrice = {};




      const PRICE_COL_RE = /价格|单价|price|金额|报价|拿货价|批发价|含税价/i;




      headCells.forEach((c, i) => {




        const t = clean(c.textContent);




        if (isAxisName(t)) colAxis[i] = t;




        else if (PRICE_COL_RE.test(t)) colPrice[i] = t;




      });




      _lastTableHead = headCells.map(c => clean(c.textContent)).slice(0, 14);   // 🔒 取证存档




      if (Object.keys(colAxis).length < 2) continue;   // 无明确双轴表头 → 不是矩阵表，跳过（防属性清单表误当 SKU）




      const rows = tbl.querySelectorAll('tbody tr, tr');




      let hit = 0;




      for (const r of rows) {




        const cells = [...r.querySelectorAll('td,th')];




        if (cells.length < 2) continue;




        const opts = {};




        let pr = '';




        cells.forEach((c, i) => {




          const ax = colAxis[i];




          const cv = clean(c.textContent);




          if (ax) { if (cv && cv !== ax) opts[ax] = cv; }        // 表头行自身 v===ax 被跳过




          if (colPrice[i] && !pr && cv) {                        // 价格列：取该行真实单价




            const pm = cv.match(/[\d]+(?:\.\d+)?/);




            if (pm && hasP(pm[0])) pr = num(pm[0]);




          }




        });




        const keys = Object.keys(opts);




        if (keys.length < 2) continue;                 // 至少两轴才是组合




        // 纯数字值（重量/编号类残值）丢弃该行，避免污染组合




        if (keys.some(k => /^[-\d.,\s]+$/.test(opts[k]) && !/[一-龥A-Za-z]/.test(opts[k]))) continue;




        const key = JSON.stringify(opts);




        if (!seen.has(key)) { seen.add(key); combos.push({ options: opts, price: pr, priceSource: pr ? 'dom-matrix' : '', image: '' }); hit++; }




      }




      if (hit) break;   // 第一张命中的矩阵表即足够（避免多表串）




    }




    return combos.slice(0, 200);




  }




  /* ── ⑤ 滚动到底触发懒加载（1688 店铺页卡片是滚到哪加载到哪）+ 顺手记录页面自己调过的接口 ── */




  // 🔴 2026-10-25 江少「整店不只50条」实证修复：noon 品牌馆/店铺页是虚拟列表，




  //   旧 autoScroll 只 window.scrollTo(scrollHeight)——noon 列表在内部滚动容器里，




  //   window 滚到底页面高度不变 → 一次都没触发懒加载（实测 4 轮都是同样 50 条）。




  //   新版：① window 渐进 scrollBy（虚拟列表常要渐进才触发）② 顺带滚页面里最大的




  //   可滚动容器（overflow-y auto/scroll 且 scrollHeight>clientHeight）③ 每轮报链接数变化。




  async function autoScroll(steps) {




    const N = Math.max(1, Math.min(20, +steps || 8));




    const linkCount = () => document.querySelectorAll('a[href]').length;




    const before = linkCount();




    // 找内部滚动容器：溢出可滚 + 不是 body/html + 面积最大的那个（noon 商品网格容器）




    const findScrollers = () => {
      // 🔴 2026-11-08 19:2x 卡死修复：原 [...document.querySelectorAll('*')] 对页面上每个元素都调
      // getComputedStyle → Noon 上万元素同步冻死主线程（症状：扫描卡在「第 1 页扫描中」永不返回、
      // 心跳停发→服务端 3 分钟判死）。改为：① 只查容器类标签 ② 先做廉价的 clientHeight/scrollHeight
      // 判断 ③ 通过后才算样式 ④ 600ms 时间预算，绝不允许冻死。
      const out = [];
      const t0 = Date.now();
      const els = document.querySelectorAll('div,section,main,article,ul,ol');
      for (const el of els) {
        if (Date.now() - t0 > 600) break;
        try {
          if (el === document.body || el === document.documentElement) continue;
          if (el.clientHeight <= 200) continue;
          if (el.scrollHeight <= el.clientHeight + 100) continue;
          if (!/auto|scroll/.test(getComputedStyle(el).overflowY)) continue;
          out.push(el);
        } catch (e) { /* 已卸载节点跳过 */ }
      }
      return out.sort((a, b) => (b.scrollHeight * b.clientHeight) - (a.scrollHeight * a.clientHeight)).slice(0, 3);
    };




    for (let i = 0; i < N; i++) {




      // 渐进滚 window（每次 60% 视口，触发 IntersectionObserver 型懒加载）




      window.scrollBy(0, Math.round(window.innerHeight * 0.6));




      await new Promise(r => setTimeout(r, 500));




      // 内部容器也滚（noon 虚拟列表的真正加载点）




      for (const sc of findScrollers()) {




        try { sc.scrollTop = sc.scrollTop + Math.round(sc.clientHeight * 0.7); } catch (e) { /* 容器已 detach 就跳过 */ }




      }




      await new Promise(r => setTimeout(r, 700));




    }




    window.scrollTo(0, 0);




    const after = linkCount();




    return { before, after, grew: after > before };




  }




  function resources() {




    try {




      return performance.getEntriesByType('resource')




        .map(e => e.name)




        .filter(u => /offer|offerlist|search|selloffer|async|\.json|openapi|m\.1688|widget/i.test(u))




        .filter(u => !/\.(js|css|png|jpg|jpeg|gif|webp|svg|woff|ttf)($|\?)/i.test(u))




        .slice(0, 40);




    } catch (e) { return []; }




  }




  /* ── 🔒 2026-10-25 江少「颜色轴丢失根治」：跨域子帧 SKU 回传（替代 CORS 死路）──




     颜色/尺码常驻在 air.1688.com / taobao 的 sku-panel iframe 里，主文档跨域读不到它的 DOM，




     旧 skuPanelNames() 用 XHR GET 子帧 src 必被 CORS 挡死（作者自己留的死路）。




     正解：content_scripts 已 all_frames 注入到子帧，子帧直接读自己的 DOM + 自己的 mtop 拦截器，




     通过 postMessage 把 SKU 回传给主帧。主帧收集后合并，不依赖主帧跨域读、不依赖 CORS。 */




  if (!window.__c1688Msg) {




    window.__c1688Msg = true;




    // 子帧：收到主帧 req_sku → 回传自身 detail 结果（子帧读得到自己内部的一切）




    window.addEventListener('message', function (e) {




      try {




        const d = e.data;




        if (!d || d.__c1688 !== 'req_sku') return;




        const r = (window.__c1688 && window.__c1688.detail) ? window.__c1688.detail() : null;




        if (!r) return;




        const payload = {




          skus: r.skus || [], combos: r.sku_combos || [], images: r.images || [],




          // 🔴 2026-10-28 区间价：子帧(sku-panel)自己的 cap 里才有 skuInfoMap 每SKU价格，




          //   主页面矩阵表只有颜色×尺码(无价格列)。回传 sku_price_map → 主帧合并还原区间价。




          sku_price_map: (r && r.sku_price_map && typeof r.sku_price_map === 'object') ? r.sku_price_map : {},




          offerId: r.offerId, isIframe: true, frameUrl: location.href,




          // 🔴 2026-10-28 子帧规格诊断：detail() 的 combos/区间价捕获状态在 r.skuDiag




          //   （dom/domKept/deep/combos/priceMapCount/priceSample/skuResp），raw_diag 是引擎层拼接、子帧没有。




          //   回传这个才能定位子帧(sku-panel)为什么 combos=0 / 区间价没采到。




          diag: (r && (r.skuDiag || r.raw_diag)) ? JSON.stringify(r.skuDiag || r.raw_diag).slice(0, 2500) : ''




        };




        (e.source || window.parent).postMessage({ __c1688: 'res_sku', payload: payload }, '*');




      } catch (e2) { /* 忽略 */ }




    });




    // 主帧：收集子帧回传（异步到，靠引擎多轮补抓在后续轮次合并）




    window.addEventListener('message', function (e) {




      try {




        const d = e.data;




        if (!d || d.__c1688 !== 'res_sku' || !d.payload) return;




        window.__c1688frameSku = window.__c1688frameSku || [];




        // 同 offerId 的只留最新一份，避免重复累积




        const pid = d.payload.offerId || location.href.match(/[?&]offer[_]?[iI][dD]=(\d+)/i);




        window.__c1688frameSku = window.__c1688frameSku.filter(p => p.offerId !== d.payload.offerId);




        window.__c1688frameSku.push(d.payload);




      } catch (e2) { /* 忽略 */ }




    });




  }




  // 主帧主动去向所有 sku 子帧请求 SKU（每轮 detail 都发，确保子帧回传进入收集）




  function requestFrameSku() {




    try {




      const frames = document.querySelectorAll('iframe');




      for (const f of frames) {




        const src = f.src || f.getAttribute('src') || '';




        if (/sku-panel|sku_panel|skupanel|air\.1688|taobao/i.test(src)) {




          try { f.contentWindow.postMessage({ __c1688: 'req_sku' }, '*'); } catch (e) { /* 跨域发失败忽略 */ }




        }




      }




    } catch (e) { /* 忽略 */ }




  }




  /* 把已回传的子帧 SKU 合并进主帧结果（颜色轴从这拿回来） */




  function mergeFrameSku(d) {




    try {




      const fs = window.__c1688frameSku || [];




      for (const p of fs) {




        if (p.skus && p.skus.length) {




          const set = new Set([...(d.skus || []), ...p.skus]);




          d.skus = [...set].slice(0, 60);




        }




        if (p.combos && p.combos.length) {




          d.sku_combos = [...(d.sku_combos || []), ...p.combos].slice(0, 200);




        }




        // 🔴 2026-10-28 区间价治本：子帧 skuInfoMap 每SKU价格回传 → 合并进主帧，




        //   并据此还原 price/priceMax（矩阵表只有颜色×尺码，价格在 iframe 里）。




        if (p.sku_price_map && Object.keys(p.sku_price_map).length) {




          d.sku_price_map = d.sku_price_map || {};
          // 🔴 治本：子帧/主帧合并取更低价（展示价≤批发价，故展示价恒优先；杜绝批发原价覆盖展示价）
          for (const _k in p.sku_price_map) {
            const _pv = num(p.sku_price_map[_k]);
            if (!hasP(_pv)) continue;
            const _cv = num(d.sku_price_map[_k]);
            if (!hasP(_cv) || _pv < _cv) d.sku_price_map[_k] = p.sku_price_map[_k];
          }




          const vals = Object.values(d.sku_price_map).map(Number).filter(n => isFinite(n) && n > 0);




          if (vals.length) {




            if (!hasP(d.price)) d.price = Math.min(...vals);




            if (!d.priceMax || +d.priceMax <= 1) d.priceMax = Math.max(...vals);




          }




        }




      }




    } catch (e) { /* 忽略 */ }




  }




  /* ═══ 2026-10-25 多平台采集（江少：noon 最主要，外加亚马逊/速卖通/Shein）═══




     平台识别：1688 家族（1688/taobao/tmall）走原有专用链路；其余平台走下面的通用链路。




     通用链路产出与 1688 同构的数据（list: offerId/title/url/image/price；




     detail: title/price/images/skus/sku_images/category/currency/captcha），




     直接插进引擎现有变体机器；各平台 SKU 深解析后续按「探针」真实结构逐家校准。 */




  const PLATFORM_OF = (h) => {




    h = String(h || '').toLowerCase();




    if (/(^|\.)1688\.com$/.test(h) || /(^|\.)taobao\.com$/.test(h) || /(^|\.)tmall\.com$/.test(h)) return '1688';




    if (/(^|\.)noon\.com$/.test(h)) return 'noon';




    if (/(^|\.)aliexpress\.(com|us)$/.test(h)) return 'aliexpress';




    if (/(^|\.)amazon\.(com|ae|sa|eg|co\.uk|de|fr|it|es|nl|se|pl|tr|in|ca|sg|com\.mx|com\.br|com\.au|co\.jp)$/.test(h)) return 'amazon';




    if (/(^|\.)shein\.com$/.test(h)) return 'shein';




    return 'web';




  };




  const CUR_PLATFORM = PLATFORM_OF(location.hostname);




  const IS_1688_FAM = CUR_PLATFORM === '1688';




  // 各平台商品详情页 URL 形态 → 列表扫描先按严格形态找，0 命中再走「卡片带价 + 产品形URL」兜底




  // 🔴 2026-10-25 江少 adidas 品牌馆探针实锤（终版铁律）：




  //   真实商品 = /<商品slug>/<商品码>/p/?o=token&store=STXXX（ZB318AE2088BC9A54E489Z/p/，N/M/W 开头都有）




  //   品牌馆磁贴 = /~<品牌>/<馆码>/g/、/uae-en/store/STXX/<馆码>/g/（CP7F6XFLHL7K/g/）——馆码也是全大写，




  //   所以「大写码」一个条件分不开商品和馆！唯一铁判据 = **码后面必须跟 /p/**（馆跟 /g/）。




  //   血泪：/{8,} 无 /p/ 条件时品牌页 75 个馆磁贴全进队列（江少「为什么乱七八糟这么多」）。




  const PRODUCT_URL_RE = {




    // 🔴 2026-11-08 19:4x 修正（江少「我粘的是全店链接」）：noon 商品页唯一真身 = <SKU>/p/（官方：/uae-en/iphone-17.../N70211466V/p/）
    //   而店铺页是 /uae-en/p-<店铺ID>/（官方：/uae-en/seller/p-xxxxxx/）——绝不能算商品页，否则整店被当成 1 条单品。
    noon: /\/[A-Za-z0-9]{4,}\/p(?:\/|\?|$)/,




    aliexpress: /\/item\/\d+/,




    // 🔵 2026-11-08 亚马逊（江少：单链接 + 全店都要支持）：
    //   实测 amazon.ae 真实商品链接有 3 种形态，缺一个就全采不到：
    //     ① /<slug>/dp/B0CJVC2KT5/ref=sr_1_1?...   ← 搜索结果/店铺页主形态
    //     ② /gp/product/B0CJVC2KT5                  ← 老形态
    //     ③ /gp/aw/d/B0CJVC2KT5                     ← 移动端形态（广告位 r= 参数里就是它）
    //   ASIN 固定 10 位（大写字母+数字）。放宽到 8~12 会把 /gp/aw/d/ 之外的短码误收，故按 10 位。
    amazon: /\/(?:dp|gp\/product|gp\/aw\/d)\/[A-Z0-9]{10}(?:[/?#]|$)/,




    shein: /-p-\d+/,




    web: /\/(?:product|item|p)\//,




  };




  // 品牌馆/店铺馆（noon ~brand/CODE/g/、store/STXX/CODE/g/）——磁贴目录页，不是商品




  // （江少探针：品牌页 1136 链接里 75 个馆磁贴 + 1 个真商品，馆磁贴全走 /g/ 结尾）




  const GALLERY_URL_RE = /\/g\/?(?:[?#]|$)|\/store\//i;




  // 品牌馆/活动落地页（noon /p-12345/）—— 不是商品，收了就是队列垃圾（江少实锤：Pan/Global Shipping/Necklaces 三条）




  // 🔴 2026-10-25 实证：落地页真实形态是 /p-535289/fashion/.../necklaces/?sort...（页码在路径开头不在结尾！），




  //   老正则 /\/p-\d+\/?$/ 锚定结尾全漏 → 改成匹配路径任意位置的 /p-<数字> 段




  // 🔶 2026-11-08 江少「noon 链接扫不出」根治：旧 /\/p-\d+\b/ 把 noon 数字商品码（/uae-en/p-593742/）当成落地页排除 → 列表页扫出 0 条。
  //   落地页（/p-535289/fashion/.../necklaces/）特征是「码后跟分类词」；商品（/p-593742/）码后直接结尾/查询参数。
  //   改为只匹配「码后跟小写分类词」的落地页，保留「码后结尾」的商品。
  const LANDING_URL_RE = /\/p-\d+\/?(?:$|[?#])/i;




  // 卡片带价信号（零售列表页商品卡才有；导航/类目/落地页没有）




  // 🔴 2026-10-25 实证：noon 卡内文本 = SEO 标题 + 评分 + 折扣徽章，标题垃圾数字粘着字母




  //   （"Album4.41K" / "Game3.7254566I" / "Vary )4.646727984"）——裸小数没 \b 锚定第一个就撞标题垃圾，




  //   价格全错（江少「价格也不对」）。\b 挡住"数字粘字母"的垃圾，只收独立小数。




  const PRICE_IN_CARD_RE = /(?:AED|SAR|USD|US\$|\$|£|€|¥|￥|د\.?إ|د|DH)\s*\d|\b\d+\.\d{2}\b/;




  // 默认币种（页面文本识别不到时按平台兜底）




  const PLAT_CUR = { noon: 'AED', aliexpress: 'USD', amazon: 'USD', shein: 'USD', web: 'USD' };




  /* 链接 census（扫描时的自诊断：把页面真实链接形态打回面板日志，不用猜） */




  function diagG() {




    const anchors = [...document.querySelectorAll('a[href]')];




    const same = anchors.filter(a => { try { return new URL(a.href).hostname === location.hostname; } catch (e) { return false; } });




    // 🔴 2026-10-25 江少 PDP 探针：strictHits=52 里含页面自身的无 slug 形态（/product/N26881286A/p/）




    //   和 #ReviewArea 锚点 → census 与 collect() 同口径排除，日志「商品形URL 数」不再虚高




    const myCode = (() => { try { const m = location.pathname.match(/\/([A-Z][A-Z0-9]{5,})\/p(?:\/|$|\?)/); return m ? m[1] : ''; } catch (e) { return ''; } })();




    const notSelfNoise = (a) => {




      try {




        const u = new URL(a.href);




        if (u.hash && (!u.pathname || u.pathname.replace(/\/+$/, '') === location.pathname.replace(/\/+$/, ''))) return false;  // 页内锚点




        if (myCode) { const m = u.pathname.match(/\/([A-Z][A-Z0-9]{5,})\/p(?:\/|$|\?)/); if (m && m[1] === myCode) return false; }  // 自身商品（含无 slug 形态）




        return true;




      } catch (e) { return false; }




    };




    const strict = PRODUCT_URL_RE[CUR_PLATFORM] || PRODUCT_URL_RE.web;




    const hit = same.filter(a => strict.test(a.href || '') && notSelfNoise(a));




    // 品牌馆/活动落地页链接（垃圾来源计数，江少实锤队列里的 535289 们）




    const land = same.filter(a => { try { return LANDING_URL_RE.test(new URL(a.href).pathname); } catch (e) { return false; } });




    // 品牌馆/店铺馆磁贴（垃圾来源计数，江少 adidas 品牌馆探针：75 个馆磁贴全进过队列）




    const gal = same.filter(a => { try { return GALLERY_URL_RE.test(new URL(a.href).pathname); } catch (e) { return false; } });




    // 带价卡片链接（真商品卡的强信号，不管 URL 长什么样；排除自身/锚点，与 collect() 同口径）




    // 🔴 2026-10-25 江少 PDP 探针：卡价拆 "AED 42 .35" 三 span 时未拼合文本匹配不到价 → census 少算。




    //   census 必须与 collect() 的 priceOfCard 同口径（先 joinSplitPrice 再判）




    const _blockedSecs = collectBlockedSections();




    const _inBlocked = (a) => { for (const b of _blockedSecs) { try { if (b.contains(a)) return true; } catch (e) { /* 忽略 */ } } return false; };




    // 推荐位商品链接数（江少「其他店铺链接混入」的可见数字：这些链接长得和主题商品一模一样，靠区块标题才分得开）




    const blockedHits = hit.filter(a => _inBlocked(a)).length;




    const cardHits = same.filter(a => {




      if (!notSelfNoise(a)) return false;




      try {




        const pu = new URL(a.href).pathname;




        if (LANDING_URL_RE.test(pu) || GALLERY_URL_RE.test(pu)) return false;




      } catch (e) { return false; }




      if (_inBlocked(a)) return false;   // 推荐位区块的带价卡同样不计（与 collect 同口径）




      const card = a.closest('[class*="product"],[class*="item"],[class*="card"],[class*="grid"],li,article') || a;





      return PRICE_IN_CARD_RE.test(joinSplitPrice(txt(card) || ''));




    });




    return {




      platform: CUR_PLATFORM,




      url: location.href,




      // 🔴 2026-10-25 江少 PDP 探针实锤：在商品详情页跑扫描（页面自身 1 个 + 相似推荐几个）——




      //   批量采集必须用类目/搜索页。标记出来，日志直接告知，不再让用户对 0 商品/几个商品发懵




      isPdp: !!(document.querySelector('meta[property="og:type"][content*="product"],script[type="application/ld+json"]')




        && /\/p\/?(?:\?|$)/.test(location.pathname)),




      anchors: anchors.length,




      sameHostLinks: same.length,




      strictHits: hit.length,




      blockedHits,   // 推荐位区块商品链接数（Sponsored/You might also like 等，江少跨店铺混入的元凶）




      landingHits: land.length,




      galleryHits: gal.length,




      cardHits: cardHits.length,




      // 🔴 2026-11-24 noon 店铺 0 商品诊断：把每个「被当推荐位」的容器打回面板
      //   （class 前缀 + 内含同站链接数），一眼看出是「整页 wrapper 被吞」还是「真推荐位小模块」
      blockedShape: (() => { const _o = []; let _k = 0; for (const _b of _blockedSecs) { if (_k++ > 5) break; try { _o.push(String(_b.className || '(no-cls)').slice(0, 36) + '@' + _b.querySelectorAll('a[href]').length); } catch (_e) {} } return _o; })(),




      sampleLinks: hit.slice(0, 15).map(a => a.getAttribute('href')),




      gallerySamples: gal.slice(0, 10).map(a => a.getAttribute('href')),




      cardSamples: cardHits.slice(0, 15).map(a => a.getAttribute('href')),




      // noon API 响应体采样：PDP/列表页的商品数据在 carousels/last-seen/search 接口里（DOM 只渲染一小部分），




      // 采样本回来定型 API 兜底解析（江少「数量没有全部扫描出来」的下阶段弹药）




      apiSamples: (() => {




        const out = [];




        try {




          for (const it of (window.__c1688cap || { items: [] })) {




            const u = String(it.url || '');




            if (!/carousel|last-seen|catalog\/api|search|offer|product/i.test(u)) continue;




            const b = String(it.body || '');




            if (b.length < 200) continue;




            out.push({ url: u.slice(0, 120), len: b.length, sample: b.slice(0, 1500) });




            if (out.length >= 3) break;




          }




        } catch (e) {}




        return out;




      })(),




      imgs: document.querySelectorAll('img').length,




      bodyText: (document.body && document.body.innerText || '').slice(0, 160),
      rawHrefSamples: (function () {
        try {
          if ((hit || []).length !== 0) return [];
          var set = [];
          var els = document.querySelectorAll('a[href]');
          for (var k = 0; k < els.length && set.length < 40; k++) {
            try {
              var u = new URL(els[k].href, location.href);
              if (u.hostname !== location.hostname) continue;
              var pth = u.pathname.replace(/\/+$/, '').split('/').map(function (x) { return x.replace(/\d+/g, 'N'); }).join('/');
              var sig = u.hostname.replace(/^[^.]+\./, '*.') + pth;
              if (set.indexOf(sig) < 0) set.push(sig);
            } catch (e) {}
          }
          return set;
        } catch (e) { return []; }
      })(),




    };




  }




  /* 兜底档的「产品形 URL」信号：URL 改版也能收，但必须长得像个商品页（防类目页混进队列）




     🔴 品牌馆磁贴（/g/ 结尾、/store/ 段）由 isGallery 硬门拦，不靠这个正则——大厅码也是全大写，




        在这里加 /p/ 条件会把"URL 改版后的新形态商品"一起挡死，违背兜底档初衷 */




  const PRODUCTISH_URL_RE = /\/p\/[A-Za-z0-9]+|\/item\/\d+|\/dp\/[A-Z0-9]{6,}|\/gp\/product\/|-p-\d+|\/[A-Z][A-Z0-9]{5,}(?:\/|$)/;




  /* 卡内取价三层（江少 2026-10-25「价格也不对」实证修复）：




     ① 卡内文本带币种符号（最可靠）→ ② 卡内价格元素（class/id 含 price，noon 真实价格常在这）




     → ③ 卡内文本裸小数 \b 锚定（ noon 卡内文本 = SEO标题+评分+折扣，标题垃圾数字粘字母，\b 才跳得过） */




  // 🔴 2026-11-08 20:0x noon 首页截图实锤：价格显示成 **"د 67"**（2025 起阿联酋新迪拉姆符号 د，不是 AED）
  //   正则里没有 د → noon 全站价格取不到。补上 د / د.إ / DH。
  const CUR_PREFIX_RE = /(?:AED|SAR|USD|US\$|\$|£|€|¥|￥|د\.?إ|د|DH)\s*([\d,]+(?:\.\d{1,2})?)/i;




  const BARE_PRICE_RE = /\b([\d,]+\.\d{2})\b/;




  // 🔴 2026-10-25 江少 PDP 探针实锤：noon 价格区拆三个 span——"AED" + "42" + ".35"，




  //   卡文本折叠成 "AED 42 .35"，CUR_PREFIX_RE 只吃到 42（小数整个丢掉）。




  //   取价前先把「数字 + 空白 + .分币」的中间空白删掉拼回完整价（42 .35 → 42.35）。




  const joinSplitPrice = (s) => String(s || '').replace(/(\d)\s*([.,]\s*\d{1,2})(?!\d)/g, '$1$2');




  // 🔴 2026-11-08 20:0x noon 列表页价格根治（江少：全店扫描价格恒空）：
  //   实测 noon 商品卡里价格是**独立叶子节点**，文本只有 "35"，货币符号 AED 在另一个节点 →
  //   CUR_PREFIX_RE 要求「AED」前缀、BARE_PRICE_RE 要求两位小数，两条都命中不了，所以价格永远为空。
  //   办法：按 DOM 顺序取「标题节点之后第一个纯数字叶子」= 价格
  //   （noon 卡片顺序：角标数字 → 标题 → 价格 → 促销语，角标在标题之前故被排除）。
  const priceFromTile = (root) => {
    if (!root) return null;
    try {
      if (root.querySelectorAll('*').length > 400) return null;          // 不是单张卡片，宁可不给也不乱猜
      const leaves = [];
      for (const e of root.querySelectorAll('*')) {
        if (e.children.length) continue;                                  // 只要叶子节点
        if (e.closest('svg,button,nav,header,footer')) continue;
        const s = (e.textContent || '').trim();
        if (s && s.length <= 8) leaves.push(s);
      }
      if (!leaves.length) return null;
      let ti = -1, maxLen = 0;
      for (let i = 0; i < leaves.length; i++) if (leaves[i].length > maxLen) { maxLen = leaves[i].length; ti = i; }
      if (ti < 0) return null;
      for (let i = ti + 1; i < leaves.length; i++) {
        const s = leaves[i];
        const mm = s.match(/^(\d{1,6})(?:[.,](\d{1,2}))?$/);
        if (!mm) continue;
        const n = parseFloat(mm[1] + (mm[2] ? '.' + mm[2] : ''));
        if (!(n > 0) || n > 99999) continue;
        return mm;
      }
    } catch (e) { /* 单条失败不影响整轮 */ }
    return null;
  };

  const priceOfCard = (card) => {




    let pm = joinSplitPrice(txt(card) || '').match(CUR_PREFIX_RE);




    if (pm) return pm;




    const pe = card.querySelector('[class*="price"],[class*="Price"],[id*="price"],[data-testid*="price"],[data-qa*="price"],[data-test-id*="price"]');




    if (pe) { const pt = joinSplitPrice(priceTextOf(pe) || ''); pm = pt.match(CUR_PREFIX_RE) || pt.match(BARE_PRICE_RE); if (pm) return pm; }




    return joinSplitPrice(txt(card) || '').match(BARE_PRICE_RE) || null;




  };




  /* 🔴 2026-10-25 江少「这三条都不是一个店铺」：noon 落地页/类目页会把 Sponsored、




     "You might also like"、Related 等推荐模块和主题商品混在一页，推荐模块商品 URL 与主题




     商品同形态（/<slug>/<码>/p/）→ 全收就跨店铺。推荐区块标题是 noon 全站固定英文文案，




     按标题文本定位区块容器整片排除（只认文本、不猜选择器；排除型过滤，误杀只少采不错采）。




     census 与 collect 共用：census 报「推荐位拦了 N 片」，采集时同口径排除。 */




  const BLOCK_TITLES_RE = /sponsored|you (?:might|may) also like|related products?|related to (?:your|this)|recommended for you|recommended products?|customers who (?:bought|viewed)|customers also (?:bought|viewed|liked)|recently viewed|similar products?|similar items?|more to explore|discover more|you may also (?:like|need)|popular (?:right )?now|trending (?:now|products?)|top (?:deals|sellers|rated)|best sellers?|inspired by your (?:browsing|shopping)|your recently viewed|other (?:customers|shoppers)|frequently (?:bought|viewed) together/i;




  const collectBlockedSections = () => {
  const blocked = new Set();
  try {
    const strictRe = PRODUCT_URL_RE[CUR_PLATFORM] || PRODUCT_URL_RE.web;
    // 全页「商品形链接」总数（占比分母；只算同站且命中平台商品 URL 正则的链接）
    let totalProd = 0;
    try {
      for (const a of document.querySelectorAll('a[href]')) {
        try { if (new URL(a.href).hostname === location.hostname && strictRe.test(a.href || '')) totalProd++; } catch (e) {}
      }
    } catch (e) { totalProd = 0; }
    // 某个容器内的商品链接数（数到 25 就停，避免大容器全量遍历）
    const countProdIn = (scope) => {
      let n = 0;
      try { for (const a of scope.querySelectorAll('a[href]')) { if (strictRe.test(a.href || '')) { n++; if (n > 24) return n; } } } catch (e) { return n; }
      return n;
    };
    // 🔴 2026-11-24 治本（江少「noon 店铺商品扫不出来」）：
    //   旧实现用 el.closest('section,...,div') 取「标题所在容器」，div 兜底会一路取到**整页 wrapper**：
    //   noon 聚合页/落地页顶部 banner 只要出现 "Best Sellers"/"Top Deals"/"Trending now" 这类词，
    //   整页主商品区就被当「推荐位区块」整片排除 → 实测 商品形URL 112 · 推荐位拦截 112 → 0 商品。
    //   改为从标题元素向上逐层上探，遇到第一个「含商品链接」的容器再判定：
    //     · 该容器商品链接 ≤ 24 且不占全页大头 → 真正的推荐位小模块，照常排除；
    //     · 该容器=全页商品（或 >24、或 >全页 60%）→ 说明标题挂在大容器里，是主商品区，**放弃拦截**。
    //   排除型过滤的原有语义不变（误杀只少采），只是不再一口气吞掉整页。
    let handled = 0;
    document.querySelectorAll('h1,h2,h3,h4,h5,[class*="title"],[class*="Title"],[data-qa*="title"],[data-testid*="title"],span,div,p').forEach(el => {
      if (handled > 40) return;
      const t = clean((el.textContent || '').slice(0, 80));
      if (!t || t.length > 80 || !BLOCK_TITLES_RE.test(t)) return;
      handled++;
      let sec = null;
      let node = el;
      for (let i = 0; i < 6 && node && node.parentElement; i++) {
        node = node.parentElement;
        if (node === document.body || node === document.documentElement) break;
        const n = countProdIn(node);
        if (n === 0) continue;                       // 纯文字层，继续向上找「真正的商品模块」
        // 含商品的容器：只有「小模块」才当推荐位
        if (n > 24 || (totalProd > 3 && n >= totalProd) || (totalProd >= 10 && n > totalProd * 0.6)) { sec = null; break; }
        sec = node; break;
      }
      if (sec && sec !== document.body && sec !== document.documentElement) blocked.add(sec);
    });
  } catch (e) { /* 区块识别异常不拦采集 */ }
  return blocked;
};




  /* 通用列表扫描：① 平台 URL 严格形态 → ② 卡片带价 + 产品形URL 兜底（URL 改版/未知形态都能收）；




     品牌馆磁贴（/g/ 结尾）、品牌馆/活动落地页（/p-12345/，真实形态在路径任意位置）和页面自身永远不当商品 */




  function listG() {




    const strict = PRODUCT_URL_RE[CUR_PLATFORM] || PRODUCT_URL_RE.web;




    // 🔴 ID 提取同样不能带 i：小写 n+8字母（nebulizers/notebooks）会被当商品码




    //   noon 真身：码后必须跟 /p/（ZB318AE2088BC9A54E489Z/p/?o=...）——馆码 /g/ 结尾取不到，正好排除




    const idRe = /\/item\/(\d+)|\/dp\/([A-Z0-9]{8,12})|\/gp\/product\/([A-Z0-9]{8,12})|-p-(\d+)|\/([A-Za-z0-9]{4,})\/p(?:\/|\?|$)/;




    // 🔴 商品码提取（noon /<slug>/<码>/p/ 与无 slug 的 /product/<码>/p/ 是同一商品的不同形态）




    const codeOf = (u) => { try { const m = u.pathname.match(/\/([A-Z][A-Z0-9]{5,})\/p(?:\/|$|\?)/); return m ? m[1] : ''; } catch (e) { return ''; } };




    const normPath = (u) => { try { return u.pathname.replace(/\/+$/, ''); } catch (e) { return ''; } };




    // 🔴 2026-10-25 江少 PDP 探针实锤：noon 自身链接有两种形态——带 slug（/pixar-cars.../N26881286A/p/）




    //   和不带 slug（/product/N26881286A/p/?o=...）——只比 pathname 字符串会漏（队列第 1 条就是页面自己）




    const isSelf = (u) => {




      try {




        if (u.hostname !== location.hostname) return false;




        if (normPath(u) === location.pathname.replace(/\/+$/, '')) return true;




        const myCode = codeOf(new URL(location.href));




        return !!myCode && codeOf(u) === myCode;    // 同商品码 → 同一商品（slug 有无不影响）




      } catch (e) { return false; }




    };




    const isLanding = (u) => { try { return LANDING_URL_RE.test(u.pathname); } catch (e) { return false; } };




    const isGallery = (u) => { try { return GALLERY_URL_RE.test(u.pathname); } catch (e) { return false; } };




    // 页内锚点（#ReviewArea 等）：商品 URL 永远不带 hash —— 同站带 hash 的一律不是商品链接




    // （noon PDP 的 #ReviewArea 锚点 pathname 是站点根，比 pathname 会漏，直接按 hash 一刀切）




    const isAnchor = (u) => { try { return !!u.hash; } catch (e) { return false; } };




    // noon 商品 URL 带 ?o=<token> 跟踪参数（真实形态 ?o=xxx&store=STEBU6，o 常不是唯一参数）：存库前剥掉 o




    const cleanUrl = (u) => { try { const x = new URL(u); if (x.searchParams.has('o')) { x.searchParams.delete('o'); if (![...x.searchParams.keys()].length) x.search = ''; } return x.toString(); } catch (e) { return u; } };




    const collect = (re, requirePrice, requireProductish) => {




      const out = [];




      const seen = new Set();




      // 🔴 2026-10-25 江少「这三条都不是一个店铺，为什么把其他店铺的链接都采集过来」：




      //   noon 落地页（/p-535289/）是营销聚合页——主题模块 + Sponsored/You might also like/




      //   Related 等推荐模块的商品 URL 全是标准形态（/<slug>/<码>/p/），第一档严格收集全收，




      //   导致跨店铺/跨类目商品混进队列。 noon 推荐区块标题是全站固定英文文案，按**区块标题




      //   文本**排除（不猜 DOM 选择器）：命中黑名单的区块整片不收。排除型过滤——误杀只少采，不错采。




      const blocked = collectBlockedSections();

      // 🔴 2026-11-07 江少「单条商品链接扫描采集出一堆乱链接」根治：
      //   当前页面本身就是商品详情页(PDP)时，只保留 URL 自身的商品码，
      //   排除「相似推荐/You might also like/Related」等一切非自身商品链接（与 1688 list() 同口径）。
      const pageCode = (() => { try { const mm = location.href.match(idRe); return mm ? (mm.slice(1).find(Boolean) || '') : ''; } catch (e) { return ''; } })();




      const inBlocked = (card) => { for (const b of blocked) { try { if (b !== card && b.contains(card)) return true; } catch (e) { /* 跨文档节点忽略 */ } } return false; };




      document.querySelectorAll('a[href]').forEach(a => {




        const href = a.href || '';




        if (!re.test(href)) return;




        let u; try { u = new URL(href); } catch (e) { return; }




        if (u.hostname !== location.hostname) return;




        if ((!pageCode && isSelf(u)) || isLanding(u) || isGallery(u) || isAnchor(u)) return;   // 页面自身(含无slug形态) / 品牌馆落地页 / 品牌馆磁贴 / 页内锚点 → 不是商品




        if (requireProductish && !PRODUCTISH_URL_RE.test(u.pathname)) return;  // 兜底档：URL 得长得像商品页（挡类目页）




        const idm = href.match(idRe);




        // ID 兜底：严格形态没中 → 取路径末段当 ID（去噪，保唯一）




        const id = idm ? (idm.slice(1).find(Boolean) || '')




          : (u.pathname.replace(/\/+$/, '').split('/').pop() || u.pathname).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);




        if (!id || seen.has(id)) return;
        if (pageCode && id !== pageCode) return;   // 🔴 当前是商品详情页 → 只采自身，排除相似推荐/相关商品等一切非自身链接




        const card = a.closest('[class*="product"],[class*="item"],[class*="card"],[class*="grid"],li,article') || a;
        // 🔧 2026-11-08 江少：Noon 是 React 卡片，主图/价格 常不在 card 容器内（在 <a> 的兄弟/父级瓦片），
        // 原只查 card 取不到 → 主图/价格空白。拓宽到 <a> 及其两级父节点兜底，1688 本就命中 card 不受影响。
        // 🔴 2026-11-08 19:1x 回归修复：绝不能把「列表容器」当卡片。a.parentElement 若是 grid/list，
        // priceOfCard→txt(容器) 会取整页文本，256 条商品 O(n²) 直接拖死扫描（症状：链接一条都扫不出）。
        // 因此上探最多 2 级，且只接受「像单张卡片」的容器（直接子元素 ≤ 8），否则立刻停。
        // 🔴 2026-11-08 20:0x 修正上探守卫（江少：图价还是取不到）：
        //   noon 一张商品卡里常有「图片链接 + 标题链接」两个 <a> 指向同一商品，
        //   旧守卫「商品链接 > 1 就停」→ 一进父节点立刻 break → 永远只在 <a> 里找图/价 → 图价全空。
        //   改为「不同商品链接 > 2 才停」（列表容器才有多商品），并允许上探 3 层。
        const _tileEls = [card, a];
        {
          let _el = a;
          for (let _i = 0; _i < 3 && _el && _el.parentElement; _i++) {
            _el = _el.parentElement;
            if (_el === document.body || _el === document.documentElement) break;
            if (_el.children && _el.children.length > 24) break;          // 明显是列表/网格容器
            let _n = 0, _dup = 0;
            for (const _x of _el.querySelectorAll('a[href]')) {
              const _h = _x.href || '';
              if (!re.test(_h)) continue;                                  // 只数「商品链接」
              _n++; if (_h === href) _dup++;
              if (_n > 2) break;
            }
            if (_n > 2) break;                                             // ≥3 个商品 = 列表，不是单卡
            _tileEls.push(_el);
            if (_dup && _el.querySelector('img')) break;                    // 已拿到本商品自己的图 → 够用即止
          }
        }






        if (inBlocked(card) || inBlocked(a)) return;   // 推荐位区块商品不当本页商品（江少 2026-10-25 跨店铺混入）




        // 主图三路：卡内 <img>（srcset/懒加载属性）→ 卡内 <picture><source srcset> → 卡片/子div 背景图




        // 🔴 2026-11-09 江少「全店扫描主图/价格又全没了」：Noon 新版商品卡改成 4 张轮播真图，
        //    且**每个真图前都插一张 media-placeholder.svg 占位图**（真 Chrome 实测单卡 8 个 img）。
        //    card.querySelector('img') 永远取到占位图 → pickImg 按 BAD_IMG 拒绝；
        //    旧兜底又对「img 数 > 3」的容器整组 continue → 真图永远拿不到 → 整页 0 主图。
        //    修：先在本商品盒 [data-qa=plp-product-box] 内遍历全部 img 取第一个有效图，
        //    再按商品码精确校验 pnsku 路径；兜底的 img 数上限由 3 放宽到 60（层级守卫仍在）。
        const _box = a.closest('[data-qa="plp-product-box"]') || null;
        let img = null;
        {
          const _imgs = _box ? _box.querySelectorAll('img') : [];
          for (const _i of _imgs) { if (pickImg(_i)) { img = _i; break; } }
          if (!img && /^[A-Z][A-Z0-9]{5,}$/.test(id)) {
            for (const _i of _imgs) {
              const _s = String(_i.getAttribute('src') || '');
              if (_s.indexOf('/pnsku/' + id + '/') >= 0 && pickImg(_i)) { img = _i; break; }
            }
          }
        }
        if (!img) img = card.querySelector('img');
        if (!pickImg(img)) { for (const _e of _tileEls) { if (_e === card) continue; try { const _is = _e.querySelectorAll('img'); if (_is.length > 60) continue; for (const _i of _is) { if (pickImg(_i)) { img = _i; break; } } if (pickImg(img)) break; } catch (err) {} } }




        const picSrc = card.querySelector('picture source[srcset], picture source[data-srcset]');




        const picUrl = picSrc ? (picSrc.getAttribute('srcset') || picSrc.getAttribute('data-srcset') || '').split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean).pop() : '';




        let mainImg = pickImg(img) || (picUrl ? absUrl(picUrl).split('?')[0] : '') || bgOf(card) || bgOf(a) || ((a.parentElement && a.parentElement.querySelectorAll('img').length <= 3) ? bgOf(a.parentElement) : '') || _tileEls.map(_e => { try { return bgOf(_e); } catch (e) { return ''; } }).find(Boolean) || '';
        // 🔴 2026-11-08 20:0x noon 懒加载兜底：真实图常在 <picture><source srcset> 里（可能不在 card 内），
        //   上面只查了 card 的 picture；这里再按瓦片范围查一遍，仍取最大那一档。
        if (!mainImg) {
          for (const _e of _tileEls) {
            try {
              const _ps = _e.querySelector('picture source[srcset], picture source[data-srcset]');
              if (!_ps) continue;
              const _u = (_ps.getAttribute('srcset') || _ps.getAttribute('data-srcset') || '')
                .split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean).pop();
              if (_u) { mainImg = absUrl(_u).split('?')[0]; break; }
            } catch (e) {}
          }
        }




        const title = (a.getAttribute('title') || clean(a.textContent) || (img && img.alt) || '').trim();




        const ctxt = txt(card) || '';




        // 🔴 2026-11-09 Noon 新版价格：货币符号由 CSS/字体渲染（DOM 文本里只剩不可见私用区字符），
        //    现价是整数（99 / 82 / 31）→ CUR_PREFIX_RE 要货币前缀、BARE_PRICE_RE 要两位小数，
        //    两条都命中不了，价格恒空。真 Chrome 实测现价叶子 span._sellingPrice_* 文本就是数字，
        //    父容器 [data-qa=plp-product-box-price] 会把「现价31+原价39+20% Off」粘成 313920% Off
        //    → 必须优先取 sellingPrice 叶子，且作用域锁死在**单个商品盒**内，防列表容器错配。
        let pm = null;
        if (CUR_PLATFORM === 'noon') {
          const _scopes = (_box ? [_box] : []).concat(_tileEls.filter(_e => _e !== card));
          for (const _sc of _scopes) {
            if (!_sc || _sc === document.body || _sc.querySelectorAll('*').length > 400) continue;
            if (_sc.querySelectorAll('[data-qa="plp-product-box"]').length > 1) continue;  // 列表容器，跳过
            const _sp = _sc.querySelector('[class*="sellingPrice"],[class*="SellingPrice"]')
              || _sc.querySelector('[data-qa="plp-product-box-price"]')
              || _sc.querySelector('[class*="price"],[class*="Price"]');
            if (!_sp) continue;
            const _t = joinSplitPrice(priceTextOf(_sp) || '');
            const _m = _t.match(/(\d{1,6}(?:[.,]\d{1,2})?)/);
            if (!_m) continue;
            const _n = parseFloat(_m[1].replace(/,/g, ''));
            if (_n > 0 && _n < 100000) { pm = [_t, _m[1]]; break; }
          }
        }
        if (!pm) pm = priceOfCard(card);
        if (!pm) pm = priceFromTile(card);
        if (!pm) { for (const _e of _tileEls) { if (_e === card) continue; try { if ((txt(_e) || '').length > 400) continue; pm = priceOfCard(_e) || priceFromTile(_e); if (pm) break; } catch (err) {} } }




        if (requirePrice && !pm) return;          // 兜底档：卡片没价 → 不是商品卡




        const curM = ctxt.match(/AED|SAR|USD|US\$|\$|£|€|¥|￥|د\.?إ|د|DH/i);




        const cur = curM ? (/aed|د|dh/i.test(curM[0]) ? 'AED' : /sar/i.test(curM[0]) ? 'SAR' : /usd|us\$|\$/i.test(curM[0]) ? 'USD' : /£/.test(curM[0]) ? 'GBP' : /€/.test(curM[0]) ? 'EUR' : 'CNY') : (PLAT_CUR[CUR_PLATFORM] || 'USD');




        seen.add(id);




        // 严格命中平台商品 URL 时，即使 Noon 的 React 卡片把标题/图片渲染在链接的兄弟节点、
        // 或选择器暂时拿不到卡片内容，也必须保留商品链接交给详情页解析补齐。
        // 旧门槛要求 title/price/img 至少一个非空，导致普查能命中 50 条商品 URL，
        // 但 listG 返回 0（Noon 列表卡片结构改版/虚拟列表下会出现）。
        if (title || pm || img || !requirePrice) {




          out.push({




            offerId: id,




            title: title || '(无标题)',




            url: cleanUrl(href),




            image: mainImg,




            price: pm ? pm[1].replace(/,/g, '') : '',




            priceMax: '',




            currency: cur,




          });




        }




      });




      return out;




    };




    // ① 严格 URL 形态（noon N/M/W 大写码 /p/ 码、速卖通 /item/、亚马逊 /dp/、shein -p-）




    let rows = collect(strict, false, false);




    // ② 兜底：同站链接里找「卡片带价 + URL 长得像商品页」的（落地页/类目页已排除）




    if (!rows.length) rows = collect(/^https?:/i, true, true);




    return rows.slice(0, 500);




  }




  // 🔴 2026-10-25 江少 PDP 探针实锤：noon PDP 的语言切换器（العربية = 阿拉伯语）class 命中




  //   option/swatch → 被当 SKU 收进来（队列"很多乱码"的真凶）——语言链接一律排除




  const LANG_SWITCH_RE = /^(العربية|English|中文|繁體|Français|Deutsch|Italiano|Español|Português|Nederlands|Polski|Svenska|Türkçe|Русский|Українська|日本語|한국어|हिन्दी|اردو|فارسی|বাংলা|ภาษาไทย|Tiếng Việt|Bahasa Indonesia|Melayu|Cymraeg|Gaeilge|Norsk|Dansk|Suomi|Čeština|Magyar|Română|Ελληνικά|עברית)$/i;




  const isLangSwitch = (el) => {




    const t = clean(el.textContent || '');




    if (LANG_SWITCH_RE.test(t)) return true;




    const href = (el.getAttribute && el.getAttribute('href')) || '';




    if (/[?&]lang=|\/lang\/|locale=|#lang/i.test(href)) return true;   // 语言切换链接特征




    return false;




  };




  /* 通用详情：JSON-LD → meta → DOM 多路取标题/价/图；swatch/按钮取规格值+图 */





  function detailG() {




    const d = { title: '', price: '', priceMax: '', images: [], skus: [], sku_combos: [], sku_images: {}, attrs: {}, category: '', currency: PLAT_CUR[CUR_PLATFORM] || 'USD', captcha: false };




    // 标题




    d.title = clean(((document.querySelector('h1') || {}).textContent) || '')




      || ((document.querySelector('meta[property="og:title"]') || {}).content || '').trim();




    if (!d.title) d.title = clean(document.title.split(/[|—-]/)[0]);




    // ① JSON-LD（跨境站常带 Product 结构化数据）




    const ld = [];




    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {




      try { const j = JSON.parse(s.textContent); (Array.isArray(j) ? j : [j]).forEach(x => ld.push(x)); } catch (e) {}




    });




    const prod = ld.find(x => x && String(x['@type'] || '').includes('Product'));




    if (prod) {




      if (!d.title && prod.name) d.title = String(prod.name);




      const off = prod.offers ? (Array.isArray(prod.offers) ? prod.offers[0] : prod.offers) : {};




      if (off.price && +off.price > 0) d.price = String(off.price);




      if (off.priceCurrency) d.currency = off.priceCurrency;




      if (Array.isArray(prod.image)) d.images = prod.image.slice(0, 12);




      else if (prod.image) d.images = [String(prod.image)];




    }




    // 🔵 2026-11-09 隔离：亚马逊详情专用逻辑迁到 src/amazon.js（window.__amzApi.fill(d)）；
    //   通用采集序章 + 中间段（og:image / 兜底价 / 通用规格）仍走本函数，保持原亚马逊路径执行顺序。
    if (CUR_PLATFORM === 'amazon') {
      if (window.__amzApi && typeof window.__amzApi.fill === 'function') {
        window.__amzApi.fill(d);
      } else {
        // 🔴 2026-11-09 江少「亚马逊批量价格/尺寸/类目全不对」：旧插件（或未重载）
        //   缺 amazon.js 时这里静默跳过，通用 1688/noon 的 detailG 会把亚马逊页面
        //   「Product summary presents…」无障碍提示当标题、把页面噪声数字 9/6 当价格入库。
        //   缺专用链路必须 fail-closed：打 gate 让引擎标失败重采，绝不静默落垃圾。
        d.gate = true; d.gateWhy = 'amz-api-missing';
        d.title = ''; d.price = '';
      }
      // 最终标题守卫：不管专用链路有没有跑到，都不许把页面无障碍提示/裸站点名当商品标题。
      // 🔴 2026-11-10 23:1x：旧版这里「命中提示语就再去读 #productTitle」——可半截页里
      //   #productTitle 自己就是那句提示语，等于把垃圾又抄了一遍，守卫形同虚设。必须复检结果。
      const _AMZ_JUNK_RE = /^(Product summary presents|About this item\b|Amazon\.[a-z.]+$)/i;
      if (_AMZ_JUNK_RE.test(String(d.title || '').trim())) {
        const _t = document.querySelector('#productTitle');
        const _t2 = _t ? clean(_t.textContent || '') : '';
        if (_t2 && !_AMZ_JUNK_RE.test(_t2)) {
          d.title = _t2;
        } else {
          // 复检仍是提示语（或压根拿不到）→ 判半截页，交引擎重取；绝不带着垃圾标题往下走
          d.title = ''; d.gate = true; d.gateWhy = 'pdp-incomplete';
        }
      } else if (!String(d.title || '').trim()) {
        // 亚马逊标题为空 = 页面主体没渲染：同样按半截页处理（入库空标题无意义）
        d.gate = true; d.gateWhy = 'pdp-incomplete';
      }
    }




    // ② meta 价
    // 🔴 2026-11-09：亚马逊页面不跑 1688/noon 的通用 meta 价兜底（实测把噪声数字 9/6 当价），
    //   亚马逊只认 PDP 应付价（amazonFill）或列表卡片价（engine 队列）；采不到就留空，宁缺毋假。




    if (CUR_PLATFORM !== 'amazon' && !hasP(d.price)) {




      const m1 = document.querySelector('meta[property="product:price:amount"],meta[itemprop="price"],meta[name="twitter:data1"]');




      if (m1 && m1.content && hasP(m1.content)) d.price = num(m1.content);




    }




    // ③ DOM 价（复用 priceTextOf：兼容「$13」+「.99」拆分展示）
    // 🔴 2026-11-09：同上，亚马逊禁用通用 DOM 文本价兜底。




    if (CUR_PLATFORM !== 'amazon' && !hasP(d.price)) {




      for (const e of document.querySelectorAll('[class*="price"],[class*="Price"],[id*="price"],[data-testid*="price"]')) {




        const t = priceTextOf(e);




        const mm = t.match(/(?:AED|SAR|USD|US\$|\$|£|€|¥|￥)\s*([\d,]+(?:\.\d{1,2})?)/i) || t.match(/^([\d,]+\.\d{2})$/);




        if (mm && +mm[1].replace(/,/g, '') > 0) {




          d.price = mm[1].replace(/,/g, '');




          const c = t.match(/AED|SAR|USD|US\$|\$|£|€|¥|￥/i);




          if (c) d.currency = /aed/i.test(c[0]) ? 'AED' : /sar/i.test(c[0]) ? 'SAR' : /usd|us\$|\$/i.test(c[0]) ? 'USD' : /£/.test(c[0]) ? 'GBP' : /€/.test(c[0]) ? 'EUR' : d.currency;




          break;




        }




      }




    }




    // 主图：og:image + 商品区图




    const og = document.querySelector('meta[property="og:image"]');




    if (og && og.content) d.images.unshift(absUrl(og.content));




    if (!d.images.length) {




      const main = document.querySelector('#landingImage, [class*="gallery"] img, [class*="product"] img[src], img[class*="product"], img[alt*="image" i]');




      const mu = main ? (pickImg(main) || '') : '';




      if (mu) d.images.push(absUrl(mu));




    }




    // 🆕 2026-10-26 江少「sku规格信息和图片没有同步采集」根治②：noon 主图廊通道。




    //   noon 图床规律：商品图 URL 都走 f.nooncdn.com/p/，且主图廊每张图 URL 内嵌当前




    //   商品 SKU（实证 Z96818D6FE68AC3224955Z：/p/pzsku/Z96818D6FE68AC3224955Z/45/_/...）。




    //   旧逻辑只靠 og:image + class*=price 式选择器 → 懒加载图廊没滚出来就只有 1 张。




    const _isNoon = /noon\.com$/i.test(location.hostname);




    const _pdpSku = _isNoon ? ((location.pathname.match(/\/([A-Za-z0-9]{8,})\/p\/?$/) || [])[1] || '') : '';




    if (_pdpSku) {




      for (const im of document.querySelectorAll('img')) {




        const u = im.currentSrc || im.src || '';




        if (u && u.includes('/p/') && u.includes(_pdpSku) && !/sprite|logo|icon|placeholder/i.test(u)) d.images.push(absUrl(u));




      }




      // srcset 里的高清源也收（懒加载图有时 src 是占位、真图在 srcset）




      for (const im of document.querySelectorAll('img[srcset*="/p/"], img[data-src*="/p/"]')) {




        const ss = im.getAttribute('srcset') || im.getAttribute('data-src') || '';




        for (const part of ss.split(',')) {




          const u = part.trim().split(/\s+/)[0] || '';




          if (u.includes(_pdpSku)) d.images.push(absUrl(u));




        }




      }




    }




    // 去重：noon 同一张图常以带/不带 ?width= 参数重复出现（DB 实证 2 条 URL 实为 1 张图）




    //   → 按「去参数后的 URL」去重，保留先出现的（og:image 带 width=1200 高清版优先）




    d.images = [...new Map(d.images.filter(Boolean).map(u => absUrl(u)).map(u => [u.split('?')[0], u])).values()].slice(0, 12);




    // 规格：颜色/尺码等 swatch / 变体按钮（文本 + 背景图/内嵌 img → sku_images；语言切换器已由 isLangSwitch 排除）




    const skus = []; const sku_images = {};




    // 🔴 2026-10-26 江少「尺码为什么是 Size/SM」根治：noon 尺寸选择器是「容器(含 variant/option/sku 类)




    //   + 内部 S/M/L 按钮」结构。旧逻辑把容器和按钮都抓了 → 容器 textContent 拼成 "Size SML" 假变体，




    //   按钮各自是 S/M/L。修复：只抓**叶子**元素（若自身含同类子元素即视为分组容器，跳过），




    //   这样 "Size SML" 整体消失，只剩真实尺码 S/M/L。




    const SW_SEL = '[class*="swatch"],[class*="variant"],[class*="variation"],[class*="sku"],[class*="option"],[id*="variation"]';




    const swEls = [...document.querySelectorAll(SW_SEL)]




      .filter(el => /^(li|button|a|div|span|label)$/i.test(el.tagName))




      .filter(el => !isLangSwitch(el))




      .filter(el => !el.querySelector(SW_SEL));   // 含同类子元素 = 分组容器（如 variant-size-group），不是真实规格值




    for (const el of swEls) {




      // 🆕 2026-10-26 noon 色卡常是无文字的小图按钮（文字在 aria-label / img.alt）→ 一并取




      const _im0 = el.querySelector('img');




      const t = clean(el.textContent || el.getAttribute('aria-label') || (_im0 && (_im0.alt || _im0.getAttribute('aria-label'))) || '');




      if (!t || t.length > 40) continue;




      if (/sold out|out of stock|加入|购买|select|choose|请选择/i.test(t)) continue;




      if (skus.includes(t)) continue;




      skus.push(t);




      const im = el.querySelector('img');




      const bg = im ? (pickImg(im) || '') : (bgOf(el) || '');




      if (bg) sku_images[t] = bg;




    }




    // 🆕 2026-10-26 noon 变体通道：noon 的颜色/款式卡常是「同 slug 兄弟 SKU 链接」




    //   （/uae-en/<同slug>/<SKU>/p/），每个变体一个独立 PDP。同前缀不同 SKU 的链接 =




    //   变体清单，色卡图就挂在链接内的 img 上。




    //   🔴 2026-10-26 江少「一个规格一个尺寸，鞋子的尺寸都打乱了」根治：旧逻辑把兄弟 SKU 码




    //   push 进 d.skus → 引擎组装出 {规格:'Z9A3…'} 子码规格行（库实证 14 行）。noon 的真实




    //   结构是**每个款式一个独立 PDP**（各自有自己的尺码轴），兄弟码不是本页的规格值。




    //   修复：兄弟码只记进 _noon_sibling_codes 诊断字段，绝不当规格行；要其余款式就把各




    //   兄弟 PDP 各采一次，每次只出它自己的尺码变体。




    if (_pdpSku) {




      const _myPrefix = location.pathname.replace(/\/[^/]+\/p\/?$/, '/');




      const _siblingCodes = [];




      for (const a of document.querySelectorAll('a[href*="/p/"]')) {




        try {




          const pu = new URL(a.href, location.href);




          if (pu.hostname !== location.hostname) continue;




          if (!pu.pathname.startsWith(_myPrefix) || pu.pathname === location.pathname) continue;




          const sib = (pu.pathname.match(/\/([^/]+)\/p\/?$/) || [])[1];




          if (!sib || sib === _pdpSku || !/^[A-Za-z0-9]{8,}$/.test(sib)) continue;




          if (!_siblingCodes.includes(sib)) _siblingCodes.push(sib);




          if (_siblingCodes.length >= 60) break;




        } catch (e) { /* 坏链接跳过 */ }




      }




      d._noon_sibling_codes = _siblingCodes.slice(0, 40);




    }




    d.sku_images = sku_images;




    // 🔴 2026-10-26 江少「一个规格一个尺寸，鞋子的尺寸都打乱了」根治②：




    //   noon 家族商品页同时渲染 尺码按钮 + 款式/颜色卡(文字标签)。旧逻辑两者全进 d.skus




    //   一个扁平列表 → 引擎组装出 {规格:'40'} 尺码行 和 {规格:'0507 broken nails gold'}




    //   款式行 混排（库实证 38 行 = 11 尺码 + 13 款式 + 14 子码）。




    //   修复：noon 页面检测到「纯尺码值 + 非尺码值」混排时，只保留纯尺码值当变体




    //   （本页自己的尺码轴，一个规格一个尺寸）；款式标签移出规格记进诊断字段——




    //   它们是兄弟 PDP 的维度，采各自页面才有真实的款式×尺码对应。




    if (_isNoon && skus.length > 1) {




      // 🔴 2026-10-26 与 ERP 显示端 catalog.html _PURE_SIZE_RE 同口径：补数字前缀 NXL（2XL~10XL/2XS），




      //   旧式 [xX]{0,3}[sSmMlL]{1,3} 不认 '2XL' → 混排页面上 2XL/3XL 会被当款式标签丢掉。




      const _SIZE_LIKE = /^(?:[1-9]\d{0,1}[xX]{1,3}[sSmMlL]|[xX]{0,3}[sSmMlL]{1,3}(?:号)?|均码|加大|加肥|free\s*size|one\s*size|\d{1,3}(?:\.\d+)?(?:\s*(?:[-~–]|to)\s*\d{1,3}(?:\.\d+)?)?)$/i;




      const _sizes = skus.filter(t => _SIZE_LIKE.test(t));




      if (_sizes.length && _sizes.length < skus.length) {




        d._noon_skus_dropped = skus.filter(t => !_SIZE_LIKE.test(t)).slice(0, 30);




        for (const k of Object.keys(sku_images)) if (!_SIZE_LIKE.test(k)) delete sku_images[k];




        skus.length = 0;




        for (const s of _sizes) skus.push(s);




      }




    }




    d.skus = skus.slice(0, 60);




    // 类目：江少 2026-10-25「noon 一比一复制类目」——noon 页面类目路径与官方库同源，




    //   一比一搬过来就能精确匹配，不用猜。五路提取（按可靠性）：




    //   ① JSON-LD BreadcrumbList（item.item 是类目页 URL、item.name 是文本）




    //   ② 面包屑 <a> 的 href 路径（noon 类目页 URL 原样 = _noon_catalog_path，**永远官方英文 slug**，




    //      文本可能被本地化成阿拉伯语，URL 不会——一比一通道的关键）




    //   ③ 面包屑文本（兼容旧链路 matchNisCategoryEn）




    //   ④ __NEXT_DATA__ 深挖 category 字段（noon 是 Next.js）




    //   ⑤ meta 兜底




    const _crumbAnchors = [...document.querySelectorAll(




      '[class*="breadcrumb"] a, [id*="breadcrumb"] a, nav[aria-label*="readcrumb"] a, nav[class*="crumb"] a, [data-qa*="breadcrumb"] a'




    )];




    // ② URL 路径：过滤 locale/品牌馆/商品页段，只留类目 slug 段（江少一比一通道的原料）




    const _pathSegs = [];




    for (const a of _crumbAnchors) {




      try {




        const pu = new URL(a.href).pathname;




        if (/\/(p-\d+|store|g\/)/.test(pu)) continue;                       // 品牌馆/店铺馆/落地页




        if (/\/(?:uae-en|saudi-en|egypt-en|ara|ar|en)\/?$/i.test(pu)) continue;  //  locale 根




        const segs = pu.split('/').filter(s => s && !/^(?:uae-en|saudi-en|egypt-en|ara|ar|en)$/i.test(s));




        // 末段是商品码（/N码/p/）→ 只取商品码之前的类目段




        const pIdx = segs.findIndex(s => /^p\/?$/i.test(s));




        const catSegs = pIdx >= 0 ? segs.slice(0, pIdx) : segs;




        if (catSegs.length >= 2 && !/[A-Z][A-Z0-9]{5,}/.test(catSegs[catSegs.length - 1])) {




          for (const s of catSegs) if (!_pathSegs.includes(s)) _pathSegs.push(s);




        }




      } catch (e) { /* 单条坏链接跳过 */ }




    }




    d._noon_catalog_path = _pathSegs.join('/').slice(0, 200);




    // ① JSON-LD BreadcrumbList




    let _ldCrumbs = [];




    try {




      for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {




        const j = JSON.parse(sc.textContent || 'null');




        const blocks = Array.isArray(j) ? j : (j && j['@graph'] ? j['@graph'] : [j]);




        for (const b of blocks) {




          if (b && b['@type'] === 'BreadcrumbList' && Array.isArray(b.itemListElement)) {




            for (const it of b.itemListElement) {




              const nm = clean((it && it.item && (it.item.name || it.name)) || '');




              const iu = (it && it.item && (typeof it.item === 'string' ? it.item : it.item['@id'])) || '';




              if (nm) _ldCrumbs.push({ name: nm, url: iu });




            }




          }




        }




      }




    } catch (e) { /* JSON-LD 解析失败走下方 */ }




    if (_ldCrumbs.length && !d._noon_catalog_path) {




      // JSON-LD 的 item URL 也是类目页 URL，同样能拼一比一路径




      const _ldSegs = [];




      for (const c of _ldCrumbs) {




        try {




          const pu = new URL(c.url).pathname;




          const segs = pu.split('/').filter(s => s && !/^(?:uae-en|saudi-en|egypt-en|ara|ar|en)$/i.test(s));




          if (segs.length >= 2) for (const s of segs) if (!_ldSegs.includes(s)) _ldSegs.push(s);




        } catch (e) { /* 无 URL 只留文本 */ }




      }




      if (_ldSegs.length) d._noon_catalog_path = _ldSegs.join('/').slice(0, 200);




    }




    // ③ 文本面包屑（JSON-LD 优先，其次 DOM）




    const _domCrumbs = _crumbAnchors.map(a => clean(a.textContent)).filter(Boolean);




    const _ldNames = _ldCrumbs.map(c => c.name).filter(Boolean);




    const crumbNames = _ldNames.length >= _domCrumbs.length ? _ldNames : _domCrumbs;




    d.category = crumbNames.join(' > ').slice(0, 120);




    // ④ __NEXT_DATA__ 深挖（noon Next.js：商品数据里常带 category 对象/路径）




    if (!d._noon_catalog_path) {




      try {




        const nd = document.querySelector('script#__NEXT_DATA__');




        if (nd) {




          const j = JSON.parse(nd.textContent || 'null');




          const found = [];




          const walk = (o, dep) => {




            if (dep > 6 || found.length) return;




            if (o && typeof o === 'object') {




              for (const k of ['categoryPath', 'category_path', 'breadcrumbs', 'categoryUrl', 'category_url', 'catalogPath']) {




                const v = o[k];




                if (typeof v === 'string' && v.includes('/') && v.length > 8) { found.push(v); return; }




              }




              for (const k in o) walk(o[k], dep + 1);




            }




          };




          walk(j, 0);




          if (found[0]) d._noon_catalog_path = found[0].replace(/^\/+|\/+$/g, '').slice(0, 200);




        }




      } catch (e) { /* NEXT_DATA 解析失败不影响 */ }




    }




    // ⑤ meta 兜底




    // 🔴 2026-10-27 根治（江少「加热手套类目变成 generic,usb,heated,...」）：`meta[name="keywords"]`




    //   是**逗号分隔的关键词标签**，根本不是类目字段。旧代码把它当 category 兜底 → 页面没有面包屑




    //   时 d.category 被灌成 "generic,usb,heated,gloves,..."，一路污染 source_category 和落库类目。




    //   只允许真正的类目 meta（product:category / category / itemprop="category"），keywords 一律丢弃。




    if (!d.category) {




      for (const sel of ['meta[property="product:category"]', 'meta[name="category"]', 'meta[itemprop="category"]']) {




        const m = document.querySelector(sel);




        if (m && m.content && !/,/.test(m.content)) { d.category = clean(m.content).slice(0, 120); break; }




      }




    }




    // ── 属性表（英文规格键白名单，noon / 速卖通 / 亚马逊 / Shein 通用）2026-10-27 ──




    //   🔒 江少「noon 一比一复制类目/属性/尺寸重量」：此前 noon 分支只采图片/尺码/类目路径，




    //   d.attrs 从没被填充 → 属性全空、重量尺寸只能落类目估算。这里仿 1688 detail() 的




    //   白名单思路，但改用**英文规格键**适配跨境站：noon 属性表通常渲染为




    //   table / dl / div-键值对（Product Weight / Material / Package Length×Width×Height…）。




    //   只收"真规格"键（含 weight/dimension/material/fabric/…），价格/库存/评分/评价噪声键一律过滤。




    // 🔴 2026-11-12 词边界修复（实证 9 条亚马逊笔记本属性只有 {"Change language":"English"}）：
    //   旧正则裸词 `age` 命中了 "langu**age**"（Change language）、`fit` 命中 fitness、`size` 命中 oversized、
    //   `type` 命中 subtype → 亚马逊页面的**导航/语言切换区**被当成商品规格采进 attributes，
    //   真规格反而没进来（键位被垃圾占住）。改用「前后非字母」断言（保留下划线/连字符键如 product_weight）。
    const SPEC_KEY_EN = /(?:^|[^a-z])(?:weight|dimension|length|width|height|depth|size|material|fabric|colour|color|capacity|voltage|wattage|power|brand|model|style|type|origin|country|composition|content|diameter|thickness|fit|closure|care|warranty|specification|volume|quantity|units|age|gender|season|waterproof|battery|connectivity|resolution|screen|memory|storage|cores|camera|charging|items?|department|pattern|shape|feature|components)s?(?![a-z])/i;




    const NOT_SPEC_KEY_EN = /price|cost|stock|inventory|quantity left|rating|review|sold|delivery|shipping cost|discount|offer|warranty period|seller|store|location|returns?|free shipping|installment|pay|tax|vat|language|deliver|sign in|sign up|account|cart|basket|wish ?list|add to list|back to top|sponsored|customer service|country\/region/i;




    const isSpecKeyEn = (k) => !!(k && SPEC_KEY_EN.test(k) && !NOT_SPEC_KEY_EN.test(k) && k.length <= 40);




    // 属性表候选容器：table 行 / dl>dt-dd / 键值 div-ul / noon 常见 attribute 区块




    const _attrRows = [




      // 🔴 2026-11-12 容器归属守卫：亚马逊页头/导航里的 <dl>（语言切换 "Change language"、配送国家）
      //   同样命中下面这个裸 dl 选择器，会抢占规格表 → 整条商品属性只剩 {"Change language":"English"}
      //   （实证：9 条笔记本属性全空壳、321 条真属性里混进这个垃圾键）。凡落在 header/nav 的行一律不算规格容器。
      ...[...document.querySelectorAll('table tr, [class*="attribute"] li, [class*="attribute"] div, [class*="Attribute"] li, [class*="specifications"] li, [class*="Specifications"] li, [class*="product-info"] li, [class*="productInfo"] li, [class*="details"] li, [class*="key-value"] li, dl')]
        .filter(el => !el.closest('header, nav, #nav-main, #nav-tools, #nav-hamburger-menu, #navbar, [role="navigation"], .nav-left, .nav-right')),




    ];




    const _pushAttr = (k, v) => {




      k = clean(k); v = clean(v);




      if (!k || !v || k.length > 40 || v.length > 120) return;




      if (!isSpecKeyEn(k)) return;




      if (/^[¥￥$€£AEDSAR]?\s*[\d,]+(?:\.\d+)?\s*(元|USD|AED|SAR)?$/i.test(v)) return;  // 纯价格值




      // 🔴 2026-10-27 根治（江少「重量识别也不对」）：noon 卖家模板**未填写的属性**统一渲染成




      //   占位默认值——实测量到 16 条五花八门商品里 10 条 Product Weight 全是 "20 g"、




      //   11 条 Product Width 全是 "10 cm"（浴巾/夹克/收纳架/玩具真实重量不可能统一 20g）。




      //   旧代码把这些占位值当真实属性采进 attrs → 服务端 autoFillDims 标成 real 真实重量，




      //   又因 20g<0.1kg 被荒谬护栏清空 → 落库类目默认 1kg。**20g→1kg 的跳变根源就是占位值污染**。




      //   ⚠️ 但采集层**不能武断删 20g**：珠宝/手表类真实重量可能就是 20g（护栏豁免保留 0.02kg，




      //   实测 5 条珠宝正确）。采集层无类目信息，无法区分"占位 20g"与"珠宝真实 20g"。




      //   → 这里**保留原值进 attrs**，仅打"可疑占位"标记，交由服务端按类目裁决（见 m1688_weight_placeholder）。




      const _kl = k.toLowerCase(), _vl = v.toLowerCase().replace(/\s+/g, '');




      const _isWtKey = /weight/.test(_kl);




      if (_isWtKey && /^20\s*g(ram)?s?$/.test(_vl)) d.m1688_weight_placeholder = true;  // 20g 是 noon 占位硬默认候选




      if (!d.attrs[k]) { d.attrs[k] = v; }




    };




    for (const el of _attrRows) {




      try {




        const t = clean(el.textContent || '').replace(/\s+/g, ' ');




        // dl 形态：dt + dd 是相邻子元素（不经过 textContent 拼接，防 "k v" 粘连）




        const dt = el.querySelector(':scope > dt'); const dd = el.querySelector(':scope > dd');




        if (dt && dd) { _pushAttr(dt.textContent, dd.textContent); continue; }




        // table 行 / li / div 形态：<td,th> 对 或 "k : v" 单文本




        // 🔴 2026-10-31 治本（江少：链接上写 1500g+，系统却填 0.6kg）：
        //   原写法 querySelectorAll('td,th,span,div,label') 会把**包着键和值的父容器**也当单元格，
        //   cells[0].textContent 直接拼成 "Product Weight381 g" / "ColorMulticolor"（库里
        //   attributes 现状就是这种粘连键），键名被污染 → isSpecKeyEn 认不出 weight →
        //   真实重量完全丢失 → 服务端只能落类目估算 0.6kg。
        //   → table 行取本行 td/th 全文（不拆单元格，防单位丢失）；其余取**叶子节点**（无子元素）。
        const cells = (el.tagName === 'TR')
          ? el.querySelectorAll(':scope > td, :scope > th')
          : Array.prototype.filter.call(el.querySelectorAll('td,th,span,div,label'), (n) => !n.querySelector('td,th,span,div,label'));




        if (cells.length >= 2) {




          const k = clean(cells[0].textContent); const v = clean(cells[1].textContent);




          if (k && v && k !== v) { _pushAttr(k, v); continue; }




        }




        // "Product Weight: 250 g" / "Material: Cotton" 单文本拆




        const mm = t.match(/^(.{1,40}?)\s*[:：]\s*(.{1,120})$/);




        if (mm && mm[1] !== mm[2]) _pushAttr(mm[1], mm[2]);




      } catch (e) { /* 单行异常跳过 */ }




    }




    // JSON-LD / __NEXT_DATA__ 里的属性补充（DOM 属性表没渲染时兜底）




    try {




      if (prod && prod.additionalProperty && Array.isArray(prod.additionalProperty)) {




        for (const ap of prod.additionalProperty) {




          const k = clean(ap && (ap.name || ap.propertyID || '')); const v = clean(ap && (ap.value || ''));




          if (k && v) _pushAttr(k, v);




        }




      }




    } catch (e) { /* JSON-LD 属性补充异常忽略 */ }




    // 🔴 2026-10-31 兜底（江少：链接写 1500g+，我们填 0.6kg 类目默认）：
    //   属性表结构千变万化（有的站不渲染规格表、有的键被吞），只靠 attrs 会整块丢重量 →
    //   服务端无法拿到真值，只能落类目估算。这里按**短行 + 明确单位**扫页面文本兜底，
    //   口径同 1688 detail()：只认 weight/尺寸语境 + 数字单位，长文案里的营销数字不碰。
    if (!d.m1688_weight_raw || !d.m1688_dims_raw) {
      try {
        const _lines = String((document.body && document.body.innerText) || '').split('\n');
        const _n = Math.min(_lines.length, 4000);
        for (let i = 0; i < _n; i++) {
          const l = clean(_lines[i] || '');
          if (!l || l.length > 60) continue;
          if (!d.m1688_weight_raw) {
            const wm = l.match(/(?:product|package|packaging|shipping|parcel|item|gross|net)\s*weight\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|g|grams?|gm|克|千克|公斤)(?![a-zA-Z])/i)
              || l.match(/^weight\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|g|grams?|gm|克|千克|公斤)(?![a-zA-Z])/i);
            if (wm) d.m1688_weight_raw = wm[1] + ' ' + wm[2];
          }
          if (!d.m1688_dims_raw) {
            const dm = l.match(/(?:package|packaging|shipping|parcel|product|item)?\s*(?:dimensions?|size)?\s*[:：]?\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(cm|mm|in|inch|厘米|毫米)?/i);
            if (dm) d.m1688_dims_raw = dm[1] + 'x' + dm[2] + 'x' + dm[3] + ' ' + (dm[4] || '');
          }
          if (d.m1688_weight_raw && d.m1688_dims_raw) break;
        }
        // 扫到的重量回写 attrs 规范键，服务端 autoFillDims 的键表直接命中（不必再依赖原始键名）
        if (d.m1688_weight_raw && !Object.keys(d.attrs).some((k) => /weight|重量|净重|毛重/i.test(k))) {
          d.attrs['Product Weight'] = d.m1688_weight_raw;
        }
        if (d.m1688_dims_raw && !Object.keys(d.attrs).some((k) => /dimension|length|width|height/i.test(k))) {
          const _p = String(d.m1688_dims_raw).match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/);
          if (_p) { d.attrs['Package Length'] = _p[1]; d.attrs['Package Width'] = _p[2]; d.attrs['Package Height'] = _p[3]; }
        }
      } catch (e) { /* 文本兜底异常忽略，不影响主流程 */ }
    }

    // 重量/尺寸：从 attrs 里提炼（单位换算），供 ERP 落 actual_weight_kg / 尺寸




    //   —— 插件只负责"把原料抓进来"，换算校验由服务端 autoFillDims 兜底（宁缺毋滥）。




    for (const k of Object.keys(d.attrs)) {




      const kl = k.toLowerCase(); const v = d.attrs[k];




      if (/weight|warranty/i.test(kl)) { d.m1688_weight_raw = v; break; }




    }




    // 尺寸三边（Package/Shipping/Dimension 键）




    for (const k of Object.keys(d.attrs)) {




      const kl = k.toLowerCase();




      if (/(package|shipping|parcel|gross|packing)?\s*(dimension|length|width|height|size)/.test(kl)) {




        const mm = String(d.attrs[k]).match(/([\d.]+)\s*[x×*]\s*([\d.]+)(?:\s*[x×*]\s*([\d.]+))?\s*(cm|mm|in|inch|米|厘米|毫米)?/i);




        if (mm) { d.m1688_dims_raw = String(d.attrs[k]); break; }




      }




    }




    // 风控识别（各站通用）




    const bodyHead = (document.body && document.body.innerText || '').slice(0, 300);




    if (/robot|captcha|verify you are|are you a human|unusual traffic|access denied|验证码|安全验证/i.test(document.title + ' ' + bodyHead)) d.captcha = true;

    // 🔵 2026-11-09 隔离：亚马逊「继续购物」软拦截标记迁到 src/amazon.js（window.__amzApi.gate(d)）
    if (CUR_PLATFORM === 'amazon') {
      if (window.__amzApi && typeof window.__amzApi.gate === 'function') window.__amzApi.gate(d);
    }




    return d;




  }




  /* 通用探针：把页面实况打出来（排障校准用，与 1688 probe 同角色） */




  function probeG() {




    const d = detailG();




    return {




      platform: CUR_PLATFORM,




      url: location.href,




      title: d.title,




      price: d.price, currency: d.currency,




      imageCount: d.images.length,




      images: d.images.slice(0, 5),




      skus: d.skus.slice(0, 20),




      skuImageCount: Object.keys(d.sku_images).length,




      category: d.category,




      // 🆕 2026-10-25 江少「noon 一比一复制类目」：探针直接回传官方类目路径，




      //   跑一次探针就能看到通道抓没抓到（抓到了 → 入库必然精确匹配官方码）




      noon_catalog_path: d._noon_catalog_path || '',




      captcha: d.captcha,




      // 🆕 2026-10-26 原始证据包：抓不到价格/类目/变体时，一眼看出页面真实形态，




      //   不用再猜选择器。只读不改，恒定回传。




      _evidence: {




        // 页面文本里出现的金额（判断页面到底有没有渲染价格）




        aedTexts: ((document.body && document.body.innerText) || '').match(/(?:AED|SAR|USD)\s?[\d,]+(?:\.\d{1,2})?/g)?.slice(0, 6) || [],




        // 整文本就是金额的叶子节点（= 真价格标签的候选，附类名供写选择器）




        priceLeafNodes: [...document.querySelectorAll('div,span,strong,b,p')].filter(e => !e.children.length && /^(?:AED|SAR|USD|\$)\s?[\d,]+(?:\.\d{1,2})?$/.test((e.textContent || '').trim())).slice(0, 5).map(e => `${e.tagName}.${String(e.className).slice(0, 70)}`),




        // JSON-LD 块的 @type（判断 Product/BreadcrumbList 是否存在）




        ldTypes: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { const j = JSON.parse(s.textContent); return (Array.isArray(j) ? j : [j]).map(x => x && x['@type']).join(','); } catch (e) { return '(解析失败)'; } }),




        // 面包屑候选锚（类名含 crumb/bread 的 a，附类名供写选择器）




        crumbAnchors: [...document.querySelectorAll('a')].filter(a => /crumb|bread/i.test(String(a.className))).slice(0, 5).map(a => `${a.tagName}.${String(a.className).slice(0, 70)} -> ${(a.getAttribute('href') || '').slice(0, 60)}`),




        hasNextData: !!document.querySelector('#__NEXT_DATA__'),




        // 同 slug 兄弟 SKU 链接数（noon 变体通道的原料够不够）




        siblingSkuLinks: (() => { const m = location.pathname.match(/\/([^/]+)\/p\/?$/); if (!m) return -1; const pre = location.pathname.replace(/\/[^/]+\/p\/?$/, '/'); let n = 0; for (const a of document.querySelectorAll('a[href*="/p/"]')) { try { const pu = new URL(a.href, location.href); if (pu.hostname === location.hostname && pu.pathname.startsWith(pre) && pu.pathname !== location.pathname) n++; } catch (e) {} } return n; })(),




      },




      ldProduct: !!document.querySelector('script[type="application/ld+json"]'),




      links: document.querySelectorAll('a[href]').length,




    };




  }




  // 🔴 2026-11-09 江少「Noon 扫描出来没有标题/主图/价格」：snapShot() 是 1688 专用实现
  //   （主图只认 alicdn/1688 的 img/ibank URL、价格只认 ¥ 纯数字正则），Noon 详情页调它
  //   必然只回 document.title，image/price 恒为空 → 单条详情链接入队后容器里就是一行空壳。
  //   非 1688 平台改用下面这个通用快照：og:image / document.title 先拿（快、必得），
  //   价格复用各平台已在用的 detailG()。1688 原 snapShot 一字不动。
  function snapShotG() {
    const out = { title: '', image: '', price: '', url: location.href };
    try { out.title = String(document.title || '').replace(/\s+/g, ' ').trim(); } catch (_) {}
    try {
      const og = document.querySelector('meta[property="og:image"], meta[name="og:image"], meta[itemprop="image"], meta[name="twitter:image"]');
      const u = og ? String(og.getAttribute('content') || '').trim() : '';
      if (u && !/\.svg($|\?)/i.test(u)) out.image = u.startsWith('//') ? 'https:' + u : u;
    } catch (_) {}
    try {
      const d = detailG();
      if (d) {
        if (!out.title && d.title) out.title = String(d.title).trim();
        if (!out.image && Array.isArray(d.images) && d.images[0]) out.image = String(d.images[0]);
        if (d.price != null && d.price !== '') out.price = String(d.price);
      }
    } catch (_) {}
    return out;
  }

  window.__c1688 = {




    list, listAcrossScroll, detail, probe, snapShot, diag, dumpAttrTable, deepOffers, deepSkuNames, deepSkuCombos, autoScroll, resources, captured, parseCaptured, offerShape, requestFrameSku, mergeFrameSku, capSku,




    // 亚马逊「本页应有几条」审计（懒查找 window.__amzApi，不依赖两个 content script 的加载先后）。
    //   engine 每页采完拿它跟实采条数对账，采少了当场报出来，不再静默丢货。
    amzPageExpect: () => (window.__amzApi && typeof window.__amzApi.pageExpect === 'function') ? window.__amzApi.pageExpect() : null,

    // 🔴 2026-11-10 亚马逊半截页治本：content script 在 document_start 注入，
    //   但 PDP 商品主体（#productTitle / #landingImage）是异步渲染的，load 事件到了也未必有。
    //   engine 采 detail 前先轮询这个探针，等主体真正出现再取数，避免把 AI 摘要提示当标题、
    //   把半截图集/隐藏占位文案当规格。纯 DOM 只读，不改动页面。
    amzPdpReady: () => {
      const _t = document.querySelector('#productTitle');
      const _li = document.querySelector('#landingImage') || document.querySelector('img[data-a-image-name="landingImage"]');
      const _txt = _t ? String(_t.textContent || '').trim() : '';
      // 🔴 2026-11-10：只判「节点存在」不够——半截页里 #productTitle 里放的是 AI 摘要提示语，
      //   会被当成「已就绪」直接采。这里把「提示语占位」也算未就绪，交给引擎继续等/重取。
      const _junk = /^(Product summary presents|About this item\b|Amazon\.[a-z.]+$)/i.test(_txt);
      const _title = !!_txt && !_junk;
      return { ok: _title && !!_li, title: _title, main: !!_li, gate: _junk ? 'title-placeholder' : '' };
    },




    // 亚马逊变体逐个补全（每规格自己的价 + 自己的图）。异步：engine 侧 await 结果。
    amzFillVariants: (combos) => (window.__amzApi && typeof window.__amzApi.fillVariants === 'function') ? window.__amzApi.fillVariants(combos) : combos,




    // 非 1688 平台：list/detail/probe/diag/snapShot 换成通用链路（放最后覆盖前面的同名键）




    ...(!IS_1688_FAM ? { list: listG, detail: detailG, probe: probeG, diag: diagG, snapShot: snapShotG } : {}),




  };




})();




