/* ============================================================
   LUMIÈRE · 全球化电商后端 (Cloudflare Worker)
   路由:
     GET  /api/geo              IP 定位 → 国家/语言/货币/支付
     GET  /api/currencies       货币与汇率表
     POST /api/order            创建订单
     GET  /api/order/:id        查询订单
     GET  /api/orders           订单列表(管理)
     POST /api/payment/callback 支付回调验签
     GET  /api/stock            库存
     PATCH /api/stock/:id       扣减库存
     GET  /api/health           健康检查
   数据层: D1 (绑定 DB)。无 D1 时自动降级为内存存储。
   ============================================================ */

import { GEO_ROUTE, CURRENCY_ROUTE, handleApi } from './backend-core.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Payment-Signature, X-Admin-Key'
};

/* 哪些请求必须带后台密钥 */
function needsAdmin(method, path) {
  if (path === '/api/orders' || path === '/api/stats') return true;
  if (path.startsWith('/api/order/') && method === 'PATCH') return true;
  if (path.startsWith('/api/products') && method !== 'GET') return true;
  if (path.startsWith('/api/settings') && method !== 'GET') return true;
  if (path.startsWith('/api/stock') && method !== 'GET') return true;
  if (path.startsWith('/api/r2')) return true;
  /* 客服聊天：访客发消息 / 读自己会话保持公开，其余后台管理接口
     （会话列表、单会话详情、客服回复、标记已读、删除会话）必须带密钥，
     否则任何人都能拉取全部客户留言、冒充客服回复或删除会话。 */
  if (path.startsWith('/api/chat/')) {
    if (path === '/api/chat/message' && method === 'POST') return false;
    if (path === '/api/chat/messages' && method === 'GET') return false;
    return true;
  }
  return false;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
  });
}

/* 内存兜底存储（D1 不可用时） */
const mem = { orders: new Map(), stock: new Map() };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return json({}, 204);

    const method = request.method;
    const path = url.pathname;

    /* 非 /api 请求交给静态资源绑定（wrangler [assets] → deploy/www），
       一个 Worker 同时提供站点页面和接口，不用再单独配 Pages。
       静态资源里找不到的图片，回落到 R2 桶（线上镜像）。 */
    if (!path.startsWith('/api/')) {
      if (env.ASSETS) {
        const r = await env.ASSETS.fetch(request);
        if (r.status !== 404 || !env.IMG) return r;
      }
      if (env.IMG) {
        const key = path.replace(/^\/+/, '');
        const obj = await env.IMG.get(key);
        if (obj) {
          const h = new Headers(CORS);
          obj.writeHttpMetadata(h);
          h.set('etag', obj.httpEtag);
          h.set('Cache-Control', 'public, max-age=31536000');
          return new Response(obj.body, { headers: h });
        }
      }
      return new Response('Not found', { status: 404 });
    }

    /* 后台写操作鉴权：线上后台接口不能裸奔，否则任何人都能改价/删商品 */
    if (needsAdmin(method, path)) {
      const key = request.headers.get('x-admin-key') || '';
      if (!env.ADMIN_KEY) return json({ error: '服务端未配置 ADMIN_KEY，后台接口已禁用' }, 503);
      if (key !== env.ADMIN_KEY) return json({ error: 'unauthorized' }, 401);
    }

    /* R2 图片桶：本机到 S3 端口不通，改由 Worker 中转上传/查询/删除 */
    if (path.startsWith('/api/r2')) {
      if (!env.IMG) return json({ ok: false, error: 'R2 桶未绑定（wrangler.toml 缺 [[r2_buckets]]）' }, 503);
      const base = (env.R2_PUBLIC_BASE || '').replace(/\/+$/, '');
      const pubUrl = (key) => (base ? `${base}/${key}` : null);

      if (path === '/api/r2/upload' && method === 'POST') {
        const key = (url.searchParams.get('key') || '').replace(/^\/+/, '');
        if (!key) return json({ ok: false, error: 'missing key' }, 400);
        if (!/^assets\/img\//.test(key)) return json({ ok: false, error: 'key 必须落在 assets/img/ 下' }, 400);
        const buf = await request.arrayBuffer();
        if (!buf.byteLength) return json({ ok: false, error: 'empty body' }, 400);
        await env.IMG.put(key, buf, {
          httpMetadata: {
            contentType: request.headers.get('content-type') || 'application/octet-stream',
            cacheControl: 'public, max-age=31536000'
          }
        });
        return json({ ok: true, key, size: buf.byteLength, url: pubUrl(key) });
      }

      if (path === '/api/r2/object' && method === 'DELETE') {
        const key = (url.searchParams.get('key') || '').replace(/^\/+/, '');
        if (!key) return json({ ok: false, error: 'missing key' }, 400);
        await env.IMG.delete(key);
        return json({ ok: true, key });
      }

      if (path === '/api/r2/list' && method === 'GET') {
        const prefix = url.searchParams.get('prefix') || '';
        const limit = Math.min(Number(url.searchParams.get('limit') || 200), 1000);
        const r = await env.IMG.list({ prefix, limit });
        return json({
          ok: true,
          count: r.objects.length,
          truncated: r.truncated,
          objects: r.objects.map(o => ({ key: o.key, size: o.size, uploaded: o.uploaded, url: pubUrl(o.key) }))
        });
      }

      if (path === '/api/r2/status' && method === 'GET') {
        const r = await env.IMG.list({ limit: 1000 });
        const bytes = r.objects.reduce((s, o) => s + o.size, 0);
        return json({ ok: true, count: r.objects.length, bytes, publicBase: base || null, bucket: 'lumiere-img' });
      }

      return json({ ok: false, error: 'unknown r2 route' }, 404);
    }


    /* IP 定位：优先用 Cloudflare 的国家头 */
    if (path === '/api/geo' && method === 'GET') {
      const country = (request.cf && request.cf.country)
        || request.headers.get('CF-IPCountry')
        || request.headers.get('x-vercel-ip-country')
        || 'US';
      return json(GEO_ROUTE(String(country).toUpperCase()));
    }

    /* 货币表 */
    if (path === '/api/currencies' && method === 'GET') return json(CURRENCY_ROUTE());

    /* 健康检查 */
    if (path === '/api/health' && method === 'GET') {
      return json({ ok: true, service: 'lumiere', d1: !!env.DB, ts: Date.now() });
    }

    let body = null;
    if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
      try { body = await request.json(); } catch (e) { return json({ error: 'invalid json' }, 400); }
    }

    /* 统一交给核心业务层处理。
       带上 admin 标记：后台带密钥读商品列表时，要把已下架（active:false）的也返回；
       顾客不带密钥，只看到在架的。 */
    const result = await handleApi({
      method, path, body, request, env, mem,
      admin: needsAdmin(method, path) || (!!env.ADMIN_KEY && (request.headers.get('x-admin-key') || '') === env.ADMIN_KEY)
    });
    return json(result.data, result.status || 200);
  }
};
