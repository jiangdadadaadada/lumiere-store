# LUMIÈRE · 批发内容层说明（2026-11-24）

## 这层是干什么的

在原有零售站旁边加了一层**面向 B2B 买家的英文内容站**：批发落地页、OEM 页、询盘页、6 篇采购指南。
不改零售前台的多语言机制（41 个语言包），批发页全部是独立静态 HTML，走单独的 `assets/wholesale.css`。

## 文件清单

| 文件 | 作用 | URL（本地） |
|---|---|---|
| `wholesale.html` | 批发主落地页：定位、客户类型、5 步流程、MOQ 阶梯、随单资料、8 条 FAQ | `/wholesale.html` |
| `oem.html` | OEM / 私标：三条路线对比、可定制项、时间线、成本杠杆、FAQ | `/oem.html` |
| `quote.html` | 询盘表单：公司/联系人/邮箱/WhatsApp/国家/数量/SKU/目标价 | `/quote.html` |
| `blog.html` | 文章列表 | `/blog.html` |
| `blog/*.html` | 6 篇采购指南（批发入门、MOQ 与到岸成本、认证、私标成本、1688 踩坑、隐私包装与清关） | `/blog/<slug>.html` |
| `assets/wholesale.css` | 批发层独立样式 | — |
| `robots.txt` | 允许收录，屏蔽 `/admin*.html` 与 `/api/` | `/robots.txt` |
| `sitemap.xml` | 14 条 URL，含 4 个批发页 + 6 篇文章 | `/sitemap.xml` |

## 询盘链路（没有在线支付）

`quote.html` → `POST /api/chat/message`（`type: "contact"`）→ 落成客服工单（D1 的 `chats` 表）→ 线上订单台 `/admin-cloud.html` 新增的「批发询盘 / 站内留言」卡片展示。

- 表单字段：公司、联系人、邮箱（必填）、WhatsApp、目的国（必填）、数量、SKU（必填）、目标价、备注。
- 提交后前端提示"1 个工作日内回复到你的邮箱"。
- 订单台询盘卡按 `type=contact` 过滤，展示名称、邮箱（可点 mailto）、国家、未读数和对话全文。
- 后台聊天接口在 Worker 侧需要 `X-Admin-Key`；访客只有 `POST /api/chat/message`、`GET /api/chat/messages` 是公开的。

## SEO 已做 / 未做

已做：
- 每个新页面都有 title / description / canonical / robots / OG；`wholesale.html` 带 Organization + WebPage + FAQPage 结构化数据；6 篇文章带 BlogPosting。
- 静态路径（`/wholesale.html`、`/blog/<slug>.html`），不依赖前端渲染。
- `robots.txt` + `sitemap.xml`。
- 零售首页 / 联系 / 隐私页补了 canonical 与 robots。

未做（按优先级）：
1. **自定义域名**。现在是 `*.workers.dev` 子域，谷歌收录权重很低；拿到域名后要同时改 canonical、OG、sitemap 里的绝对 URL（共 3 处文件：`sitemap.xml`、`robots.txt`、所有 HTML 的 canonical/og 行）。
2. **hreflang / 多语言路径**。零售站 41 种语言靠 localStorage 切换，同一个 URL，谷歌看不到多语言版本。批发站建议只保留 en（+ 中文），或做 `/de/`、`/ar/` 这类真实路径。
3. **商品静态 URL**。现在是 `product.html?id=LUM-W07`，要改成 `/product/lum-w07` 这类路径（Worker 里做路由改写），才能进 sitemap 拿排名。
4. **Search Console**：域名绑定后建资源 → DNS TXT 验证 → 提交 `sitemap.xml` → 用 URL 检查工具逐个推新页面。

## 部署注意

- 用 `node _tmp\build-www-only.js` 只刷新 `deploy/www`（新页面、样式、blog、robots、sitemap、改过的 index/admin-cloud）。
- **不要直接跑 `_tmp\build-deploy.js`**：它会根据本地 `.data/db.json` 重写 `deploy/seed.sql`，而本地现在是 0 商品，一旦部署会把线上 D1 的商品表清空。
- 部署命令仍为 `npx wrangler@4 deploy`，需要你确认后再执行。

## 首页双轨（2026-11-24 已完成，本地）

`/` 现在是零售 + 批发并存，不再是单选：

1. **两条购买路径卡**（hero 下方，`.paths`）：Retail「Shop the storefront」→ category.html；Wholesale · OEM「Buy at wholesale」→ wholesale.html / quote.html。
2. **批发内容块**（精选商品与 trust-bar 之间，`.b2b-band`）：深紫底，含 MOQ 10+、阶梯报价、线下结算、单证四要点，右侧三个数据（10+ / 3–7 天 / 15–30 天）+ 博客入口。
3. 首页 title 改为 `LUMIÈRE · Intimate Wellness — Retail & Wholesale`，description 同时覆盖零售与批发。
4. 样式追加在 `assets/style.css` 末尾（`.paths/.path-card/.b2b-band` 等，900px/560px 两个断点）。
5. 说明：批发卡与批发块为英文（与 wholesale.html 口径一致，卖方市场以英文为主），零售 hero 与分类/精选仍是 41 语 i18n，不冲突。

## 待你定的三件事

1. `/` 要不要进一步把零售内容收进 `/shop.html`、让首页以批发为主？当前按你的要求是"并存"。
2. 零售结账（`checkout.html`，货到付款/卡/加密货币）留不留？纯批发模式应改成"提交询盘/申请报价"。
3. 批发价是否公开：现在是"不公开价目表、按询报价"，MOQ 与阶梯结构公开。
