/*
 * build-address-data.js
 * 由全球行政区划原始数据生成前端内置地址数据。
 *
 * 输入（_address_work/，运行后即删，不随项目交付）：
 *   countries.json  dr5hn/countries-states-cities-database 国家表（250）
 *   states.json     同上州省表（5327）
 *   china.json      china-area-data v5 中国省市区三级码表
 *
 * 输出：
 *   assets/address-data.js   window.WORLD_STATES（全球州省）+ window.CHINA_AREAS（中国市区县）
 *   assets/geo.js            就地追加缺失国家与货币（幂等，重复运行不再新增）
 *
 * 用法：node build-address-data.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WORK = path.join(ROOT, '_address_work');
const ASSETS = path.join(ROOT, 'assets');

/* 原始数据 URL：本地缺失时自动下载，脚本可随时重跑更新数据 */
const SOURCES = {
  'countries.json': 'https://cdn.jsdelivr.net/gh/dr5hn/countries-states-cities-database@master/json/countries.json',
  'states.json': 'https://cdn.jsdelivr.net/gh/dr5hn/countries-states-cities-database@master/json/states.json',
  'china.json': 'https://cdn.jsdelivr.net/npm/china-area-data@5.0.1/data.json'
};
if (!fs.existsSync(WORK)) fs.mkdirSync(WORK, { recursive: true });
(async () => {
  for (const [file, url] of Object.entries(SOURCES)) {
    const dest = path.join(WORK, file);
    if (fs.existsSync(dest)) continue;
    process.stdout.write('↓ 下载 ' + file + ' ... ');
    const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error('download failed: ' + url + ' -> ' + res.status);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    console.log('OK');
  }
  main();
})();

function main() {
const read = f => fs.readFileSync(path.join(WORK, f), 'utf8');
const json = f => JSON.parse(read(f));
const zh = tr => (tr && (tr['zh-CN'] || tr.zh)) || '';

/* ---------- 1. 生成 window.WORLD_STATES：{ CC: [[iso2, 英文, 中文], ...] } ---------- */
const states = json('states.json');
const worldStates = {};
for (const s of states) {
  const cc = s.country_code;
  if (!cc) continue;
  if (!worldStates[cc]) worldStates[cc] = [];
  const zhName = zh(s.translations) || s.native || '';
  worldStates[cc].push([
    s.iso2 || s.iso3166_2 || s.name,
    s.name,
    zhName && zhName !== s.name ? zhName : ''
  ]);
}
/* 每个国家按英文名排序，保证输出稳定 */
for (const cc of Object.keys(worldStates)) {
  worldStates[cc].sort((a, b) => a[1].localeCompare(b[1]));
}

/* ---------- 2. 生成 window.CHINA_AREAS：省 -> 市 -> 区县 ---------- */
const cn = json('china.json');
const provinceMap = cn['86'];
/* 直辖市/特殊：市级只有「市辖区」「县」这种虚拟层，把区县直接挂到省级下 */
const VIRTUAL_CITY = /^(市辖区|县)$/;
const chinaAreas = {};
for (const [pCode, pName] of Object.entries(provinceMap)) {
  const cities = {};
  const cityMap = cn[pCode] || {};
  for (const [cCode, cName] of Object.entries(cityMap)) {
    const distMap = cn[cCode] || {};
    if (VIRTUAL_CITY.test(cName)) {
      /* 虚拟市：区县并到省级，市名用省名 */
      for (const [dCode, dName] of Object.entries(distMap)) {
        cities[dCode] = { n: dName, d: {} };
      }
    } else {
      const dists = {};
      for (const [dCode, dName] of Object.entries(distMap)) dists[dCode] = dName;
      cities[cCode] = { n: cName, d: dists };
    }
  }
  chinaAreas[pCode] = { n: pName, c: cities };
}

/* ---------- 3. 写出 assets/address-data.js ---------- */
const out =
  '/* 全球地址内置数据 — 由 build-address-data.js 自动生成，请勿手改 */\n' +
  'window.WORLD_STATES = ' + JSON.stringify(worldStates) + ';\n' +
  'window.CHINA_AREAS = ' + JSON.stringify(chinaAreas) + ';\n';
fs.writeFileSync(path.join(ASSETS, 'address-data.js'), out, 'utf8');
const stat = fs.statSync(path.join(ASSETS, 'address-data.js'));
console.log('✓ assets/address-data.js', (stat.size / 1024).toFixed(1) + 'KB',
  '| 国家州省表', Object.keys(worldStates).length,
  '| 州省条目', Object.values(worldStates).reduce((s, a) => s + a.length, 0),
  '| 中国省级', Object.keys(chinaAreas).length);

/* ---------- 4. 就地补齐 assets/geo.js 缺失国家与货币（幂等） ---------- */
const countries = json('countries.json');
let geo = fs.readFileSync(path.join(ASSETS, 'geo.js'), 'utf8');

/* 现有货币 */
const curMatch = geo.match(/const CURRENCY_DATA = `([\s\S]*?)`;/);
const curBlock = curMatch[1];
const existingCur = new Set(curBlock.trim().split('\n').map(l => l.split('~')[0]));

/* 现有国家 */
const coMatch = geo.match(/const COUNTRY_DATA = `([\s\S]*?)`;/);
const coBlock = coMatch[1];
const existingCo = new Set(coBlock.trim().split('\n').map(l => l.split('|')[0]));

/* 补充货币：CODE~符号~英文名~1CNY汇率~小数位。未知小币种统一按 1 CNY≈0.13 单位、2 位小数兜底 */
const curMeta = {};
for (const c of countries) {
  if (c.currency && !existingCur.has(c.currency) && !curMeta[c.currency]) {
    curMeta[c.currency] = { name: c.currency_name || c.currency, symbol: c.currency_symbol || c.currency };
  }
}
const newCurLines = Object.entries(curMeta).map(([code, m]) =>
  `${code}~${m.symbol}~${m.name}~0.13~2`
);

/* 补充国家：CODE|中文|English|旗帜|语言|货币|COD */
const langOf = c => {
  const t = (c.translations || {})['zh-CN'] || '';
  /* 中文官方语言的中译国家默认中文界面 */
  return /中文|Chinese/i.test(c.languages || '') ? 'zh' : 'en';
};
const newCoLines = [];
for (const c of countries) {
  if (existingCo.has(c.iso2)) continue;
  const zhName = zh(c.translations) || c.name;
  const cc = c.iso2;
  /* XK 科索沃：非 ISO 正式代码，按地区处理 */
  newCoLines.push(`${cc}|${zhName.replace(/\|/g, '')}|${c.name.replace(/\|/g, '')}|${c.emoji || '🌐'}|${langOf(c)}|${c.currency || 'USD'}|1`);
}

let changed = false;
if (newCurLines.length) {
  geo = geo.replace(/const CURRENCY_DATA = `([\s\S]*?)`;/, (m, b) =>
    'const CURRENCY_DATA = `' + b.trimEnd() + '\n' + newCurLines.join('\n') + '\n`;');
  changed = true;
}
if (newCoLines.length) {
  geo = geo.replace(/const COUNTRY_DATA = `([\s\S]*?)`;/, (m, b) =>
    'const COUNTRY_DATA = `' + b.trimEnd() + '\n' + newCoLines.join('\n') + '\n`;');
  changed = true;
}
if (changed) {
  fs.writeFileSync(path.join(ASSETS, 'geo.js'), geo, 'utf8');
}
console.log('✓ assets/geo.js 补齐货币', newCurLines.length, '| 补齐国家', newCoLines.length,
  newCoLines.length ? '' : '(已全，幂等跳过)');

/* geo.js 变了必须同步后端共享数据，保证前后端国家/货币表一致 */
try {
  require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'gen-geo-data.js')], { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  console.error('✗ gen-geo-data.js 执行失败，请手动重跑:', e.message);
}
}
