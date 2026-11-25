/* ============================================================
   把 _shell/*.json（41 语言词条）汇总成 assets/i18n-shell.js
   改词条流程：改 _shell/<lang>.json → node build-i18n-shell.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const LANGS = ('zh en ja ko th vi id ms tl de nl sv da no fi fr es it pt ro ru uk pl cs el hu ar he fa ur tr ' +
  'hi bn mr ta km my sr sw af kk').split(' ');

const dir = path.join(__dirname, '_shell');
const out = {};
LANGS.forEach(l => {
  const p = path.join(dir, l + '.json');
  if (!fs.existsSync(p)) throw new Error('缺少词条文件: ' + l + '.json');
  out[l] = JSON.parse(fs.readFileSync(p, 'utf8'));
});

/* key 一致性校验：全部语言必须与英文基线同 key */
const base = Object.keys(out.en).sort().join(',');
LANGS.forEach(l => {
  const k = Object.keys(out[l]).sort().join(',');
  if (k !== base) throw new Error(l + ' 的 key 与英文基线不一致');
});

const js = '/* 联系页 / 站内聊天 / 支付开关 词条补丁（41 语言）\n' +
  '   独立文件，避免改动 41 个既有语言包；app.js 启动时合并进 I18N[lang].ui。\n' +
  '   本文件由 build-i18n-shell.js 从 _shell/*.json 汇总生成，请勿手改。 */\n' +
  'window.I18N_SHELL = ' + JSON.stringify(out) + ';\n';

fs.writeFileSync(path.join(__dirname, 'assets', 'i18n-shell.js'), js);
console.log('✓ 已生成 assets/i18n-shell.js：' + LANGS.length + ' 语言 × ' + Object.keys(out.en).length +
  ' 词条，' + (js.length / 1024).toFixed(1) + 'KB');
