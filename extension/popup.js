/* ============================================================
   LUMIÈRE 采集器 · popup
   一个按钮：采集当前页 → 自动转白底 → 存入草稿箱
   ============================================================ */
'use strict';

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  /* 构建号上报给 service worker，由它统一重载扩展并复活页面按钮。
     这里不再自己调 chrome.runtime.reload() —— 那会让已打开页面的
     content script 上下文失效，按钮变死。 */
  try {
    await new Promise((res) => chrome.runtime.sendMessage({ type:'registerBuild', scope:'popup' }, res));
  } catch (e) {}

  chrome.runtime.sendMessage({ type: 'getState' }, (r) => {
    if (r && r.ok && r.state) render(r.state);
  });

  checkServer();
  checkVersion();
  $('btnStart').addEventListener('click', start);
  $('btnAdmin').addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://127.0.0.1:8080/admin.html' });
  });
  $('btnReload').addEventListener('click', () => {
    $('verTxt').textContent = '正在更新…';
    chrome.runtime.sendMessage({ type: 'forceReload' }, () => setTimeout(() => location.reload(), 400));
  });
});

/* ---------------- 版本自检：浏览器实际版本 vs 服务端 ---------------- */
function checkVersion() {
  const bar = $('verbar'), txt = $('verTxt'), btn = $('btnReload');
  chrome.runtime.sendMessage({ type: 'getBuild' }, (r) => {
    if (!r || !r.ok) { txt.textContent = '版本检查失败'; return; }
    const local = r.local || '?', server = r.server || '?';
    if (server && local !== server) {
      bar.className = 'verbar outdated';
      txt.textContent = '扩展过期 ' + local + ' → 新版 ' + server;
      btn.classList.remove('hidden');
    } else {
      bar.className = 'verbar latest';
      txt.textContent = '扩展已是最新 · ' + local;
      btn.classList.add('hidden');
    }
  });
}

/* ---------------- 服务检查 ---------------- */
function checkServer() {
  const el = $('srv');
  el.textContent = '检查本地服务…';
  el.className = 't2';
  chrome.runtime.sendMessage({ type: 'checkServer' }, (r) => {
    if (r && r.ok) {
      el.textContent = '本地服务已连接';
      el.className = 't2 ok';
    } else {
      el.textContent = '本地服务未启动（' + ((r && r.error) || '连接失败') + '）';
      el.className = 't2 err';
    }
  });
}

/* ---------------- 一键采集 ---------------- */
function start() {
  const limit = Math.max(1, Math.min(200, Number($('limit').value) || 60));
  const btn = $('btnStart');
  btn.disabled = true;
  btn.textContent = '采集中…';
  $('prog').classList.remove('hidden');
  $('resSec').classList.add('hidden');

  chrome.runtime.sendMessage({ type: 'start', cfg: { limit } }, (r) => {
    if (!r || !r.ok) {
      btn.disabled = false;
      btn.textContent = '采集到草稿箱';
      $('prog').classList.add('hidden');
      alert((r && r.error) || '启动失败');
    }
  });
}

/* ---------------- 渲染 ---------------- */
function render(s) {
  s = s || {};
  const running = !!s.running;

  $('btnStart').disabled = running;
  $('btnStart').textContent = running ? '采集中…' : '采集到草稿箱';

  const hasMsg = !!s.message;
  $('prog').classList.toggle('hidden', !running && !hasMsg);

  if (hasMsg) {
    $('pmsg').textContent = s.message;
    let pct = 0;
    if (s.phase === 'done') pct = 100;
    else if (s.phase === 'import') pct = 100;
    else if (s.total) pct = Math.round((s.done / s.total) * 100);
    $('bar').style.width = pct + '%';
    $('pnum').textContent = s.total ? (s.done + '/' + s.total) : '';
  }

  /* 结果 */
  if (s.phase === 'done' || s.phase === 'error') {
    $('resSec').classList.remove('hidden');
    $('cnt').textContent = s.imported || 0;
    const failed = s.importFailed || 0;
    if (s.phase === 'error') {
      $('impMsg').className = 'note err';
      $('impMsg').textContent = s.message || '失败';
    } else {
      $('impMsg').className = failed ? 'note' : 'note ok';
      $('impMsg').textContent = '存草稿 ' + (s.imported || 0) + ' 款' +
        (failed ? ('，失败 ' + failed + ' 款') : '') +
        '，图片已转白底';
    }
  }
}

/* ---------------- 来自 background 的推送 ---------------- */
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === 'progress' || msg.type === 'done' || msg.type === 'error' || msg.type === 'reset') {
    render(msg.state);
  }
});
