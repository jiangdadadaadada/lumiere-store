/* ============================================================
   LUMIÈRE · 白底常驻进程客户端
   ---------------------------------------------------------
   背景：rembg 的 u2netp 模型每次启动 Python 都要加载 ~4.8 秒，
   采集 60 张图若每张起一次进程，光加载模型就要 5 分钟。
   这里维护一个常驻 Python 进程（tools/whitebg.py daemon），
   模型只加载一次，之后通过 NDJSON 逐条下发任务。

   重要：pymatting 单张 800px 峰值内存近 2GiB，并发 3 张直接 OOM，
   所以这里严格串行 —— 一次只发一个任务，等回复再发下一个。
   ============================================================ */
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PY = 'C:\\Program Files\\Python312\\python.exe';
const WHITEBG = path.join(ROOT, 'tools', 'whitebg.py');
const TMP = path.join(ROOT, '_tmp');

let proc = null;
let ready = false;
let booting = false;
let seq = 0;
const pending = new Map();
let buf = '';

function env() {
  return { ...process.env, U2NET_HOME: path.join(ROOT, '_models'),
           TMP: TMP, TEMP: TMP, PYTHONUNBUFFERED: '1' };
}

function boot() {
  if (proc || booting) return booting ? Promise.resolve() : Promise.resolve();
  booting = true;
  fs.mkdirSync(TMP, { recursive: true });
  proc = spawn(PY, [WHITEBG, 'daemon'], {
    cwd: ROOT, env: env(), stdio: ['pipe', 'pipe', 'pipe']
  });
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch (e) { continue; }
      if (msg.ready !== undefined) { ready = !!msg.ready; booting = false; continue; }
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); p.resolve(msg); }
    }
  });
  proc.stderr.on('data', () => {});
  proc.on('exit', () => {
    ready = false; booting = false; proc = null; buf = '';
    /* 进程挂了：把等待中的任务全部失败掉，避免永久挂起 */
    pending.forEach((p) => p.resolve({ ok: false, error: '白底进程已退出' }));
    pending.clear();
  });
  return Promise.resolve();
}

function request(payload) {
  return new Promise((resolve) => {
    if (!proc) { resolve({ ok: false, error: '白底进程未启动' }); return; }
    const id = String(++seq);
    pending.set(id, { resolve });
    try { proc.stdin.write(JSON.stringify(Object.assign({ id }, payload)) + '\n'); }
    catch (e) { pending.delete(id); resolve({ ok: false, error: e.message }); }
  });
}

/* 等待就绪（最多 60 秒：模型加载约 5 秒） */
function waitReady(timeoutMs) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (ready) return resolve(true);
      if (Date.now() - t0 > (timeoutMs || 60000)) return reject(new Error('白底进程启动超时'));
      setTimeout(tick, 100);
    };
    tick();
  });
}

/**
 * 单张转换（走常驻进程，串行）
 * @returns {ok, path, before, changed, error}
 */
async function convertOne(srcFile, outFile) {
  await boot();
  await waitReady();
  const r = await request({ src: srcFile, out: outFile });
  if (!r || !r.ok) return { ok: false, error: (r && r.error) || '白底转换失败' };
  return { ok: true, before: r.before, changed: r.changed };
}

/** 批量转换（走常驻进程，内部逐条串行） */
async function convertItems(items) {
  await boot();
  await waitReady();
  const out = [];
  for (const it of items) {
    const r = await request({ src: it.src, out: it.out });
    out.push({
      src: it.src, out: it.out, ok: !!(r && r.ok),
      before: r && r.before, changed: r && r.changed,
      error: (r && r.error) || null
    });
  }
  return out;
}

function shutdown() {
  if (!proc) return;
  try { proc.stdin.write(JSON.stringify({ cmd: 'quit' }) + '\n'); } catch (e) {}
  try { proc.kill(); } catch (e) {}
  proc = null; ready = false;
}

module.exports = { convertOne, convertItems, boot, waitReady, shutdown,
                   get ready() { return ready; } };
