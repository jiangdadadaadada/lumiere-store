/* ============================================================
   LUMIÈRE · 采集内容自动优化
   ------------------------------------------------------------
   1688 原始标题是 SEO 关键词堆砌，不能一比一搬进自有商城。
   本模块做三件事（全部本地规则，不增加采集耗时）：
     1. 标题 -> 品牌化短标题 + 自动生成英文名
     2. 描述 -> 基于真实属性生成中英品牌文案（不空着、不照抄）
     3. 属性 -> 映射成商品表单使用的 spec_* 规格键
   ============================================================ */

/* ---------- 品类词典（长词优先） ---------- */
const CATEGORIES = [
  { words: ['飞机杯', '电动杯', '男用自慰杯'], series: '涌浪', en: 'Stroker', cat: 'men',
    line: '包裹感是设计好的，你只需要决定什么时候开始。' },
  { words: ['倒模', '名器', '臀模', '阴臀'], series: '形境', en: 'Mold Stroker', cat: 'men',
    line: '复刻真实的起伏，每一次都像第一次那样具体。' },
  { words: ['震动棒', '按摩棒', 'G点棒', 'AV棒'], series: '云弧', en: 'Vibrator', cat: 'women',
    line: '角度是提前设计好的，不用在黑暗里反复寻找位置。' },
  { words: ['跳蛋', '遥控蛋'], series: '星跳', en: 'Vibrating Egg', cat: 'women',
    line: '小到可以忘记它的存在，震动一来又想起它。' },
  { words: ['按摩器', '按摩仪'], series: '私语', en: 'Massager', cat: 'women',
    line: '把注意力交还给身体，剩下的交给节奏。' },
  { words: ['润滑液', '润滑油', '润滑'], series: '丝滑', en: 'Lubricant', cat: 'health',
    line: '水润不黏腻，薄薄一层就够，事后一冲即净。' },
  { words: ['延时环', '锁精环', '震动环'], series: '恒久', en: 'Vibrating Ring', cat: 'men',
    line: '戴上去就不必再分心，把时间留给两个人的节奏。' },
  { words: ['后庭', '肛塞', '拉珠'], series: '秘境', en: 'Anal Plug', cat: 'women',
    line: '从轻到重循序渐进，陌生的感觉也可以很安心。' },
  { words: ['乳夹', '乳头夹'], series: '微颤', en: 'Nipple Clamp', cat: 'couples',
    line: '一点点压力，把敏感放大成清晰的感知。' },
  { words: ['按摩油', '精油', '按摩膏'], series: '暖屿', en: 'Massage Oil', cat: 'health',
    line: '温热顺着指尖推开，紧绷的地方慢慢松下来。' },
  { words: ['清洗剂', '清洁液', '玩具清洁'], series: '净隅', en: 'Toy Cleaner', cat: 'health',
    line: '喷上、擦掉、冲净，三步之后就可以安心收好。' },
  { words: ['收纳袋', '收纳盒', '绒布袋'], series: '藏匣', en: 'Storage Pouch', cat: 'health',
    line: '外观低调，放在抽屉里看不出里面是什么。' }
];
/* 通用商品（非成人品类，测试与杂货采集用） */
const GENERAL_CATEGORIES = [
  { words: ['便携蓝牙音箱', '蓝牙音箱', '音箱', '音响', '低音炮'], series: '声隅', en: 'Bluetooth Speaker', cat: 'health',
    line: '声音是随身带的，音量不大，但够把一整天撑起来。' },
  { words: ['蓝牙耳机', '无线耳机', '耳机'], series: '静界', en: 'Headphones', cat: 'health',
    line: '戴上之后，世界就只剩下你和正在听的东西。' },
  { words: ['手机壳', '保护壳'], series: '形铠', en: 'Phone Case', cat: 'health',
    line: '薄薄一层，该挡的都挡住了，手感还在。' },
  { words: ['充电宝', '移动电源'], series: '恒电', en: 'Power Bank', cat: 'health',
    line: '出门不用再算电量，放在包里就是底气。' }
];

const DEFAULT_CATEGORY = {
  words: [], series: '私语', en: 'Intimate Essential', cat: 'women',
  line: '为私密时刻而设计，细节都藏在手感里。'
};

/* ---------- 卖点词典 ---------- */
const FEATURES = [
  { w: '多频震动', en: 'Multi-Frequency Vibration' }, { w: '多档变频', en: 'Multi-Speed' },
  { w: '多档', en: 'Multi-Speed' }, { w: '变频', en: 'Variable Speed' },
  { w: '无线遥控', en: 'Wireless Remote' }, { w: '遥控', en: 'Remote Control' },
  { w: 'APP控制', en: 'App Control' }, { w: '手机控制', en: 'App Control' },
  { w: '电动', en: 'Electric' }, { w: '自动', en: 'Automatic' },
  { w: '静音', en: 'Whisper-Quiet' }, { w: '低噪', en: 'Low-Noise' },
  { w: '防水', en: 'Waterproof' }, { w: '全身防水', en: 'Fully Waterproof' },
  { w: '充电', en: 'Rechargeable' }, { w: 'USB', en: 'USB Rechargeable' },
  { w: '磁吸', en: 'Magnetic Charging' }, { w: '加热', en: 'Warming' },
  { w: '加温', en: 'Warming' }, { w: '伸缩', en: 'Thrusting' },
  { w: '旋转', en: 'Rotating' }, { w: '吮吸', en: 'Suction' },
  { w: '脉冲', en: 'Pulsing' }, { w: '气压', en: 'Air Pulse' },
  { w: '男用', en: 'For Him' }, { w: '女用', en: 'For Her' },
  { w: '情侣', en: 'For Couples' }, { w: '双人', en: 'For Two' },
  { w: '硅胶', en: 'Silicone' }, { w: 'TPE', en: 'TPE' },
  { w: '软胶', en: 'Soft-Touch' }, { w: '亲肤', en: 'Skin-Safe' }
];

/* ---------- 1688 SEO 垃圾词（一律剔除） ---------- */
const NOISE = [
  /商品库存高?稳定/g, /库存高?稳定/g, /库存充足/g, /现货批发/g, /现货/g,
  /\d+\s*小时揽收率?\s*\d*%?/g, /揽收率\s*\d*%?/g, /发货速度\d*/g,
  /复购率\s*\d*%?/g, /回头客\d*/g, /买过的店/g, /老顾客多/g, /销量\d*/g,
  /一件代发/g, /厂家直销/g, /源头工厂/g, /工厂直供/g, /跨境专供/g, /跨境/g,
  /外贸出口/g, /批发价/g, /批发/g, /代发/g, /分销/g, /招代理/g, /加盟/g,
  /OEM/gi, /ODM/gi, /定制/g, /加工/g, /贴牌/g,
  /正品保障/g, /七天无理由/g, /全国联保/g, /量大从优/g, /支持混批/g,
  /包邮/g, /特价/g, /促销/g, /优惠/g, /买一送一/g, /赠品/g, /秒杀/g,
  /爆款/g, /热销/g, /热卖/g, /霸屏/g, /网红/g, /同款/g,
  /新款/g, /升级款/g, /第\d代/g, /20\d{2}新款/g, /20\d{2}/g,
  /成人情趣用品/g, /情趣用品/g, /成人用品/g, /性用品/g,
  /阿里巴巴/g, /1688/g, /淘宝/g, /天猫/g, /京东/g
];

/* ---------- 属性键 -> 表单字段 ---------- */
const SPEC_MAP = [
  [/^(全长|长度|长)$/, 'spec_length'], [/^(直径|外径)$/, 'spec_diameter'],
  [/^(最大直径|最粗|最大外径)$/, 'spec_maxdiameter'], [/^高度$/, 'spec_height'],
  [/^宽度$/, 'spec_width'], [/^容量|容积$/, 'spec_volume'],
  [/^颜色|色系$/, 'spec_color'], [/^线长$/, 'spec_cablelength'],
  [/^件数|数量$/, 'spec_count'], [/^开口尺寸|开口$/, 'spec_opening'],
  [/^款式|型号|版本$/, 'spec_version'], [/^(包装尺寸|礼盒尺寸|外箱尺寸)$/, 'spec_packsize'],
  [/^(净重|重量|产品重量|毛重)$/, 'spec_netweight']
];
/* 「尺寸明细」只放尺寸/重量/容量这类量值 + 颜色款式（SKU 要用）。
   材质、产地、功能、振动模式、加热、包装方式等属于商品属性，走专用字段或直接丢弃，
   不能混进尺寸明细，否则前台规格表会显示一堆与尺寸无关的条目。 */
const SPEC_DIM_KEYS = ['spec_length','spec_diameter','spec_maxdiameter','spec_height','spec_width',
  'spec_volume','spec_color','spec_cablelength','spec_count','spec_opening','spec_version',
  'spec_packsize','spec_netweight','spec_weight'];
const CORE_MAP = [
  [/^(全长|长度|尺寸|主体尺寸|产品尺寸|规格|包装尺寸)$/, 'size'],
  [/噪音|声音|分贝/, 'noise'], [/防水/, 'waterproof'],
  [/供电|充电|电源|电池|连接方式/, 'battery'],
  [/(主体材质|产品材质|材质|材料)/, 'material']
];

/* ---------- 占位图 URL 特征 ---------- */
const BAD_IMG = /(placeholder|noimage|no-image|noimg|defaultimg|default-image|blank|loading|crossborder|kuajing|kjd|跨境|占位|默认图)/i;

function normText(s) {
  return String(s == null ? '' : s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[【】\[\]（）(){}「」『』]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function attrsToPairs(attrs) {
  if (!attrs) return [];
  if (Array.isArray(attrs)) {
    return attrs.filter(x => x && x.k).map(x => ({ k: String(x.k).trim(), v: String(x.v == null ? '' : x.v).trim() }))
      .filter(x => x.k && x.v);
  }
  if (typeof attrs === 'object') {
    return Object.keys(attrs).filter(k => attrs[k] != null && String(attrs[k]).trim())
      .map(k => ({ k: k.trim(), v: String(attrs[k]).trim() }));
  }
  return [];
}

function detectCategory(raw) {
  for (const c of CATEGORIES.concat(GENERAL_CATEGORIES))
    for (const w of c.words) if (raw.indexOf(w) >= 0) return c;
  return DEFAULT_CATEGORY;
}

function detectFeatures(raw) {
  const out = [], seen = new Set();
  /* 词典按长度降序，避免「多档」抢在「多档变频」前面 */
  const sorted = FEATURES.slice().sort((a, b) => b.w.length - a.w.length);
  for (const f of sorted) {
    if (raw.indexOf(f.w) >= 0 && !seen.has(f.en)) { out.push(f); seen.add(f.en); }
    if (out.length >= 3) break;
  }
  return out;
}

/* ---------- 1. 标题优化 ---------- */
function optimizeTitle(raw, attrs) {
  const src = normText(raw);
  let clean = src;
  for (const re of NOISE) clean = clean.replace(re, ' ');
  clean = clean.replace(/[，,。;；:：!！?？|｜\\\/~～*#+]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const cat = detectCategory(src);
  const feats = detectFeatures(clean);
  const featZh = feats.map(f => f.w).join('').slice(0, 10);
  const featEn = feats.map(f => f.en).slice(0, 2).join(' ');

  /* 品牌名 · 卖点 + 品类；卖点为空时退化为「系列 · 品类」 */
  const coreWord = cat.words[0] || '甄选好物';
  const name = (featZh ? featZh : '') + coreWord;
  const short = cat.series + ' · ' + name;
  const nameEn = ((featEn ? featEn + ' ' : '') + cat.en).replace(/\s+/g, ' ').trim();
  const seriesEn = { '涌浪': 'Surge', '形境': 'Form', '云弧': 'Arc', '星跳': 'Pulse',
    '私语': 'Whisper', '丝滑': 'Silk', '恒久': 'Endure', '秘境': 'Secret',
    '微颤': 'Tremor', '暖屿': 'Warmth', '净隅': 'Pure', '藏匣': 'Vault',
    '声隅': 'Echo', '静界': 'Silence', '形铠': 'Armor', '恒电': 'Power' }[cat.series] || 'LUMIÈRE';

  const pairs = attrsToPairs(attrs);
  const material = (pairs.find(p => /^材质|^材料/.test(p.k)) || {}).v || '';
  const size = sanitizeSize((pairs.find(p => /^(全长|长度|尺寸|包装尺寸|规格)$/.test(p.k)) || {}).v);

  return {
    name: short.slice(0, 40),
    nameEn: (seriesEn + ' · ' + nameEn).replace(/\s+/g, ' ').trim(),
    category: cat.cat,
    _cat: cat,
    _feats: feats,
    _material: material,
    _size: size,
    _rawClean: clean
  };
}

/* ---------- 2. 描述优化 ---------- */
/* 清掉「SKU 规格枚举」句子：斜纹震动棒(粉色)、斜纹震动棒(黑色)… / 单只装（黑色）￥12.5、…
   这些是规格表内容，不是卖点，抄进描述会让文案像爬虫抓的。 */
function stripSkuEnum(src) {
  const s = String(src || '');
  const sents = s.split(/(?<=[。；！!?？])/);
  const kept = [];
  for (const sent of sents) {
    const parts = sent.split(/([、,，])/);
    const items = [];
    let dropped = 0, total = 0;
    for (let i = 0; i < parts.length; i += 2) {
      const t = String(parts[i] || '').trim();
      if (!t) continue;
      total++;
      const skuish = /[（(][^）)]{1,8}[）)]/.test(t) || /[￥¥]\s*\d/.test(t);
      if (skuish) { dropped++; continue; }
      items.push(t);
    }
    if (total >= 2 && dropped >= 2) {
      if (items.length) kept.push(items.join('、') + '。');
      continue;
    }
    kept.push(sent);
  }
  return kept.join('');
}

/* 「规格/尺寸」字段的值常常是 SKU 枚举（斜纹震动棒(粉色)、…），不是尺寸，必须剔除 */
function sanitizeSize(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/[（(][^）)]{1,8}[）)]/.test(s) || /[、]/.test(s)) return '';
  if (!/\d/.test(s)) return '';
  return s;
}

function optimizeDesc(raw, attrs, titleInfo, originalDesc) {
  const t = titleInfo || optimizeTitle(raw, attrs);
  const cat = t._cat || DEFAULT_CATEGORY;
  const pairs = attrsToPairs(attrs);
  const rawDesc = normText(stripSkuEnum(originalDesc))
    .replace(NOISE[0], ' ').replace(/正品保障|七天无理由|全国联保|厂家直销|量大从优/g, ' ')
    .replace(/^[，。、；;：:\s]+/, '')
    .replace(/\s+/g, ' ').trim();

  const mat = t._material || (pairs.find(p => /^材质|^材料/.test(p.k)) || {}).v || '';
  const size = sanitizeSize(t._size || (pairs.find(p => /^(全长|长度|尺寸|规格)$/.test(p.k)) || {}).v);
  const featurePhrase = t._feats.slice(0, 2).map(f => f.w).join(' + ');

  /* 中文：材质 -> 卖点 -> 尺寸 -> 品牌句。没有的信息不硬编。 */
  const bits = [];
  bits.push('这款' + (cat.words[0] || '单品') + (mat ? '采用' + mat : '选用亲肤材质'));
  if (featurePhrase) bits.push(featurePhrase + '，力度随你掌控');
  if (size) bits.push(size);
  bits.push(cat.line);
  if (rawDesc && rawDesc.length > 8 && !/^[a-zA-Z0-9\s]+$/.test(rawDesc)) {
    bits.push('细节：' + rawDesc.slice(0, 120));
  }
  bits.push('私密包装，中性面单发货。');
  const desc = bits.join('。').replace(/。。/g, '。').slice(0, 400);

  /* 英文 */
  const enBits = [];
  const fEn = t._feats.slice(0, 2).map(f => f.en).join(' + ');
  enBits.push('A ' + cat.en.toLowerCase() + (mat ? ' made from ' + mat : ' with a skin-safe finish'));
  if (fEn) enBits.push(fEn + ' for a rhythm you set yourself');
  if (size) enBits.push(size);
  enBits.push('Discreet packaging, neutral billing.');
  const descEn = (enBits.join('. ').replace(/\s*\.\s*\.+$/, '.').replace(/\s+/g, ' ').trim()).replace(/\.$/, '') + '.';

  return { desc, descEn: descEn.slice(0, 500) };
}

/* ---------- 3. 规格属性映射 ---------- */
/* ★ 平台/运营类属性不是商品规格：1688 会把「商家代发热度」「48h揽收率」「代发品质达标率」
   「是否进口」「生产企业」「人群」「年龄」这类后台指标一起塞进属性表。
   这些不能进「尺寸明细」，否则前台商品页会显示一堆与商品无关的数字。
   （收口只认 SPEC_MAP 的尺寸量值，其余属性一律不进） */
function normalizeSpecs(attrs) {
  const pairs = attrsToPairs(attrs);
  const specs = [], core = {}, seen = new Set();
  for (const p of pairs) {
    /* ★ 先筛垃圾项，再进映射：SKU 行「商品名(颜色)=价格」和只剩单位的空值，
       如果先被 SPEC_MAP 命中就会直接写进 specs，后面再过滤就来不及了。 */
    const kRaw = String(p.k || ''), vRaw = String(p.v || '').trim();
    if (!vRaw) continue;
    if (/[（(][^）)]{1,12}[）)]/.test(kRaw) && /^[\d.,\s¥￥元个]+$/.test(vRaw)) continue;
    if (/^[\s（）()]*[a-zA-Z]{0,4}[\s（）()]*$/.test(vRaw)) continue;
    if (/^[\s/\\\-—–_·.、，,]+$/.test(vRaw)) continue;

    for (const [re, key] of SPEC_MAP) {
      if (re.test(p.k)) {
        if (!seen.has(key)) { specs.push({ k: key, v: p.v.slice(0, 80) }); seen.add(key); }
        break;
      }
    }
    let isCore = false;
    for (const [re, key] of CORE_MAP) {
      if (re.test(p.k)) {
        isCore = true;
        /* 「规格」字段常是 SKU 枚举，不是尺寸；别让它占掉真正的 主体尺寸 */
        if (key === 'size' && !sanitizeSize(p.v)) continue;
        if (core[key] == null) core[key] = p.v.slice(0, 80);
      }
    }
    /* ★ 从「规格/颜色」字段里解析 SKU 组合：
       1688 常把所有 SKU 连写成一个值，如
       「小蝌蚪跳蛋（紫色）袋装、小蝌蚪跳蛋（玫红）袋装、小蝌蚪跳蛋（紫色）带盒…」
       拆出颜色（紫色/玫红）和款式（袋装/带盒），用 / 分隔，后台即可自动生成 SKU 选项行。 */
    if (/^(规格|颜色|色系|款式|型号|版本|规格选项|sku)/i.test(p.k)) {
      const combo = extractSkuOptions(p.v);
      if (combo.color.length > 1) setSpec(specs, 'spec_color', combo.color.join(' / '));
      if (combo.version.length > 1) setSpec(specs, 'spec_version', combo.version.join(' / '));
    }

    /* ★ 过滤 SKU 行被误读成属性：1688 规格区每行「商品名(颜色) ¥价格 库存N个」
       被属性表解析成 key=「…(粉色)」value=「199」这类垃圾，不是规格属性，丢掉。 */
    const kClean = String(p.k || ''), vClean = String(p.v || '');
    const looksSkuRow = /[（(][^）)]{1,12}[）)]/.test(kClean) && /^[\d.,\s¥￥元个]+$/.test(vClean);
    const valueIsPrice = /^\d{1,3}(\.\d+)?$/.test(vClean.trim()) && /[（(][^）)]*[色款尺寸装]/.test(kClean);
    if (looksSkuRow || valueIsPrice) continue;
    /* 空值 /(g) / (ml) 这类只有单位的残缺值，不是有效规格 */
    if (/^[\s（）()]*[a-zA-Z]{0,4}[\s（）()]*$/.test(vClean.trim())) continue;

    /* 不再做「像规格就收」的兜底：1688 属性表里混着振动模式/加热功能/伸缩功能/功能/包装，
       这些是商品属性不是尺寸，收进来只会把尺寸明细搞脏。只认 SPEC_MAP 明确映射的量值。 */
  }
  /* 出口统一收口：只留尺寸量值 + 颜色款式，且丢掉被拆坏的残值
     （如「)、相见欢 粉色（带」这种从详情文案里截出来的碎片）。 */
  const cleanSpecs = specs.filter(s => {
    if (!SPEC_DIM_KEYS.includes(s.k)) return false;
    const v = String(s.v || '').trim();
    if (!v) return false;
    if (/^[）)，,、;；:：/\\·'"\s]/.test(v)) return false;   /* 以标点开头：被截断的碎片 */
    if (/）、|。$/.test(v)) return false;                    /* 半句拼接的残值 */
    if (v.length > 48) return false;
    return true;
  });
  /* core.size 常被「规格」字段的 SKU 枚举（斜纹震动棒(粉色)、…）污染，清洗掉 */
  if (core.size) { const cs = sanitizeSize(core.size); if (cs) core.size = cs; else delete core.size; }
  return { specs: cleanSpecs, core };
}

/* 设置/覆盖某条 spec（SKU 拆出的多值优先覆盖单值） */
function setSpec(specs, k, v) {
  const hit = specs.find(x => x.k === k);
  if (hit) hit.v = v;
  else specs.push({ k, v });
}

/* 从连写的规格文本里抽取颜色与款式候选 */
const SKU_COLORS = ['黑','白','红','粉','紫','玫红','象牙白','雾粉','蓝','绿','金','银','灰','棕','橘','橙','黄','透明','肤色','马卡龙','薄荷绿','樱花粉','星空黑','魅惑紫','烈焰红'];
const SKU_VERSIONS = ['袋装','带盒','礼盒装','盒装','简装','精装','标准版','升级版','旗舰版','尊享版','plus','pro','mini'];
function extractSkuOptions(text) {
  const s = String(text || '');
  const version = [];
  for (const v of SKU_VERSIONS) if (s.indexOf(v) >= 0 && version.indexOf(v) < 0) version.push(v);

  /* ★ 已经用 / 、 , 分隔好的清单（如「粉色 / 黑色 / 蓝色 / 玫红 / 紫色」）
     直接按段取原名，不要再用单字词典去拆 —— 那样「粉色」会被截成「粉」，
     「象牙白」被截成「白」，后台生成的 SKU 规格名就和 1688 原页对不上了。 */
  const segs = s.split(/[/、,，;；|]+/).map(x => x.trim()).filter(Boolean);
  if (segs.length >= 2 && segs.length <= 12 && segs.every(x => x.length <= 24 && !/^\d+$/.test(x))) {
    /* ★ 规格名原样保留：「斜纹震动棒(粉色)」就输出完整名，不拆成「粉色」。
       1688 的 SKU 选项名本身就是商品名+颜色，拆掉括号等于把规格名改掉了。 */
    const names = [];
    for (const seg of segs) {
      if (/^[¥￥]\s*\d/.test(seg) || /^\d+(\.\d+)?\s*元?$/.test(seg)) continue;   /* 纯价格段丢掉 */
      if (!names.includes(seg)) names.push(seg);
    }
    if (names.length >= 2) {
      const allVersion = names.every(n => SKU_VERSIONS.some(v => n.indexOf(v) >= 0) || /^(装|盒装|袋装|简装|精装|带盒|礼盒)$/.test(n));
      if (allVersion) return { color: [], version: names.slice(0, 8) };
      return { color: names.slice(0, 8), version: [] };
    }
  }

  /* 统一收集所有颜色候选：词典命中 + 括号内的短词，然后一次性去重 */
  const cand = [];
  for (const c of SKU_COLORS) { const i = s.indexOf(c); if (i >= 0) cand.push({ c, i }); }
  const paren = s.match(/[（(]([^）)]{2,6})[）)]/g) || [];
  for (const pa of paren) {
    const w = pa.replace(/[（()）]/g, '').trim();
    if (w && w.length <= 5 && !SKU_VERSIONS.some(v => w.indexOf(v) >= 0)) {
      const i = s.indexOf(pa);
      cand.push({ c: w, i });
    }
  }
  cand.sort((a, b) => b.c.length - a.c.length || a.i - b.i);   /* 长词优先：紫色 先于 紫 */
  const color = [];
  for (const h of cand) {
    if (color.some(x => x.indexOf(h.c) >= 0 || h.c.indexOf(x) >= 0)) continue;   /* 互为子串只留长的 */
    color.push(h.c);
  }
  color.sort((a, b) => s.indexOf(a) - s.indexOf(b));   /* 按文本出现顺序输出 */
  return { color: color.slice(0, 8), version: version.slice(0, 8) };
}

/* ---------- 4. 占位图识别 ---------- */
function isPlaceholderImage(url) {
  if (!url || typeof url !== 'string') return true;
  if (BAD_IMG.test(url)) return true;
  /* 1688 跨境频道的通用占位图：固定文件名 + 极小体积，URL 常带 cbu01 之外的静态域 */
  if (/\/img\/(ibank|bao\/uploaded)\//i.test(url)) return false;
  return false;
}

module.exports = {
  optimizeTitle, optimizeDesc, normalizeSpecs, isPlaceholderImage, attrsToPairs, normText, SPEC_DIM_KEYS
};
