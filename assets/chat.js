/* ============================================================
   LUMIÈRE · 站内聊天（访客端浮窗）
   与后端 /api/chat/* 配合，轮询收发；静态部署无后端时自动隐藏
   ============================================================ */

(function () {
  if (window.__lumChatInit) return;
  window.__lumChatInit = true;

  const SID_KEY = 'lumiere_chat_sid';
  const OPEN_KEY = 'lumiere_chat_open';

  function ct(key, fallback) {
    try {
      const v = (typeof t === 'function') ? t(key) : key;
      return (!v || v === key) ? fallback : v;
    } catch (e) { return fallback; }
  }
  function sid() { try { return localStorage.getItem(SID_KEY) || ''; } catch (e) { return ''; } }
  function setSid(v) { try { localStorage.setItem(SID_KEY, v); } catch (e) {} }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function api(path, opt) {
    return fetch(path, opt).then(r => r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)));
  }

  /* ---------- DOM ---------- */
  function build() {
    if (document.getElementById('chat-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'chat-fab';
    fab.className = 'chat-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', ct('chat_title', '在线客服'));
    fab.innerHTML = `<span class="chat-fab-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7"
             stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.3-.6L3 21l1.7-4.6A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/></svg>
      </span><span class="chat-fab-dot" hidden></span>`;

    const panel = document.createElement('div');
    panel.id = 'chat-panel';
    panel.className = 'chat-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="chat-head">
        <div class="chat-head-txt">
          <strong>${esc(ct('chat_title', '在线客服'))}</strong>
          <span class="chat-status"><i></i>${esc(ct('chat_online', '通常几分钟内回复'))}</span>
        </div>
        <button type="button" class="chat-x" id="chat-x" aria-label="close">×</button>
      </div>
      <div class="chat-body" id="chat-body"></div>
      <form class="chat-form" id="chat-form" autocomplete="off">
        <input id="chat-input" type="text" maxlength="800" placeholder="${esc(ct('chat_placeholder', '想问点什么？直接说…'))}">
        <button type="submit" id="chat-send" aria-label="send">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg>
        </button>
      </form>
`;

    /* 邮箱 / WhatsApp 也做成和聊天浮标一样的圆形按钮，竖排在聊天浮标上方 */
    const cfabs = document.createElement('div');
    cfabs.id = 'chat-contact-fabs';
    cfabs.className = 'chat-contact-fabs';
    cfabs.hidden = true;
    cfabs.innerHTML = `
      <div class="chat-cfab-item">
        <span class="chat-cfab-tip" id="tip-wa" aria-hidden="true"></span>
        <a class="chat-cfab is-wa" id="cf-wa" href="#" target="_blank" rel="noopener" aria-label="WhatsApp">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
        </a>
      </div>
      <div class="chat-cfab-item">
        <span class="chat-cfab-tip" id="tip-mail" aria-hidden="true"></span>
        <a class="chat-cfab is-mail" id="cf-mail" href="#" aria-label="${esc(ct('chat_mail', '邮箱'))}">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>
        </a>
      </div>`;
    document.body.appendChild(fab);
    document.body.appendChild(panel);
    document.body.appendChild(cfabs);

    paintContacts();
    fab.addEventListener('click', () => toggle(true));
    panel.querySelector('#chat-x').addEventListener('click', () => toggle(false));
    panel.querySelector('#chat-form').addEventListener('submit', onSend);
  }

  /* 底部联系方式：读后台「联系方式」里的客服邮箱与 WhatsApp，有就显示，没有就不占位置 */
  function paintContacts() {
      const box = document.getElementById('chat-contact-fabs');
      if (!box) return;
    api('/api/settings').then(s => {
      const c = (s && (s.contact || (s.settings && s.settings.contact))) || {};
      const mail = String(c.email || '').trim();
      const wa = String(c.whatsapp || '').trim();
      const waDigits = wa.replace(/[^0-9]/g, '');
      const mailBtn = document.getElementById('cf-mail');
      const waBtn = document.getElementById('cf-wa');
      if (mailBtn) {
        mailBtn.hidden = !mail;
        if (mail) {
          const label = ct('chat_mail', '邮箱') + '：' + mail;
          mailBtn.href = 'mailto:' + mail;
          mailBtn.setAttribute('title', label);
          mailBtn.setAttribute('aria-label', label);
          const tip = document.getElementById('tip-mail');
          if (tip) tip.textContent = label;
        }
      }
      if (waBtn) {
        waBtn.hidden = !waDigits;
        if (waDigits) {
          const label = 'WhatsApp：' + wa;
          waBtn.href = 'https://wa.me/' + waDigits;
          waBtn.setAttribute('title', label);
          waBtn.setAttribute('aria-label', label);
          const tip = document.getElementById('tip-wa');
          if (tip) tip.textContent = label;
        }
      }
      box.hidden = !(mail || waDigits);
    }).catch(() => {});
  }

  /* 面板固定文案（标题/在线状态/占位符/底部链接）
     建好后不随语言变化，所以语言切换或每次展开时重绘一次 */
  function paintStatic() {
    const panel = document.getElementById('chat-panel');
    if (!panel) return;
    const title = panel.querySelector('.chat-head-txt strong');
    if (title) title.textContent = ct('chat_title', '在线客服');
    const status = panel.querySelector('.chat-status');
    if (status) status.innerHTML = '<i></i>' + esc(ct('chat_online', '通常几分钟内回复'));
    const input = panel.querySelector('#chat-input');
    if (input) input.placeholder = ct('chat_placeholder', '想问点什么？直接说…');
    const fab = document.getElementById('chat-fab');
    if (fab) fab.setAttribute('aria-label', ct('chat_title', '在线客服'));
    /* 还没有对话消息时，欢迎语也跟着换语言 */
    if (rendered === 0) welcome();
  }

  function toggle(open) {
    if (open) paintContacts();
    const panel = document.getElementById('chat-panel');
    const fab = document.getElementById('chat-fab');
    if (!panel) return;
    paintStatic();
    panel.hidden = !open;
    fab.classList.toggle('is-open', open);
    document.body.classList.toggle('chat-open', open);
    if (open) {
      clearBadge();
      document.getElementById('chat-input') && document.getElementById('chat-input').focus();
      pull(true);
      startPoll();
    } else stopPoll();
  }

  /* ---------- 渲染 ---------- */
  function welcome() {
    const body = document.getElementById('chat-body');
    if (!body) return;
    body.innerHTML = `<div class="chat-note">${esc(ct('chat_welcome', '欢迎来到 LUMIÈRE。关于尺寸、材质、配送隐私或订单，都可以直接问。'))}</div>`;
  }
  function bubble(m) {
    const mine = m.from === 'user';
    const time = new Date(m.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="chat-msg ${mine ? 'mine' : 'staff'}">
      <div class="chat-bubble">${esc(m.text)}</div>
      <div class="chat-time">${time}</div>
    </div>`;
  }
  let rendered = 0;
  function render(list, reset) {
    const body = document.getElementById('chat-body');
    if (!body) return;
    if (reset) { rendered = 0; body.innerHTML = ''; }
    if (!list.length) { welcome(); return; }
    if (rendered === 0) body.innerHTML = '';
    const html = list.slice(rendered).map(bubble).join('');
    if (html) body.insertAdjacentHTML('beforeend', html);
    rendered = list.length;
    body.scrollTop = body.scrollHeight;
  }

  /* ---------- 数据 ---------- */
  let timer = null, badgeTimer = null, lastStaffTs = '';

  function pull(reset) {
    const s = sid();
    if (!s) { if (reset) render([], true); return Promise.resolve(); }
    return api('/api/chat/messages?sessionId=' + encodeURIComponent(s))
      .then(d => {
        const list = d.messages || [];
        render(list, !!reset);
        const staff = [...list].reverse().find(m => m.from === 'staff');
        lastStaffTs = staff ? staff.ts : '';
      })
      .catch(() => {});
  }

  function onSend(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = (input.value || '').trim();
    if (!text) return;
    input.value = '';
    /* 先本地回显，再发后端 */
    const body = document.getElementById('chat-body');
    const note = body.querySelector('.chat-note');
    if (note) { body.innerHTML = ''; rendered = 0; }
    body.insertAdjacentHTML('beforeend', bubble({ from: 'user', text, ts: new Date().toISOString() }));
    rendered++;
    body.scrollTop = body.scrollHeight;

    api('/api/chat/message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sid() || undefined, text,
        lang: (typeof state !== 'undefined' && state.lang) || 'zh',
        country: (typeof state !== 'undefined' && state.country) || ''
      })
    }).then(d => {
      if (d && d.sessionId) {
        const isNew = !sid();
        setSid(d.sessionId);
        if (isNew) return pull(true);   /* 新会话拉一次服务端（含真实时间戳） */
      }
    }).catch(() => {
      body.insertAdjacentHTML('beforeend',
        `<div class="chat-note">${esc(ct('chat_offline', '消息暂未送达，请稍后重试或改用邮件联系。'))}</div>`);
    });
  }

  function startPoll() {
    stopPoll();
    timer = setInterval(() => pull(false), 4000);
  }
  function stopPoll() { if (timer) { clearInterval(timer); timer = null; } }

  function badge() {
    const dot = document.querySelector('#chat-fab .chat-fab-dot');
    if (dot) dot.hidden = false;
  }
  function clearBadge() {
    const dot = document.querySelector('#chat-fab .chat-fab-dot');
    if (dot) dot.hidden = true;
  }

  /* 关闭状态下的轻量轮询：有客服回复就亮小红点 */
  function startBadgePoll() {
    stopBadgePoll();
    badgeTimer = setInterval(() => {
      const s = sid();
      if (!s) return;
      api('/api/chat/messages?sessionId=' + encodeURIComponent(s))
        .then(d => {
          const staff = [...(d.messages || [])].reverse().find(m => m.from === 'staff');
          if (staff && staff.ts !== lastStaffTs) { lastStaffTs = staff.ts; badge(); }
        })
        .catch(() => {});
    }, 20000);
  }
  function stopBadgePoll() { if (badgeTimer) { clearInterval(badgeTimer); badgeTimer = null; } }

  /* ---------- 启动 ---------- */
  function boot() {
    api('/api/settings').then(s => {
      if (!s || s.chatEnabled === false) return;   /* 后台关掉聊天则不注入 */
      build();
      /* 语言切换后重绘面板文案 */
      document.addEventListener('lumiere:lang', () => paintStatic());
      /* 始终默认收起：只有访客点气泡才展开，刷新不恢复上次状态 */
      try { localStorage.removeItem(OPEN_KEY); } catch (e) {}
      paintStatic();
      startBadgePoll();
      pull(false);
    }).catch(() => { /* 无后端（纯静态）不显示聊天 */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
