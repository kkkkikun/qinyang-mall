# 项目基线 · 琴扬精纺羊绒 QINYANG 微信商城 V1

> 记录时间：2026-11-26
> 记录范围：接手时既有成果的审计结论、已保护资产、可用基础设施与已知阻塞。

## 1. 既有成果（只读保护，不可破坏）

| 目录 | 内容 | 体积 | 处置 |
| --- | --- | --- | --- |
| `images/` | 690 张原始商品图（`images/yiwu/…`） | 11.0 GB | **只读**，禁止覆盖/删除/重命名；不进 Git |
| `catalog/products/` | 76 件商品的 `original/ processed/ thumbnails/ display/` 衍生副本 | 8.3 GB | **只读**；不进 Git；服务器按需重建 |
| `catalog/reports/` | 商品 CSV、图片清单、质量报告、验收报告 | 1.8 MB | 已入 Git |
| `catalog/review/` | 人工审核页 + 76 件商品对照表 | 19 MB | 已入 Git |
| `catalog/ai-ready/` | AI 生成准备度清单（51/76 达标） | 344 KB | 已入 Git；**未获授权不生成 AI 图** |
| `prototype/` | 12 页高保真 HTML 原型 + 21 张截图 + 测试报告 | 36 MB | 已入 Git；**视觉与交互第一基线** |
| `ref/` | 客户原小程序 53 张截图 | 16 MB | 已入 Git；逐屏对照依据 |
| `tools/` | 25 个 Python 流水线脚本 | 312 KB | 已入 Git；不重复执行已完成的 690 张识别 |

### 商品资产现状

- 76 件商品，编号 `ED-0001` ~ `ED-0076`，`review_status = auto_recognized`。
- 76/76 已选定主图；51/76 达到 AI 图片准备条件。
- **商品正式名称、售价、材质、尺码、库存、正式文案均未经商家确认**。
  现有名称带「（临时命名·待确认）」后缀，价格/材质字段为空。
- 因此 V1 全部商品以 `pricingMode = QUOTE_ONLY` 建模，价格恒为 `null`，
  前端显示「待报价」，**任何环节都不得出现 0 元或编造价格**。

## 2. 原型基线（视觉与交互）

`prototype/README.md` 已完整记录 12 个页面对应关系、逐项取色与 17 项 ref 差异修订：

| 视觉令牌 | 值 |
| --- | --- |
| 主色 · 金 | `#D29B5E` |
| 主要按钮 · 麦金 | `#CD9150` |
| 次要按钮 · 炭黑 | `#272727` |
| 强调红 | `#F53939` |
| 页面底 / 卡片 / 输入框 | `#F2F2F2` / `#FFFFFF` / `#F7F7F7` |
| 正文 / 次要 / 三级文字 | `#1A1A1A` / `#666666` / `#999999` |

字体：标题宋体族（`Songti SC, STSong, Noto Serif SC, serif`），正文 `-apple-system, PingFang SC, Microsoft YaHei`。
图标全部内联 SVG，无 emoji、无图标字体、无外链资源。
品牌标识：`QINYANG` 字标 + 琴扬书法 logo（已提取为透明 PNG）。

原型自带浏览器实测：**100/100 用例通过，0 控制台错误**（`prototype/test-report.md`）。

## 3. 参考资料

- `docs/goal.md` —— 本项目的总目标提示词（权威）。
- `docs/reference/QINYANG-V1-开发计划.md` —— 客户方开发计划，含技术栈、交易规则、发布门槛。
- `docs/reference/qinyang_customer_demo_v2_pixel.html` —— 客户原型（HTML 第一基线）。

> 说明：目标文档提到「如果原型 (1) 版本也存在，先比较版本差异」。工作区实际提供的是
> `qinyang_customer_demo_v2_pixel.html`（v2），不存在 (1) 号文件，
> 因此**基线采用 v2**，并以 `prototype/` 的复刻成果为可直接执行的对照物。

## 4. 工程与基础设施

### 4.1 本地（开发机）

| 项 | 值 |
| --- | --- |
| 工作区 | `/home/kikun/MyProject/clothing-mall-miniapp`（Windows `W:\home\kikun\MyProject\clothing-mall-miniapp`） |
| 磁盘 | `/dev/sdc` 1007G，已用 371G，剩余 586G（39%） |
| Node | v22.21.1（**本地不构建 API/后台**，仅编辑与脚本） |
| pnpm | 本地 corepack 缓存损坏；**构建在服务器完成**，故不阻塞 |
| Docker | 本机不可用（符合「本地不装重型基础设施」红线） |

### 4.2 学校服务器（构建与测试）

| 项 | 值 |
| --- | --- |
| SSH | `ssh sqserver`（`~/.ssh/config`：172.16.38.110:56127，密钥认证，已验证） |
| 主机 | kvm-ubuntu-24，128 核 / 295 GB 内存 |
| 磁盘 | `/dev/vda1` 991G，已用 567G，剩余 425G（58%） |
| 系统 Node | v22.21.1 → **本项目改用隔离的 `~/tools/node-v24.22.3`**（Node 24 LTS "Krypton"） |
| pnpm | 11.7.0（已装入 Node 24 工具链） |
| Docker | 29.8.2，Compose v5.5.1 |
| npm registry | `registry.npmmirror.com`（`registry.npmjs.org` 直连被拒，`.npmrc` 已锁定镜像） |
| Docker Hub | 直连被重置 → 使用已存在的华为云镜像 `swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/library/*` |

### 4.3 本项目的隔离命名空间

| 资源 | 值 | 说明 |
| --- | --- | --- |
| Compose project | `qinyang` | 不与服务器既有项目混用 |
| MySQL | 容器 `qinyang-mysql`，`127.0.0.1:13316` | 既有项目占用 13306/13307，避让 |
| API | `127.0.0.1:18110` | 既有项目占用 18080/18081/18082，避让 |
| 管理后台 | `127.0.0.1:18111` | 仅绑定回环，不暴露校园网 |
| 数据卷 | `qinyang_mysql_data` / `qinyang_media` / `qinyang_storage` | 独立命名空间 |
| 资源上限 | MySQL 2C/2G、API 2C/2G、后台 1C/512M；日志 10MB×3 | 满足目标文档的节制要求 |

## 5. Git

- 仓库：<https://github.com/kkkkikun/qinyang-mall>（公开，经用户确认后创建）。
- 基线提交：`6c2b525 chore: 建立 QINYANG 微信商城 V1 基线`。
- `images/` 与 `catalog/products/` 由 `.gitignore` 排除，仓库体积 **63 MB**。
- 服务器持有完整 `.git` 历史（`infra/scripts/sync-to-server.sh git` 同步），
  构建以**固定 commit** 为准，服务器不自行修改源码。

## 6. 已识别的阻塞与待确认事项

| # | 事项 | 影响 | 处置 |
| --- | --- | --- | --- |
| B1 | 无微信小程序 AppID / AppSecret | 顾客登录无法走真实 `code2session` | 实现 `CustomerIdentityProvider` 抽象：`WECHAT_MOCK_AUTH=true` 时用 mock（`dev:openid` 形式）；拿到 AppID 后零改动切换 |
| B2 | 微信开发者工具不在本 WSL 环境 | 小程序无法在本机预览 | 代码严格按原生 TS 编写并自检；预览步骤写入交付文档，待在 Windows 开发者工具执行 |
| B3 | 商品正式名称/价格/材质/文案未确认 | 不能正式上架 | 商品以 `DRAFT` 种子入库，价格恒 `null`；上架须由后台显式操作并留审计 |
| B4 | 量体必填项与放量规则未确认 | 量体模板字段可调整 | 模板版本化（`ACTIVE`/`ARCHIVED`），改字段=发布新版本，历史申请引用的版本永久可回溯 |
| B5 | 运费/周期/取消退款规则未确认 | 报价字段默认值 | 报价由店员逐单填写；无默认值，不自动计算 |
| B6 | 真实微信支付未获批准 | 无法收款 | `PaymentGateway` 接口 + **明确禁用的** `DISABLED` 适配器，调用恒返回 `PAYMENT_DISABLED`，不产生伪造支付/退款记录 |
| B7 | 对象存储未获授权 | 图片只能走本地受控存储 | `StorageService` 抽象 + 本地驱动；`STORAGE_DRIVER=oss` 未实现时**直接报错而非静默降级** |

## 7. 首批开发验收范围

按目标文档「仅选取 10～15 件代表性商品完成首批开发验收」，选定 **13 件**：

| 编号 | 分类 | 覆盖点 |
| --- | --- | --- |
| ED-0001 / ED-0003 | 围巾 | 巾类 / 披肩类，量体模板 `TPL-SCARF` |
| ED-0006 / ED-0007 / ED-0008 | 针织服饰 | 开衫 / polo / 圆领长袖，`TPL-KNIT-TOPS` |
| ED-0009 | 衬衫 | `TPL-KNIT-TOPS` |
| ED-0018 | 针织服饰 | 亨利领短袖 |
| ED-0021 | 其他服装 | 阔腿长裤，`TPL-BOTTOM`（下装模板覆盖） |
| ED-0024 | 针织服饰 | 无袖背心 |
| ED-0032 | 针织服饰 | 演示款（原型 README 指定的 12 图主推款） |
| ED-0043 | 针织服饰 | 千鸟格开衫（提花纹理） |
| ED-0060 | 其他服装 | 连帽卫衣，`TPL-OUTER` |
| ED-0062 | 其他服装 | 针织长裙，`TPL-BOTTOM`（裙装覆盖） |

其余 63 件待商家确认商品资料后按同一流程批量导入。
