/* ============================================================
   LUMIÈRE · 后端共享地理数据生成器
   从 assets/geo.js 的两张数据表自动提取，生成 geo-data.js。
   用法: node gen-geo-data.js
   改了 geo.js 的国家/货币数据表后，务必重跑此脚本，
   保证前后端地理映射完全一致。
   ============================================================ */
const fs = require('fs');
const src = fs.readFileSync('assets/geo.js', 'utf8');
const cur = src.match(/const CURRENCY_DATA = `[\s\S]*?`;/)[0];
const country = src.match(/const COUNTRY_DATA = `[\s\S]*?`;/)[0];

const out = `/* LUMIÈRE · 共享地理数据（由 gen-geo-data.js 自动生成，请勿手改） */
${cur}

${country}

export const CURRENCIES = {};
CURRENCY_DATA.trim().split("\\n").forEach(line => {
  const [code, symbol, name, rate, dec] = line.split("~");
  if (!CURRENCIES[code]) CURRENCIES[code] = { symbol, name, rate: parseFloat(rate), dec: parseInt(dec, 10) };
});

export const COUNTRY_LIST = [];
export const GEO = {};
COUNTRY_DATA.trim().split("\\n").forEach(line => {
  const [code, zh, en, flag, lang, currency, cod] = line.split("|");
  const pay = cod === "1" ? ["cod","card","crypto"] : ["card","crypto"];
  COUNTRY_LIST.push({ code, zh, en, flag, lang, currency, pay });
  GEO[code] = { lang, currency, pay };
});

export const GEO_DEFAULT = { lang: "en", currency: "USD", pay: ["crypto","card"] };
`;

fs.writeFileSync('geo-data.js', out, 'utf8');
console.log('✓ geo-data.js 已生成（' + out.length + ' 字节）');
