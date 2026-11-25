/* ============================================================
   LUMIÈRE 采集器 · 页面内悬浮按钮
   ---------------------------------------------------------
   打开任意商品页，页面上直接出现「一键采集」按钮，
   点一下就采集当前页到草稿箱，不用去找工具栏图标。

   ★ 进度通知用 chrome.tabs.sendMessage（定向发给本页），
     不是 runtime.sendMessage —— 后者到不了 content script，
     会让按钮永远停在"正在读取当前页面…"（看起来像卡死）。
   ============================================================ */
(() => {
  'use strict';

  /* 扩展被重载后，页面上的旧按钮还在，但它的监听器已随旧上下文一起失效，
     点了毫无反应（死按钮）。
     这里先把旧按钮移除再重建 —— 新注入的脚本用新监听器接管。
     （注入同一个页面两次也不会出问题：旧的 DOM 已被移除） */
  try {
    const old = document.getElementById('lum-fab');
    if (old) old.remove();
  } catch (e) {}
  window.__LUM_FAB__ = true;


  /* 构建号上报给 service worker：
     由 background 统一决定要不要重载扩展，并在重载后把按钮重新挂上。
     （之前在这里自己调 chrome.runtime.reload()，会把本页的 content script
       上下文搞失效，按钮变成点了没反应的死按钮） */
  try {
    chrome.runtime.sendMessage({ type: 'registerBuild', scope: 'page' }, () => {});
  } catch (e) {}
  /* 再报一次：service worker 可能刚被唤醒，监听器还没就绪，
     第一次消息会丢。延迟 1.2 秒补报一次，确保版本检查一定执行。 */
  setTimeout(() => {
    try { chrome.runtime.sendMessage({ type: 'registerBuild', scope: 'page' }, () => {}); } catch (e) {}
  }, 1200);
  /* 后台管理页不显示按钮 */
  if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) return;

  /* ============================================================
     ★ 只在「货源站 / 电商站」出现按钮
     之前是无差别挂在所有页面上：随便一个空白页、文档页都顶着紫色
     「一键采集到草稿箱」，看着像流氓插件，也没有任何采集价值。
     现在两道判定，命中任一才挂按钮：
       ① 域名命中货源/电商白名单（1688、淘宝天猫、拼多多、京东、
          AliExpress、1688 的 Alibaba、Amazon、Temu、Shein、独立站…）
       ② 页面自身有商品特征：JSON-LD Product/Offer、og:type=product、
          schema.org/Product、product:price:amount，或"加入购物车/立即购买 + 价格"
     都不是就静默不显示；页面内容可能晚到，最多轮询 8 秒再放弃。
     ============================================================ */
  const SOURCE_HOSTS = [
    /(^|\.)1688\.com$/, /(^|\.)taobao\.com$/, /(^|\.)tmall\.com$/, /(^|\.)tmall\.hk$/,
    /(^|\.)yangkeduo\.com$/, /(^|\.)pinduoduo\.com$/, /(^|\.)jd\.com$/, /(^|\.)jd\.hk$/,
    /(^|\.)vip\.com$/, /(^|\.)kaola\.com$/, /(^|\.)suning\.com$/,
    /(^|\.)aliexpress\.com$/, /(^|\.)alibaba\.com$/, /(^|\.)taobao\.hk$/,
    /(^|\.)amazon\.(com|co\.jp|de|co\.uk|fr|it|es|ca)$/, /(^|\.)temu\.com$/,
    /(^|\.)shein\.com$/, /(^|\.)dhgate\.com$/, /(^|\.)made-in-china\.com$/,
    /(^|\.)shopify\.com$/, /(^|\.)myshopify\.com$/, /(^|\.)walmart\.com$/, /(^|\.)ebay\.(com|co\.uk|de)$/
  ];
  function isSourceHost() {
    const h = (location.hostname || '').toLowerCase();
    return SOURCE_HOSTS.some(re => re.test(h));
  }
  function pageLooksLikeProduct() {
    try {
      if (document.querySelector('meta[property="og:type"][content="product"]')) return true;
      if (document.querySelector('meta[property="product:price:amount"]')) return true;
      if (document.querySelector('[itemtype*="schema.org/Product"]')) return true;
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        if (/"(Product|Offer|AggregateOffer)"\s*:/.test(s.textContent || '')) return true;
      }
      /* 文本兜底：既要"加购/购买"动作词，也要价格符号，避免把资讯页当商品页 */
      const t = ((document.body && document.body.innerText) || '').slice(0, 6000);
      if (/加入购物车|立即购买|立即抢购|add to cart|buy now/i.test(t) && /[¥￥$]\s*\d/.test(t)) return true;
    } catch (e) {}
    return false;
  }
  /* ============================================================
     ★ 页面类型检测：单商品 / 店铺列表
     决定按钮显示"一键采集单商品"还是"一键全店采集"
     ============================================================ */
  function detectPageType() {
    try {
      const h = (location.hostname || '').toLowerCase();
      const p = (location.pathname || '') + (location.search || '');

      /* 1688 店铺页 */
      if (h.endsWith('.1688.com') && !/(^|\.)(detail|offer|offers|upload|img|cbu\d+|.*\.alicdn)\./.test(h)) {
        if (/offerlist|search/i.test(p)) return 'shop';
        if (/\/page\/offerlist/i.test(p)) return 'shop';
        /* 1688 商品详情页：offer/\d+ 或 goods/detail */
        if (/\/offer\/\d+/i.test(p) || /goods\/detail/i.test(p) || /^\/offer\.htm/i.test(p)) return 'single';
      }

      /* 通用：单商品页特征 */
      if (document.querySelector('meta[property="og:type"][content="product"]')) return 'single';
      if (document.querySelector('[itemtype*="schema.org/Product"]')) return 'single';
      if (document.querySelector('meta[property="product:price:amount"]')) return 'single';

      /* 通用：店铺/列表页特征 */
      if (/\/offerlist|\/shop|\/store|\/category|\/list|\/search/i.test(p)) {
        if (document.querySelectorAll('a[href*="/offer/"], a[href*="item.taobao"], a[href*="/goods/"]').length >= 4) {
          return 'shop';
        }
      }
    } catch (e) {}
    return 'single';  /* 默认 */
  }

  /* 当前页是不是该显示按钮 */
  function shouldShow() { return isSourceHost() || pageLooksLikeProduct(); }

  const CSS = `
  #lum-fab{position:fixed;bottom:24px;right:24px;z-index:2147483647;font-family:-apple-system,"Segoe UI",sans-serif}
  #lum-fab .lum-btn{display:flex;align-items:center;gap:8px;padding:12px 18px;border:0;border-radius:28px;
    background:linear-gradient(135deg,#7c5cff,#b06ab3);color:#fff;font-size:15px;font-weight:700;cursor:pointer;
    box-shadow:0 6px 20px rgba(124,92,255,.45);letter-spacing:.5px;transition:transform .15s,box-shadow .15s;user-select:none}
  #lum-fab .lum-btn:hover{transform:translateY(-2px);box-shadow:0 9px 26px rgba(124,92,255,.6)}
  #lum-fab .lum-btn:disabled{opacity:.7;cursor:wait;transform:none}
  #lum-fab .lum-info{margin-top:8px;max-width:340px;padding:10px 12px;border-radius:12px;background:#fff;
    color:#333;font-size:12px;line-height:1.6;box-shadow:0 4px 16px rgba(0,0,0,.18);display:none}
  #lum-fab .lum-info.show{display:block}
  #lum-fab .lum-info.err{color:#b42318}
  #lum-fab .lum-sub{margin-top:6px;padding-top:6px;border-top:1px solid #f0f0f0;font-size:11px;color:#888;
    word-break:break-all;max-height:84px;overflow:auto}
  #lum-fab .lum-bar{height:5px;border-radius:3px;background:#eee;margin-top:6px;overflow:hidden}
  #lum-fab .lum-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#7c5cff,#b06ab3);transition:width .3s}
  `;

  function mount() {
    if (document.getElementById('lum-fab')) return;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.id = 'lum-fab';
    wrap.innerHTML = `
      <button class="lum-btn" id="lum-fab-btn">◈ 一键采集到草稿箱</button>
      <div class="lum-info" id="lum-fab-info">
        <span id="lum-fab-msg"></span>
        <div class="lum-sub" id="lum-fab-sub" style="display:none"></div>
        <div class="lum-bar"><i id="lum-fab-bar"></i></div>
      </div>`;
    (document.body || document.documentElement).appendChild(wrap);

    const btn = document.getElementById('lum-fab-btn');
    const info = document.getElementById('lum-fab-info');
    const msg = document.getElementById('lum-fab-msg');
    const sub = document.getElementById('lum-fab-sub');
    const bar = document.getElementById('lum-fab-bar');

    const setMsg = (t) => { if (msg) msg.textContent = t; };
    const setBar = (p) => { if (bar) bar.style.width = Math.max(0, Math.min(100, p)) + '%'; };
    /* 失败时补一行诊断（页面地址 + 链接统计），方便截图排查 */
    const setSub = (t) => {
      if (!sub) return;
      if (!t) { sub.style.display = 'none'; sub.textContent = ''; return; }
      sub.textContent = t; sub.style.display = 'block';
    };

    btn.addEventListener('click', () => {
      /* ★ 点击只做采集，绝不在点击路径里触发 registerBuild：
         registerBuild 一旦触发 chrome.runtime.reload()，会销毁正在处理的 start 消息，
         SW 一死，按钮就永远卡在「采集中…」。版本更新交给 ①页面加载时(见文件头) ②SW 启动时 ③popup 自查，
         刷新一次页面即可完成更新，点击本身保持纯粹、不被打断。 */
      btn.disabled = true;
      btn.textContent = '采集中…';
      info.classList.add('show');
      setMsg('正在读取当前页面…');
      setBar(0);
      /* ★ 把当前页面的真实 URL 随消息带上：SW 不再靠 chrome.tabs.query(active)
         去猜「当前标签」，多标签时激活态可能是别的页面，导致采错页面。 */
      chrome.runtime.sendMessage({ type: 'start', cfg: { limit: 60 }, clickAt: Date.now(), url: location.href }, (r) => {
        if (chrome.runtime.lastError) {
          btn.disabled = false;
          btn.textContent = '◈ 再采集一次';
          setMsg('扩展刚更新，请再点一次采集');
          return;
        }
        if (!r || !r.ok) {
          btn.disabled = false;
          btn.textContent = '◈ 一键采集到草稿箱';
          setMsg('启动失败：' + ((r && r.error) || '未知错误'));
        }
      });
    });

    /* 预热 service worker：
       MV3 的 SW 空闲 30 秒就被回收，下次唤醒要重新加载脚本，
       系统负载高时这一步能到 1~2 秒（用户看到的就是按钮卡在"正在读取当前页面…"）。
       鼠标移到按钮上就先把它唤醒，等真正点击时 SW 已经是热的。 */
    let warming = false;
    let lastWarm = 0;
    const warm = () => {
      if (warming) return;
      const now = Date.now();
      if (now - lastWarm < 1500) return;   /* 节流，别把 SW 吵醒太频繁 */
      warming = true; lastWarm = now;
      try {
        chrome.runtime.sendMessage({ type: 'ping' }, () => {
          warming = false;
          void chrome.runtime.lastError;
        });
      } catch (e) { warming = false; }
    };
    btn.addEventListener('mouseenter', warm);
    btn.addEventListener('focus', warm);
    /* 页面加载后延迟一点再预热：别在页面渲染高峰期跟主线程抢资源 */
    setTimeout(warm, 1500);

    /* 进度通知：只认本页定向发来的消息（background 用 tabs.sendMessage） */
    chrome.runtime.onMessage.addListener((m) => {
      if (!m || !m.state) return;
      try {
        window.__LUM_MSG_LOG__ = window.__LUM_MSG_LOG__ || [];
        window.__LUM_MSG_LOG__.push(m.type + ':' + (m.state.message || '').slice(0, 30));
      } catch (e) {}
      const s = m.state;
      if (m.type === 'progress') {
        setMsg(s.message || '采集中…');
        setBar(s.total ? Math.round((s.done / s.total) * 100) : 0);
      } else if (m.type === 'done' || m.type === 'error') {
        setMsg(s.message || (m.type === 'done' ? '完成' : '失败'));
        setBar(100);
        btn.disabled = false;
        btn.textContent = '◈ 再采集一次';
        if (m.type === 'error') {
          info.classList.add('err');
          const d = s.diag || {};
          const bits = [];
          if (d.pageTitle) bits.push(d.pageTitle);
          if (d.totalLinks) bits.push('页面 ' + d.totalLinks + ' 个链接 / 认出 ' + (d.linkCount || 0) + ' 个商品链接');
          if (d.url) bits.push(d.url);
          setSub(bits.join(' · '));
        } else {
          info.classList.remove('err');
          setSub('');
        }
      } else if (m.type === 'reset') {
        btn.disabled = false;
        btn.textContent = '◈ 一键采集到草稿箱';
        info.classList.remove('show');
      }
    });

    /* 同步已在进行中的任务状态 */
    try {
      chrome.runtime.sendMessage({ type: 'getState' }, (r) => {
        if (chrome.runtime.lastError) return;
        if (r && r.ok && r.state && r.state.running) {
          btn.disabled = true;
          btn.textContent = '采集中…';
          info.classList.add('show');
          setMsg(r.state.message || '采集中…');
        }
      });
    } catch (e) {}
  }

  /* 只有货源/电商页才挂按钮；页面内容晚到时轮询最多 8 秒 */
  let tries = 0;
  const boot = () => {
    if (shouldShow()) {
      if (document.body) mount();
      else document.addEventListener('DOMContentLoaded', mount, { once: true });
      return true;
    }
    return false;
  };
  if (!boot()) {
    const timer = setInterval(() => {
      tries++;
      if (boot() || tries >= 10) clearInterval(timer);
    }, 800);
  }
})();
