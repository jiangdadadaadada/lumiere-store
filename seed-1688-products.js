/* 一次性脚本：把「山东挚诺情趣用品有限公司」（zhinuochaopin.1688.com）采集的商品，
   清洗成自有品牌 SKU 并上架。可重复执行（已存在则跳过）。
   说明：
   - 规格参数来自 1688 商品详情页「商品属性 / 包装信息」，为供应商申报值，未做二次加工
   - 零售价为批发价 × 约 15 倍后取整，用于覆盖头程、平台佣金、退货与广告
   - 名称/文案为自写，不使用供应商品牌名与主图（其主图带中文促销文字，不适合全球站点）
*/
const BASE = process.env.LUMIERE_BASE || 'http://127.0.0.1:8080';

/* 来源留档：offerId → 1688 商品 */
const ITEMS = [
  {
    id: 'LUM-W07', offerId: '610180740595',
    name: '云弧 · G点静音震动按摩棒',
    nameEn: 'Arc · Quiet G-Spot Vibrator',
    category: 'women', badge: '主推', price: 279, stock: 40,
    material: 'TPE 软胶 + ABS 机身',
    size: '全长 19.1 cm · 最粗 3.3 cm（包装 23 × 8 × 4 cm）',
    noise: '≤ 40 分贝', waterproof: '不可整机浸泡，湿布擦拭', battery: '电池款 · 2 节 AAA',
    features: ['头部 15° 上翘贴合G点', '40 分贝静音', '多档变频', 'TPE 软胶包覆'],
    desc: '头部做了上翘角度，进去之后不用再反复找位置。40 分贝，隔着一道墙就听不见了。软胶包覆的机身握起来不冰手，睡前那十几分钟，安静得只剩呼吸。',
    descEn: 'The head is angled upward, so you stop hunting for the spot. At 40 dB it stays on your side of the wall. The soft-touch body warms in the hand quickly — fifteen quiet minutes, nothing but breathing.',
    i18n: { en: {
      material: 'TPE soft-touch + ABS body',
      size: '19.1 cm length · 3.3 cm max Ø (pack 23 × 8 × 4 cm)',
      noise: '≤ 40 dB', waterproof: 'Not submersible — wipe clean',
      battery: 'Battery powered · 2 × AAA',
      features: ['Angled head for G-spot reach', '40 dB quiet', 'Multi-speed vibration', 'TPE soft-touch body']
    } },
    theme: '#FDEBF1', fg: '#C2557E', accent: '#F6CBDC', variant: 0
  },
  {
    id: 'LUM-W08', offerId: '548308388081',
    name: '迷情兔 · 双头兔子震动棒',
    nameEn: 'Duo Rabbit · Dual-Head Vibrator',
    category: 'women', badge: '热卖', price: 259, stock: 32,
    material: 'TPE',
    size: '全长 17 cm · 直径 3 cm（包装 23.5 × 7 × 4 cm · 120 g）',
    noise: '厂商标称低噪（见包装）', waterproof: '不可整机浸泡，湿布擦拭', battery: 'USB 充电 · 充电款',
    features: ['内外双头同步', '兔耳外部刺激', 'USB 充电', '电池款 / 充电款可选'],
    desc: '两个头，一个节奏。里面的头顶着，外面的兔耳跟着走，快慢是你自己调的。充电款充满能撑一整晚，用完拔掉，第二天还在。',
    descEn: 'Two heads, one rhythm — the inner shaft presses while the outer ear keeps pace, and the tempo is yours to set. The rechargeable version lasts the night and is still going the next day.',
    i18n: { en: {
      material: 'TPE',
      size: '17 cm length · 3 cm Ø (pack 23.5 × 7 × 4 cm · 120 g)',
      noise: 'Low-noise per manufacturer (see packaging)',
      waterproof: 'Not submersible — wipe clean',
      battery: 'USB rechargeable',
      features: ['Inner + outer heads in sync', 'Rabbit-ear external stimulation', 'USB charging', 'Battery or rechargeable version']
    } },
    theme: '#F3E9FD', fg: '#7A54B8', accent: '#E2D2F8', variant: 1
  },
  {
    id: 'LUM-W09', offerId: '624319948753',
    name: '角斗士 · 无线遥控跳蛋',
    nameEn: 'Gladiator · Remote-Control Egg',
    category: 'women', badge: '', price: 249, stock: 45,
    material: '硅胶',
    size: '3.5 × 9.2 cm（包装 13.2 × 8.5 × 3.8 cm · 80 g）',
    noise: '低噪（厂商标称见包装）', waterproof: '不可整机浸泡，湿布擦拭', battery: '电池款 · 机身按键 + 无线遥控',
    features: ['无线遥控', '机身按键双控', '硅胶亲肤表面', '粉色 / 薄荷绿双色'],
    desc: '遥控器交到他手里，节奏就不再由你决定。80 克，轻到忘了它在。适合那些不想说话、只想被带着走的晚上。',
    descEn: 'Hand him the remote and the tempo stops being yours. At 80 g you forget it is there — for the nights when you would rather be led than talk.',
    i18n: { en: {
      material: 'Silicone',
      size: '3.5 × 9.2 cm (pack 13.2 × 8.5 × 3.8 cm · 80 g)',
      noise: 'Low-noise per manufacturer (see packaging)',
      waterproof: 'Not submersible — wipe clean',
      battery: 'Battery powered · body button + wireless remote',
      features: ['Wireless remote', 'Dual control: body button + remote', 'Silicone surface', 'Pink / mint green']
    } },
    theme: '#E8F3F5', fg: '#3F7B85', accent: '#C9E4E8', variant: 2
  },
  {
    id: 'LUM-M07', offerId: '742371916763',
    name: '形 · 阴臀倒模名器',
    nameEn: 'Form · Hip Mold Stroker',
    category: 'men', badge: '', price: 189, stock: 30,
    material: '硅胶',
    size: '包装 18 × 13 × 7 cm · 净重 390 g',
    noise: '—（无源手动）', waterproof: '内腔可翻洗', battery: '—（手动）',
    features: ['一体成型硅胶', '内腔分段纹理', '可翻洗内腔', '390 g 实重手感'],
    desc: '一体成型，拿在手里有实打实的重量，不是那种一捏就塌的轻货。内腔纹理分两段，冲水就能翻出来洗，晾干再收。',
    descEn: 'One piece, with real weight in the hand instead of the hollow give of cheap moulds. The canal runs in two textures, flips inside out under the tap, and dries before you put it away.',
    i18n: { en: {
      material: 'Silicone',
      size: 'Pack 18 × 13 × 7 cm · 390 g net',
      noise: '— (manual, no motor)', waterproof: 'Invertible, rinse-clean canal',
      battery: '— (manual)',
      features: ['One-piece silicone', 'Two-section canal texture', 'Invertible for cleaning', '390 g solid weight']
    } },
    theme: '#EEF1F8', fg: '#4C5A85', accent: '#D5DBEC', variant: 3
  },
  {
    id: 'LUM-M08', offerId: '713106220500',
    name: '火舞 · 3D 立体臀型名器',
    nameEn: 'Ember · 3D Hip Stroker',
    category: 'men', badge: '新品', price: 309, stock: 24,
    material: '硅胶',
    size: '包装 20 × 20 × 10 cm · 净重 1040 g',
    noise: '—（无源手动）', waterproof: '可整只水洗', battery: '—（手动）',
    features: ['1 kg 实心倒模', '3D 立体臀型', '硅胶亲肤表面', '可整只水洗'],
    desc: '一公斤出头，压在桌面上不会滑走，也不用一只手按着。3D 立体臀型，触感比平面倒模实在得多。用完直接拿到水龙头下冲。',
    descEn: 'Just over a kilo, so it stays where you put it and you keep both hands free. The sculpted 3D hip reads far more like the real thing than a flat mould — and it goes straight under the tap afterwards.',
    i18n: { en: {
      material: 'Silicone',
      size: 'Pack 20 × 20 × 10 cm · 1040 g net',
      noise: '— (manual, no motor)', waterproof: 'Fully washable',
      battery: '— (manual)',
      features: ['1 kg solid mould', 'Sculpted 3D hip', 'Silicone surface', 'Washable as a whole']
    } },
    theme: '#FBEFE9', fg: '#B0673F', accent: '#F2D8C8', variant: 4
  },
  {
    id: 'LUM-C03', offerId: '688978775835',
    name: '緋 · 毛绒捆绑七件套',
    nameEn: 'Scarlet · Plush Bondage Set of 7',
    category: 'couples', badge: '主推', price: 219, stock: 26,
    material: 'PU 皮革 + 毛绒内衬',
    size: '套装包装 22 × 16 × 7 cm · 净重 480 g',
    noise: '—', waterproof: '擦拭清洁', battery: '—',
    features: ['七件套：手铐 / 脚铐 / 口球 / 眼罩 / 鞭 / 绳 / 束带', '毛绒内衬不磨肤', '金属扣件', '黑 / 红 / 粉三色'],
    desc: '绒面贴着皮肤，扣子收紧的那一下是整晚的开场。金属件做得很沉，不像是用两次就松的东西。七件，够你们玩很久。',
    descEn: 'Plush against skin, then the click of the buckle — that is where the night starts. The hardware has real weight to it, not the kind that loosens after two uses. Seven pieces will last you a long while.',
    i18n: { en: {
      material: 'PU leather + plush lining',
      size: 'Set pack 22 × 16 × 7 cm · 480 g net',
      noise: '—', waterproof: 'Wipe clean',
      battery: '—',
      features: ['7 pieces: cuffs, ankle cuffs, ball gag, blindfold, flogger, rope, straps', 'Plush lining, no chafing', 'Metal buckles', 'Black / red / pink']
    } },
    theme: '#F7E9EA', fg: '#8E3B47', accent: '#EBCFD2', variant: 5
  },
  {
    id: 'LUM-C04', offerId: '616280048420',
    name: '蝶 · 震动延时环',
    nameEn: 'Butterfly · Vibrating Ring',
    category: 'couples', badge: '', price: 79, stock: 60,
    material: 'TRE 弹性胶',
    size: '环体可拉伸 · 净重 30 g',
    noise: '震动款 · 纽扣电池供电', waterproof: '不可整机浸泡', battery: '纽扣电池',
    features: ['蝶形外贴震动', '弹力环体不勒', '双人同时感受', '轻至 30 g'],
    desc: '环体有弹力，戴上不勒。蝶形那一片贴在外面，震动两个人都收得到。三十克，轻到中途会忘记。',
    descEn: 'The ring stretches to fit without pinching, and the butterfly pad sits where you both feel it. Thirty grams — light enough to forget mid-way.',
    i18n: { en: {
      material: 'TRE elastic gel',
      size: 'Stretch-to-fit ring · 30 g net',
      noise: 'Vibrating · button-cell powered',
      waterproof: 'Not submersible',
      battery: 'Button cell',
      features: ['Butterfly pad with vibration', 'Stretch ring, no pinch', 'Felt by both partners', 'Only 30 g']
    } },
    theme: '#F1EAF9', fg: '#6B4B9E', accent: '#DDD0F2', variant: 0
  },
  {
    id: 'LUM-H04', offerId: '632822466206',
    name: '净润 · 水基润滑剂 50 ml',
    nameEn: 'Slide · Water-Based Lubricant 50 ml',
    category: 'health', badge: '', price: 69, stock: 120,
    material: '水基配方（水、甘油等）',
    size: '容量 50 ml（包装 5.5 × 3.5 × 13.5 cm）',
    noise: '—', waterproof: '—', battery: '—',
    features: ['水基配方', '透明无味', '可与硅胶玩具同用', '50 ml 随身装'],
    desc: '水基，透明，没有味道。和硅胶玩具一起用不会咬胶，事后清水冲一冲就干净。50 ml 塞进包里也占不了地方。',
    descEn: 'Water-based, clear, unscented. It will not degrade silicone toys, and it rinses off with water. Fifty millilitres disappears into a bag.',
    i18n: { en: {
      material: 'Water-based (water, glycerin)',
      size: '50 ml (pack 5.5 × 3.5 × 13.5 cm)',
      noise: '—', waterproof: '—', battery: '—',
      features: ['Water-based formula', 'Clear and unscented', 'Silicone-toy safe', '50 ml travel size']
    } },
    theme: '#EAF4F0', fg: '#3F7F6A', accent: '#CCE6DC', variant: 1
  }
];

(async () => {
  let ok = 0, skip = 0, fail = 0;
  let existing = { products: [] };
  try {
    existing = await fetch(BASE + '/api/products').then(r => r.json());
  } catch (e) {
    console.error('✗ 连不上后端 ' + BASE + '，请先 node server.js');
    process.exit(1);
  }
  const have = new Set((existing.products || []).map(p => p.id));

  for (const it of ITEMS) {
    if (have.has(it.id)) { console.log('跳过（已存在） ' + it.id); skip++; continue; }
    const payload = { ...it };
    delete payload.offerId;
    const r = await fetch(BASE + '/api/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).then(x => x.json());
    if (r.error) { console.log('✗ ' + it.id + ' ' + r.error); fail++; }
    else { console.log('✓ ' + it.id + '  [' + it.category + ']  ' + it.name + '  ¥' + it.price); ok++; }
  }

  const after = await fetch(BASE + '/api/products').then(r => r.json());
  const byCat = {};
  (after.products || []).forEach(p => { byCat[p.category] = (byCat[p.category] || 0) + 1; });
  console.log('\n新增 ' + ok + ' · 跳过 ' + skip + ' · 失败 ' + fail);
  console.log('商品总数 ' + after.total + '  分类分布 ' + JSON.stringify(byCat));
})();
