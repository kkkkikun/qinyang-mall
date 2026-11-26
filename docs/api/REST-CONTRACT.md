# 琴扬商城 V1 · REST API 契约

基址：`/api/v1`
所有响应使用统一包装：

```json
{ "code": 0, "message": "ok", "data": { }, "requestId": "..." }
```

- `code = 0` 表示成功；非 0 为业务错误码（见 `packages/contracts` 的 `ERROR_CODES`）。
- HTTP 状态码同时保持语义：400 参数错误 / 401 未登录 / 403 无权限 / 404 不存在 / 409 状态冲突。
- 金额字段一律整数分，字段名以 `Cents` 结尾。
- 分页参数：`page`（从 1 开始）、`pageSize`；返回 `{ items, total, page, pageSize }`。

---

## 1. 顾客端（小程序）

无需登录即可浏览；涉及个人数据的接口需要顾客 token（`Authorization: Bearer <customerToken>`）。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/login` | `{ code }`（wx.login code）→ `{ token, customer }` |
| GET | `/auth/me` | 当前顾客资料 |
| GET | `/categories` | 分类树（含二级分组） |
| GET | `/banners` | 首页轮播（仅 ACTIVE 且在投放期内） |
| GET | `/products` | `keyword` `categoryId` `group` `page` `pageSize` |
| GET | `/products/:id` | 商品详情（含图集、量体模板指引） |
| GET | `/measurement-templates/resolve?productId=` | 按商品分类解析可用量体模板（ACTIVE 版本） |
| GET | `/guides/:slug` | 图文指南：`measure-top` `measure-bottom` `care` `material` |
| POST | `/customization-requests` | 提交定制申请（含量体资料），需登录 |
| GET | `/customization-requests` | 我的定制申请列表（仅本人），需登录 |
| GET | `/customization-requests/:id` | 申请详情（含当前有效报价），需登录 |
| POST | `/customization-requests/:id/confirm-quote` | `{ quoteId, expectedVersion }` 确认报价，需登录 |
| POST | `/customization-requests/:id/cancel` | 取消申请，需登录 |
| GET | `/orders` | 我的订单列表，需登录 |
| GET | `/orders/:id` | 订单详情与进度时间线，需登录 |

顾客 token 通过 `x-customer-token` 或 `Authorization: Bearer` 传递。

## 2. 管理后台

需要管理员 token：`Authorization: Bearer <adminToken>`。
权限：`OWNER` 店主可执行全部操作；`STAFF` 店员仅可执行日常操作。
**关键操作**（改价、报价、订单状态、商品上下架、分类删除）一律写审计日志。

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/admin/auth/login` | 公开 | `{ username, password }` → `{ token, expiresIn, user }` |
| GET | `/admin/auth/me` | 登录 | 当前管理员 |
| GET | `/admin/products` | 登录 | `keyword` `categoryId` `status` `pricingMode` `page` `pageSize` |
| POST | `/admin/products` | STAFF | 新增商品（初始为 DRAFT） |
| GET | `/admin/products/:id` | 登录 | 商品详情（含图集） |
| PUT | `/admin/products/:id` | STAFF | 修改商品（已发布商品的价格/文案修改需走重新审核） |
| POST | `/admin/products/:id/status` | OWNER | `{ status }` 上下架 / 提交审核，OWNER 专属 |
| POST | `/admin/products/:id/media` | STAFF | 追加图集 `{ role, storageKey, url, width, height, bytes, sortOrder }` |
| DELETE | `/admin/products/:id/media/:mediaId` | STAFF | 移除图集条目 |
| GET | `/admin/categories` | 登录 | 分类树 |
| POST | `/admin/categories` | OWNER | 新增分类 |
| PUT | `/admin/categories/:id` | OWNER | 修改分类 |
| DELETE | `/admin/categories/:id` | OWNER | 删除分类（有商品时拒绝） |
| GET | `/admin/banners` | 登录 | 轮播列表 |
| POST | `/admin/banners` | STAFF | 新增轮播 |
| PUT | `/admin/banners/:id` | STAFF | 修改轮播 |
| DELETE | `/admin/banners/:id` | OWNER | 删除轮播 |
| GET | `/admin/measurement-templates` | 登录 | 量体模板（含历史版本） |
| GET | `/admin/measurement-templates/:id` | 登录 | 模板详情 |
| POST | `/admin/measurement-templates` | OWNER | 新建模板（可 `publish` 直接发布 v1） |
| PUT | `/admin/measurement-templates/:id` | OWNER | 修改草稿；已发布模板需新建版本 |
| POST | `/admin/measurement-templates/:id/publish` | OWNER | 发布（草稿→ACTIVE，已 ACTIVE 则生成新版本） |
| GET | `/admin/customization-requests` | 登录 | 申请列表 `status` `keyword` `productId` |
| GET | `/admin/customization-requests/:id` | 登录 | 申请详情（含量体资料、报价历史） |
| POST | `/admin/customization-requests/:id/review` | STAFF | `{ action: 'APPROVE' \| 'REJECT', note }` 审核申请 |
| PUT | `/admin/customization-requests/:id/status` | 登录 | `{ status, note }` 直接变更申请状态（受状态机约束） |
| POST | `/admin/customization-requests/:id/quotes` | OWNER | 创建报价（生成新版本，旧版本转 SUPERSEDED） |
| GET | `/admin/customization-requests/:id/quotes` | 登录 | 报价历史版本 |
| POST | `/admin/quotes/:id/withdraw` | OWNER | 撤回报价 |
| GET | `/admin/orders` | 登录 | 订单列表 `status` `keyword` |
| POST | `/admin/orders` | OWNER | 由已确认申请生成订单 `{ requestId, quoteId }` |
| GET | `/admin/orders/:id` | 登录 | 订单详情 |
| POST | `/admin/orders/:id/status` | STAFF | `{ status, note }` 更新制作状态 |
| POST | `/admin/orders/:id/ship` | STAFF | `{ carrier, trackingNo, note }` 填写物流 |
| POST | `/admin/orders/:id/cancel` | OWNER | 取消订单并记录原因 |
| GET | `/admin/orders/:id/payment` | 登录 | 订单支付记录（V1 恒为 `provider: DISABLED` / `status: DISABLED`） |
| POST | `/admin/orders/:id/pay` | OWNER | 发起支付 —— **V1 恒返回 `PAYMENT_DISABLED`，不产生任何支付/退款记录** |
| GET | `/admin/audit-logs` | OWNER | 审计日志 `action` `targetType` `targetId` `actorId` |
| POST | `/admin/media/upload` | STAFF | multipart 图片上传 → `MediaDto` |

## 3. 关键业务规则

### 3.1 状态机

定制申请（`REQUEST_STATUS_TRANSITIONS`）：

```
PENDING_REVIEW ──▶ PENDING_QUOTE ──▶ QUOTED ──▶ CONFIRMED ──▶ IN_PRODUCTION ──▶ SHIPPED ──▶ COMPLETED
       │                  │             │           │              │
       └──▶ REJECTED      └──▶ CANCELLED └──▶ PENDING_QUOTE（重新报价）
```

订单（`ORDER_STATUS_TRANSITIONS`）：

```
CONFIRMED ──▶ IN_PRODUCTION ──▶ SHIPPED ──▶ COMPLETED
     │                │
     └──▶ CANCELLED   └──▶ CANCELLED
```

任何非法迁移返回 `409 / INVALID_STATUS_TRANSITION`。

### 3.2 报价

- 报价创建时**冻结**商品快照与量体快照；后续商品变更不影响既有报价与订单。
- 每次创建报价生成新 `version`，同一申请同时只有一个 `ACTIVE` 版本，旧版本置 `SUPERSEDED`。
- 顾客确认时后端必须校验 `quoteId` 属于该申请、`quote.status === ACTIVE`、`quote.version === expectedVersion`；
  不符返回 `409 / QUOTE_VERSION_CONFLICT` 或 `409 / QUOTE_NOT_ACTIVE`。

### 3.3 支付

- V1 不启用真实支付。`PaymentGateway` 接口 + 明确禁用的 `DISABLED` 适配器。
- 调用支付接口返回 `409 / PAYMENT_DISABLED`，**不得**返回伪造的已支付状态，也不得生成虚假退款记录。

### 3.4 权限与归属

- 顾客接口必须校验订单/申请归属本人，越权返回 404（不泄露存在性）。
- 量体资料、联系方式、收货地址不写入普通日志。
