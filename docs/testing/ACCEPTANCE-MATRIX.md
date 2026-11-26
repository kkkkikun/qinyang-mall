# 验收矩阵 · 琴扬精纺羊绒 QINYANG 微信商城 V1

> 目标文档：`docs/goal.md`
> 本文件是 Goal §10 要求的验收矩阵：把目标文档的每一条要求映射到**可复现的验证证据**。
> 详细测试输出见 `docs/ACCEPTANCE-REPORT.md`；决策依据见 `docs/agent/DECISIONS.md`；
> 阶段状态见 `docs/agent/PROJECT-STATUS.md`。
>
> 图例：✅ 已验证通过 ｜ 🟡 已实现，待外部条件解除后验证 ｜ ⛔ 按红线暂不执行
> 最后更新：2026-11-26

---

## 1. 顾客端（goal.md §2）

| # | 需求 | 验证方式 | 证据 | 状态 |
| --- | --- | --- | --- | --- |
| C1 | 品牌首页 | 静态自检 + 真实 API 拉取首页聚合 | `apps/miniprogram/pages/index`；验收项「顾客端商品列表返回已发布商品」 | ✅ |
| C2 | 羊绒衣橱自动轮播与手势滑动 | 原生 `<swiper>` 轮播 + `bindchange` 手势 | `apps/miniprogram/pages/index/index.wxml` | ✅ |
| C3 | 商品搜索 | 真实 API `GET /products?keyword=` | 验收项「商品搜索命中 — keyword=ED-0062」 | ✅ |
| C4 | 商品分类（两级分组） | 真实 API `GET /categories` + 一级/二级分组筛选 + **页面级执行** | 验收项「二级分组筛选生效 — knitwear-cardigan → 3 件」；页面级断言「分类页：一级分类 5 个 / 二级分组 5 个 / 商品列表 7 件」；集成「按一级分类 id 查询能取到其下分组商品」 | ✅ |
| C5 | 商品详情与多图展示 | 真实 API `GET /products/:id` + 图集 + **页面级执行** | 验收项「商品均有真实主图 — 13/13」；页面级断言「图集 8 张」「未确认价格显示「待报价」而非数字」「带出量体模板名称」 | ✅ |
| C6 | 上装量体指南 | 图文页接口 + 真实字段 | 验收项「图文说明页 measure-top」 | ✅ |
| C7 | 长裤量体指南 | 同上 | 验收项「图文说明页 measure-bottom」 | ✅ |
| C8 | 羊绒洗护指南 | 同上 | 验收项「图文说明页 care」 | ✅ |
| C9 | 材质定制说明 | 同上 | 验收项「图文说明页 material」 | ✅ |
| C10 | 定制申请表 | **小程序自身代码**在 Node 中对真实 API 执行 + 幂等校验 | 执行桩 20/20：表单按模板渲染 7 字段（必填 5）、客户端校验拦截空必填、提交 payload 5 项量体、幂等重提交不产生第二条 | ✅ |
| C11 | 我的定制申请 | 真实 API | `pages/requests`、`GET /customization-requests` | ✅ |
| C12 | 报价查看与确认 | **由报价页 confirm() 完成的真实确认**（含版本校验） | 验收项「顾客确认报价 — 状态=ACTIVE」；页面级「顾客在报价页确认报价 → 申请变为已确认 — CONFIRMED」；集成测试「用旧版本号确认 → 409 QUOTE_VERSION_CONFLICT」 | ✅ |
| C13 | 制作、发货状态查看 | 真实发货后由**订单详情页自身**查询 | 验收项「顾客查看订单进度 — 3 条进度」；页面级断言「进度时间线 3 条」「带出量体快照 7 项」「金额已渲染」 | ✅ |
| C14 | 个人中心与客服入口 | 页面存在 + 微信原生客服能力 | `pages/profile`、`pages/contact` | ✅ |
| C15 | 首期一申请一款式，不做多商品结算/库存扣减/营销 | 数据模型与接口约束 | `customization-request` 单商品外键；无 SKU/库存/购物车实体 | ✅ |
| C16 | 个人中心以定制记录为主 | 页面结构 | `pages/profile` 主体为定制记录 | ✅ |

小程序共 **17 个页面**（index / category / custom / profile / search / product /
guide-top / guide-bottom / guide-care / guide-material / apply / requests /
request-detail / quote / orders / order-detail / contact），
静态自检 0 阻塞（页面清单、四件套文件、资源引用不越界、零 npm 运行时依赖）。

---

## 2. 管理后台（goal.md §2）

| # | 需求 | 验证方式 | 证据 | 状态 |
| --- | --- | --- | --- | --- |
| A1 | 商品新增、修改、查看、上下架 | 集成测试 + 真实 API | 集成断言 4/6/7/8/31；验收项「全部商品经提交审核 → 发布上架 — 13/13」 | ✅ |
| A2 | 商品分类管理 | 真实 API + 后台页面 | `categories-admin.controller.ts`、`CategoryView.vue` | ✅ |
| A3 | 商品主图与图集管理 | 真实 API + 上传通道 | `product-media` 实体；`POST /admin/media/upload`；`MediaAdminController` | ✅ |
| A4 | 首页轮播管理 | 真实 API | `banners-admin.controller.ts`、`BannerView.vue` | ✅ |
| A5 | 商品详情内容维护 | 图文页 + 商品详情字段 | `guide-page` 实体、`GET /guides/:slug` | ✅ |
| A6 | 商品报价模式设置 | 报价模式字段 + 定价规则 | `QUOTE_ONLY` 恒 `priceCents = null`（单元测试 `pricing.spec.ts`） | ✅ |
| A7 | 草稿 / 待审核 / 已发布状态 | 状态机 + 两步上架 | 集成断言 7「草稿不能直接上架 → 409」 | ✅ |
| A8 | 定制申请列表 / 详情 / 量体资料查看 | 真实 API | `customization-admin.controller.ts`、`RequestListView.vue` | ✅ |
| A9 | 审核申请 | 真实审核 | 验收项「店员审核通过 — 状态=PENDING_QUOTE」 | ✅ |
| A10 | 创建报价 / 修改报价保留历史版本 | 真实报价 v1→v2 | 验收项「店主创建报价 — 版本=1」；集成断言 18「新报价 v2 → 旧版 SUPERSEDED，同时只有一个 ACTIVE」 | ✅ |
| A11 | 查看顾客是否确认报价 | 申请详情含报价状态 | `RequestStatusDto` / 申请详情接口返回当前有效报价 | ✅ |
| A12 | 已确认申请转订单 | 真实建单 | 验收项「由申请生成订单 — 订单=QO-…」 | ✅ |
| A13 | 更新制作状态 / 发货状态 | 真实流转 | 验收项「店员填写物流并发货 — 状态=SHIPPED」 | ✅ |
| A14 | 填写物流公司与单号 | 真实写入 | `POST /admin/orders/:id/ship` `{ carrier, trackingNo, note }` | ✅ |
| A15 | 查看订单完整历史 | 订单事件时间线 | `order-event` 实体；验收项「顾客查看订单进度 — 3 条进度」 | ✅ |
| A16 | 记录取消及售后处理 | 取消须填原因并留审计 | `POST /admin/orders/:id/cancel`；集成断言 29（审计不含手机号与地址明文） | ✅ |
| A17 | 区分店主与店员，店员只能执行授权操作 | RBAC 守卫 + 集成断言 | 集成断言 1/6/16/30：店员上下架 403、店员报价 403、店员看审计 403 | ✅ |
| A18 | 关键操作留审计 | 真实审计表 | 验收项「关键操作留有审计记录 — 82～100 条」 | ✅ |

后台共 **9 个视图 + 1 个框架布局**（Dashboard / Product / Category / Banner /
Template / Request / Order / AuditLog / Login + AppLayout），
`vue-tsc` 0 错误、`vite build` 成功、`scripts/lint.mjs` 25 文件通过。

---

## 3. 交易规则与数据安全（goal.md §3）

| # | 需求 | 验证方式 | 证据 | 状态 |
| --- | --- | --- | --- | --- |
| T1 | 不套用普通电商购物车逻辑 | 数据模型无购物车实体 | 无 `cart` 实体/接口；业务入口为「定制申请」 | ✅ |
| T2 | 状态机合法转换 | 单元 + 集成 | `REQUEST_STATUS_TRANSITIONS` / `ORDER_STATUS_TRANSITIONS`（`packages/contracts`）；集成断言 9/24「非法跳转 → 409 INVALID_STATUS_TRANSITION」 | ✅ |
| T3 | 报价保存商品快照 / 量体快照 / 金额 / 运费 / 周期 / 说明 / 版本 / 有效期 / 创建人 | 实体字段 + 集成 | `quote` 实体；`quote` 快照冻结断言 17/23 | ✅ |
| T14 | **量体资料必须真的被采集与校验** | 集成 + 端到端 | 集成 6 例（解析同源 / 历史行归一化 / 必填缺失 400）；执行桩「payload 的量体字段数与必填项一致 — 5 vs 必填 5」「申请快照带回真实量体数值 — 快照字段 7 个」 | ✅ |
| T15 | **表单与校验必须同源** | 集成 | `measurement-resolution.spec.ts`：解析接口返回商品绑定模板；按另一模板字段提交 → 400 `MEASUREMENT_INVALID` | ✅ |
| T4 | 报价变更生成新版本 | 真实 v1→v2 | 集成断言 18 | ✅ |
| T5 | 顾客确认须为当前有效版本 | 真实确认 + 冲突用例 | 集成断言 20「旧版本号确认 → 409 QUOTE_VERSION_CONFLICT」 | ✅ |
| T6 | 订单生成后不随后台改商品而变 | 快照冻结 | 集成断言 23「后台改商品不影响历史订单快照」 | ✅ |
| T7 | 金额用整数分 | 单元 + 服务端强制 | `pricing.spec.ts`：拒绝浮点分、合计为整数分求和 | ✅ |
| T8 | V1 不启用真实支付，禁用适配器，禁止假支付 | 真实调用 | 验收项「支付接口返回 PAYMENT_DISABLED」；集成断言 28「支付记录状态恒为 DISABLED」 | ✅ |
| T9 | 不索取/保存真实商户支付密钥 | 代码与仓库检查 | 仓库无任何支付密钥；`PAYMENT_ENABLED=false` 硬编码 | ✅ |
| T10 | 量体/联系方式/地址严格保护 | 归属校验 + 日志脱敏 | 集成断言 14/26「越权查看他人 → 404」；断言 29「审计不含手机号与地址明文」；异常过滤器不记录请求体 | ✅ |
| T11 | 只收集业务必要信息 | DTO 字段审查 | `customization-request` DTO 仅含量体字段 + 收货必要项 | ✅ |
| T12 | 不使用真实客户数据测试 | 测试数据全部虚构 | 集成测试使用 `openid-test-*` 等虚构标识；种子数据均为临时命名 | ✅ |
| T13 | 测试与生产环境隔离 | 独立库 + 独立端口/卷 | `qinyang_mall_test` 独立库；`global-setup.ts` 检测到开发库直接报错；端口 13316/18110/18111 全绑 127.0.0.1 | ✅ |

---

## 4. 技术架构（goal.md §4）

| # | 需求 | 证据 | 状态 |
| --- | --- | --- | --- |
| X1 | 微信原生（WXML/WXSS/TS），不用 Taro/uni-app/WebView | `apps/miniprogram` 17 页 × 4 文件；自检确认无 npm 运行时依赖、无 WebView | ✅ |
| X2 | 使用原生轮播/分享/导航/客服，不模拟右上角胶囊 | `<swiper>`、`onShareAppMessage`、原生客服；无胶囊占位模拟 | ✅ |
| X3 | 管理后台 Vue3 + Vite + TypeScript + TDesign Vue Next | `apps/admin-web`；`vue-tsc` 0 错误 | ✅ |
| X4 | API Node 24 LTS + NestJS + TypeORM + REST + OpenAPI | 服务器 Node v24.22.3；NestJS 11；`/docs` Swagger 可访问 | ✅ |
| X5 | MySQL 8.4 LTS + TypeORM Migration，禁 synchronize | MySQL 8.4 容器；2 个迁移；`synchronize: false` 硬编码 | ✅ |
| X6 | pnpm Workspace，四个 app + 共享契约 | `pnpm-workspace.yaml`：`apps/miniprogram` `apps/admin-web` `apps/api` `packages/contracts` `infra` `docs` | ✅ |
| X7 | 小程序尽量无运行时 npm 依赖；共享类型可被开发者工具编译 | 自检项 5；契约副本 `apps/miniprogram/types/contracts.ts` 由脚本同步并校验 | ✅ |
| X10 | **小程序 TypeScript 纳入类型检查** | `pnpm typecheck:miniprogram`（`build.sh` 前置步骤） | ✅ 0 错误。首轮即报出 12 个此前从未被发现的错误，含 `formatDate` 重复实现（后者覆盖前者，外部调用会崩） |
| X8 | 首期基础设施仅 MySQL / API / 静态后台 / Nginx / 受控文件存储 | `infra/docker/docker-compose.test.yml` 仅 3 个服务；未引入 Redis/Kafka/MQ/ES/MinIO | ✅ |
| X9 | 图片存储抽象接口，测试用受控文件存储 | `StorageService` 抽象 + `LocalFileStorageService`；`STORAGE_DRIVER=oss` 未实现时启动即报错 | ✅ |

---

## 5. 阶段交付（goal.md §7）

| 阶段 | 交付物 | 状态 |
| --- | --- | --- |
| P0 | PROJECT-BASELINE / DECISIONS / RESOURCE-LEDGER / 工程骨架 / **开发者工具预览记录** | 🟡 前四份齐备；预览记录待 Windows 侧执行后补 |
| P1 | 真实全链路垂直切片（后台新增→上架→API→小程序展示→详情） | ✅ |
| P2 | 量体模板版本化、单位与边界校验、提交、审核、详情、状态变化 | ✅ |
| P3 | 报价版本、顾客确认、订单快照、制作、发货、进度、完成 | ✅ |
| P4 | 视觉核对 / 开发者工具预览 / 真机检查 / 权限测试 / 迁移验证 / 备份恢复 / 异常测试 / 部署文档 / 体验版准备 | 🟡 除预览与真机外全部完成 |

---

## 6. UI 与体验验收（goal.md §8）

| # | 要求 | 状态 | 说明 |
| --- | --- | --- | --- |
| U1 | 品牌标识与品牌视觉、字体层级、商品图片比例、卡片间距、金棕点缀、留白 | ✅ | 视觉令牌与原型一致（主金 `#D29B5E`、麦金 `#CD9150`、炭黑 `#272727`、红 `#F53939`、底 `#F2F2F2`、输入框 `#F7F7F7`）；原型基线自身 100/100 浏览器用例通过、0 控制台错误 |
| U2 | 390×844 / 375×812 / 430×932 三档宽度 | 🟡 | 需开发者工具预览截图核对（`docs/RUNBOOK.md` §7） |
| U3 | 安全区域、底部导航与手势区、胶囊占位 | ✅ | WXSS 使用 `env(safe-area-inset-bottom)`；顶部为**自定义导航栏**（`navigationStyle: custom`），按 `wx.getMenuButtonBoundingClientRect()` **预留真实胶囊位置**（`utils/nav.ts`），不模拟胶囊 |
| U4 | 图片加载失败 | ✅ | 图片统一 `binderror` → 占位兜底（17 页中含图片的页面均已接入） |
| U5 | 页面返回 | ✅ | **17/17 页面**为自定义导航栏并统一提供返回按钮（`nav__back` → `goBack`）；标题在 WXML 内渲染（`navigationStyle: custom`，不使用原生 `navigationBarTitleText`） |
| U6 | 搜索无结果 | ✅ | 搜索页空态分支 |
| U7 | 商品下架 | ✅ | 详情接口对未发布商品返回 404；集成断言 31「下架后顾客立即不可见，详情 404」 |
| U8 | 网络断开 | ✅ | `request.ts` 统一失败分支 + toast，不静默失败 |
| U9 | 提交重复点击 | ✅ | `submitId` 幂等（验收项「重复提交同一 submitId 幂等」）；执行桩另测「校验不通过时不发起提交」 |
| U10 | 越界量体值的提示 | ✅ | 客户端与服务端**同时**拦截同一越界值（执行桩「越界值：客户端拦截 / 服务端同样拒绝 — MEASUREMENT_INVALID」）；服务端真实原因透传给顾客（不再显示「服务器返回数据异常」） |

---

## 7. 资源与安全红线（goal.md §6 / §9）

| # | 约束 | 实测 | 状态 |
| --- | --- | --- | --- |
| R1 | 本地新增磁盘 ≤ 8GB（硬上限 10GB） | 约 66 MB（源码 + `.git` 64 MB） | ✅ |
| R2 | 本地不装依赖树 / Docker / MySQL | 本地 `node_modules` = 0，Docker 不可用 | ✅ |
| R3 | 服务器新增磁盘目标 ≤ 8GB | ≈ 2.52 GB（目录 1.3 + 镜像 1.15 + 工具链 0.07） | ✅ 31% |
| R4 | 构建 ≤ 4 CPU 核 / 8GB 内存 | `taskset -c 0-3`，实测 3.20 核 / 1.54 GB | ✅ |
| R5 | 日常测试服务 ≤ 2.5 核 / 4GB | compose 限额合计 2.5 核 / 3.75 GB；空闲实测内存 641 MB | ✅ |
| R6 | 同时重型任务 ≤ 1；图片并发 ≤ 2；测试并发 ≤ 2 Worker | 构建与图片流水线串行；`maxWorkers: 2`；镜像构建并发限 2 | ✅ |
| R7 | Docker 资源限制 / 日志轮转 / 独立命名空间 | 全部服务设限额与 `10m × 3` 轮转；`qinyang` 命名空间 | ✅ |
| R8 | 不全局清理 Docker、不动其他项目 | 从未执行 prune；仅删除本项目自有重复镜像 | ✅ |
| R9 | 磁盘余量 < 20% 暂停重型任务 | 当前 58%，阈值监控已内置 | ✅ |
| R10 | 每次任务记录 CPU/内存/磁盘/耗时 | `docs/agent/RESOURCE-LEDGER.md` T1–T21 | ✅ |
| R11 | 密钥用环境变量、不入 Git | `infra/docker/.env` 权限 600 且被同步脚本排除；仓库仅存 `.env.example` | ✅ |
| R12 | 不得擅自执行的操作 | 未执行 `git reset --hard` / `git clean -fdx` / 强制推送 / 全局清理 / 删未知目录 / 生产库迁移 | ✅ |
| R13 | 真实支付 / 正式部署 / 上传发布 / 改 AppID / 真实顾客数据 / 付费服务 / 外部上传素材 / 删数据 / 大规模压测 | **一律未执行**，需明确批准 | ⛔ 按红线暂不执行 |

---

## 8. 阻塞项（goal.md §7 末句：记录原因，不以假结果代替）

| # | 事项 | 阻塞原因 | 解除条件 |
| --- | --- | --- | --- |
| B1 | 微信开发者工具预览 | 本 WSL 环境无微信开发者工具；红线禁止为此下载大型工具链 | 在 Windows 侧导入 `apps/miniprogram` 预览（步骤见 `docs/RUNBOOK.md` §7） |
| B2 | Android / iOS 真机验收 | 同 B1 | 需真机 + 合法域名或勾选「不校验合法域名」 |
| B3 | 真实微信登录 | 无商家授权 AppID/Secret | 提供后 `WECHAT_MOCK_AUTH=false` 并配置 AppID/Secret，代码零改动切换 |
| B4 | 真实微信支付 | 需商家明确批准，并需先确定全款/定金、尾款、运费、取消退款规则 | 决策后单独实现 `PaymentGateway` 与回调验签/幂等/查单补偿 |
| B5 | 对象存储 | 未获商家授权 | 实现 oss 适配器并配置 `STORAGE_DRIVER=oss` |
| B6 | 正式上线 / 提交审核 / 体验版上传 | 目标文档列为需明确批准的操作 | 商家批准后由 Windows 开发者工具手动上传 |
| C1 | 76 件商品正式资料 | 商家未确认 | 确认后走「提交审核 → 发布」上架，页面代码无需改动 |
| C2 | 分类树 / 量体必填项 / 运费周期 / SKU / 洗护文案 | 商家未确认 | 已按安全临时方案实现（见 `docs/agent/DECISIONS.md` §7 与 `docs/ACCEPTANCE-REPORT.md` §7） |
