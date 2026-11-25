/* 临时脚本：把调研后的品类结构落成自有商品并上架（一次性，可重复执行） */
const BASE = 'http://127.0.0.1:8080';

/* 参考同行（Lovehoney / Satisfyer / Lelo）的在售品类与规格写法，
   文案与配图均为自写/自动生成，不使用对方图片与原文。 */
const ITEMS = [
  {
    id: 'LUM-W05',
    name: '兔耳系列 · 双刺激振动器',
    nameEn: 'Bunny Duo · Dual-Stimulation Vibrator',
    category: 'women', badge: '新品', price: 469, stock: 36,
    material: '医用级硅胶 + ABS', size: '全长 21 cm · 可插入 12 cm · 周长 11 cm',
    noise: '≤ 45 分贝', waterproof: 'IPX7 全身防水', battery: '磁吸充电 · 续航 90 分钟',
    features: ['兔耳双重刺激', '可弯曲颈部', '10 档震动', '磁吸充电'],
    desc: '可弯曲的颈部顺着体内曲线走，外侧兔耳同步照顾。10 档强度从晨间的轻，到深夜的重。',
    descEn: 'A flexible neck follows your inner curve while the outer bunny ear works in sync. Ten intensities, from a morning-light hum to a late-night rumble.',
    i18n: { en: {"material":"Medical-grade silicone + ABS","size":"Total length 21 cm · Insertable 12 cm · Circumference 11 cm","noise":"≤ 45 dB","waterproof":"IPX7 fully waterproof","battery":"Magnetic charging · 90 min runtime","features":["Dual-stimulation bunny ear","Flexible neck","10 vibration levels","Magnetic charging"]} },
    theme: '#F4E9FB', fg: '#8B5FBF', accent: '#E3CDF5', variant: 1
  },
  {
    id: 'LUM-W06',
    name: '潮汐系列 · 吸吮震动双效',
    nameEn: 'Tidal · Suction & Vibration Duo',
    category: 'women', badge: '主推', price: 559, stock: 28,
    material: '医用级硅胶', size: '高 16 cm · 吸口内径 1.4 cm',
    noise: '≤ 42 分贝', waterproof: 'IPX7 全身防水', battery: 'USB 充电 · 续航 120 分钟',
    features: ['气压脉冲吸吮', '11 档强度', '双马达独立控制', '可水洗'],
    desc: '不靠接触，用气压脉冲推动。双马达独立调节，吸吮与震动可以只用一种，也可以叠在一起。',
    descEn: 'Pressure pulses instead of contact. Two independent motors — use suction alone, vibration alone, or both stacked.',
    i18n: { en: {"material":"Medical-grade silicone","size":"Height 16 cm · Nozzle Ø 1.4 cm","noise":"≤ 42 dB","waterproof":"IPX7 fully waterproof","battery":"USB charging · 120 min runtime","features":["Pressure-wave suction","11 intensity levels","Dual independent motors","Water washable"]} },
    theme: '#E7F2FA', fg: '#4A7FA8', accent: '#C6DFF0', variant: 2
  },
  {
    id: 'LUM-M05',
    name: '磐石系列 · 前列腺按摩器',
    nameEn: 'Bedrock · Prostate Massager',
    category: 'men', badge: '', price: 699, stock: 22,
    material: '医用级硅胶', size: '可插入 11 cm · 最粗处 3.4 cm',
    noise: '≤ 40 分贝', waterproof: 'IPX7 全身防水', battery: 'USB 充电 · 续航 150 分钟',
    features: ['双马达', '无线遥控', '人体工学弧度', '静音设计'],
    desc: '按人体工学的弧度弯好，进入角度不需要反复调整。底座留出外部接触面，内外同时。',
    descEn: 'Shaped to the angle you actually need, so there is no readjusting. The base leaves an external contact point for dual stimulation.',
    i18n: { en: {"material":"Medical-grade silicone","size":"Insertable 11 cm · Max Ø 3.4 cm","noise":"≤ 40 dB","waterproof":"IPX7 fully waterproof","battery":"USB charging · 150 min runtime","features":["Dual motors","Wireless remote","Ergonomic curve","Quiet design"]} },
    theme: '#EDEFF7', fg: '#4B5680', accent: '#D2D8EA', variant: 3
  },
  {
    id: 'LUM-M06',
    name: '暖石系列 · 加温飞机杯',
    nameEn: 'Warmstone · Heated Stroker',
    category: 'men', badge: '新品', price: 529, stock: 30,
    material: 'TPE 内胆 + ABS 外壳', size: '全长 24 cm · 内腔 18 cm',
    noise: '≤ 48 分贝', waterproof: '内胆可拆洗', battery: 'USB 充电 · 续航 80 分钟',
    features: ['40°C 恒温加热', '11 档震动', '可拆洗内胆', '可调吸力'],
    desc: '内壁恒温到接近体温，11 档震动叠加可调吸力。内胆可拆下单独清洗。',
    descEn: 'The sleeve warms to near body temperature, with eleven vibration levels and adjustable suction. The inner sleeve detaches for washing.',
    i18n: { en: {"material":"TPE sleeve + ABS shell","size":"Total length 24 cm · Canal 18 cm","noise":"≤ 48 dB","waterproof":"Removable washable sleeve","battery":"USB charging · 80 min runtime","features":["40°C warming","11 vibration levels","Removable sleeve","Adjustable suction"]} },
    theme: '#FBEEE6', fg: '#B5714C', accent: '#F0D6C4', variant: 4
  },
  {
    id: 'LUM-H03',
    name: '净润系列 · 水基润滑剂 250ml',
    nameEn: 'Slide · Water-Based Lubricant 250 ml',
    category: 'health', badge: '', price: 99, stock: 150,
    material: '水基配方 · 无甘油', size: '容量 250 ml',
    noise: '—', waterproof: '—', battery: '—',
    features: ['水基易清洗', '不黏腻', '可与硅胶玩具同用', '250 ml 大瓶'],
    desc: '水基配方，与硅胶玩具安全同用，清水即可洗净。大瓶装放在床头柜，不用省。',
    descEn: 'Water-based and silicone-safe, rinses clean with water. The big bottle sits by the bed, so you stop rationing it.',
    i18n: { en: {"material":"Water-based · Glycerin-free","size":"250 ml","noise":"—","waterproof":"—","battery":"—","features":["Water-based, rinses clean","Non-sticky","Silicone-toy safe","250 ml bottle"]} },
    theme: '#EAF4EE', fg: '#4E8B6A', accent: '#CBE4D6', variant: 5
  }
];

(async () => {
  const existing = await fetch(BASE + '/api/products').then(r => r.json());
  const have = new Set((existing.products || []).map(p => p.id));
  for (const it of ITEMS) {
    if (have.has(it.id)) { console.log('跳过（已存在）', it.id); continue; }
    const r = await fetch(BASE + '/api/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(it)
    }).then(x => x.json());
    console.log(r.error ? `✗ ${it.id} ${r.error}` : `✓ ${it.id} ${it.name} ¥${it.price}`);
  }
  const after = await fetch(BASE + '/api/products').then(r => r.json());
  console.log('\n当前商品总数:', after.total);
})();
