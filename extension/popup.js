/* ============================================================
   LUMIÈRE 采集器 · popup
   两个模式：单页采集 / 全店采集
   ============================================================ */
'use strict';

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await new Promise((res) => chrome.runtime.sendMessage({ type:'registerBuild', scope:'popup' }, res));
  } catch (e) {}

  chrome.runtime.sendMessage({ type: 'getState' }, (r) => {
    if (r && r.ok && r.state) render(r.state);
  });

  checkServer();
  checkVersion();

  /* ===== Tab 切换 ===== */
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      $('panel-' + t.dataset.tab).classList.add('active');
    });
  });

  /* ===== 单页采集 ===== */
  $('btnStart').addEventListener('click', startSingle);
  $('btnAdmin').addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://127.0.0.1:8080/admin.html' });
  });
  $('btnReload').addEventListener('click', () => {
    $('verTxt').textContent = '正在更新…';
    chrome.runtime.sendMessage({ type: 'forceReload' }, () => setTimeout(() => location.reload(), 400));
  });

  /* ===== 全店采集 ===== */
  $('btnShopScan').addEventListener('click', startShopScan);
  $('btnShopGo').addEventListener('click', startShopCollect);
});

/* ---------------- 版本自检 ---------------- */
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

/* ---------------- 单页采集 ---------------- */
function startSingle() {
  const limit = Math.max(1, Math.min(200, Number($('limit').value) || 60));
  const btn = $('btnStart');
  btn.disabled = true;
  btn.textContent = '采集中…';
  $('prog').classList.remove('hidden');
  $('resSec').classList.add('hidden');
  $('shopScanSec').classList.add('hidden');

  chrome.runtime.sendMessage({ type: 'start', cfg: { limit }, clickAt: Date.now() }, (r) => {
    if (!r || !r.ok) {
      btn.disabled = false;
      btn.textContent = '采集到草稿箱';
      $('prog').classList.add('hidden');
      alert((r && r.error) || '启动失败');
    }
  });
}

/* ---------------- 全店：扫描阶段 ---------------- */
function startShopScan() {
  const btn = $('btnShopScan');
  btn.disabled = true;
  btn.textContent = '扫描中…';
  $('prog').classList.remove('hidden');
  $('prog').classList.remove('hidden');
  $('resSec').classList.add('hidden');
  $('shopScanSec').classList.add('hidden');
  $('pmsg').textContent = '正在扫描店铺商品…';
  $('bar').style.width = '0%';
  $('pnum').textContent = '';

  const pages = Math.max(1, Math.min(200, Number($('shopPages').value) || 30));

  chrome.runtime.sendMessage({ type: 'shopScan', cfg: { pages } }, (r) => {
    btn.disabled = false;
    if (!r || !r.ok) {
      btn.textContent = '扫描当前店铺全部商品';
      $('prog').classList.add('hidden');
      alert((r && r.error) || '扫描失败');
    }
  });
}

/* ---------------- 全店：开始采集 ---------------- */
function startShopCollect() {
  const concurrency = Math.max(1, Math.min(10, Number($('shopConcurrency').value) || 4));
  const skipExisting = $('shopSkipExisting').checked;

  $('btnShopGo').disabled = true;
  $('btnShopGo').textContent = '采集中…';
  $('prog').classList.remove('hidden');
  $('shopScanSec').classList.add('hidden');

  chrome.runtime.sendMessage(
    { type: 'shopCollect', cfg: { concurrency, skipExisting } },
    (r) => {
      if (!r || !r.ok) {
        $('btnShopGo').disabled = false;
        $('btnShopGo').textContent = '开始采集';
        $('prog').classList.add('hidden');
        alert((r && r.error) || '启动失败');
      }
    }
  );
}

/* ---------------- 渲染 ---------------- */
function render(s) {
  s = s || {};
  const running = !!s.running;

  /* 单页按钮 */
  $('btnStart').disabled = running;
  $('btnStart').textContent = running ? '采集中…' : '采集当前页并入库';

  /* 店铺按钮 */
  $('btnShopScan').disabled = running;
  $('btnShopScan').textContent = running ? '进行中…' : '扫描当前店铺全部商品';

  const hasMsg = !!s.message;
  $('prog').classList.toggle('hidden', !running && !hasMsg && s.phase !== 'shop-scan-done');

  if (hasMsg) {
    $('pmsg').textContent = s.message;
    let pct = 0;
    if (s.phase === 'done' || s.phase === 'shop-done') pct = 100;
    else if (s.phase === 'import') pct = 100;
    else if (s.total) pct = Math.round((s.done / s.total) * 100);
    $('bar').style.width = pct + '%';
    $('pnum').textContent = s.total ? (s.done + '/' + s.total) : '';
  }

  /* 店铺扫描完成 */
  if (s.phase === 'shop-scan-done') {
    $('shopScanSec').classList.remove('hidden');
    $('prog').classList.add('hidden');
    $('shopFound').textContent = s.shopFound || 0;
    $('shopScanInfo').textContent =
      '去重后 ' + (s.shopUnique || 0) + ' 款待采' +
      (s.shopSkippedExisting ? ('（已采过 ' + s.shopSkippedExisting + ' 款）') : '');
    $('btnShopGo').disabled = false;
    $('btnShopGo').textContent = '开始采集 ' + (s.shopUnique || 0) + ' 款';
  }

  /* 结果 */
  if (s.phase === 'done' || s.phase === 'shop-done' || s.phase === 'error') {
    $('resSec').classList.remove('hidden');
    $('cnt').textContent = s.imported || 0;
    $('btnShopGo').disabled = false;
    $('btnShopGo').textContent = '开始采集';
    $('btnShopScan').disabled = false;
    $('btnShopScan').textContent = '扫描当前店铺全部商品';
    const failed = s.importFailed || 0;
    if (s.phase === 'error') {
      $('impMsg').className = 'note err';
      $('impMsg').textContent = s.message || '失败';
    } else {
      $('impMsg').className = failed ? 'note' : 'note ok';
      const actionLabel = s.phase === 'shop-done' ? '全店采集' : '存草稿';
      $('impMsg').textContent = actionLabel + ' ' + (s.imported || 0) + ' 款' +
        (failed ? ('，失败 ' + failed + ' 款') : '') +
        '，图片已转白底';
    }
  }
}

/* ---------------- 来自 background 的推送 ---------------- */
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (['progress', 'done', 'error', 'reset'].includes(msg.type)) {
    render(msg.state);
  }
});
