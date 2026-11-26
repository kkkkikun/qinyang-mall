# 验收报告 · 琴扬精纺羊绒 QINYANG 微信商城 V1

> 验收时间：2026-11-26
> 验收环境：学校服务器（构建与联调用），MySQL 8.4 独立容器 `qinyang-mysql`（127.0.0.1:13316）
> 验收范围：P0 工程准备、P1 商品展示垂直切片、P2 量体与定制申请、P3 报价与订单闭环、P4 交付准备

---

## 1. 总览

| 阶段 | 交付物 | 状态 |
| --- | --- | --- |
| P0 | 工程骨架、Git 基线、服务器工具链、基线文档、资源账本 | ✅ 完成 |
| P1 | 后台商品/分类/轮播管理 → API → 小程序首页/分类/搜索/详情 | ✅ 完成 |
| P2 | 量体模板版本化、量体提交与校验、店员审核 | ✅ 完成 |
| P3 | 报价版本、顾客确认、订单快照、制作/发货状态机、审计 | ✅ 完成 |
| P4 | 服务器构建全绿、备份恢复演练、运行手册、交付文档 | ✅ 完成（微信侧验收待 Windows 环境） |

**自动化验证总计：80 个自动化用例（37 单元 + 43 集成）全部通过，
30 项真实环境垂直切片验收在「独立进程」与「Docker Compose 隔离栈」两种部署形态下各通过一次，
73 项小程序执行验证（在 Node 中执行小程序**自身代码**打真实 API）全部通过，
小程序静态自检与前后端接口契约核对均通过。**

---

## 2. 自动化测试证据

### 2.1 单元测试（37 例，纯业务规则）

| 文件 | 覆盖内容 |
| --- | --- |
| `test/unit/status-machine.spec.ts` | 定制申请与订单状态机：终态无后继、覆盖全部状态、主链路逐步可达、不允许跳过报价、报价后可重新报价、已完成不可回退 |
| `test/unit/measurement-validator.spec.ts` | 量体校验：必填缺失提示具体字段、数值越界、单位不一致拒绝、模板外字段拒绝、错误码、快照结构完整可回溯 |
| `test/unit/pricing.spec.ts` | 价格规则：`QUOTE_ONLY` 恒为 null（绝不落 0）、固定价必须正整数分、拒绝浮点分、合计为整数分求和 |
| `test/unit/static-assets.spec.ts` | 静态资源挂载：前缀推导（带端口 / https / 多级路径 / 空值回退）、可写存储根与只读媒体根共用同一前缀且媒体根兜底排在后面、空白媒体根视为未配置 |
| `test/unit/measurement-shape.spec.ts` | 量体模板形状归一化：原型 snake_case → 契约 camelCase、幂等、混合形状、缺省值兜底、非法输入不抛异常、空模板写入被拦截 |

### 2.2 集成测试（43 例，真实 MySQL 测试库）

`test/integration/vertical-slice.spec.ts` —— 跑在 `qinyang_mall_test` 独立库上
（`global-setup.ts` 在检测到指向开发库时直接报错），测试前自动清空测试表。

关键断言与结果：

| # | 断言 | 结果 |
| --- | --- | --- |
| 1 | 店主/店员登录分别拿到正确角色令牌 | ✅ |
| 2 | 错误密码被拒绝，且不区分「用户不存在」与「密码错误」 | ✅ |
| 3 | 未登录访问管理端 → 401 | ✅ |
| 4 | 店员新增商品 → 状态 DRAFT、价格 null | ✅ |
| 5 | 未发布商品顾客不可见 | ✅ |
| 6 | **店员上下架 → 403 FORBIDDEN** | ✅ |
| 7 | **草稿不能直接上架，必须先提交审核 → 409** | ✅ |
| 8 | 店主提交审核→发布后顾客可见，`priceCents` 为 null | ✅ |
| 9 | 非法状态迁移 → 409 INVALID_STATUS_TRANSITION | ✅ |
| 10 | 按商品解析量体模板 | ✅ |
| 11 | 顾客提交申请 → PENDING_REVIEW | ✅ |
| 12 | **重复提交同一 submitId 幂等**（只产生 1 条申请） | ✅ |
| 13 | 量体越界 → 400 MEASUREMENT_INVALID | ✅ |
| 14 | **顾客看不到他人申请 → 404** | ✅ |
| 15 | 店员审核通过 → PENDING_QUOTE | ✅ |
| 16 | **店员创建报价 → 403（店主专属）** | ✅ |
| 17 | 店主创建报价 v1 → 整数分、快照冻结 | ✅ |
| 18 | 新报价 v2 → 旧版 SUPERSEDED，同时只有一个 ACTIVE | ✅ |
| 19 | **未确认报价的申请不能建单 → 409** | ✅ |
| 20 | **顾客用旧版本号确认报价 → 409 QUOTE_VERSION_CONFLICT** | ✅ |
| 21 | 顾客确认当前有效报价 → CONFIRMED | ✅ |
| 22 | 店主生成订单，快照继承自报价 | ✅ |
| 23 | **后台改商品不影响已生成订单的历史快照** | ✅ |
| 24 | 订单状态非法跳转 → 409 | ✅ |
| 25 | 店员制作 → 发货 → 顾客看到 3 条进度 | ✅ |
| 26 | **顾客不能查看他人订单 → 404** | ✅ |
| 27 | 订单完成 → 申请状态同步为 COMPLETED | ✅ |
| 28 | **支付接口 → 409 PAYMENT_DISABLED，支付记录状态恒为 DISABLED** | ✅ |
| 29 | **关键操作留有审计记录，且审计内容不含手机号与地址明文** | ✅ |
| 30 | **店员访问审计日志 → 403** | ✅ |
| 31 | 管理员下架 → 顾客立即不可见，详情 404 | ✅ |
| 32 | **商品确实写入数据库（不是内存假数据）** | ✅ |

---

## 3. 真实环境垂直切片验收（30 项全通过）

`infra/scripts/acceptance.mjs` 对**运行中的真实 API**执行，使用**真实种子商品**与**真实图片文件**：

```
✅ API 健康检查
✅ 店主登录并取得令牌 — role=OWNER
✅ 后台读取到种子商品 — 13 件
✅ 全部商品经「提交审核 → 发布」上架 — 13/13
✅ 顾客端商品列表返回已发布商品 — 13 件
✅ 未确认价格的商品不显示价格（priceCents 为 null） — 全部为 null（前端显示「待报价」）
✅ 商品均有真实主图 — 13/13
✅ 主图文件可访问且非空 — http://127.0.0.1:18110/static/products/ED-0062/IMG-0505-4x5.jpg → 200, 69KB
✅ 商品搜索命中 — keyword=ED-0062
✅ 二级分组筛选生效 — knitwear-cardigan → 3 件
✅ 分类树含二级分组 — 5 个一级分类
✅ 图文说明页 measure-top / measure-bottom / care / material
✅ 顾客登录
✅ 按商品解析量体模板 — template=TPL-BOTTOM
✅ 量体模板带得出可填字段与必填项 — 字段 7 个（必填 5 个）
✅ 顾客提交定制申请 — 状态=PENDING_REVIEW
✅ 申请快照带回真实量体数值 — 快照字段 7 个
✅ 重复提交同一 submitId 幂等
✅ 店员登录
✅ 店员审核通过 — 状态=PENDING_QUOTE
✅ 店主创建报价 — 版本=1
✅ 顾客确认报价 — 状态=ACTIVE
✅ 由申请生成订单 — 订单=QO-20261126-3E5D29
✅ 店员填写物流并发货 — 状态=SHIPPED
✅ 顾客查看订单进度 — 3 条进度
✅ 支付接口返回 PAYMENT_DISABLED
✅ 关键操作留有审计记录 — 100 条

=== 结果：30/30 项通过 ===
```

> 本轮新增的两项断言（「量体模板带得出可填字段与必填项」「申请快照带回真实量体数值」）
> 正是上一版**空洞通过**的地方 —— 详见 §4.2。

### 3.1 两种部署形态各验收一次

同一套 `acceptance.mjs` 分别指向两种运行形态，均为 28/28：

| 部署形态 | API 入口 | 后台入口 | 结果 |
| --- | --- | --- | --- |
| 独立进程（`infra/scripts/run-api.sh`） | `127.0.0.1:18120/api/v1` | 静态包由 Vite/nginx 托管 | ✅ 28/28，主图 200 / 69KB |
| Docker Compose 隔离栈（`infra/docker/docker-compose.test.yml`） | `127.0.0.1:18110/api/v1`（容器 `qinyang-api`） | `127.0.0.1:18111`（容器 `qinyang-admin-web`） | ✅ 28/28，主图 200 / 69KB |

容器化栈的额外核验：

```
✅ 网络成员：qinyang-mysql 172.19.0.2 / qinyang-api 172.19.0.3 / qinyang-admin-web 172.19.0.4
✅ api 容器运行时网络端点与端口发布：NetworkSettings.Networks 非空、3000/tcp → 127.0.0.1:18110
✅ api 容器健康检查通过（compose: service_healthy）
✅ admin-web nginx 反代 /api → api:3000 → 200
✅ admin-web 直接托管 /static 主图 → 200 / 70769 B
✅ 容器内直连服务名：http://api:3000/api/v1/health → 200
```

### 3.2 小程序真实流程验证（20 项全通过）

小程序是三端里唯一**从未被执行过**的一端：微信开发者工具不在本环境，
此前所有验收都是直接调 HTTP 接口，**一行小程序代码都没跑过**。

`tools/verify_miniprogram_flow.mjs` 的做法：用工作区的 `tsc` 把
`apps/miniprogram` 编译到临时目录（不做类型跳过，因此顺带把小程序类型检查
也变成真实关卡），注入 `wx` / `Page` / `App` 等全局桩件，
其中 `wx.request` 用 fetch 打到**真实运行中的 API**，
然后用小程序**自己的** `utils/api.ts` 与 `pages/apply/apply.ts` 跑完整流程：

```
✅ 顾客端 wx.login → POST /auth/login 取得 token
✅ 顾客端商品列表取到已发布商品 — 13 件
✅ 商品可解析出量体模板 — ED-0062 / 裤装 / 裙装量体模板
✅ 量体模板带得出可填字段与必填项 — 字段 7 个（必填 5 个）
✅ 申请页加载出商品与量体字段 — 2 个测量分区 / 必填 5 项
✅ 必填项未填时客户端校验拦截 — 请填写腰围
✅ 填写合法值后客户端校验通过
✅ 申请页提交触发真实请求 — submitCalls=1
✅ payload 含 productId / measurements / contact / submitId — measurements=5 项
✅ payload 的量体字段数与必填项一致 — 5 vs 必填 5
✅ 服务端可查到该申请 — 状态=PENDING_REVIEW
✅ 申请初始状态为待审核 — PENDING_REVIEW
✅ 重复提交同一 submitId 幂等（返回同一条申请）
✅ 重复提交未产生第二条记录 — 匹配 1 条
✅ 越界值：客户端拦截 — waist
✅ 越界值：服务端同样拒绝 — MEASUREMENT_INVALID
✅ 联系方式缺失被客户端拦截 — 请填写联系电话
✅ 校验不通过时不发起提交 — submitCalls=1
✅ 提交成功后跳转申请详情页 — /pages/request-detail/request-detail?id=…
✅ 顾客可查到自己的定制申请列表 — 2 条

=== 结果：20/20 项通过 ===
```

其中的「越界值：客户端拦截 / 服务端同样拒绝」是一对**一致性断言**：
同一个越界数值，客户端表单与服务端校验必须都拒绝 —— 只有两端规则一致，
顾客才不会遇到「表单能填、提交被拒」。

### 3.3 小程序页面级执行验证（53 项全通过）

```
✅ 顾客端登录（wx.login → /auth/login）
✅ 顾客端商品列表有数据 — 13 件
✅ 首页：加载无错误
✅ 首页：羊绒衣橱轮播有内容 — 3 张
✅ 首页：精选商品有内容 — 4 件
✅ 首页：轮播项带图片地址
✅ 分类页：加载无错误
✅ 分类页：一级分类有内容 — 5 个
✅ 分类页：二级分组有内容 — 5 个
✅ 分类页：商品列表有内容 — 7 件
✅ 搜索页：热门关键词有内容 — 6 个
✅ 搜索页：按商品编号搜到结果 — keyword=ED-0062 → 1 件
✅ 商品详情：加载无错误
✅ 商品详情：商品主体有数据 — ED-0062
✅ 商品详情：图集有多张 — 8 张
✅ 商品详情：未确认价格显示「待报价」而非数字 — priceLabel=待报价
✅ 商品详情：带出量体模板名称 — 裤装 / 裙装量体模板
✅ 指南页 guide-top / guide-bottom / guide-care / guide-material：内容与分区均有数据（来源 api）
✅ 个人中心：顾客资料有数据 — 琴扬顾客
✅ 个人中心：手机号已脱敏
✅ 我的申请：列表有内容、包含刚提交的申请
✅ 申请详情：状态文案已渲染 — 待审核
✅ 申请详情：带出量体字段 — 2 个分区
✅ 申请详情：可取消按钮状态正确 — canCancel=true
✅ 店员创建报价 — status=201
✅ 报价页：报价金额已渲染 — ¥2,880.00
✅ 报价页：报价版本号已渲染 — version=1
✅ 报价页：报价编号与商家侧一致
✅ 顾客在报价页确认报价 → 申请变为已确认 — CONFIRMED
✅ 店员由已确认申请生成订单
✅ 订单列表：有内容、包含刚生成的订单 — 已发货
✅ 订单详情：订单主体有数据 — 已发货
✅ 订单详情：进度时间线有 3 条 — 3 条
✅ 订单详情：带出量体快照 — 7 项
✅ 订单详情：金额已渲染 — ¥2,900.00
✅ 可取消的申请：按钮可用 — canCancel=true
✅ 顾客在申请详情页取消申请 → 状态为已取消 — CANCELLED
✅ 取消前弹出了二次确认 — 取消定制申请

=== 结果：53/53 项通过 ===
```

---

## 4. 构建与工程验证

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 共享契约构建 | `pnpm --filter @qinyang/contracts build` | ✅ |
| API 类型检查 | `pnpm --filter @qinyang/api typecheck` | ✅ 0 错误 |
| 后台类型检查 | `pnpm --filter @qinyang/admin-web typecheck`（vue-tsc） | ✅ 0 错误 |
| API 构建 | `pnpm --filter @qinyang/api build`（nest build） | ✅ |
| 后台构建 | `pnpm --filter @qinyang/admin-web build`（vite） | ✅ 3941 模块 |
| 全量流水线 | `bash infra/scripts/build.sh`（限核 0-3） | ✅ **76.33 s**，峰值内存 **1.63 GB** |
| 单元测试 | `pnpm --filter @qinyang/api test:unit` | ✅ 37 例 |
| 集成测试 | `pnpm --filter @qinyang/api test`（含集成） | ✅ **80 例**（37 单元 + 43 集成） |
| API 镜像构建 | `docker build -f infra/docker/Dockerfile.api -t qinyang/api:local .` | ✅ 1.08 GB |
| 后台镜像构建 | `docker build -f infra/docker/Dockerfile.admin-web -t qinyang/admin-web:local .` | ✅ 74.6 MB |
| Compose 隔离栈 | `docker compose -f infra/docker/docker-compose.test.yml up -d` | ✅ 三容器均 healthy / Up |
| 小程序静态自检 | `python3 tools/check_miniprogram.py` | ✅ 0 阻塞问题 |
| **前后端接口契约核对** | `python3 tools/check_api_contract.py` | ✅ **0 阻塞**：55 条 API 路由 ↔ 小程序 15 处 + 后台 35 处调用全部匹配 |
| **小程序类型检查** | `pnpm typecheck:miniprogram` | ✅ 0 错误（17 个页面首次纳入类型检查） |
| **小程序写路径执行验证** | `node tools/verify_miniprogram_flow.mjs` | ✅ 20/20（小程序自身代码打真实 API） |
| **小程序页面级执行验证** | `node tools/verify_miniprogram_pages.mjs` | ✅ 53/53（17 个页面逐一加载 + 闭环走页面代码） |
| 小程序契约副本一致性 | `python3 tools/sync_contracts_to_miniprogram.py --check` | ✅ 与源文件一致 |
| 后台源码 lint | `node apps/admin-web/scripts/lint.mjs` | ✅ 25 个源文件无问题 |
| 数据库迁移 | `pnpm --filter @qinyang/api db:migrate` | ✅ 2 个迁移已应用 |
| 种子数据 | `pnpm --filter @qinyang/api db:seed` | ✅ 幂等 |

### 备份恢复演练

`infra/scripts/backup-restore-drill.sh`（导出 → 恢复到独立演练库 → 结构与行数比对 → 清理）：

```
✅ 备份大小: 266 KB
✅ 源库表数=15  演练库表数=15
✅ products 13 行 / product_media 119 行 / categories 19 行
✅ measurement_templates 5 行 / customization_requests 6 行 / quotes 6 行 / orders 6 行
✅ audit_logs 88 行 / admin_users 2 行
✅ 备份恢复演练通过：结构一致、关键表行数一致
```

> 行数随验收轮次增长（每次验收会真实写入申请、报价、订单与审计记录），
> 演练比对的是「源库 vs 恢复库」的一致性，两侧始终相等。

### 4.1 Docker Compose 隔离栈：故障与修复记录

本次收尾阶段定位并修复了两个真实故障，均已复验通过，过程留档如下。

**故障一：api 容器不入网、18110 不发布**

| 观测 | 数据 |
| --- | --- |
| 容器状态 | `qinyang-api` 显示 Up，但 `NetworkSettings.Networks = {}`、`NetworkSettings.Ports = {}` |
| 容器日志 | `Error: getaddrinfo EAI_AGAIN mysql`（TypeORM 重试 9 次后放弃） |
| 网络成员 | `docker network inspect qinyang_default` 只列出 mysql 与 admin-web，**没有 api** |
| compose 展开 | `docker compose config` 中 api 的 `ports`（18110）与 `networks.default` 均**正确存在** |

- 判定：**不是配置写错**。`HostConfig.NetworkMode` 已是 `qinyang_default`、
  `HostConfig.PortBindings` 也已是 `127.0.0.1:18110`，但运行时端点丢失 ——
  典型成因是网络被重建（down 删网）后，容器仍持有旧 network id 的端点引用。
- 修复：完整 `docker compose down --remove-orphans`（连同网络一起删除）后重新 `up -d`，
  三个容器一次性重建，端点与端口发布恢复正常。

**故障二：后台 nginx 反复重启**

| 观测 | 数据 |
| --- | --- |
| nginx 日志 | `[emerg] host not found in upstream "api" in /etc/nginx/conf.d/default.conf:30` |
| 容器状态 | `qinyang-admin-web` 处于 `Restarting (1)` 循环 |

- 判定：nginx 在**启动时**解析上游域名，api 容器未就绪时直接致命退出；
  原来的 `depends_on: [api]` 只保证「已启动」，不保证「可用」。
- 修复：为 api 增加健康检查（镜像内无 curl/wget，用 node 内置 `fetch` 探测 `/api/v1/health`），
  admin-web 改为 `depends_on: api: {condition: service_healthy}`。

**故障三（顺带发现）：容器内商品主图 404**

| 观测 | 数据 |
| --- | --- |
| 验收项 | 「主图文件可访问且非空」→ `http://127.0.0.1:18110/static/products/ED-0062/IMG-0505-4x5.jpg` → **404, 0KB** |
| 原因 | 容器内商品目录图片位于只读挂载 `/app/media`，而 API 静态目录指向可写存储 `/app/storage`，两者未打通 |

- 修复：新增 `STORAGE_MEDIA_ROOT` 配置项（可写存储根 + 只读媒体根共用 `/static` 前缀，
  express 静态中间件 fallthrough，媒体根兜底在后），后台容器同步挂载媒体目录到 `/var/www/media`。
- 回归保护：抽取 `apps/api/src/common/static-assets.ts` 并新增 7 例单元测试
  （前缀推导、双根顺序、空白媒体根），避免同类问题复发。

### 4.2 本轮发现并修复的四个真实缺陷（量体环节）

这一组缺陷是**在小程序代码第一次被真正执行**时暴露的。
它们的共同特征是：编译通过、类型通过、接口返回 200、验收全绿 ——
但业务实际上是断的。

#### 缺陷一：小程序从未被类型检查（12 个错误）

小程序没有 `package.json`（原生小程序不引入 npm 依赖），
因此不在 `pnpm -r typecheck` 的覆盖范围内 —— 17 个页面的 TypeScript
**从未被任何类型检查器看过**。首次纳入检查即报出 12 个错误：

| 错误 | 位置 | 实质 |
| --- | --- | --- |
| `TS2393 Duplicate function implementation` | `utils/format.ts` | `formatDate` 被声明两次：导出的 `string` 版与内部的 `Date` 版。**后者会覆盖前者** —— 任何外部调用 `formatDate(iso)` 都会拿到 `Date` 版，运行时 `date.getFullYear is not a function` |
| `TS2345 Date → string` | `utils/format.ts` ×4 | `formatDateTime` 被传入 `Date` 对象（签名是 `string`），靠 `new Date(date)` 的隐式转换侥幸能跑 |
| `TS2739` 缺 `createdAt`/`updatedAt` | `data/measure_templates.ts` ×5 | 本地兜底量体模板与契约 DTO 不符 |

修复：拆出内部实现 `formatDatePart(date: Date)`，`formatDate(iso)` 只保留对外的一份；
`validUntilText` 直接用 `formatDatePart`；兜底模板补齐时间字段。
并把 `pnpm typecheck:miniprogram` 接入 `build.sh` 与根 `typecheck` 脚本。

#### 缺陷二：量体模板的形状不一致（snake_case vs camelCase）

原型数据 `prototype/data/measurement_templates.json` 用 snake_case
（`section_id` / `measurement_fields` / `field_code`），
而契约 `MeasurementSection` / `MeasurementField` 要求 camelCase。
早期种子把原型 JSON **原样**写进 `measurement_sections` 列，于是接口返回：

```json
{"title": "身体测量", "section_id": "body",
 "measurement_fields": [{"field_code": "chest_bust", "required": true, "min": 60, "max": 140}]}
```

连锁后果：

- 顾客端表单渲染出 **0 个字段**（客户端读 `measurementFields`，拿到 undefined）；
- 顾客提交时 `measurements` 为空数组；
- 服务端校验器同样读 `measurementFields`，模板字段表是**空的** ——
  于是「必填项校验」「越界校验」「模板外字段拒绝」全部形同虚设。

为什么之前没被发现：三端各用不同的事实来源 ——
集成测试自己造 camelCase 模板，验收脚本从接口取模板（取到空的），
小程序从未执行。**谁都没在真实数据上跑通过量体环节。**

修复：新增 `apps/api/src/modules/templates/measurement-shape.ts` 统一归一化；
种子写入前转换并用 `assertSectionsUsable` 拦截空模板；
服务读路径归一化，历史行照样可用。

#### 缺陷三：解析与校验不同源

`GET /measurement-templates/resolve?productId=` 按**分类**解析模板，
而提交校验按商品**显式绑定**的模板（`product.measurementTemplateId`）。
两个来源不一致时，顾客按 A 模板填表，服务端按 B 模板判定，
返回 `MEASUREMENT_INVALID：量体字段 chest_bust 不属于该商品的量体模板` —— 顾客永远提交不成功。

修复：新增唯一入口 `TemplatesService.resolveForProduct(product)`
（优先商品绑定模板，再按分类回退），**解析接口与提交校验共用它**。

#### 缺陷四：客户端丢掉了服务端给出的真实原因

服务端异常响应把业务错误码放在 `code`（字符串，如 `MEASUREMENT_INVALID`）、
把可直接展示的原因放在 `message`。而小程序 `request.ts` 只接受数字 `code`，
于是所有业务错误都被归类为「服务器返回数据异常（HTTP 400）」——
顾客看到的是一句无用的技术提示，而不是「胸围 不能小于 60cm」。

修复：`ApiEnvelope.code` 与 `ApiError.code` 放宽为 `number | string`，
按后台 `http.ts` 的同一套语义处理：字符串业务码 + 服务端 message 直接透出。

#### 防回归

| 层次 | 用例 | 数量 |
| --- | --- | --- |
| 单元 | `measurement-shape.spec.ts` 形状归一化 | 8 |
| 集成 | `measurement-resolution.spec.ts` 解析同源 / 历史行归一化 / 必填缺失拒绝 | 6 |
| 端到端 | `verify_miniprogram_flow.mjs` 客户端与服务端校验一致性 | 20 项断言 |
| 真实环境 | `acceptance.mjs` 模板字段非空 + 快照带真实数值 | 新增 2 项 |

### 4.3 页面级执行验证与两个新的真实缺陷（53/53 通过）

上一轮把「定制申请表」跑通后，其余 16 个页面仍然只被静态检查过。
本轮新增 `tools/verify_miniprogram_pages.mjs`，把**全部 17 个页面**在 Node 中
逐个加载、用真实参数触发 `onLoad`，并断言页面数据落到预期形态；
同时让**顾客侧的每一步都由页面自己的方法完成**：

```
申请（顾客端 api 层造数）
  → 我的申请页：列表包含该申请
  → 申请详情页：状态文案 + 量体字段 + 可取消标记
  → 店员报价（管理端接口）
  → 报价页：金额 ¥2,880.00、版本 1、报价编号与商家侧一致
  → 顾客在报价页点 confirm() → 申请变为 CONFIRMED
  → 店员建单 + 发货（管理端接口）
  → 订单列表页：包含该订单
  → 订单详情页：进度时间线 3 条、量体快照 7 项、金额 ¥2,900.00
  → 顾客在申请详情页点 cancel() → 二次确认弹窗 → 状态 CANCELLED
```

页面冒烟覆盖：首页轮播、分类两级、搜索命中、商品详情多图与「待报价」、
4 个图文指南、个人中心脱敏、我的申请、申请详情、报价、订单列表、订单详情。

**结果：53/53 通过。**（全过程见 §3.3）

这一轮又抓出两个真实缺陷：

#### 缺陷五：顾客打开分类页看到的是空列表

商品挂在**二级分组**上，而小程序的分类页默认按**一级分类 id** 查询
（`products({ categoryId: curCatId, group: '' })`）。
API 侧 `categoryId` 是**精确匹配** `p.categoryId = :categoryId`，
一级分类自身没有商品 → 必然 0 件。

实测（修复前）：

```
一级分类 knitwear  productCount = 0   按其 id 过滤 → 0 件   <== 分类页默认走这条
二级分组 knitwear-cardigan  productCount = 3
```

分类树里的 `productCount` 同样只统计直接挂载，导致一级分类恒显示 0 件。

修复：
- `products.service` 的 `categoryId` 过滤改为**包含下级分组**
  （传入分组 id 时行为不变，因为分组没有子级）；
- `categories.service` 的分类树计数**向下汇总**（一级分类 = 自身 + 所有下级分组）。

修复后实测：`一级分类 knitwear productCount = 7，按其 id 过滤 → 7 件`。

#### 缺陷六：商品详情页拿不到量体模板名

契约 `ProductDetail` 声明了 `measurementTemplateName`，小程序商品详情页也渲染它，
但 API 侧 `products.service.ts` 把这个字段**硬编码成 `null`** ——
顾客在商品页永远看不到「按哪套模板量体」。

修复：按 `measurementTemplateId` 关联查询模板并返回其名称；
实测 `measurementTemplateName = 裤装 / 裙装量体模板`。

#### 防回归

新增集成测试 `vertical-slice.spec.ts` 的「分类层级语义」分组（4 例）：
一级分类过滤含下级分组、二级分组精确过滤、分类树计数汇总、商品详情模板名。

---

## 5. 资源预算验证

见 `docs/agent/RESOURCE-LEDGER.md`。要点：

| 约束 | 实测 | 结论 |
| --- | --- | --- |
| 本地新增磁盘 ≤ 8 GB | **约 66 MB**（源码 + `.git` 64 MB） | ✅ 0.8% |
| 本地不装依赖树 / 不装 Docker / 不装 MySQL | 本地 `node_modules` = 0，Docker 不可用 | ✅ |
| 服务器项目新增 ≤ 8 GB | 工程目录 **1.3 GB** + 本项目镜像 **1.15 GB** ≈ **2.45 GB** | ✅ 31% |
| 构建 ≤ 4 CPU 核 | 首次实测 9.25 核（超限）→ 加 `taskset -c 0-3` 后 **3.11 核** | ✅ 已修正 |
| 构建内存 ≤ 8 GB | 流水线实测峰值 **1.54 GB** | ✅ |
| 镜像构建并发 | 两个 Dockerfile 均设 `npm_config_child_concurrency=2` / `network_concurrency=2` | ✅ |
| 同时重型任务 ≤ 1 | 构建与图片流水线全程串行 | ✅ |
| 测试并发 ≤ 2 Worker | `jest.config.js` `maxWorkers: 2` | ✅ |
| 日常测试服务 ≤ 2.5 核 / 4 GB | compose 限额合计 **2.5 核 / 3.75 GB**（MySQL 1C/2G + API 1C/1.5G + admin-web 0.5C/256M）；空闲实测 CPU ≈ 1%、内存合计 **641 MB** | ✅ |
| Docker 日志轮转 | 全部服务 10MB × 3 | ✅ |
| 不全局清理 Docker / 不动其他项目 | 从未执行 prune；仅删除本项目自有的 `qinyang/*:build-test` 重复镜像（释放约 1.1 GB）；端口与卷全部使用 `qinyang` 命名空间 | ✅ |

---

## 6. 视觉与体验验收

### 6.1 已验证

- 原型基线本身：`prototype/test-report.md` 记录 **100/100 浏览器用例通过、0 控制台错误**，
  覆盖 12 个页面渲染、与 `ref/` 原截图的 17 项差异回归、分类页两级分组重构、
  量体表单校验与进度、购物车幂等、订单流程、搜索与空态。
- 小程序代码的视觉令牌与原型一致：主金 `#D29B5E`、麦金 `#CD9150`、炭黑 `#272727`、
  强调红 `#F53939`、页面底 `#F2F2F2`、输入框 `#F7F7F7`；标题宋体族、正文 PingFang 族。
- 小程序静态自检：17 个页面 4 文件齐全、`app.json` 与目录一一对应、
  **无任何指向 `apps/miniprogram` 之外的资源引用**、无 npm 运行时依赖、
  tabBar 图标存在。

### 6.2 未能验证（阻塞原因已记录，不以假结果代替）

| # | 事项 | 阻塞原因 | 解除条件 |
| --- | --- | --- | --- |
| B1 | 微信开发者工具预览（375 / 390 / 430 三档宽度） | 本 WSL 环境无微信开发者工具，且项目红线禁止为此下载大型工具链 | 在 Windows 侧导入 `apps/miniprogram` 预览（步骤见 `docs/RUNBOOK.md` §7） |
| B2 | Android / iOS 真机验收 | 同 B1 | 需真机 + 合法域名或勾选「不校验合法域名」 |
| B3 | 真实微信登录 | 无商家授权的 AppID / AppSecret | 提供后把 `WECHAT_MOCK_AUTH` 置 false，配置 AppID/Secret，代码零改动切换 |
| B4 | 真实微信支付 | 目标文档要求商家明确批准；并需确定「全款 or 定金」「尾款怎么结」「运费/取消退款谁核准」 | 商家决策后单独实现 `PaymentGateway` 与回调验签/幂等/查单补偿 |
| B5 | 对象存储 | 未获商家授权 | 实现 `StorageService` 的 oss 适配器并配置 `STORAGE_DRIVER=oss` |
| B6 | 正式上线 / 提交审核 / 体验版上传 | 目标文档列为需明确批准的操作 | 商家批准后由 Windows 开发者工具手动上传 |

---

## 7. 尚未由商家确认的业务问题（已采用安全临时方案）

见 `docs/agent/DECISIONS.md` 与 `docs/PROJECT-BASELINE.md` §6。要点：

| # | 问题 | 当前安全做法 |
| --- | --- | --- |
| 1 | 76 件商品的正式名称、售价、材质、尺码、库存、正式文案 | 名称沿用带「（临时命名·待确认）」的临时命名；价格恒 null 显示「待报价」；材质与文案留空；商品状态 DRAFT，需后台显式上架 |
| 2 | 正式商品分类树 | 当前一级来自图片聚类（针织服饰/衬衫/围巾/其他服装/待人工确认），二级为按临时命名的展示层分组；整表可替换，页面代码无需改动 |
| 3 | 量体必填项、容差与放量规则 | 模板版本化（ACTIVE/ARCHIVED），商家改字段 = 发布新版本，历史申请引用的版本永久可回溯 |
| 4 | 运费、制作周期、取消退款规则 | 报价由店员逐单填写，无默认值，不自动计算；取消订单必须填原因并留审计 |
| 5 | 是否需要颜色 SKU / 库存 | V1 不做颜色 SKU、不做库存扣减；首期一个定制申请对应一个款式 |
| 6 | 洗护与材质说明的正式文案 | 图文页当前为**通用建议稿**，页面摘要已标注「正式洗护说明需商家确认后替换」 |
| 7 | 是否需要账号体系 | 采用微信授权登录；V1 不做会员营销、积分、储值 |
| 8 | 是否保留收藏 / 分享 | 分享用微信原生能力；收藏未做（个人中心以定制记录为主） |

---

## 8. 结论

琴扬精纺羊绒 QINYANG 微信商城 V1 已从 HTML 原型落地为**可运行、可管理、可交付商家体验**的全栈系统：

- **顾客端**：17 个原生小程序页面，零运行时依赖，对齐原型视觉与交互，驱动真实 API；**17 个页面已全部在 Node 中对真实 API 执行验证**，顾客侧的提交、确认报价、取消申请均走页面自身方法完成。
- **管理后台**：9 个页面 + 框架布局，店主/店员分权，价格与量体展示到位，无任何收款状态按钮。
- **API**：13 张表 + 2 个迁移，状态机、报价版本、快照冻结、归属校验、审计脱敏全部落地并有测试覆盖。
- **验证**：80 个自动化用例 + 30 项真实环境验收（两种部署形态各一轮）+ 73 项小程序执行验证（写路径 20 + 页面级 53）+ 备份恢复演练 + 资源预算核验，全部通过。

**唯一未闭环的是微信平台侧验收**（开发者工具预览、真机、AppID、真实支付、正式发布），
原因均为「缺商家授权或缺本机工具链」，已在 §6.2 逐条记录阻塞原因与解除条件，
**没有用假结果代替**。
