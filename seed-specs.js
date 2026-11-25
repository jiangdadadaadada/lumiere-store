/* ============================================================
   LUMIÈRE · 商品规格尺寸结构化
   把 9 款 1688 真实商品的「尺寸」拆成逐项规格，每项单独展示。
   数据来源：1688 商品详情页「商品属性 / 包装信息」申报值，未做二次加工。
   写入字段：specs = [{ k:'spec_length', v:'19.1 cm', vEn:'19.1 cm' }, ...]
   用法：cd E:/LUMIERE && node seed-specs.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '.data', 'db.json');
const BACKUP_PATH = path.join(__dirname, '.data', 'db.backup-specs.json');

/* ---------- 规格定义：每款商品逐项尺寸 ---------- */
const SPECS = {
  'LUM-W07': [
    { k: 'spec_length', v: '全长 19.1 cm', vEn: 'Length 19.1 cm' },
    { k: 'spec_maxdiameter', v: '最粗 3.3 cm', vEn: 'Max Ø 3.3 cm' },
    { k: 'spec_netweight', v: '净重 96 g', vEn: 'Net weight 96 g' },
    { k: 'spec_packsize', v: '礼盒 23 × 8 × 4 cm', vEn: 'Gift box 23 × 8 × 4 cm' },
    { k: 'spec_material', v: 'TPE 软胶 + ABS 机身', vEn: 'TPE soft-touch + ABS body' },
    { k: 'spec_color', v: '雾粉 / 象牙白', vEn: 'Misty pink / Ivory' }
  ],
  'LUM-W08': [
    { k: 'spec_length', v: '全长 17 cm', vEn: 'Length 17 cm' },
    { k: 'spec_diameter', v: '直径 3 cm', vEn: 'Ø 3 cm' },
    { k: 'spec_netweight', v: '净重 120 g', vEn: 'Net weight 120 g' },
    { k: 'spec_packsize', v: '礼盒 23.5 × 7 × 4 cm', vEn: 'Gift box 23.5 × 7 × 4 cm' },
    { k: 'spec_material', v: 'TPE 软胶', vEn: 'TPE soft-touch' },
    { k: 'spec_version', v: '电池款 / 充电款', vEn: 'Battery / Rechargeable' },
    { k: 'spec_color', v: '浅紫 / 白', vEn: 'Lilac / White' }
  ],
  'LUM-W09': [
    { k: 'spec_length', v: '长 9.2 cm', vEn: 'Length 9.2 cm' },
    { k: 'spec_diameter', v: '直径 3.5 cm', vEn: 'Ø 3.5 cm' },
    { k: 'spec_netweight', v: '净重 80 g', vEn: 'Net weight 80 g' },
    { k: 'spec_packsize', v: '礼盒 13.2 × 8.5 × 3.8 cm', vEn: 'Gift box 13.2 × 8.5 × 3.8 cm' },
    { k: 'spec_material', v: '硅胶', vEn: 'Silicone' },
    { k: 'spec_color', v: '粉色 / 薄荷绿', vEn: 'Pink / Mint green' },
    { k: 'spec_cablelength', v: '遥控无线连接', vEn: 'Wireless remote link' }
  ],
  'LUM-M07': [
    { k: 'spec_length', v: '全长 18 cm', vEn: 'Length 18 cm' },
    { k: 'spec_height', v: '高 13 cm', vEn: 'Height 13 cm' },
    { k: 'spec_width', v: '宽 7 cm', vEn: 'Width 7 cm' },
    { k: 'spec_netweight', v: '净重 390 g', vEn: 'Net weight 390 g' },
    { k: 'spec_packsize', v: '礼盒 18 × 13 × 7 cm', vEn: 'Gift box 18 × 13 × 7 cm' },
    { k: 'spec_material', v: '一体成型硅胶', vEn: 'One-piece silicone' },
    { k: 'spec_opening', v: '内腔可翻洗', vEn: 'Invertible, rinse-clean canal' }
  ],
  'LUM-M08': [
    { k: 'spec_length', v: '全长 20 cm', vEn: 'Length 20 cm' },
    { k: 'spec_height', v: '高 20 cm', vEn: 'Height 20 cm' },
    { k: 'spec_width', v: '宽 10 cm', vEn: 'Width 10 cm' },
    { k: 'spec_netweight', v: '净重 1040 g', vEn: 'Net weight 1040 g' },
    { k: 'spec_packsize', v: '礼盒 20 × 20 × 10 cm', vEn: 'Gift box 20 × 20 × 10 cm' },
    { k: 'spec_material', v: '实心硅胶', vEn: 'Solid silicone' },
    { k: 'spec_color', v: '暖棕肤色', vEn: 'Warm tan' }
  ],
  'LUM-C03': [
    { k: 'spec_length', v: '套装长 22 cm', vEn: 'Set length 22 cm' },
    { k: 'spec_height', v: '套装高 16 cm', vEn: 'Set height 16 cm' },
    { k: 'spec_width', v: '套装宽 7 cm', vEn: 'Set width 7 cm' },
    { k: 'spec_count', v: '共 7 件', vEn: '7 pieces' },
    { k: 'spec_netweight', v: '净重 480 g', vEn: 'Net weight 480 g' },
    { k: 'spec_packsize', v: '礼盒 22 × 16 × 7 cm', vEn: 'Gift box 22 × 16 × 7 cm' },
    { k: 'spec_material', v: 'PU 皮革 + 毛绒内衬', vEn: 'PU leather + plush lining' },
    { k: 'spec_color', v: '黑 / 红 / 粉', vEn: 'Black / Red / Pink' }
  ],
  'LUM-C04': [
    { k: 'spec_opening', v: '环体内径 4.5 cm（可拉伸）', vEn: 'Inner Ø 4.5 cm (stretchable)' },
    { k: 'spec_netweight', v: '净重 30 g', vEn: 'Net weight 30 g' },
    { k: 'spec_material', v: 'TRE 弹性胶', vEn: 'TRE elastic gel' },
    { k: 'spec_color', v: '浅紫 / 透明', vEn: 'Lilac / Clear' }
  ],
  'LUM-H04': [
    { k: 'spec_volume', v: '容量 50 ml', vEn: 'Volume 50 ml' },
    { k: 'spec_length', v: '瓶高 13.5 cm', vEn: 'Bottle height 13.5 cm' },
    { k: 'spec_width', v: '瓶宽 5.5 cm', vEn: 'Bottle width 5.5 cm' },
    { k: 'spec_netweight', v: '净重 55 g', vEn: 'Net weight 55 g' },
    { k: 'spec_packsize', v: '外盒 5.5 × 3.5 × 13.5 cm', vEn: 'Outer box 5.5 × 3.5 × 13.5 cm' },
    { k: 'spec_material', v: '水基配方（水、甘油等）', vEn: 'Water-based (water, glycerin)' }
  ],
  'LUM-W10': [
    { k: 'spec_length', v: '大蛋长 7 cm · 小蛋长 6 cm', vEn: 'Large egg 7 cm · Small egg 6 cm' },
    { k: 'spec_diameter', v: '大蛋直径 3 cm · 小蛋直径 2.5 cm', vEn: 'Large Ø 3 cm · Small Ø 2.5 cm' },
    { k: 'spec_cablelength', v: '线长 30 cm', vEn: 'Lead length 30 cm' },
    { k: 'spec_netweight', v: '整组净重 100 g', vEn: 'Net weight 100 g (set)' },
    { k: 'spec_packsize', v: '礼盒 13.2 × 8.5 × 3.8 cm', vEn: 'Gift box 13.2 × 8.5 × 3.8 cm' },
    { k: 'spec_material', v: 'ABS + TPE 软胶', vEn: 'ABS + TPE soft gel' },
    { k: 'spec_color', v: '奶白 / 粉', vEn: 'Cream / Pink' }
  ]
};

/* 兼容 spec_material / spec_color / spec_opening / spec_cablelength / spec_count 等键 */
const ALLOWED_KEYS = new Set([
  'spec_length', 'spec_diameter', 'spec_maxdiameter', 'spec_height', 'spec_width',
  'spec_volume', 'spec_color', 'spec_cablelength', 'spec_count', 'spec_opening',
  'spec_version', 'spec_packsize', 'spec_netweight', 'spec_origin', 'spec_material'
]);

/* ---------- 写库 ---------- */
function main() {
  if (!fs.existsSync(DB_PATH)) { console.error('✗ 找不到 ' + DB_PATH); process.exit(1); }
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  fs.writeFileSync(BACKUP_PATH, raw, 'utf8');
  console.log('✓ 已备份 ' + BACKUP_PATH);

  const db = JSON.parse(raw);
  const products = db.products || {};
  let updated = 0, missing = 0;

  Object.keys(SPECS).forEach(id => {
    const p = products[id];
    if (!p) { console.log('✗ 商品不存在：' + id); missing++; return; }
    const list = SPECS[id].filter(s => ALLOWED_KEYS.has(s.k));
    if (list.length !== SPECS[id].length) {
      console.log('✗ ' + id + ' 含未登记的规格键，已跳过');
    }
    p.specs = list;
    updated++;
    console.log('✓ ' + id + '  ' + list.length + ' 项规格  ' + p.name);
  });

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 1), 'utf8');
  console.log('\n完成：更新 ' + updated + ' 款 · 缺失 ' + missing + ' 款');
}

main();
