# LUMIÈRE 上线部署手册（Cloudflare Worker + D1）

一个 Worker 同时提供**前台页面**和**下单接口**：静态页在 `deploy/www`，接口走 `/api/*`，数据在 D1。
部署完就是一个能投流、能收单、能客服聊天的真实站点。

---

## ✅ 当前线上状态（2026-11-21 已部署）

| 项 | 值 |
|---|---|
| 站点地址 | https://lumiere-store.lumiere-store.workers.dev |
| 订单台 | https://lumiere-store.lumiere-store.workers.dev/admin-cloud.html （填 ADMIN_KEY 解锁） |
| 商品台 | https://lumiere-store.lumiere-store.workers.dev/admin-shop.html （同一个 ADMIN_KEY：改价、改库存、改文案、上下架、换主图） |
| Worker | `lumiere-store`，版本 47b0cc4e-5f81-451d-8d85-9267247767a3（在 0578da7c 基础上：线上商品台 `/admin-shop.html`、商品上下架（active 字段，下架的顾客看不到）、修复 Worker 不解析 PUT 请求体导致改价改不动） |
| R2 | 桶 `lumiere-img`（绑定名 `IMG`，公共域名 `https://pub-70a352fa1a7d4db9b093906989cc565f.r2.dev`）；本地 108 张图已全量同步（5.07 MB），`pending 0` |
| D1 | `lumiere-db` / `c8d4ada5-ddeb-45e7-a78c-92e439510d42`（WNAM）：products 10 / stock 43 / settings 1（settings 内含 `shipping`） |
| ADMIN_KEY | 本地 `E:\LUMIERE\.data\cf-admin-key.txt`（也是云端 secret，勿外传） |
| workers.dev 子域 | `lumiere-store`（Cloudflare 账号级，注册后才有上面那个地址） |

实测通过（用真实 D1 跑 `worker.js` 全链路）：`/api/health`、`/api/products`（10 条）、`/api/settings`、`/api/geo`、
`/api/currencies`、首页/商品页/图片、`POST /api/order`（落库 + 返回 LM 订单号）、
`PATCH /api/order/:id` 全状态流转、`/api/orders` 带密钥可读/不带 401。

**注意**：`*.workers.dev` 在中国大陆被 DNS 污染，本机直连不通（要开代理才打得开）；海外访客正常。
面向投放必须绑自有域名 → 见第 6 节。

---

## 0. 现在就能跑的部分 / 还缺你确认的部分

**已就绪（部署后立即可用）**

| 能力 | 说明 |
|---|---|
| 站点页面 | 首页、分类、商品详情、购物车、结账、联系页，含 221 张图（7.8 MB） |
| 商品数据 | 本地后台里的 10 个商品（含 SKU 组合价、规格、英文描述、图集）导成 `deploy/seed.sql` |
| 下单 | `POST /api/order` 落 D1，返回订单号，前台显示成功页 |
| 库存 | D1 `stock` 表，下单后自动扣减 |
| 客服 | 站内聊天 + 留言（`/api/chat/*`，D1 存储）+ 前台 WhatsApp / 邮箱浮标 |
| 多语言/多币种 | `/api/geo` 按访问者国家自动切语言、货币、支付方式 |
| 安全 | 后台写操作（改价、删商品、改库存、看订单列表）必须带 `X-Admin-Key`，否则 401 |

**需要你提供才能算“真能用”**

1. **域名**：`lumiere.store` 是否已买？没有可先用 `xxx.workers.dev` 免费子域跑通。
2. **收款**：现在是“提交订单 + 人工确认”模式（订单进来后你线下联系收款/发货）。
   要自动扣款必须接一个渠道（Stripe / PayPal / Airwallex 等），需要你给密钥；这类品类风控较严，建议先确认渠道再改结账页。
3. **真实客服号**：`deploy/seed.sql` 里联系方式还是占位值（`+86 13800000000`、`care@lumiere.store`），换成你的真实 WhatsApp / 邮箱再投流。

---

## 1. 前置

```powershell
cd E:\LUMIERE
npx wrangler --version      # 首次会自动安装 wrangler
npx wrangler login          # 浏览器登录你的 Cloudflare 账号（这一步只能你本人做）
```

## 2. 建 D1 数据库（已完成）

```powershell
npx wrangler d1 create lumiere-db
```

已建的库：`lumiere-db` = `c8d4ada5-ddeb-45e7-a78c-92e439510d42`，已写进 `wrangler.toml`。
要换库就改 `wrangler.toml` 里的 `database_id`。

## 3. 建表 + 导入商品

```powershell
npx wrangler d1 execute lumiere-db --remote --file=schema.sql
npx wrangler d1 execute lumiere-db --remote --file=deploy/seed.sql
```

`schema.sql` 建 orders / stock / products / settings / chats 五张表；
`deploy/seed.sql` 灌 10 个商品、43 条库存、站点设置（含支付开关与联系方式）。
seed 先 `DELETE` 再插，可反复执行。

## 4. 后台密钥（已完成）

```powershell
npx wrangler secret put ADMIN_KEY     # 值已存在 E:\LUMIERE\.data\cf-admin-key.txt
```

要换密钥就重新 `secret put`，并同步改本地那个文件；线上订单台 `admin-cloud.html` 用同一个值解锁。

## 5. 部署

```powershell
node _tmp\build-deploy.js     # 重新生成 deploy/www + seed.sql（改过商品后必跑）
npx wrangler deploy
```

需要 `workers.dev` 子域已注册（一次即可，账号级）：本账号子域 = `lumiere-store`，
所以地址是 `https://lumiere-store.lumiere-store.workers.dev`。

## 6. 绑自有域名（投流必做）

当前 token **没有** `Account → Zone → Create` 权限，加不了站点，所以这一步要你本人操作一次：

1. Cloudflare 控制台 → **Add a site** → 输入 `lumiere.store` → 选 Free 计划 → 拿到两条 NS（如 `xxx.ns.cloudflare.com`）。
2. 到域名注册商（现在 NS 指向 Hostinger 停放 `nebula.dns-parking.com` / `aurora.dns-parking.com`）把 NS 改成上面那两条。
3. 等 CF 显示 Active（一般几分钟到几小时）。
4. Cloudflare 控制台 → Workers & Pages → `lumiere-store` → Settings → **Domains & Routes → Add custom domain** → 填 `lumiere.store`（会自动建好代理 DNS 记录）。
   也可以改 `wrangler.toml` 加：

```toml
routes = [
  { pattern = "lumiere.store/*", zone_name = "lumiere.store" }
]
```

然后重新 `npx wrangler deploy`。域名生效后把 `settings.contact` 的占位联系方式、`sites.lumiere.domain` 一并核对一遍。

## 7. 验收

```powershell
curl https://lumiere-store.lumiere-store.workers.dev/api/health        # {"ok":true,...}
curl https://lumiere-store.lumiere-store.workers.dev/api/products      # 10 条
curl -X PATCH https://lumiere-store.lumiere-store.workers.dev/api/settings -d '{}'   # 401
```

> `*.workers.dev` 在大陆被 DNS 污染，本机不通属正常；用代理或换海外网络验证。

浏览器打开首页 → 商品能显示图 → 加购 → 结账填地址 → 提交 → 出现订单号 →
打开 `/admin-cloud.html` 填 ADMIN_KEY → 能看到这单 → 点状态按钮推进流程。

---

## 8. 上线后怎么维护

- **改商品/改价**：本地后台（`http://127.0.0.1:8080/admin.html`）改 → `node _tmp\build-deploy.js` → 重跑第 3 步 seed → `npx wrangler deploy`。
  或者直接在线上订单台之外用 `X-Admin-Key` 调 `/api/products` 接口改。
- **看订单**：线上 `/admin-cloud.html`（填密钥后可看订单、客户地址、WhatsApp 直达、改状态）。
- **改商品/上下架/换主图**：线上 `/admin-shop.html`（同一个 ADMIN_KEY）——改价、改库存、改名称与文案、上架下架、点缩略图换图（图自动传到 R2）。
  下架的商品顾客看不到，后台仍可见，随时可重新上架。不用回本地，手机也能改。
  或 `npx wrangler d1 execute lumiere-db --remote --command="SELECT id,status,created_at FROM orders ORDER BY created_at DESC LIMIT 20"`。
- **客户留言/聊天**：存 D1 `chats` 表。
- **改下单页文案**：改 `checkout.html` → 重跑 build-deploy → deploy。
- **图片镜像到 R2**：采集/白底/译图产出后会自动推（`whitebg.js`、`server.js` 里挂了 `r2sync.pushAsync`）。
  存量一次性补：`node -e "require('./r2sync.js').syncAll(0).then(r=>console.log(r))"`，
  或本地 `POST http://127.0.0.1:8080/api/r2/sync`（`GET /api/r2/status` 看已传张数与 pending）。
  走的是 Cloudflare 官方 REST（`PUT …/r2/buckets/lumiere-img/objects/<key>`），token 在 `.data\cf-token.txt`，**不依赖 workers.dev**。

## 9. 线上做不到的（仍只在本地）

草稿箱、1688 采集插件、白底抠图（`rembg` + `pymatting`，要 Python 和 2GB 内存）、描述自动翻译、后台多站点管理 —— 依赖本地 `server.js` + `.data/db.json` + `assets/img`，Worker 没有磁盘和 Python 运行时。

工作流：**本地后台编辑 + 转白底 → build-deploy 同步线上**。

## 10. 投流 / 收单还缺的三件事

1. **真实收款**：现在结账是"提交订单 → 你审核 → 联系客户付款"，不自动扣款。要自动收款得接 Stripe / PayPal / Airwallex（需要主体资质 + 密钥；这类成人健康品类风控严，先确认账户允许）。
2. **真实联系方式**：`settings.contact` 还是占位 `care@lumiere.store` / `+86 13800000000`，必须换成能真收到的 WhatsApp 与邮箱，否则广告来的客户联系不上。
3. **合规页面**：只有 `privacy.html`，Meta / TikTok 审核通常还要 Terms、Refund/Shipping 政策页；广告文案也不能出现"演示/demo"字样（结账页横幅已删）。
4. 成人健康品类在 Meta / TikTok 属受限类目，投放前先确认账户可投类目与落地页口径。

