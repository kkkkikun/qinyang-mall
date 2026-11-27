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
| GET | `/guides/:slug` | 图文指南：`measure-top` `measure-bottom` `care` `material`（分节含服务端解析出的 `fields` 示意图元数据，见 §3.6） |
| POST | `/customization-requests` | 提交定制申请（含量体资料），需登录 |
| GET | `/customization-requests` | 我的定制申请列表（仅本人），需登录 |
| GET | `/customization-requests/:id` | 申请详情（含当前有效报价），需登录 |
| POST | `/customization-requests/:id/confirm-quote` | `{ quoteId, expectedVersion }` 确认报价，需登录 |
| POST | `/customization-requests/:id/reject-quote` | `{ quoteId, expectedVersion, reason? }` 拒绝报价，需登录 |
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
| POST | `/admin/products/import` | STAFF | CSV 批量导入 `{ csv, dryRun? }`：**只新增不覆盖**，编号已存在则跳过；导入商品一律 DRAFT；逐行返回 CREATED/PENDING/SKIPPED/FAILED 与原因 |
| GET | `/admin/products/:id` | 登录 | 商品详情（含图集） |
| PUT | `/admin/products/:id` | STAFF | 修改商品（**已发布商品的价格/报价模式仅店主可改**，店员改价 409；文案与资料店员可改，改动进审计） |
| POST | `/admin/products/:id/status` | OWNER | `{ status }` 上下架 / 提交审核，OWNER 专属 |
| POST | `/admin/products/batch-status` | OWNER | `{ ids[], status }` 批量上下架，OWNER 专属；单条失败不影响其余 |
| POST | `/admin/products/:id/media` | STAFF | 追加图集 `{ role, storageKey, url, width, height, bytes, sortOrder }` |
| PUT | `/admin/products/:id/media/:mediaId` | STAFF | 调整图集条目（`sortOrder` / `role` / `alt`） |
| DELETE | `/admin/products/:id/media/:mediaId` | STAFF | 移除图集条目 |
| DELETE | `/admin/products/:id` | OWNER | 删除商品：**已发布**须先下架；**已被定制申请引用**的拒绝删除（409 并说明引用笔数） |
| GET | `/admin/categories` | 登录 | 分类树 |
| POST | `/admin/categories` | OWNER | 新增分类 |
| PUT | `/admin/categories/:id` | OWNER | 修改分类 |
| DELETE | `/admin/categories/:id` | OWNER | 删除分类（有商品时拒绝） |
| GET | `/admin/banners` | 登录 | 轮播列表 |
| POST | `/admin/banners` | STAFF | 新增轮播 |
| PUT | `/admin/banners/:id` | STAFF | 修改轮播 |
| DELETE | `/admin/banners/:id` | OWNER | 删除轮播 |
| GET | `/admin/guides` | 登录 | 图文说明页列表（量体指南 / 洗护 / 材质，含停用） |
| PUT | `/admin/guides/:slug` | STAFF | 更新图文说明页（标题 / 摘要 / 分节内容），顾客端立即生效 |
| GET | `/admin/measurement-templates` | 登录 | 量体模板（含历史版本） |
| GET | `/admin/measurement-templates/:id` | 登录 | 模板详情 |
| POST | `/admin/measurement-templates` | OWNER | 新建模板（可 `publish` 直接发布 v1） |
| PUT | `/admin/measurement-templates/:id` | OWNER | 修改草稿；已发布模板需新建版本 |
| POST | `/admin/measurement-templates/:id/publish` | OWNER | 发布（草稿→ACTIVE，已 ACTIVE 则生成新版本） |
| DELETE | `/admin/measurement-templates/:id` | OWNER | 删除模板（**被商品引用时拒绝**，409） |
| GET | `/admin/customization-requests` | 登录 | 申请列表 `status` `keyword` `productId`（keyword 同时匹配顾客姓名/手机号/商品名） |
| GET | `/admin/customization-requests/export` | 登录 | 导出当前筛选的申请为 CSV（`text/csv`，手机号脱敏、不含量体明细） |
| GET | `/admin/customization-requests/:id` | 登录 | 申请详情（含量体资料、报价历史） |
| POST | `/admin/customization-requests/:id/review` | STAFF | `{ action: 'APPROVE' \| 'REJECT', note }` 审核申请 |
| PUT | `/admin/customization-requests/:id/status` | 登录 | `{ status, note }` 直接变更申请状态（受状态机约束） |
| POST | `/admin/customization-requests/:id/quotes` | OWNER | 创建报价（生成新版本，旧版本转 SUPERSEDED） |
| GET | `/admin/customization-requests/:id/quotes` | 登录 | 报价历史版本 |
| POST | `/admin/quotes/:id/withdraw` | OWNER | 撤回报价 |
| GET | `/admin/orders` | 登录 | 订单列表 `status` `keyword`（**keyword 同时匹配订单号 / 申请号 / 申请 ID**） |
| GET | `/admin/orders/export` | 登录 | 导出当前筛选的订单为 CSV（`text/csv`，手机号脱敏、不含量体明细） |
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
- 顾客可**拒绝**报价：报价置 `REJECTED`，申请回到 `PENDING_QUOTE` 等待店员重新报价，并写入审计（`quote.reject`）。
- 申请处于 `CONFIRMED` 及之后的状态时，店员**不可撤回**报价（`409 / INVALID_STATUS_TRANSITION`）——
  否则顾客侧会出现「已确认 + 商家尚未报价」的自相矛盾。

### 3.3 支付

- V1 不启用真实支付。`PaymentGateway` 接口 + 明确禁用的 `DISABLED` 适配器。
- 调用支付接口返回 `409 / PAYMENT_DISABLED`，**不得**返回伪造的已支付状态，也不得生成虚假退款记录。

### 3.4 权限与归属

- 顾客接口必须校验订单/申请归属本人，越权返回 `404`（不泄露存在性）。
- 量体资料、联系方式、收货地址不写入普通日志。

### 3.5 商品 CSV 批量导入

`POST /admin/products/import` 请求体为 `{ csv, dryRun? }`（`csv` 为含表头的 CSV 文本，前端读本地文件后提交文本，不走 multipart）。

标准表头（顺序固定，前后端共用 `PRODUCT_IMPORT_CSV_HEADERS`）：

```
商品编号,商品名称,分类编号,报价模式,价格(元),材质,副标题,商品简介,洗护说明,量体模板编号,排序
```

口径：

- **只新增不覆盖** —— 编号已存在于库中 → 该行 `SKIPPED`，既有商品不被改动；
  文件内编号重复 → 该行 `FAILED`。
- **导入商品一律 `DRAFT`** —— 与 `POST /admin/products` 一致，上架仍走店主审核流程。
- **`dryRun: true` 为预检** —— 只校验不落库，通过校验的行返回 `PENDING`，`created` 恒为 0。
- **逐行结论** —— 每行返回 `CREATED / PENDING / SKIPPED / FAILED` 与中文原因，失败行不影响其余行。
- **分类 / 量体模板引用**接受 `code`（商家可读，如 `knitwear-cardigan`）或 `id`；分类已停用 → 该行失败。
- **报价模式**接受 `仅按量体报价` / `固定价可直售`（或枚举值），留空按「仅按量体报价」；
  固定价必须填正数价格（单位元，按整数分存储），仅按量体报价却填了价格 → 该行失败（不静默丢弃数据）。
- **不代填经营数据** —— 缺名称、缺分类、缺价格一律报错，系统不补默认值。
- 单次上限 500 行；导入写入审计（`product.import` / `product.import.preview`）。

### 3.6 图文说明页（量体指南 / 洗护 / 材质）

后台维护入口：`GET /admin/guides`（列表）、`PUT /admin/guides/:slug`（更新）。
顾客端只读：`GET /guides/:slug`。

- **可改字段** —— 页面标题、摘要、分节（标题 / 说明 / 要点 / 分节级示意图 / 量体字段引用）。
  `slug` 是路由标识（不可改，改了顾客端链接失效）；`status` 属启停性质，本接口不开放。
- **权限** —— OWNER 与 STAFF 均可维护图文内容（与「编辑商品文案」同属内容维护）。
- **整体覆盖** —— `sections` 是**整段替换**，不是逐节合并；保存后顾客端立即生效。
- **只新增不覆盖的例外** —— 无：`sections` 全量覆盖是本接口的既定语义，前端编辑时以服务端返回值为准。

#### 3.6.1 量体示意图字段（`fieldCodes` → `fields`）

分节用 `fieldCodes` 引用量体字段；**服务端**按 `fieldCodes` 从**已发布（ACTIVE）量体模板**
解析出字段元数据，放在分节的 `fields` 里返回（只读）。

| 字段 | 说明 |
| --- | --- |
| `fieldCode` | 量体字段编码（如 `chest_bust`） |
| `fieldName` | 字段名称（如「胸围」） |
| `measurementType` | `body` / `garment_flat` |
| `instruction` | 测量说明 |
| `tips` | 测量提示（每行一条） |
| `illustration` | 示意图标识（小程序按 `*.svg` 映射到本地 PNG 素材） |

口径：

- **示意图的名称 / 说明 / 提示 / 配图一律以量体模板为准**，图文说明页只做引用 ——
  商家在「量体模板」里改一次，量体表单与图文指南两处说法一致，不会各写一份而互相矛盾。
- **解析顺序确定** —— 同一 `fieldCode` 出现在多个模板时，取模板列表顺序（`code` 升序 / `version` 降序）中的第一个，
  后台可选字段清单与此处同一口径，不会出现「后台显示 A、顾客端显示 B」。
- **引用了不存在的 `fieldCode`** → 该字段解析不出（`fields` 里没有它），不报错、不影响其余字段。
- **`fields` 不可提交** —— 它是服务端解析结果，`PUT` 请求体里带 `fields` 会被参数校验拒绝（400）。
- **后台没有 ACTIVE 量体模板时** → 退回使用全部模板解析，保证新建页面也能出图。
