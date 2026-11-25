/* ============================================================
   LUMIÈRE · 商品数据层
   定位：高端私密健康生活方式。商品图用抽象 SVG 生成，
   专业、非露骨。数据可整体替换为真实 SKU。
   ============================================================ */

/* 抽象艺术商品图：柔色几何，按主题与造型变体生成 */
function makeArt(bg, fg, accent, variant) {
  const shapes = [
    // 柔和弧线
    `<path d="M60 300 Q200 60 340 300" fill="none" stroke="${fg}" stroke-width="26" stroke-linecap="round" opacity="0.9"/>
     <circle cx="200" cy="120" r="34" fill="${accent}"/>`,
    // 层叠圆环
    `<circle cx="200" cy="200" r="110" fill="none" stroke="${fg}" stroke-width="20" opacity="0.85"/>
     <circle cx="200" cy="200" r="60" fill="${accent}"/>`,
    // 波浪
    `<path d="M40 240 Q120 150 200 240 T360 240" fill="none" stroke="${fg}" stroke-width="24" stroke-linecap="round"/>
     <path d="M40 290 Q120 200 200 290 T360 290" fill="none" stroke="${accent}" stroke-width="14" stroke-linecap="round" opacity="0.7"/>`,
    // 竖条光影
    `<rect x="120" y="90" width="52" height="220" rx="26" fill="${fg}" opacity="0.9"/>
     <rect x="200" y="60" width="52" height="250" rx="26" fill="${accent}" opacity="0.8"/>
     <rect x="280" y="120" width="52" height="190" rx="26" fill="${fg}" opacity="0.6"/>`,
    // 椭圆悬浮
    `<ellipse cx="200" cy="220" rx="120" ry="70" fill="${fg}" opacity="0.85"/>
     <ellipse cx="200" cy="170" rx="70" ry="42" fill="${accent}"/>`,
    // 圆点矩阵
    `<g fill="${fg}"><circle cx="140" cy="150" r="26"/><circle cx="220" cy="130" r="26"/><circle cx="270" cy="200" r="26"/><circle cx="180" cy="250" r="26"/></g>
     <circle cx="230" cy="220" r="34" fill="${accent}" opacity="0.9"/>`
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <rect width="400" height="400" fill="${bg}"/>
    <g transform="translate(0,10)">${shapes[variant % shapes.length]}</g>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* 分类 */
const CATEGORIES = [
  { id: 'women',   name: '女性用品', en: 'For Her',    desc: '为自我愉悦而设计，柔软与安全并重', theme: '#F4C0D1' },
  { id: 'men',     name: '男性用品', en: 'For Him',    desc: '贴合人体工学，细节处的用心', theme: '#B5D4F4' },
  { id: 'couples', name: '情侣共悦', en: 'For Two',    desc: '让亲密，成为两个人的语言和游戏', theme: '#CECBF6' },
  { id: 'health',  name: '健康护理', en: 'Wellness',   desc: '从清洁到养护，照顾每一次使用', theme: '#9FE1CB' }
];

/* 分面筛选维度（对齐 Lovehoney 做法：按用户真实决策路径筛选）
   value 为判定函数，label 为 vocab key（自动随 41 种语言翻译） */
const FACETS = [
  {
    id: 'type', label: '类型', group: 'type',
    options: [
      { key: '震动棒',   test: p => /震动棒|振动器|按摩棒|按摩器|AV棒/.test(p.name) && !/吸吮/.test(p.name) },
      { key: '跳蛋',     test: p => /跳蛋/.test(p.name) },
      { key: '吸吮器',   test: p => /吸吮/.test(p.name) },
      { key: '名器',     test: p => /名器|飞机杯|倒模/.test(p.name) },
      { key: '震动环',   test: p => /震动环|延时环|锁精环/.test(p.name) },
      { key: '捆绑',     test: p => /捆绑|SM/i.test(p.name) },
      { key: '润滑清洁', test: p => /润滑|清洁|收纳|按摩膏|按摩油/.test(p.name) }
    ]
  },
  {
    id: 'material', label: '材质', group: 'material',
    options: [
      { key: '医用级硅胶', test: p => /医用级/.test(p.material) },
      { key: '食品级硅胶', test: p => /食品级/.test(p.material) },
      { key: 'TPE 安全材质', test: p => /TPE/.test(p.material) },
      { key: '其他材质', test: p => !/医用级|食品级|TPE/.test(p.material) }
    ]
  },
  {
    id: 'feature', label: '功能', group: 'feature',
    options: [
      { key: '静音设计', test: p => p.features.some(f => /静音/.test(f)) },
      { key: '全身防水', test: p => /IPX7/.test(p.waterproof) || p.features.some(f => /防水/.test(f)) },
      { key: '恒温模式', test: p => p.features.some(f => /恒温/.test(f)) },
      { key: '无线遥控', test: p => p.features.some(f => /遥控/.test(f)) },
      { key: '多档变频', test: p => p.features.some(f => /档/.test(f)) }
    ]
  },
  {
    id: 'price', label: '价格', group: 'price',
    /* 价格区间按当前货币实时换算，避免英文界面出现「¥ 100 以下」 */
    options: [
      { key: '¥ 100 以下', test: p => p.price < 100, render: () => `< ${fmtMoney(100, state.currency)}` },
      { key: '¥ 100 - 300', test: p => p.price >= 100 && p.price < 300, render: () => `${fmtMoney(100, state.currency)} – ${fmtMoney(300, state.currency)}` },
      { key: '¥ 300 - 500', test: p => p.price >= 300 && p.price < 500, render: () => `${fmtMoney(300, state.currency)} – ${fmtMoney(500, state.currency)}` },
      { key: '¥ 500 以上', test: p => p.price >= 500, render: () => `> ${fmtMoney(500, state.currency)}` }
    ]
  }
];

/* 排序方式 */
const SORTS = [
  { id: 'featured', label: '推荐排序' },
  { id: 'price_asc', label: '价格从低到高' },
  { id: 'price_desc', label: '价格从高到低' },
  { id: 'name', label: '名称' }
];

/* 商品。价格为人民币基准，前端按汇率换算展示。 */
const PRODUCTS = [
  {
    "id": "LUM-C04",
    "name": "蝶 · 震动延时环",
    "nameEn": "Butterfly · Vibrating Ring",
    "descEn": "The ring stretches to fit without pinching, and the butterfly pad sits where you both feel it. Thirty grams — light enough to forget mid-way.",
    "category": "couples",
    "badge": "",
    "price": 79,
    "theme": "#F1EAF9",
    "fg": "#6B4B9E",
    "accent": "#DDD0F2",
    "variant": 0,
    "image": "/assets/img/c04.webp",
    "material": "TRE 弹性胶",
    "size": "环体可拉伸 · 净重 30 g",
    "noise": "震动款 · 纽扣电池供电",
    "waterproof": "不可整机浸泡",
    "battery": "纽扣电池",
    "features": [
      "蝶形外贴震动",
      "弹力环体不勒",
      "双人同时感受",
      "轻至 30 g"
    ],
    "desc": "环体有弹力，戴上不勒。蝶形那一片贴在外面，震动两个人都收得到。三十克，轻到中途会忘记。",
    "i18n": {
      "en": {
        "material": "TRE elastic gel",
        "size": "Stretch-to-fit ring · 30 g net",
        "noise": "Vibrating · button-cell powered",
        "waterproof": "Not submersible",
        "battery": "Button cell",
        "features": [
          "Butterfly pad with vibration",
          "Stretch ring, no pinch",
          "Felt by both partners",
          "Only 30 g"
        ]
      }
    },
    "createdAt": "2026-11-18T13:53:13.608Z",
    "updatedAt": "2026-11-19T03:18:39.851Z",
    "detail": "环体是 TRE 弹性胶，能拉伸，戴上不勒，也不会卡在某处压出一圈印子。30 克的净重轻到戴上以后很快就会忘记它的存在，翻身、起身都不觉得身上多了什么。\n\n外侧贴一片蝶形震动片，装在环体外缘，两个人同时能感觉到，不是单边；强度靠纽扣电池供电，一档一档往上加，不需要 App，也不需要另外一只手柄。\n\n可拉伸这一点对双人使用最要紧：松紧自己掌握，松到不勒、紧到不会移位，节奏由你们自己定。使用时无需刻意调整位置，它会待在原处。\n\n整只不可浸泡，用完以湿布擦净、晾干即可。收纳袋一只，放进抽屉或旅行收纳包都不占地方。",
    "detailEn": "The ring is cut from stretchy TRE elastic gel, so it pulls into place without pinching and without leaving a band pressed into the skin. At 30 grams it is light enough that you stop noticing it within a minute, whether you turn over, sit up or shift position.\n\nA butterfly-shaped vibrating pad sits on the outer rim, positioned so that both partners feel the same pulse — the vibration is not one-sided, and nobody has to hold anything in place. Strength steps up through a button-cell, one level at a time, with no app and no separate controller.\n\nStretch-to-fit matters most when you are not using it alone: the tightness is yours to set, loose enough to stay comfortable and firm enough to stay where you put it. It keeps its position without readjusting.\n\nIt cannot be submerged, so wipe it with a damp cloth and let it dry. Light and small, it drops into a storage pouch and into a drawer or a travel kit without taking up room.",
    "pack": "简约浅紫磨砂礼盒，无品牌标识",
    "weight": "净重 30 g",
    "origin": "中国 · 山东",
    "packaging": "震动环 ×1 · 收纳袋 ×1 · 纽扣电池 ×1 · 说明书 ×1",
    "gallery": [
      "/assets/img/c04.webp",
      "/assets/img/c04-2.webp",
      "/assets/img/c04-3.webp"
    ],
    "packEn": "Minimal lilac matte gift box, unbranded",
    "weightEn": "Net weight 30 g",
    "originEn": "China · Shandong",
    "packagingEn": "Vibrating ring ×1 · Storage pouch ×1 · Button cell ×1 · Instruction manual ×1",
    "specs": [
      {
        "k": "spec_opening",
        "v": "环体内径 4.5 cm（可拉伸）",
        "vEn": "Inner Ø 4.5 cm (stretchable)"
      },
      {
        "k": "spec_netweight",
        "v": "净重 30 g",
        "vEn": "Net weight 30 g"
      },
      {
        "k": "spec_material",
        "v": "TRE 弹性胶",
        "vEn": "TRE elastic gel"
      },
      {
        "k": "spec_color",
        "v": "浅紫 / 透明",
        "vEn": "Lilac / Clear"
      }
    ]
  },
  {
    "id": "LUM-C03",
    "name": "緋 · 毛绒捆绑七件套",
    "nameEn": "Scarlet · Plush Bondage Set of 7",
    "descEn": "Plush against skin, then the click of the buckle — that is where the night starts. The hardware has real weight to it, not the kind that loosens after two uses. Seven pieces will last you a long while.",
    "category": "couples",
    "badge": "主推",
    "price": 219,
    "theme": "#F7E9EA",
    "fg": "#8E3B47",
    "accent": "#EBCFD2",
    "variant": 5,
    "image": "/assets/img/c03.webp",
    "material": "PU 皮革 + 毛绒内衬",
    "size": "套装包装 22 × 16 × 7 cm · 净重 480 g",
    "noise": "—",
    "waterproof": "擦拭清洁",
    "battery": "—",
    "features": [
      "七件套：手铐 / 脚铐 / 口球 / 眼罩 / 鞭 / 绳 / 束带",
      "毛绒内衬不磨肤",
      "金属扣件"
    ],
    "desc": "绒面贴着皮肤，扣子收紧的那一下是整晚的开场。金属件做得很沉，不像是用两次就松的东西。七件，够你们玩很久。",
    "i18n": {
      "en": {
        "material": "PU leather + plush lining",
        "size": "Set pack 22 × 16 × 7 cm · 480 g net",
        "noise": "—",
        "waterproof": "Wipe clean",
        "battery": "—",
        "features": [
          "7 pieces: cuffs, ankle cuffs, ball gag, blindfold, flogger, rope, straps",
          "Plush lining, no chafing",
          "Metal buckles"
        ]
      }
    },
    "createdAt": "2026-11-18T13:53:13.605Z",
    "updatedAt": "2026-11-19T02:52:06.174Z",
    "detail": "七件一套：手铐、脚铐、口球、眼罩、鞭、绳、束带。金属扣件是有分量的那种，扣上那一下是明确的\"咔哒\"，不是用两次就松垮的薄片；受力点做了加固，反复使用不会先坏在扣眼上。\n\nPU 皮革外面衬了一层毛绒，贴着皮肤的那一面是软的。长时间戴着不会磨出印子，边缘也做了包边，不刮蹭。束带与手铐、脚铐都可调节松紧，肩宽腿粗的人也能找到合适的档位。\n\n三种配色：黑、红、粉。整套净重 480 克，包装 22 × 16 × 7 厘米，件件有独立位置，收纳袋一装，抽屉里就能找到。\n\n皮面用湿布擦即可，不要长时间泡水；毛绒内衬用软毛刷顺着一个方向清理，晾干后再收。",
    "detailEn": "Seven pieces in one set: wrist cuffs, ankle cuffs, a ball gag, a blindfold, a flogger, a length of rope, and a set of straps. The hardware is deliberately weighted — when a buckle closes, it closes with a definite click, not the thin rattle of something that loosens after a few uses, and the stress points are reinforced so they are not the first thing to fail.\n\nPU leather over a plush lining means the side that touches skin is soft. Nothing chafes and nothing bites, even over a long session, and the edges are bound so they will not scratch. Cuffs and straps all adjust, so the fit works across different wrists, ankles and frames.\n\nThree colourways: black, red and pink. The set weighs 480 grams and ships in a 22 × 16 × 7 cm box, each piece sitting in its own place, with a storage pouch that drops it straight into a drawer.\n\nWipe the leather with a damp cloth and keep it out of standing water; brush the plush lining in one direction and let it dry before putting it away.",
    "pack": "简约暗红磨砂礼盒，无品牌标识",
    "weight": "净重 480 g",
    "origin": "中国 · 山东",
    "packaging": "手铐 ×1 · 脚铐 ×1 · 口球 ×1 · 眼罩 ×1 · 鞭 ×1 · 绳 ×1 · 束带 ×1 · 收纳袋 ×1 · 说明书 ×1",
    "gallery": [
      "/assets/img/c03.webp",
      "/assets/img/c03-2.webp",
      "/assets/img/c03-3.webp",
      "/assets/img/c03-4.webp",
      "/assets/img/c03-5.webp",
      "/assets/img/c03-6.webp"
    ],
    "packEn": "Minimal dark red matte gift box, unbranded",
    "weightEn": "Net weight 480 g",
    "originEn": "China · Shandong",
    "packagingEn": "Handcuffs ×1 · Ankle cuffs ×1 · Oral gag ×1 · Blindfold ×1 · Whip ×1 · Rope ×1 · Harness ×1 · Storage pouch ×1 · Instruction manual ×1",
    "specs": [
      {
        "k": "spec_length",
        "v": "套装长 22 cm",
        "vEn": "Set length 22 cm"
      },
      {
        "k": "spec_height",
        "v": "套装高 16 cm",
        "vEn": "Set height 16 cm"
      },
      {
        "k": "spec_width",
        "v": "套装宽 7 cm",
        "vEn": "Set width 7 cm"
      },
      {
        "k": "spec_count",
        "v": "共 7 件",
        "vEn": "7 pieces"
      },
      {
        "k": "spec_netweight",
        "v": "净重 480 g",
        "vEn": "Net weight 480 g"
      },
      {
        "k": "spec_packsize",
        "v": "礼盒 22 × 16 × 7 cm",
        "vEn": "Gift box 22 × 16 × 7 cm"
      },
      {
        "k": "spec_material",
        "v": "PU 皮革 + 毛绒内衬",
        "vEn": "PU leather + plush lining"
      },
      {
        "k": "spec_color",
        "v": "黑 / 红 / 粉",
        "vEn": "Black / Red / Pink"
      }
    ]
  },
  {
    "id": "LUM-H04",
    "name": "净润 · 水基润滑剂 50 ml",
    "nameEn": "Slide · Water-Based Lubricant 50 ml",
    "descEn": "Water-based, clear, unscented. It will not degrade silicone toys, and it rinses off with water. Fifty millilitres disappears into a bag.",
    "category": "health",
    "badge": "",
    "price": 69,
    "theme": "#EAF4F0",
    "fg": "#3F7F6A",
    "accent": "#CCE6DC",
    "variant": 1,
    "image": "/assets/img/h04.webp",
    "material": "水基配方（水、甘油等）",
    "size": "容量 50 ml（包装 5.5 × 3.5 × 13.5 cm）",
    "noise": "—",
    "waterproof": "—",
    "battery": "—",
    "features": [
      "水基配方",
      "透明无味",
      "可与硅胶玩具同用",
      "50 ml 随身装"
    ],
    "desc": "水基，透明，没有味道。和硅胶玩具一起用不会咬胶，事后清水冲一冲就干净。50 ml 塞进包里也占不了地方。",
    "i18n": {
      "en": {
        "material": "Water-based (water, glycerin)",
        "size": "50 ml (pack 5.5 × 3.5 × 13.5 cm)",
        "noise": "—",
        "waterproof": "—",
        "battery": "—",
        "features": [
          "Water-based formula",
          "Clear and unscented",
          "Silicone-toy safe",
          "50 ml travel size"
        ]
      }
    },
    "createdAt": "2026-11-18T13:52:58.694Z",
    "updatedAt": "2026-11-19T03:18:39.854Z",
    "detail": "水基配方，以水和甘油为主体，挤出来是透明的，没有颜色也没有香精味。气味这件事在亲密场景里比想象中重要——一支带香的东西，会先于其他一切成为房间里的主角。\n\n可与硅胶玩具同用，不会咬胶。硅胶最怕的是油基和部分树脂类配方，用久了表面会发黏、发软；水基不会让胶体起黏，也不会缩短玩具的寿命。\n\n水基需要补涂，几次之后加一点就好，用量比油基省。结束后清水冲一冲就干净，皮肤和床品都不留油印。\n\n50 毫升随身装，包装 5.5 × 3.5 × 13.5 厘米，出差放进洗漱包正好。按压式泵头单手可挤，另一只手空着。",
    "detailEn": "Water-based, built on water and glycerin, and nothing that announces itself. It dispenses clear and carries no fragrance — which matters more than it sounds: in a small room, a scented lube becomes the loudest thing in the space.\n\nIt is safe to use with silicone toys. Silicone is damaged by oil-based and certain resin formulas, which can leave the surface tacky or swollen; a water-based formula leaves the material exactly as it was.\n\nWater-based lubes need a top-up rather than one heavy application, so keep it within reach and add a little between rounds. It rinses away with plain water — no residue on skin, no oil mark left on sheets.\n\nFifty millilitres in a 5.5 × 3.5 × 13.5 cm bottle, small enough to travel with and to sit in a bathroom cabinet. The pump dispenser puts it out one-handed, so the other hand stays free, and the clear bottle lets you see how much is left before you reach for it again.",
    "pack": "简约透明外盒 + 素色纸盒，无品牌标识",
    "weight": "净重 55 g",
    "origin": "中国 · 山东",
    "packaging": "润滑剂 50 ml ×1 · 说明卡 ×1",
    "gallery": [
      "/assets/img/h04.webp",
      "/assets/img/h04-2.webp",
      "/assets/img/h04-3.webp"
    ],
    "packEn": "Minimal clear outer box + plain paper box, unbranded",
    "weightEn": "Net weight 55 g",
    "originEn": "China · Shandong",
    "packagingEn": "Lubricant 50 ml ×1 · Product card ×1",
    "specs": [
      {
        "k": "spec_volume",
        "v": "容量 50 ml",
        "vEn": "Volume 50 ml"
      },
      {
        "k": "spec_length",
        "v": "瓶高 13.5 cm",
        "vEn": "Bottle height 13.5 cm"
      },
      {
        "k": "spec_width",
        "v": "瓶宽 5.5 cm",
        "vEn": "Bottle width 5.5 cm"
      },
      {
        "k": "spec_netweight",
        "v": "净重 55 g",
        "vEn": "Net weight 55 g"
      },
      {
        "k": "spec_packsize",
        "v": "外盒 5.5 × 3.5 × 13.5 cm",
        "vEn": "Outer box 5.5 × 3.5 × 13.5 cm"
      },
      {
        "k": "spec_material",
        "v": "水基配方（水、甘油等）",
        "vEn": "Water-based (water, glycerin)"
      }
    ]
  },
  {
    "id": "LUM-M08",
    "name": "火舞 · 3D 立体臀型名器",
    "nameEn": "Ember · 3D Hip Stroker",
    "descEn": "Just over a kilo, so it stays where you put it and you keep both hands free. The sculpted 3D hip reads far more like the real thing than a flat mould — and it goes straight under the tap afterwards.",
    "category": "men",
    "badge": "新品",
    "price": 309,
    "theme": "#FBEFE9",
    "fg": "#B0673F",
    "accent": "#F2D8C8",
    "variant": 4,
    "image": "/assets/img/m08.webp",
    "material": "硅胶",
    "size": "包装 20 × 20 × 10 cm · 净重 1040 g",
    "noise": "—（无源手动）",
    "waterproof": "可整只水洗",
    "battery": "—（手动）",
    "features": [
      "1 kg 实心倒模",
      "3D 立体臀型",
      "硅胶亲肤表面",
      "可整只水洗"
    ],
    "desc": "一公斤出头，压在桌面上不会滑走，也不用一只手按着。3D 立体臀型，触感比平面倒模实在得多。用完直接拿到水龙头下冲。",
    "i18n": {
      "en": {
        "material": "Silicone",
        "size": "Pack 20 × 20 × 10 cm · 1040 g net",
        "noise": "— (manual, no motor)",
        "waterproof": "Fully washable",
        "battery": "— (manual)",
        "features": [
          "1 kg solid mould",
          "Sculpted 3D hip",
          "Silicone surface",
          "Washable as a whole"
        ]
      }
    },
    "createdAt": "2026-11-18T13:52:58.692Z",
    "updatedAt": "2026-11-19T03:18:39.848Z",
    "detail": "1040 克净重，一公斤出头。放在桌面上不会滑走，也不需要一只手一直按着；两只手空出来这件事，本身就改变了使用方式——节奏由身体带动，而不是由手臂撑着。\n\n3D 立体臀型不是平面上贴一张图，是有弧度、有起伏的真实轮廓，从侧面看有明显的高低差。贴合上去的触感因此比平面模具实在得多，转动时轮廓会跟着身体走。\n\n整只用硅胶，表面亲肤，边缘做了圆润过渡，不刮不硌。没有任何电动部件，纯手动，力度和节奏完全由你自己的腰胯动作决定，房间里只有你制造的声音。\n\n可整只水洗：拿到水管下直接冲即可，不需要拆任何零件，也没有充电口需要保护。包装 20 × 20 × 10 厘米，体积不小，收货前先确认柜子放得下。",
    "detailEn": "1,040 grams — just over a kilo. Set it down and it stays there, which means you are not holding it in place with one hand while you work with the other. Both hands free changes the shape of the whole session.\n\nThe form is genuinely sculpted rather than flat. There is a real rise and fall in the silhouette and a clear difference in height seen from the side, so contact follows a curve instead of a plane, and the outline moves with the body.\n\nThe silicone surface has no hard edges, and every transition is rounded off. There are no electric parts, no battery and no noise — pace and pressure come entirely from your own movement, and the only sound in the room is one you are making.\n\nThe whole piece can be washed under running water, with no parts to remove and no charging contacts to protect. It is a solid object: 20 × 20 × 10 cm is not a small parcel, so check the space it will live in before you order.",
    "pack": "简约暖棕磨砂礼盒，无品牌标识",
    "weight": "净重 1040 g",
    "origin": "中国 · 山东",
    "packaging": "名器 ×1 · 收纳袋 ×1 · 说明书 ×1",
    "gallery": [
      "/assets/img/m08.webp",
      "/assets/img/m08-3.webp",
      "/assets/img/m08-2.webp"
    ],
    "packEn": "Minimal warm brown matte gift box, unbranded",
    "weightEn": "Net weight 1040 g",
    "originEn": "China · Shandong",
    "packagingEn": "Stroker ×1 · Storage pouch ×1 · Instruction manual ×1",
    "specs": [
      {
        "k": "spec_length",
        "v": "全长 20 cm",
        "vEn": "Length 20 cm"
      },
      {
        "k": "spec_height",
        "v": "高 20 cm",
        "vEn": "Height 20 cm"
      },
      {
        "k": "spec_width",
        "v": "宽 10 cm",
        "vEn": "Width 10 cm"
      },
      {
        "k": "spec_netweight",
        "v": "净重 1040 g",
        "vEn": "Net weight 1040 g"
      },
      {
        "k": "spec_packsize",
        "v": "礼盒 20 × 20 × 10 cm",
        "vEn": "Gift box 20 × 20 × 10 cm"
      },
      {
        "k": "spec_material",
        "v": "实心硅胶",
        "vEn": "Solid silicone"
      },
      {
        "k": "spec_color",
        "v": "暖棕肤色",
        "vEn": "Warm tan"
      }
    ]
  },
  {
    "id": "LUM-M07",
    "name": "形 · 阴臀倒模名器",
    "nameEn": "Form · Hip Mold Stroker",
    "descEn": "One piece, with real weight in the hand instead of the hollow give of cheap moulds. The canal runs in two textures, flips inside out under the tap, and dries before you put it away.",
    "category": "men",
    "badge": "",
    "price": 189,
    "theme": "#EEF1F8",
    "fg": "#4C5A85",
    "accent": "#D5DBEC",
    "variant": 3,
    "image": "/assets/img/m07.webp",
    "material": "硅胶",
    "size": "包装 18 × 13 × 7 cm · 净重 390 g",
    "noise": "—（无源手动）",
    "waterproof": "内腔可翻洗",
    "battery": "—（手动）",
    "features": [
      "一体成型硅胶",
      "内腔分段纹理",
      "可翻洗内腔",
      "390 g 实重手感"
    ],
    "desc": "一体成型，拿在手里有实打实的重量，不是那种一捏就塌的轻货。内腔纹理分两段，冲水就能翻出来洗，晾干再收。",
    "i18n": {
      "en": {
        "material": "Silicone",
        "size": "Pack 18 × 13 × 7 cm · 390 g net",
        "noise": "— (manual, no motor)",
        "waterproof": "Invertible, rinse-clean canal",
        "battery": "— (manual)",
        "features": [
          "One-piece silicone",
          "Two-section canal texture",
          "Invertible for cleaning",
          "390 g solid weight"
        ]
      }
    },
    "createdAt": "2026-11-18T13:52:58.689Z",
    "updatedAt": "2026-11-19T03:18:39.845Z",
    "detail": "一体成型的硅胶，没有拼接缝，也没有一捏就塌的轻飘手感。390 克的净重拿在手里是有分量的——那份分量本身就是体验的一部分：它会留在该在的位置上，不会在使用中被挤得变形。\n\n内腔是分段纹理，进出的深浅两段手感不同，走完一段自然换一种刺激。没有电机、没有电池、没有充电这件事要惦记，全部靠你自己的节奏推动。\n\n内腔可以整个翻出来：翻转后用水冲洗、晾干，再折回去。纹理是刻在本体上的，翻洗不会掉屑，也藏不住污垢，洗完擦干就能收起来。\n\n整支不出一点声音。包装 18 × 13 × 7 厘米，随附收纳袋，抽屉里放得下，也便于出门携带。",
    "detailEn": "One continuous piece of silicone, moulded in a single form with no seams to feel. At 390 grams it has real weight in the hand, and that weight is part of how it works — it stays where you put it and never collapses under pressure.\n\nThe canal runs in two sections, and the texture changes partway through, so the experience shifts as you move rather than staying on one note. There is no motor, no battery and no charge to think about. Everything is driven by your own rhythm.\n\nThe canal inverts inside out under the tap. Rinse it, leave it to dry, and fold it back — the texture is moulded into the material itself, so washing takes nothing away and holds nothing back.\n\nNothing inside makes a sound. It packs into 18 × 13 × 7 cm with the storage pouch, easy to find a drawer for and easy to take along.",
    "pack": "简约深灰磨砂礼盒，无品牌标识",
    "weight": "净重 390 g",
    "origin": "中国 · 山东",
    "packaging": "名器 ×1 · 收纳袋 ×1 · 说明书 ×1",
    "gallery": [
      "/assets/img/m07.webp",
      "/assets/img/m07-2.webp",
      "/assets/img/m07-3.webp"
    ],
    "packEn": "Minimal dark grey matte gift box, unbranded",
    "weightEn": "Net weight 390 g",
    "originEn": "China · Shandong",
    "packagingEn": "Stroker ×1 · Storage pouch ×1 · Instruction manual ×1",
    "specs": [
      {
        "k": "spec_length",
        "v": "全长 18 cm",
        "vEn": "Length 18 cm"
      },
      {
        "k": "spec_height",
        "v": "高 13 cm",
        "vEn": "Height 13 cm"
      },
      {
        "k": "spec_width",
        "v": "宽 7 cm",
        "vEn": "Width 7 cm"
      },
      {
        "k": "spec_netweight",
        "v": "净重 390 g",
        "vEn": "Net weight 390 g"
      },
      {
        "k": "spec_packsize",
        "v": "礼盒 18 × 13 × 7 cm",
        "vEn": "Gift box 18 × 13 × 7 cm"
      },
      {
        "k": "spec_material",
        "v": "一体成型硅胶",
        "vEn": "One-piece silicone"
      },
      {
        "k": "spec_opening",
        "v": "内腔可翻洗",
        "vEn": "Invertible, rinse-clean canal"
      }
    ]
  },
  {
    "id": "LUM-W09",
    "name": "角斗士 · 无线遥控跳蛋",
    "nameEn": "Gladiator · Remote-Control Egg",
    "descEn": "Hand him the remote and the tempo stops being yours. At 80 g you forget it is there — for the nights when you would rather be led than talk.",
    "category": "women",
    "badge": "",
    "price": 249,
    "theme": "#E8F3F5",
    "fg": "#3F7B85",
    "accent": "#C9E4E8",
    "variant": 2,
    "image": "/assets/img/w09.webp",
    "material": "硅胶",
    "size": "3.5 × 9.2 cm（包装 13.2 × 8.5 × 3.8 cm · 80 g）",
    "noise": "低噪（厂商标称见包装）",
    "waterproof": "不可整机浸泡，湿布擦拭",
    "battery": "电池款 · 机身按键 + 无线遥控",
    "features": [
      "无线遥控",
      "机身按键双控",
      "硅胶亲肤表面"
    ],
    "desc": "遥控器交到他手里，节奏就不再由你决定。80 克，轻到忘了它在。适合那些不想说话、只想被带着走的晚上。",
    "i18n": {
      "en": {
        "material": "Silicone",
        "size": "3.5 × 9.2 cm (pack 13.2 × 8.5 × 3.8 cm · 80 g)",
        "noise": "Low-noise per manufacturer (see packaging)",
        "waterproof": "Not submersible — wipe clean",
        "battery": "Battery powered · body button + wireless remote",
        "features": [
          "Wireless remote",
          "Dual control: body button + remote",
          "Silicone surface"
        ]
      }
    },
    "createdAt": "2026-11-18T13:52:58.686Z",
    "updatedAt": "2026-11-19T03:18:39.826Z",
    "detail": "这是一枚可以遥控的跳蛋。遥控器交到对方手里，节奏就不再由你决定——什么时候加速、什么时候停下、中途换不换挡，都可以由不在你身边的那个人来定；你只需要待在该待的地方。\n\n机身按键同时保留，所以控制权可以归你，也可以拆给两个人各握一半。80 克的净重很轻，留在体内几乎感觉不到它的存在，起身、走动、坐下都不会有明显异物感。\n\n3.5 × 9.2 厘米的尺寸配硅胶表面，贴肤柔软，走动时也不会硌到某一处。低噪设计，夜里使用不必把声音调大；粉色与薄荷绿两种配色，一只一个也好，成对使用也好。\n\n电池款供电，机身与遥控器各自独立控制。硅胶表面用完以湿布擦拭即可，整只不可浸泡，请勿放进水里清洗。",
    "detailEn": "This is an egg you do not have to hold the reins of. Hand the remote to someone else and the tempo stops belonging to you: when it speeds up, when it stops, whether the mode changes mid-session — all of it can be decided by the person who is not sitting next to you.\n\nThe body button stays on the device as well, so control can sit with one person or be split between two. At 80 grams the egg is light enough to forget, and 3.5 × 9.2 cm in size, so it stays comfortable while you shift, stand or walk across the room.\n\nThe silicone surface sits close to the skin without a hard edge, and the motor is built for low noise — nothing has to be turned up at night. Two colourways, pink and mint green, so a pair can be split or matched.\n\nIt runs on batteries, for both the egg and the remote. Wipe the surface with a damp cloth after use; the unit must not be submerged.",
    "pack": "简约青白磨砂礼盒，无品牌标识",
    "weight": "净重 80 g",
    "origin": "中国 · 山东",
    "packaging": "主机 ×1 · 无线遥控器 ×1 · 收纳袋 ×1 · 电池 ×2 · 说明书 ×1",
    "gallery": [
      "/assets/img/w09.webp",
      "/assets/img/w09-2.webp",
      "/assets/img/w09-3.webp"
    ],
    "packEn": "Minimal teal-and-white matte gift box, unbranded",
    "weightEn": "Net weight 80 g",
    "originEn": "China · Shandong",
    "packagingEn": "Device ×1 · Wireless remote ×1 · Storage pouch ×1 · 2 × batteries · Instruction manual ×1",
    "specs": [
      {
        "k": "spec_length",
        "v": "长 9.2 cm",
        "vEn": "Length 9.2 cm"
      },
      {
        "k": "spec_diameter",
        "v": "直径 3.5 cm",
        "vEn": "Ø 3.5 cm"
      },
      {
        "k": "spec_netweight",
        "v": "净重 80 g",
        "vEn": "Net weight 80 g"
      },
      {
        "k": "spec_packsize",
        "v": "礼盒 13.2 × 8.5 × 3.8 cm",
        "vEn": "Gift box 13.2 × 8.5 × 3.8 cm"
      },
      {
        "k": "spec_material",
        "v": "硅胶",
        "vEn": "Silicone"
      },
      {
        "k": "spec_color",
        "v": "粉色 / 薄荷绿",
        "vEn": "Pink / Mint green"
      },
      {
        "k": "spec_cablelength",
        "v": "遥控无线连接",
        "vEn": "Wireless remote link"
      }
    ]
  },
  {
    "id": "LUM-W08",
    "name": "迷情兔 · 双头兔子震动棒",
    "nameEn": "Duo Rabbit · Dual-Head Vibrator",
    "descEn": "Two heads, one rhythm — the inner shaft presses while the outer ear keeps pace, and the tempo is yours to set. The rechargeable version lasts the night and is still going the next day.",
    "category": "women",
    "badge": "热卖",
    "price": 259,
    "theme": "#F3E9FD",
    "fg": "#7A54B8",
    "accent": "#E2D2F8",
    "variant": 1,
    "image": "/assets/img/w08.webp",
    "material": "TPE",
    "size": "全长 17 cm · 直径 3 cm（包装 23.5 × 7 × 4 cm · 120 g）",
    "noise": "厂商标称低噪（见包装）",
    "waterproof": "不可整机浸泡，湿布擦拭",
    "battery": "USB 充电 · 充电款",
    "features": [
      "内外双头同步",
      "兔耳外部刺激",
      "USB 充电",
      "电池款 / 充电款可选"
    ],
    "desc": "两个头，一个节奏。里面的头顶着，外面的兔耳跟着走，快慢是你自己调的。充电款充满能撑一整晚，用完拔掉，第二天还在。",
    "i18n": {
      "en": {
        "material": "TPE",
        "size": "17 cm length · 3 cm Ø (pack 23.5 × 7 × 4 cm · 120 g)",
        "noise": "Low-noise per manufacturer (see packaging)",
        "waterproof": "Not submersible — wipe clean",
        "battery": "USB rechargeable",
        "features": [
          "Inner + outer heads in sync",
          "Rabbit-ear external stimulation",
          "USB charging",
          "Battery or rechargeable version"
        ]
      }
    },
    "createdAt": "2026-11-18T13:52:58.681Z",
    "updatedAt": "2026-11-19T02:52:06.166Z",
    "detail": "这一支是双头结构：里面的柱体负责向内推进，外侧那对兔耳负责贴住体表。两个头同步震动，不是各震各的，节奏落在同一条线上，所以体内的压力感和体表的刺激会叠在一起，而不是互相打断。\n\n全长 17 厘米、直径 3 厘米，是偏纤细的比例，用得久也不容易觉得胀。兔耳的角度做得比较软，能顺着身体轮廓走，而不是压在某一点上硬蹭；表面是 TPE，贴肤不吸水的质地。\n\n提供电池款与充电款两种：充电款用 USB 充满一次，够撑一整晚，中途不用停下来换电池；机身与手柄之间走线，想放手就把手柄放在枕边，不用一路绕在身上。\n\n低噪表现以厂商标称为准，开在中低档不会有明显的电机声。用完以湿布擦一遍即可，整支不可浸泡，请勿整只放进水里清洗。",
    "detailEn": "Dual heads, one rhythm. The inner shaft does the reaching while the pair of rabbit ears sits against the outside — and they run in sync rather than drifting apart, so pressure and surface stimulation arrive together instead of interrupting each other.\n\nAt 17 cm long and 3 cm across, the proportions are deliberately slim. There is no sense of overfilling, and the ears are soft enough to follow the contour of a body rather than digging into one stubborn point. The TPE surface does not absorb water and stays close to the skin.\n\nTwo versions are available: battery, and rechargeable over USB. The rechargeable one holds a charge through a whole evening, so a session does not stop for a battery change. The controller runs on a lead, so the unit can be left on the pillow instead of wired around the body.\n\nNoise is low by manufacturer specification, with no obvious motor whine at the lower settings. Wipe the surface with a damp cloth after use; it cannot be submerged, so keep the whole piece out of the sink.",
    "pack": "简约浅紫磨砂礼盒，无品牌标识",
    "weight": "净重 120 g",
    "origin": "中国 · 山东",
    "packaging": "主机 ×1 · 收纳袋 ×1 · USB 充电线 ×1 · 说明书 ×1",
    "gallery": [
      "/assets/img/w08.webp",
      "/assets/img/w08-2.webp",
      "/assets/img/w08-3.webp",
      "/assets/img/w08-4.webp"
    ],
    "packEn": "Minimal lilac matte gift box, unbranded",
    "weightEn": "Net weight 120 g",
    "originEn": "China · Shandong",
    "packagingEn": "Device ×1 · Storage pouch ×1 · USB charging cable ×1 · Instruction manual ×1",
    "specs": [
      {
        "k": "spec_length",
        "v": "全长 17 cm",
        "vEn": "Length 17 cm"
      },
      {
        "k": "spec_diameter",
        "v": "直径 3 cm",
        "vEn": "Ø 3 cm"
      },
      {
        "k": "spec_netweight",
        "v": "净重 120 g",
        "vEn": "Net weight 120 g"
      },
      {
        "k": "spec_packsize",
        "v": "礼盒 23.5 × 7 × 4 cm",
        "vEn": "Gift box 23.5 × 7 × 4 cm"
      },
      {
        "k": "spec_material",
        "v": "TPE 软胶",
        "vEn": "TPE soft-touch"
      },
      {
        "k": "spec_version",
        "v": "电池款 / 充电款",
        "vEn": "Battery / Rechargeable"
      },
      {
        "k": "spec_color",
        "v": "浅紫 / 白",
        "vEn": "Lilac / White"
      }
    ]
  },
  {
    "id": "LUM-W07",
    "name": "云弧 · G点静音震动按摩棒",
    "nameEn": "Arc · Quiet G-Spot Vibrator",
    "descEn": "The head is angled upward, so you stop hunting for the spot. At 40 dB it stays on your side of the wall. The soft-touch body warms in the hand quickly — fifteen quiet minutes, nothing but breathing.",
    "category": "women",
    "badge": "主推",
    "price": 279,
    "theme": "#FDEBF1",
    "fg": "#C2557E",
    "accent": "#F6CBDC",
    "variant": 0,
    "image": "/assets/img/w07.webp",
    "material": "TPE 软胶 + ABS 机身",
    "size": "全长 19.1 cm · 最粗 3.3 cm（包装 23 × 8 × 4 cm）",
    "noise": "≤ 40 分贝",
    "waterproof": "不可整机浸泡，湿布擦拭",
    "battery": "电池款 · 2 节 AAA",
    "features": [
      "头部 15° 上翘贴合G点",
      "40 分贝静音",
      "多档变频",
      "TPE 软胶包覆"
    ],
    "desc": "头部做了上翘角度，进去之后不用再反复找位置。40 分贝，隔着一道墙就听不见了。软胶包覆的机身握起来不冰手，睡前那十几分钟，安静得只剩呼吸。",
    "i18n": {
      "en": {
        "material": "TPE soft-touch + ABS body",
        "size": "19.1 cm length · 3.3 cm max Ø (pack 23 × 8 × 4 cm)",
        "noise": "≤ 40 dB",
        "waterproof": "Not submersible — wipe clean",
        "battery": "Battery powered · 2 × AAA",
        "features": [
          "Angled head for G-spot reach",
          "40 dB quiet",
          "Multi-speed vibration",
          "TPE soft-touch body"
        ]
      }
    },
    "createdAt": "2026-11-18T13:52:58.677Z",
    "updatedAt": "2026-11-19T02:52:06.150Z",
    "detail": "头部以 15° 角度上翘，是这支按摩棒最要紧的地方。放进去以后前端自然顶住前壁，不用再左右挪动反复找位置；配合多档变频，从最轻的一档一路往上加，随时都能停在你要的强度上。\n\n机身用 TPE 软胶整段包覆，内里是 ABS 骨架。握在手里是温的，指腹压下去有回弹，不像硬塑料那样硌手；全长 19.1 厘米，最粗处 3.3 厘米，进出的弧度不夸张，拿捏的时候心里有数。\n\n40 分贝是它最实在的参数。夜里在卧室里开到中档，隔着一道墙基本听不见动静，只剩一点很轻的嗡声——不用压低声音，也不用因为怕被听见而把强度调回最低。\n\n电池款用两节 AAA，拧开尾盖即可更换。整支不可浸泡，用完以湿布擦净、阴干就好；重量轻，出差塞进洗漱包也占不了多少地方。",
    "detailEn": "The head sits at a 15° upward angle, and that single detail changes how the whole thing is used. Once it is in place, the tip rests against the front wall on its own — no shuffling back and forth to hunt for the right spot. Multi-speed vibration lets you climb from a whisper to something stronger and stop wherever you want to stay.\n\nThe body is TPE soft-touch wrapped around an ABS core. It warms quickly in the hand and gives under the fingers rather than pressing back like hard plastic. At 19.1 cm long and 3.3 cm at its thickest, the profile stays comfortable for as long as you want to keep it there.\n\nThe number that matters most is 40 decibels. At a medium setting in a bedroom, the sound stays on your side of the wall — a low hum rather than anything you would need to apologise for. It is the difference between using it at the intensity you actually want and quietly dialling everything down.\n\nTwo AAA cells power it, and the tail cap unscrews for a quick swap. It cannot be submerged, so a damp cloth and a moment of drying is the whole cleaning routine. Light enough to travel, quiet enough to use after dark.",
    "pack": "简约深灰磨砂礼盒，无品牌标识",
    "weight": "净重 96 g",
    "origin": "中国 · 山东",
    "packaging": "主机 ×1 · 收纳袋 ×1 · AAA 电池 ×2 · 说明书 ×1",
    "gallery": [
      "/assets/img/w07.webp",
      "/assets/img/w07-3.webp",
      "/assets/img/w07-4.webp",
      "/assets/img/w07-5.webp",
      "/assets/img/w07-6.webp"
    ],
    "packEn": "Minimal dark grey matte gift box, unbranded",
    "weightEn": "Net weight 96 g",
    "originEn": "China · Shandong",
    "packagingEn": "Device ×1 · Storage pouch ×1 · 2 × AAA batteries · Instruction manual ×1",
    "specs": [
      {
        "k": "spec_length",
        "v": "全长 19.1 cm",
        "vEn": "Length 19.1 cm"
      },
      {
        "k": "spec_maxdiameter",
        "v": "最粗 3.3 cm",
        "vEn": "Max Ø 3.3 cm"
      },
      {
        "k": "spec_netweight",
        "v": "净重 96 g",
        "vEn": "Net weight 96 g"
      },
      {
        "k": "spec_packsize",
        "v": "礼盒 23 × 8 × 4 cm",
        "vEn": "Gift box 23 × 8 × 4 cm"
      },
      {
        "k": "spec_material",
        "v": "TPE 软胶 + ABS 机身",
        "vEn": "TPE soft-touch + ABS body"
      },
      {
        "k": "spec_color",
        "v": "雾粉 / 象牙白",
        "vEn": "Misty pink / Ivory"
      }
    ]
  },
  {
    "id": "LUM-W10",
    "name": "逗豆 · 双蛋跳蛋",
    "nameEn": "Dot · Twin Egg Vibrator",
    "descEn": "One large, one small — placed wherever you want them. The control sits in your palm; a thumb is all it takes.",
    "category": "women",
    "badge": "",
    "price": 179,
    "theme": "#FDEBF1",
    "fg": "#C2557E",
    "accent": "#F6CBDC",
    "variant": 2,
    "image": "/assets/img/w10.webp",
    "material": "ABS + TPE 软胶",
    "size": "大蛋 3 × 7 cm · 小蛋 2.5 × 6 cm · 线长 30 cm（包装 13.2 × 8.5 × 3.8 cm · 100 g）",
    "noise": "低噪（厂商标示见包装）",
    "waterproof": "不可浸泡，湿布擦拭",
    "battery": "USB 充电",
    "features": [
      "双蛋一大一小",
      "同步震动",
      "线控盒单手操作",
      "TPE 软胶包裹"
    ],
    "desc": "一大一小两颗，可以分别放在想放的位置。控制盒握在手里，拇指一推就是节奏，不用再伸手去够。",
    "i18n": {
      "en": {
        "material": "ABS + TPE soft gel",
        "size": "Large egg 3 × 7 cm · small egg 2.5 × 6 cm · 30 cm cord (pack 13.2 × 8.5 × 3.8 cm · 100 g)",
        "noise": "Low noise (per manufacturer)",
        "waterproof": "Not submersible — wipe clean",
        "battery": "USB rechargeable",
        "features": [
          "Two eggs, one large one small",
          "Synchronised vibration",
          "One-hand remote",
          "TPE soft coating"
        ]
      }
    },
    "createdAt": "2026-11-19T02:54:38.595Z",
    "detail": "两颗蛋，一大一小。大蛋 3 × 7 厘米，小蛋 2.5 × 6 厘米，可以分开放在你想要的位置，也可以并在一起用；两者的震动是同步的，小蛋不会在大蛋停下之后还继续嗡嗡作响。\n\n控制盒握在手里，拇指一推就是调档，另一只手完全空着。30 厘米的线不长，藏得住，也不需要一圈圈缠在腰上；放在枕头边、床头柜抽屉里都不占地方。\n\nABS 骨架外面裹了一层 TPE 软胶，贴着皮肤是软的，最薄的小蛋推进去几乎感觉不到硬边。整组 100 克，两颗加控制盒的重量都不压手，长时间用下来手腕不会酸。\n\nUSB 充电，充满后够用一段时间。表面用湿布擦拭即可，不可浸泡；收纳袋一只，把线绕好放进去，抽屉里一塞就行。",
    "detailEn": "Two eggs, deliberately different. The large one measures 3 × 7 cm, the small one 2.5 × 6 cm, so you can place them apart, or together, wherever the two of you want them. Vibration is synchronised — the small egg never carries on while the large one has stopped.\n\nThe controller stays in your hand and the whole thing runs off a thumb: one press changes the level, the other hand is free for everything else. The 30 cm lead is short enough to hide and does not need to be wound around a waist.\n\nAn ABS frame under TPE soft gel keeps the small egg from feeling like a hard edge at all. The set weighs 100 grams including the controller, so neither egg nor box pulls the hand down over a long session.\n\nUSB charging keeps it ready between sessions. Wipe clean with a damp cloth — it cannot be submerged. The storage pouch takes both eggs and the coiled lead, so it drops straight into a drawer.",
    "pack": "简约深灰磨砂礼盒，无品牌标识",
    "weight": "净重 100 g",
    "origin": "中国 · 山东",
    "packaging": "大蛋 ×1 · 小蛋 ×1 · 线控盒 ×1 · USB 充电线 ×1 · 收纳袋 ×1 · 说明书 ×1",
    "gallery": [
      "/assets/img/w10.webp",
      "/assets/img/w10-2.webp",
      "/assets/img/w10-3.webp"
    ],
    "packEn": "Minimal dark grey matte gift box, unbranded",
    "weightEn": "Net weight 100 g",
    "originEn": "China · Shandong",
    "packagingEn": "Large egg ×1 · Small egg ×1 · Remote control unit ×1 · USB charging cable ×1 · Storage pouch ×1 · Instruction manual ×1",
    "specs": [
      {
        "k": "spec_length",
        "v": "大蛋长 7 cm · 小蛋长 6 cm",
        "vEn": "Large egg 7 cm · Small egg 6 cm"
      },
      {
        "k": "spec_diameter",
        "v": "大蛋直径 3 cm · 小蛋直径 2.5 cm",
        "vEn": "Large Ø 3 cm · Small Ø 2.5 cm"
      },
      {
        "k": "spec_cablelength",
        "v": "线长 30 cm",
        "vEn": "Lead length 30 cm"
      },
      {
        "k": "spec_netweight",
        "v": "整组净重 100 g",
        "vEn": "Net weight 100 g (set)"
      },
      {
        "k": "spec_packsize",
        "v": "礼盒 13.2 × 8.5 × 3.8 cm",
        "vEn": "Gift box 13.2 × 8.5 × 3.8 cm"
      },
      {
        "k": "spec_material",
        "v": "ABS + TPE 软胶",
        "vEn": "ABS + TPE soft gel"
      },
      {
        "k": "spec_color",
        "v": "奶白 / 粉",
        "vEn": "Cream / Pink"
      }
    ]
  }
];

/* 抽象图备用色板：后端商品可能只存了文字字段（无配色），按 SKU 稳定取一组，
   避免 makeArt 收到 undefined 渲出黑块 */
const ART_PALETTE = [
  { theme: '#FDEBF1', fg: '#C2557E', accent: '#F6CBDC' },
  { theme: '#F3E9FD', fg: '#7A54B8', accent: '#E2D2F8' },
  { theme: '#EEF1F8', fg: '#4C5A85', accent: '#D5DBEC' },
  { theme: '#FBEFE9', fg: '#B0673F', accent: '#F2D8C8' },
  { theme: '#EAF4F0', fg: '#3F7F6A', accent: '#CCE6DC' },
  { theme: '#E8F3F5', fg: '#3F7B85', accent: '#C9E4E8' },
  { theme: '#F7E9EA', fg: '#8E3B47', accent: '#EBCFD2' },
  { theme: '#F1EAF9', fg: '#6B4B9E', accent: '#DDD0F2' }
];

/* SKU 颜色图内置兜底：API 不可用时，离线商品数据仍带真实颜色缩略图。
   线上以后端商品数据里的 skuImages 为准，后台改图会直接覆盖这里。 */
const DEFAULT_SKU_IMAGES = {
  'LUM-C03': { '黑': '/assets/img/c03-2.webp', '红': '/assets/img/c03.webp', '粉': '/assets/img/c03-3.webp' },
  'LUM-W09': { '粉色': '/assets/img/w09-2.webp', '薄荷绿': '/assets/img/w09.webp' },
  'LUM-W10': { '奶白': '/assets/img/w10-2.webp', '粉': '/assets/img/w10.webp' },
  'LUM-C04': { '浅紫': '/assets/img/c04-3.webp', '透明': '/assets/img/c04-2.webp' },
  'LUM-W08': { '浅紫': '/assets/img/w08.webp', '白': '/assets/img/w08-4.webp' },
  'LUM-W07': { '雾粉': '/assets/img/w07.webp', '象牙白': '/assets/img/w07-3.webp' }
};

/* 补全商品：有上传图片则用之，否则生成抽象 SVG；补分类名 */
function hydrateProduct(p) {
  if (!p.theme || !p.fg || !p.accent) {
    const s = String(p.id || p.name || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const pal = ART_PALETTE[h % ART_PALETTE.length];
    p.theme = p.theme || pal.theme;
    p.fg = p.fg || pal.fg;
    p.accent = p.accent || pal.accent;
    if (p.variant === undefined || p.variant === null) p.variant = h % 6;
  }
  p.image = p.image && String(p.image).length > 8 ? p.image : makeArt(p.theme, p.fg, p.accent, p.variant);
  if (!p.skuImages || typeof p.skuImages !== 'object' || Array.isArray(p.skuImages)) {
    p.skuImages = DEFAULT_SKU_IMAGES[p.id] ? { spec_color: DEFAULT_SKU_IMAGES[p.id] } : {};
  }
  const c = CATEGORIES.find(x => x.id === p.category);
  p.categoryName = c ? c.name : '';
  return p;
}

PRODUCTS.forEach(hydrateProduct);

/* 用后端商品列表替换（后台增删改商品后调用），保持 PRODUCTS 引用不变。
   空数组也要替换 —— 后端把商品全删掉时，前端必须跟着变空，
   以前这里 `!list.length` 直接 return，页面就还留着内置的演示商品。 */
function replaceProducts(list) {
  if (!Array.isArray(list)) return false;
  PRODUCTS.length = 0;
  list.forEach(p => PRODUCTS.push(hydrateProduct(p)));
  return true;
}

function getProduct(id) { return PRODUCTS.find(p => p.id === id); }

