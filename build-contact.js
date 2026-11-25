/* 临时构建脚本：用 index.html 的头部/页脚外壳生成 contact.html（可重复执行） */
const fs = require('fs');

const idx = fs.readFileSync('index.html', 'utf8');
const start = idx.indexOf('</header>') + '</header>'.length;
const end = idx.indexOf('<footer');
if (start < 10 || end < 0) throw new Error('未找到外壳边界');

const CONTACT = `
  <main class="contact-wrap">
    <div class="contact-head">
      <h1 data-i18n="contact_title">联系我们</h1>
      <p data-i18n="contact_sub">关于尺寸、材质、配送隐私或订单，我们都在。</p>
    </div>

    <div class="channel-grid">
      <div class="channel-card">
        <div class="ch-ico" aria-hidden="true">◍</div>
        <h3 data-i18n="contact_chat">站内聊天</h3>
        <p data-i18n="contact_chat_desc">点右下角气泡即可对话，通常几分钟内回复。</p>
        <a href="#" class="ch-val" id="open-chat" data-i18n="contact_chat_cta">立即对话 →</a>
      </div>
      <div class="channel-card">
        <div class="ch-ico" aria-hidden="true">✉</div>
        <h3 data-i18n="contact_email">邮件</h3>
        <p data-i18n="contact_email_desc">适合订单、退换货与较复杂的问题。</p>
        <a class="ch-val" id="contact-email" href="mailto:care@lumiere.store">care@lumiere.store</a>
      </div>
      <div class="channel-card">
        <div class="ch-ico" aria-hidden="true">◷</div>
        <h3 data-i18n="contact_time">在线时间</h3>
        <p data-i18n="contact_time_desc">全年无休，节假日照常值守。</p>
        <div class="ch-val" id="contact-hours">7×24</div>
      </div>
    </div>

    <div class="contact-main">
      <section class="contact-panel">
        <h2 data-i18n="contact_form_title">给我们留言</h2>
        <p class="cp-sub" data-i18n="contact_form_sub">留下邮箱，我们会在 12 小时内回复。</p>
        <form id="contact-form" autocomplete="on">
          <div class="cf-row">
            <div class="cf-field">
              <label data-i18n="contact_name">称呼</label>
              <input id="c-name" maxlength="60" required>
            </div>
            <div class="cf-field">
              <label data-i18n="contact_email_label">邮箱</label>
              <input id="c-email" type="email" maxlength="120" required>
            </div>
          </div>
          <div class="cf-field">
            <label data-i18n="contact_subject">问题类型</label>
            <input id="c-subject" maxlength="120" data-i18n-ph="contact_subject_ph" placeholder="订单 / 配送 / 商品咨询">
          </div>
          <div class="cf-field">
            <label data-i18n="contact_message">内容</label>
            <textarea id="c-msg" maxlength="2000" required data-i18n-ph="contact_message_ph" placeholder="请描述你的问题…"></textarea>
          </div>
          <button class="btn btn-primary btn-block" type="submit" data-i18n="contact_send">发送留言</button>
          <div id="contact-result"></div>
        </form>
      </section>

      <section class="contact-panel">
        <h2 data-i18n="contact_faq">常见问题</h2>
        <p class="cp-sub" data-i18n="contact_faq_sub">先看看这里，也许立刻就有答案。</p>
        <div id="faq-list">
          <div class="faq-item">
            <button class="faq-q" type="button"><span data-i18n="faq1_q">包装是否保密？</span><span>+</span></button>
            <div class="faq-a" data-i18n="faq1_a">默认不透明中性包装，外箱无品牌标识，面单发货名为中性名称，不写任何商品内容。</div>
          </div>
          <div class="faq-item">
            <button class="faq-q" type="button"><span data-i18n="faq2_q">多久发货，支持全球直邮吗？</span><span>+</span></button>
            <div class="faq-a" data-i18n="faq2_a">现货 24 小时内出库，全球直邮，时效约 5–14 个工作日，具体按目的地而定。</div>
          </div>
          <div class="faq-item">
            <button class="faq-q" type="button"><span data-i18n="faq3_q">可以退换吗？</span><span>+</span></button>
            <div class="faq-a" data-i18n="faq3_a">未拆封商品 14 天内可退。出于卫生考虑，已拆封的贴身用品不支持非质量问题退换；质量问题 30 天内换新。</div>
          </div>
          <div class="faq-item">
            <button class="faq-q" type="button"><span data-i18n="faq4_q">支持哪些付款方式？</span><span>+</span></button>
            <div class="faq-a" data-i18n="faq4_a">按你所在地区自动匹配：货到付款、银行卡或加密货币。结账页只显示当前实际可用的方式。</div>
          </div>
        </div>
        <div class="contact-meta">
          <span data-i18n="contact_meta_1"><b>隐私：</b>所有对话与留言仅用于处理你的问题。</span>
        </div>
      </section>
    </div>
  </main>
`;

let out = idx.slice(0, start) + CONTACT + idx.slice(end);

/* 页脚「联系我们」指到真实联系页 */
out = out.replace(/href="privacy\.html" data-i18n="foot_contact"/g, 'href="contact.html" data-i18n="foot_contact"');
/* 标题 */
out = out.replace(/<title>[^<]*<\/title>/, '<title>Contact · LUMIÈRE</title>');
/* 引入聊天脚本（其余页面另有脚本处理） */
if (!out.includes('assets/chat.js')) {
  out = out.replace('<script src="assets/app.js"></script>',
    '<script src="assets/app.js"></script>\n  <script src="assets/chat.js"></script>');
}

/* 页面专属逻辑：留言提交 + FAQ 折叠 + 打开聊天 */
const pageJS = `
  <script>
  (function(){
    var form = document.getElementById('contact-form');
    var result = document.getElementById('contact-result');
    var emailEl = document.getElementById('contact-email');
    var hoursEl = document.getElementById('contact-hours');

    /* 后台配置的联系方式覆盖默认文案 */
    function paintContact(s){
      if (!s || !s.contact) return;
      if (s.contact.email && emailEl) { emailEl.textContent = s.contact.email; emailEl.href = 'mailto:' + s.contact.email; }
      if (s.contact.hours && hoursEl) hoursEl.textContent = s.contact.hours;
      var sub = document.querySelector('[data-i18n="contact_form_sub"]');
      if (sub && s.contact.responseHours) {
        var txt = (typeof t === 'function') ? t('contact_form_sub') : '';
        if (txt) sub.textContent = txt.replace(/\\d+/, s.contact.responseHours);
      }
    }
    fetch('/api/settings').then(function(r){ return r.json(); }).then(paintContact).catch(function(){});

    /* FAQ 折叠 */
    document.querySelectorAll('.faq-item').forEach(function(item){
      var q = item.querySelector('.faq-q');
      q.addEventListener('click', function(){
        var open = item.classList.toggle('open');
        q.lastElementChild.textContent = open ? '−' : '+';
      });
    });

    /* 打开站内聊天 */
    var openChat = document.getElementById('open-chat');
    if (openChat) openChat.addEventListener('click', function(e){
      e.preventDefault();
      var fab = document.getElementById('chat-fab');
      if (fab) fab.click();
      else location.href = 'mailto:' + ((emailEl && emailEl.textContent) || 'care@lumiere.store');
    });

    /* 留言提交 → 写入后台客服收件箱 */
    if (form) form.addEventListener('submit', function(e){
      e.preventDefault();
      var payload = {
        type: 'contact',
        name: (document.getElementById('c-name').value || '').trim(),
        email: (document.getElementById('c-email').value || '').trim(),
        subject: (document.getElementById('c-subject').value || '').trim(),
        text: (document.getElementById('c-msg').value || '').trim(),
        lang: (typeof state !== 'undefined' && state.lang) || 'zh',
        country: (typeof state !== 'undefined' && state.country) || ''
      };
      if (!payload.text || !payload.email) return;
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      fetch('/api/chat/message', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
        .then(function(r){ return r.json(); })
        .then(function(d){
          if (!d || !d.sessionId) throw new Error('fail');
          result.innerHTML = '<div class="contact-sent">' + ((typeof t === 'function' ? t('contact_sent') : '已收到，我们会尽快回复。')) + '</div>';
          form.reset();
        })
        .catch(function(){
          result.innerHTML = '<div class="contact-sent" style="background:#FDF0F4;border-color:#F2C6D5;color:#B3385C">' +
            ((typeof t === 'function' ? t('contact_fail') : '发送失败，请改用邮件联系。')) + '</div>';
        })
        .then(function(){ btn.disabled = false; });
    });
  })();
  </script>
`;

out = out.replace('</body>', pageJS + '</body>');
fs.writeFileSync('contact.html', out);
console.log('contact.html 已生成，长度', out.length);
