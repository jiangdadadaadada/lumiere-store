/* ============================================================
   LUMIÈRE · 商品画廊（多角度图集）
   把各商品的多角度图补进 gallery 字段。
   规则：gallery[0] 恒为该商品的原 image（主图不变），
        后续追加的均为新增角度图，文件名 <sku>-<序号>.webp。
   幂等：可重复执行。
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DB = path.join(ROOT, '.data', 'db.json');
const BACKUP = path.join(ROOT, '.data', 'db.backup-gallery.json');

/* 新增角度图：sku → [相对 assets/img 的文件名] */
const EXTRA = {
  'LUM-W07': ['w07-3.webp', 'w07-4.webp', 'w07-5.webp', 'w07-6.webp'],
  'LUM-W08': ['w08-2.webp', 'w08-3.webp', 'w08-4.webp'],
  'LUM-W09': ['w09-2.webp', 'w09-3.webp'],
  'LUM-W10': ['w10-2.webp', 'w10-3.webp'],
  'LUM-M07': ['m07-2.webp', 'm07-3.webp'],
  'LUM-M08': ['m08-3.webp', 'm08-2.webp'],
  'LUM-C03': ['c03-2.webp', 'c03-3.webp', 'c03-4.webp', 'c03-5.webp', 'c03-6.webp'],
  'LUM-C04': ['c04-2.webp', 'c04-3.webp'],
  'LUM-H04': ['h04-2.webp', 'h04-3.webp']
};

function main() {
  if (!fs.existsSync(DB)) { console.error('✗ 找不到 db.json'); process.exit(1); }
  const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  if (!db.products) { console.error('✗ db.json 无 products'); process.exit(1); }

  /* 备份只在首次生成 */
  if (!fs.existsSync(BACKUP)) {
    fs.copyFileSync(DB, BACKUP);
    console.log('已创建备份：.data/db.backup-gallery.json');
  }

  let ok = 0, skip = 0;
  for (const [id, files] of Object.entries(EXTRA)) {
    const p = db.products[id];
    if (!p) { console.warn(`✗ 跳过 ${id}：商品不存在`); skip++; continue; }
    const gal = Array.isArray(p.gallery) && p.gallery.length ? p.gallery.slice() : [p.image];
    /* 主图永远在第一位 */
    if (!gal.includes(p.image)) gal.unshift(p.image);
    for (const f of files) {
      const rel = `/assets/img/${f}`;
      if (gal.includes(rel)) continue;
      const abs = path.join(ROOT, 'assets', 'img', f);
      if (!fs.existsSync(abs)) { console.warn(`✗ ${id} 缺文件 ${f}`); continue; }
      gal.push(rel);
    }
    p.gallery = gal;
    ok++;
    console.log(`✓ ${id}  gallery=${gal.length}  ${JSON.stringify(gal)}`);
  }

  fs.writeFileSync(DB, JSON.stringify(db, null, 2), 'utf8');
  console.log(`\n完成：更新 ${ok} 款，跳过 ${skip} 款。db.json 已写回。`);

  /* 校验 */
  const check = JSON.parse(fs.readFileSync(DB, 'utf8'));
  let bad = 0;
  for (const [id, p] of Object.entries(check.products)) {
    if (!Array.isArray(p.gallery) || !p.gallery.length) { console.error(`✗ ${id} gallery 为空`); bad++; continue; }
    if (p.gallery[0] !== p.image) { console.error(`✗ ${id} gallery[0] 与 image 不一致`); bad++; }
    for (const g of p.gallery) {
      const abs = path.join(ROOT, g.replace(/^\//, ''));
      if (!fs.existsSync(abs)) { console.error(`✗ ${id} 文件不存在 ${g}`); bad++; }
    }
    if (new Set(p.gallery).size !== p.gallery.length) { console.error(`✗ ${id} gallery 有重复`); bad++; }
  }
  console.log(bad === 0 ? '校验通过：全部商品 gallery 有效、无重复、文件齐全。' : `校验失败 ${bad} 项`);
  process.exit(bad === 0 ? 0 : 1);
}

main();
