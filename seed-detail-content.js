/* 一次性/可重复执行脚本：为 LUMIERE 现有 9 款商品补齐「详情页长文案」与「包装规格字段」。
 *
 *   新增字段：detail（中文长描述）· detailEn（英文长描述）· pack · weight · origin · packaging · gallery
 *                packEn · weightEn · originEn · packagingEn（英文版包装规格，供 tProduct() 三级回退使用）
 *
 * 规则：
 *   - 只写中/英两套文案，其余 39 种语言由 assets/app.js 的 tProduct() 四级回退自动处理
 *   - gallery 目前每款只有 1 张实拍图（assets/img/ 下共 9 张 webp），因此每款先只放现有 image，
 *     后续补图后再往数组里追加路径即可
 *   - 不改动 db.json 以外的任何文件；执行前自动备份到 .data/db.backup-detail.json
 *
 * 用法：cd E:/LUMIERE && node seed-detail-content.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DB_PATH = path.join(ROOT, '.data', 'db.json');
const BACKUP_PATH = path.join(ROOT, '.data', 'db.backup-detail.json');

/* 9 款商品的长文案与包装规格 */
const DETAIL = {
  'LUM-W07': {
    detail:
      '头部以 15° 角度上翘，是这支按摩棒最要紧的地方。放进去以后前端自然顶住前壁，不用再左右挪动反复找位置；配合多档变频，从最轻的一档一路往上加，随时都能停在你要的强度上。\n\n' +
      '机身用 TPE 软胶整段包覆，内里是 ABS 骨架。握在手里是温的，指腹压下去有回弹，不像硬塑料那样硌手；全长 19.1 厘米，最粗处 3.3 厘米，进出的弧度不夸张，拿捏的时候心里有数。\n\n' +
      '40 分贝是它最实在的参数。夜里在卧室里开到中档，隔着一道墙基本听不见动静，只剩一点很轻的嗡声——不用压低声音，也不用因为怕被听见而把强度调回最低。\n\n' +
      '电池款用两节 AAA，拧开尾盖即可更换。整支不可浸泡，用完以湿布擦净、阴干就好；重量轻，出差塞进洗漱包也占不了多少地方。',
    detailEn:
      'The head sits at a 15° upward angle, and that single detail changes how the whole thing is used. Once it is in place, the tip rests against the front wall on its own — no shuffling back and forth to hunt for the right spot. Multi-speed vibration lets you climb from a whisper to something stronger and stop wherever you want to stay.\n\n' +
      'The body is TPE soft-touch wrapped around an ABS core. It warms quickly in the hand and gives under the fingers rather than pressing back like hard plastic. At 19.1 cm long and 3.3 cm at its thickest, the profile stays comfortable for as long as you want to keep it there.\n\n' +
      'The number that matters most is 40 decibels. At a medium setting in a bedroom, the sound stays on your side of the wall — a low hum rather than anything you would need to apologise for. It is the difference between using it at the intensity you actually want and quietly dialling everything down.\n\n' +
      'Two AAA cells power it, and the tail cap unscrews for a quick swap. It cannot be submerged, so a damp cloth and a moment of drying is the whole cleaning routine. Light enough to travel, quiet enough to use after dark.',
    pack: '简约深灰磨砂礼盒，无品牌标识',
    weight: '净重 96 g',
    origin: '中国 · 山东',
    packaging: '主机 ×1 · 收纳袋 ×1 · AAA 电池 ×2 · 说明书 ×1',
    packEn: 'Minimal dark grey matte gift box, unbranded',
    weightEn: 'Net weight 96 g',
    originEn: 'China · Shandong',
    packagingEn: 'Device ×1 · Storage pouch ×1 · 2 × AAA batteries · Instruction manual ×1',
    gallery: ['/assets/img/w07.webp']
  },

  'LUM-W08': {
    detail:
      '这一支是双头结构：里面的柱体负责向内推进，外侧那对兔耳负责贴住体表。两个头同步震动，不是各震各的，节奏落在同一条线上，所以体内的压力感和体表的刺激会叠在一起，而不是互相打断。\n\n' +
      '全长 17 厘米、直径 3 厘米，是偏纤细的比例，用得久也不容易觉得胀。兔耳的角度做得比较软，能顺着身体轮廓走，而不是压在某一点上硬蹭；表面是 TPE，贴肤不吸水的质地。\n\n' +
      '提供电池款与充电款两种：充电款用 USB 充满一次，够撑一整晚，中途不用停下来换电池；机身与手柄之间走线，想放手就把手柄放在枕边，不用一路绕在身上。\n\n' +
      '低噪表现以厂商标称为准，开在中低档不会有明显的电机声。用完以湿布擦一遍即可，整支不可浸泡，请勿整只放进水里清洗。',
    detailEn:
      'Dual heads, one rhythm. The inner shaft does the reaching while the pair of rabbit ears sits against the outside — and they run in sync rather than drifting apart, so pressure and surface stimulation arrive together instead of interrupting each other.\n\n' +
      'At 17 cm long and 3 cm across, the proportions are deliberately slim. There is no sense of overfilling, and the ears are soft enough to follow the contour of a body rather than digging into one stubborn point. The TPE surface does not absorb water and stays close to the skin.\n\n' +
      'Two versions are available: battery, and rechargeable over USB. The rechargeable one holds a charge through a whole evening, so a session does not stop for a battery change. The controller runs on a lead, so the unit can be left on the pillow instead of wired around the body.\n\n' +
      'Noise is low by manufacturer specification, with no obvious motor whine at the lower settings. Wipe the surface with a damp cloth after use; it cannot be submerged, so keep the whole piece out of the sink.',
    pack: '简约浅紫磨砂礼盒，无品牌标识',
    weight: '净重 120 g',
    origin: '中国 · 山东',
    packaging: '主机 ×1 · 收纳袋 ×1 · USB 充电线 ×1 · 说明书 ×1',
    packEn: 'Minimal lilac matte gift box, unbranded',
    weightEn: 'Net weight 120 g',
    originEn: 'China · Shandong',
    packagingEn: 'Device ×1 · Storage pouch ×1 · USB charging cable ×1 · Instruction manual ×1',
    gallery: ['/assets/img/w08.webp']
  },

  'LUM-W09': {
    detail:
      '这是一枚可以遥控的跳蛋。遥控器交到对方手里，节奏就不再由你决定——什么时候加速、什么时候停下、中途换不换挡，都可以由不在你身边的那个人来定；你只需要待在该待的地方。\n\n' +
      '机身按键同时保留，所以控制权可以归你，也可以拆给两个人各握一半。80 克的净重很轻，留在体内几乎感觉不到它的存在，起身、走动、坐下都不会有明显异物感。\n\n' +
      '3.5 × 9.2 厘米的尺寸配硅胶表面，贴肤柔软，走动时也不会硌到某一处。低噪设计，夜里使用不必把声音调大；粉色与薄荷绿两种配色，一只一个也好，成对使用也好。\n\n' +
      '电池款供电，机身与遥控器各自独立控制。硅胶表面用完以湿布擦拭即可，整只不可浸泡，请勿放进水里清洗。',
    detailEn:
      'This is an egg you do not have to hold the reins of. Hand the remote to someone else and the tempo stops belonging to you: when it speeds up, when it stops, whether the mode changes mid-session — all of it can be decided by the person who is not sitting next to you.\n\n' +
      'The body button stays on the device as well, so control can sit with one person or be split between two. At 80 grams the egg is light enough to forget, and 3.5 × 9.2 cm in size, so it stays comfortable while you shift, stand or walk across the room.\n\n' +
      'The silicone surface sits close to the skin without a hard edge, and the motor is built for low noise — nothing has to be turned up at night. Two colourways, pink and mint green, so a pair can be split or matched.\n\n' +
      'It runs on batteries, for both the egg and the remote. Wipe the surface with a damp cloth after use; the unit must not be submerged.',
    pack: '简约青白磨砂礼盒，无品牌标识',
    weight: '净重 80 g',
    origin: '中国 · 山东',
    packaging: '主机 ×1 · 无线遥控器 ×1 · 收纳袋 ×1 · 电池 ×2 · 说明书 ×1',
    packEn: 'Minimal teal-and-white matte gift box, unbranded',
    weightEn: 'Net weight 80 g',
    originEn: 'China · Shandong',
    packagingEn: 'Device ×1 · Wireless remote ×1 · Storage pouch ×1 · 2 × batteries · Instruction manual ×1',
    gallery: ['/assets/img/w09.webp']
  },

  'LUM-W10': {
    detail:
      '两颗蛋，一大一小。大蛋 3 × 7 厘米，小蛋 2.5 × 6 厘米，可以分开放在你想要的位置，也可以并在一起用；两者的震动是同步的，小蛋不会在大蛋停下之后还继续嗡嗡作响。\n\n' +
      '控制盒握在手里，拇指一推就是调档，另一只手完全空着。30 厘米的线不长，藏得住，也不需要一圈圈缠在腰上；放在枕头边、床头柜抽屉里都不占地方。\n\n' +
      'ABS 骨架外面裹了一层 TPE 软胶，贴着皮肤是软的，最薄的小蛋推进去几乎感觉不到硬边。整组 100 克，两颗加控制盒的重量都不压手，长时间用下来手腕不会酸。\n\n' +
      'USB 充电，充满后够用一段时间。表面用湿布擦拭即可，不可浸泡；收纳袋一只，把线绕好放进去，抽屉里一塞就行。',
    detailEn:
      'Two eggs, deliberately different. The large one measures 3 × 7 cm, the small one 2.5 × 6 cm, so you can place them apart, or together, wherever the two of you want them. Vibration is synchronised — the small egg never carries on while the large one has stopped.\n\n' +
      'The controller stays in your hand and the whole thing runs off a thumb: one press changes the level, the other hand is free for everything else. The 30 cm lead is short enough to hide and does not need to be wound around a waist.\n\n' +
      'An ABS frame under TPE soft gel keeps the small egg from feeling like a hard edge at all. The set weighs 100 grams including the controller, so neither egg nor box pulls the hand down over a long session.\n\n' +
      'USB charging keeps it ready between sessions. Wipe clean with a damp cloth — it cannot be submerged. The storage pouch takes both eggs and the coiled lead, so it drops straight into a drawer.',
    pack: '简约深灰磨砂礼盒，无品牌标识',
    weight: '净重 100 g',
    origin: '中国 · 山东',
    packaging: '大蛋 ×1 · 小蛋 ×1 · 线控盒 ×1 · USB 充电线 ×1 · 收纳袋 ×1 · 说明书 ×1',
    packEn: 'Minimal dark grey matte gift box, unbranded',
    weightEn: 'Net weight 100 g',
    originEn: 'China · Shandong',
    packagingEn: 'Large egg ×1 · Small egg ×1 · Remote control unit ×1 · USB charging cable ×1 · Storage pouch ×1 · Instruction manual ×1',
    gallery: ['/assets/img/w10.webp']
  },

  'LUM-M07': {
    detail:
      '一体成型的硅胶，没有拼接缝，也没有一捏就塌的轻飘手感。390 克的净重拿在手里是有分量的——那份分量本身就是体验的一部分：它会留在该在的位置上，不会在使用中被挤得变形。\n\n' +
      '内腔是分段纹理，进出的深浅两段手感不同，走完一段自然换一种刺激。没有电机、没有电池、没有充电这件事要惦记，全部靠你自己的节奏推动。\n\n' +
      '内腔可以整个翻出来：翻转后用水冲洗、晾干，再折回去。纹理是刻在本体上的，翻洗不会掉屑，也藏不住污垢，洗完擦干就能收起来。\n\n' +
      '整支不出一点声音。包装 18 × 13 × 7 厘米，随附收纳袋，抽屉里放得下，也便于出门携带。',
    detailEn:
      'One continuous piece of silicone, moulded in a single form with no seams to feel. At 390 grams it has real weight in the hand, and that weight is part of how it works — it stays where you put it and never collapses under pressure.\n\n' +
      'The canal runs in two sections, and the texture changes partway through, so the experience shifts as you move rather than staying on one note. There is no motor, no battery and no charge to think about. Everything is driven by your own rhythm.\n\n' +
      'The canal inverts inside out under the tap. Rinse it, leave it to dry, and fold it back — the texture is moulded into the material itself, so washing takes nothing away and holds nothing back.\n\n' +
      'Nothing inside makes a sound. It packs into 18 × 13 × 7 cm with the storage pouch, easy to find a drawer for and easy to take along.',
    pack: '简约深灰磨砂礼盒，无品牌标识',
    weight: '净重 390 g',
    origin: '中国 · 山东',
    packaging: '名器 ×1 · 收纳袋 ×1 · 说明书 ×1',
    packEn: 'Minimal dark grey matte gift box, unbranded',
    weightEn: 'Net weight 390 g',
    originEn: 'China · Shandong',
    packagingEn: 'Stroker ×1 · Storage pouch ×1 · Instruction manual ×1',
    gallery: ['/assets/img/m07.webp']
  },

  'LUM-M08': {
    detail:
      '1040 克净重，一公斤出头。放在桌面上不会滑走，也不需要一只手一直按着；两只手空出来这件事，本身就改变了使用方式——节奏由身体带动，而不是由手臂撑着。\n\n' +
      '3D 立体臀型不是平面上贴一张图，是有弧度、有起伏的真实轮廓，从侧面看有明显的高低差。贴合上去的触感因此比平面模具实在得多，转动时轮廓会跟着身体走。\n\n' +
      '整只用硅胶，表面亲肤，边缘做了圆润过渡，不刮不硌。没有任何电动部件，纯手动，力度和节奏完全由你自己的腰胯动作决定，房间里只有你制造的声音。\n\n' +
      '可整只水洗：拿到水管下直接冲即可，不需要拆任何零件，也没有充电口需要保护。包装 20 × 20 × 10 厘米，体积不小，收货前先确认柜子放得下。',
    detailEn:
      '1,040 grams — just over a kilo. Set it down and it stays there, which means you are not holding it in place with one hand while you work with the other. Both hands free changes the shape of the whole session.\n\n' +
      'The form is genuinely sculpted rather than flat. There is a real rise and fall in the silhouette and a clear difference in height seen from the side, so contact follows a curve instead of a plane, and the outline moves with the body.\n\n' +
      'The silicone surface has no hard edges, and every transition is rounded off. There are no electric parts, no battery and no noise — pace and pressure come entirely from your own movement, and the only sound in the room is one you are making.\n\n' +
      'The whole piece can be washed under running water, with no parts to remove and no charging contacts to protect. It is a solid object: 20 × 20 × 10 cm is not a small parcel, so check the space it will live in before you order.',
    pack: '简约暖棕磨砂礼盒，无品牌标识',
    weight: '净重 1040 g',
    origin: '中国 · 山东',
    packaging: '名器 ×1 · 收纳袋 ×1 · 说明书 ×1',
    packEn: 'Minimal warm brown matte gift box, unbranded',
    weightEn: 'Net weight 1040 g',
    originEn: 'China · Shandong',
    packagingEn: 'Stroker ×1 · Storage pouch ×1 · Instruction manual ×1',
    gallery: ['/assets/img/m08.webp']
  },

  'LUM-C03': {
    detail:
      '七件一套：手铐、脚铐、口球、眼罩、鞭、绳、束带。金属扣件是有分量的那种，扣上那一下是明确的"咔哒"，不是用两次就松垮的薄片；受力点做了加固，反复使用不会先坏在扣眼上。\n\n' +
      'PU 皮革外面衬了一层毛绒，贴着皮肤的那一面是软的。长时间戴着不会磨出印子，边缘也做了包边，不刮蹭。束带与手铐、脚铐都可调节松紧，肩宽腿粗的人也能找到合适的档位。\n\n' +
      '三种配色：黑、红、粉。整套净重 480 克，包装 22 × 16 × 7 厘米，件件有独立位置，收纳袋一装，抽屉里就能找到。\n\n' +
      '皮面用湿布擦即可，不要长时间泡水；毛绒内衬用软毛刷顺着一个方向清理，晾干后再收。',
    detailEn:
      'Seven pieces in one set: wrist cuffs, ankle cuffs, a ball gag, a blindfold, a flogger, a length of rope, and a set of straps. The hardware is deliberately weighted — when a buckle closes, it closes with a definite click, not the thin rattle of something that loosens after a few uses, and the stress points are reinforced so they are not the first thing to fail.\n\n' +
      'PU leather over a plush lining means the side that touches skin is soft. Nothing chafes and nothing bites, even over a long session, and the edges are bound so they will not scratch. Cuffs and straps all adjust, so the fit works across different wrists, ankles and frames.\n\n' +
      'Three colourways: black, red and pink. The set weighs 480 grams and ships in a 22 × 16 × 7 cm box, each piece sitting in its own place, with a storage pouch that drops it straight into a drawer.\n\n' +
      'Wipe the leather with a damp cloth and keep it out of standing water; brush the plush lining in one direction and let it dry before putting it away.',
    pack: '简约暗红磨砂礼盒，无品牌标识',
    weight: '净重 480 g',
    origin: '中国 · 山东',
    packaging: '手铐 ×1 · 脚铐 ×1 · 口球 ×1 · 眼罩 ×1 · 鞭 ×1 · 绳 ×1 · 束带 ×1 · 收纳袋 ×1 · 说明书 ×1',
    packEn: 'Minimal dark red matte gift box, unbranded',
    weightEn: 'Net weight 480 g',
    originEn: 'China · Shandong',
    packagingEn: 'Handcuffs ×1 · Ankle cuffs ×1 · Oral gag ×1 · Blindfold ×1 · Whip ×1 · Rope ×1 · Harness ×1 · Storage pouch ×1 · Instruction manual ×1',
    gallery: ['/assets/img/c03.webp']
  },

  'LUM-C04': {
    detail:
      '环体是 TRE 弹性胶，能拉伸，戴上不勒，也不会卡在某处压出一圈印子。30 克的净重轻到戴上以后很快就会忘记它的存在，翻身、起身都不觉得身上多了什么。\n\n' +
      '外侧贴一片蝶形震动片，装在环体外缘，两个人同时能感觉到，不是单边；强度靠纽扣电池供电，一档一档往上加，不需要 App，也不需要另外一只手柄。\n\n' +
      '可拉伸这一点对双人使用最要紧：松紧自己掌握，松到不勒、紧到不会移位，节奏由你们自己定。使用时无需刻意调整位置，它会待在原处。\n\n' +
      '整只不可浸泡，用完以湿布擦净、晾干即可。收纳袋一只，放进抽屉或旅行收纳包都不占地方。',
    detailEn:
      'The ring is cut from stretchy TRE elastic gel, so it pulls into place without pinching and without leaving a band pressed into the skin. At 30 grams it is light enough that you stop noticing it within a minute, whether you turn over, sit up or shift position.\n\n' +
      'A butterfly-shaped vibrating pad sits on the outer rim, positioned so that both partners feel the same pulse — the vibration is not one-sided, and nobody has to hold anything in place. Strength steps up through a button-cell, one level at a time, with no app and no separate controller.\n\n' +
      'Stretch-to-fit matters most when you are not using it alone: the tightness is yours to set, loose enough to stay comfortable and firm enough to stay where you put it. It keeps its position without readjusting.\n\n' +
      'It cannot be submerged, so wipe it with a damp cloth and let it dry. Light and small, it drops into a storage pouch and into a drawer or a travel kit without taking up room.',
    pack: '简约浅紫磨砂礼盒，无品牌标识',
    weight: '净重 30 g',
    origin: '中国 · 山东',
    packaging: '震动环 ×1 · 收纳袋 ×1 · 纽扣电池 ×1 · 说明书 ×1',
    packEn: 'Minimal lilac matte gift box, unbranded',
    weightEn: 'Net weight 30 g',
    originEn: 'China · Shandong',
    packagingEn: 'Vibrating ring ×1 · Storage pouch ×1 · Button cell ×1 · Instruction manual ×1',
    gallery: ['/assets/img/c04.webp']
  },

  'LUM-H04': {
    detail:
      '水基配方，以水和甘油为主体，挤出来是透明的，没有颜色也没有香精味。气味这件事在亲密场景里比想象中重要——一支带香的东西，会先于其他一切成为房间里的主角。\n\n' +
      '可与硅胶玩具同用，不会咬胶。硅胶最怕的是油基和部分树脂类配方，用久了表面会发黏、发软；水基不会让胶体起黏，也不会缩短玩具的寿命。\n\n' +
      '水基需要补涂，几次之后加一点就好，用量比油基省。结束后清水冲一冲就干净，皮肤和床品都不留油印。\n\n' +
      '50 毫升随身装，包装 5.5 × 3.5 × 13.5 厘米，出差放进洗漱包正好。按压式泵头单手可挤，另一只手空着。',
    detailEn:
      'Water-based, built on water and glycerin, and nothing that announces itself. It dispenses clear and carries no fragrance — which matters more than it sounds: in a small room, a scented lube becomes the loudest thing in the space.\n\n' +
      'It is safe to use with silicone toys. Silicone is damaged by oil-based and certain resin formulas, which can leave the surface tacky or swollen; a water-based formula leaves the material exactly as it was.\n\n' +
      'Water-based lubes need a top-up rather than one heavy application, so keep it within reach and add a little between rounds. It rinses away with plain water — no residue on skin, no oil mark left on sheets.\n\n' +
      'Fifty millilitres in a 5.5 × 3.5 × 13.5 cm bottle, small enough to travel with and to sit in a bathroom cabinet. The pump dispenser puts it out one-handed, so the other hand stays free, and the clear bottle lets you see how much is left before you reach for it again.',
    pack: '简约透明外盒 + 素色纸盒，无品牌标识',
    weight: '净重 55 g',
    origin: '中国 · 山东',
    packaging: '润滑剂 50 ml ×1 · 说明卡 ×1',
    packEn: 'Minimal clear outer box + plain paper box, unbranded',
    weightEn: 'Net weight 55 g',
    originEn: 'China · Shandong',
    packagingEn: 'Lubricant 50 ml ×1 · Product card ×1',
    gallery: ['/assets/img/h04.webp']
  }
};

/* ---------- 工具 ---------- */
const cnChars = s => String(s || '').replace(/\s+/g, '').length;
const enWords = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;

/* ---------- 读取 ---------- */
if (!fs.existsSync(DB_PATH)) {
  console.error('✗ 找不到数据文件：' + DB_PATH);
  process.exit(1);
}
const raw = fs.readFileSync(DB_PATH, 'utf8');
let db;
try {
  db = JSON.parse(raw);
} catch (e) {
  console.error('✗ db.json 解析失败：' + e.message);
  process.exit(1);
}
if (!db.products || typeof db.products !== 'object') {
  console.error('✗ db.products 结构异常（应为以 id 为键的对象）');
  process.exit(1);
}

/* ---------- 校验 ---------- */
const errors = [];
const ids = Object.keys(DETAIL);
if (ids.length !== 9) errors.push('DETAIL 条目数应为 9，实际 ' + ids.length);

ids.forEach(id => {
  const d = DETAIL[id];
  const p = db.products[id];
  if (!p) { errors.push(id + '：db.json 中不存在该商品'); return; }
  if (cnChars(d.detail) < 200) errors.push(id + '：detail 字数不足 200（' + cnChars(d.detail) + '）');
  if (cnChars(d.detail) > 320) errors.push(id + '：detail 字数超过 320（' + cnChars(d.detail) + '）');
  if (String(d.detailEn || '').length < 600) errors.push(id + '：detailEn 字符数不足 600（' + String(d.detailEn || '').length + '）');
  const w = enWords(d.detailEn);
  if (w < 150) errors.push(id + '：detailEn 词数不足 150（' + w + '）');
  if (w > 220) errors.push(id + '：detailEn 词数超过 220（' + w + '）');
  if (!Array.isArray(d.gallery) || !d.gallery.length) errors.push(id + '：gallery 必须是非空数组');
  else if (d.gallery[0] !== p.image) errors.push(id + '：gallery 首项 ' + d.gallery[0] + ' 与原 image ' + p.image + ' 不一致');
  ['pack', 'weight', 'origin', 'packaging'].forEach(f => {
    if (!String(d[f] || '').trim()) errors.push(id + '：' + f + ' 为空');
  });
  /* 英文版包装字段：4 个均非空，且 originEn 必须是 China · Shandong */
  ['packEn', 'weightEn', 'originEn', 'packagingEn'].forEach(f => {
    if (!String(d[f] || '').trim()) errors.push(id + '：' + f + ' 为空');
  });
  if (d.originEn !== 'China · Shandong') {
    errors.push(id + '：originEn 应为 "China · Shandong"，实际为 "' + d.originEn + '"');
  }
  if (!String(d.detail || '').includes('\n\n')) errors.push(id + '：detail 缺少段落分隔 \\n\\n');
  if (!String(d.detailEn || '').includes('\n\n')) errors.push(id + '：detailEn 缺少段落分隔 \\n\\n');
});

if (errors.length) {
  console.error('✗ 校验未通过，共 ' + errors.length + ' 条：');
  errors.forEach(e => console.error('   - ' + e));
  process.exit(1);
}

/* ---------- 写入（先备份） ---------- */
/* 只在备份不存在时写入，保留首次执行前的原始快照，脚本可反复执行 */
if (!fs.existsSync(BACKUP_PATH)) {
  fs.writeFileSync(BACKUP_PATH, raw, 'utf8');
  console.log('备份已写入 ' + BACKUP_PATH);
} else {
  console.log('备份已存在，保留原始快照 ' + BACKUP_PATH);
}

let updated = 0;
ids.forEach(id => {
  const p = db.products[id];
  const d = DETAIL[id];
  const patch = {
    detail: d.detail,
    detailEn: d.detailEn,
    pack: d.pack,
    weight: d.weight,
    origin: d.origin,
    packaging: d.packaging,
    packEn: d.packEn,
    weightEn: d.weightEn,
    originEn: d.originEn,
    packagingEn: d.packagingEn
  };
  /* gallery 已有值则保留，否则使用 DETAIL 里的 */
  if (!Array.isArray(p.gallery) || !p.gallery.length) patch.gallery = d.gallery.slice();
  Object.assign(p, patch);
  updated++;
});

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');

/* ---------- 报告 ---------- */
console.log('\n更新 ' + updated + '/' + ids.length + ' 款商品\n');
console.log('商品ID    detail字  detailEn字符  detailEn词  gallery  英文包装字段');
ids.forEach(id => {
  const p = db.products[id];
  const enOk = ['packEn', 'weightEn', 'originEn', 'packagingEn']
    .filter(f => String(p[f] || '').trim()).length;
  console.log(
    id.padEnd(10) +
    String(cnChars(p.detail)).padStart(8) +
    String(p.detailEn.length).padStart(13) +
    String(enWords(p.detailEn)).padStart(11) +
    String((p.gallery || []).length).padStart(9) +
    String(enOk + '/4').padStart(13)
  );
});
console.log('\n写入完成 → ' + DB_PATH);
