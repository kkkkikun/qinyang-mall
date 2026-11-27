# 运行与部署手册 · 琴扬精纺羊绒 QINYANG 微信商城 V1

> 适用范围：学校服务器（构建与联调）。**学校服务器不是正式生产环境**，
> 正式环境需另行申请商家授权的公网主机、HTTPS 域名与对象存储。

---

## 1. 环境准备（首次）

### 1.1 本地

本地只做源码开发、Git 管理、原型核对与微信开发者工具预览。

```bash
# 拉取源码
git clone https://github.com/kkkkikun/qinyang-mall.git
cd qinyang-mall

# 同步到学校服务器（唯一允许的同步入口）
bash infra/scripts/sync-to-server.sh git
```

**本地禁止**：`pnpm install`（完整依赖树）、Docker、MySQL、批量图片处理。

### 1.2 学校服务器

```bash
ssh sqserver    # 172.16.38.110:56127，已配置密钥认证

# 1) 隔离的 Node 24 LTS 工具链（不动系统 Node）
mkdir -p ~/tools && cd /tmp
curl -sL -o node.tar.xz "https://npmmirror.com/mirrors/node/v24.22.3/node-v24.22.3-linux-x64.tar.xz"
mkdir -p ~/tools/node-v24.22.3
tar -xJf node.tar.xz -C ~/tools/node-v24.22.3 --strip-components=1 && rm node.tar.xz
export PATH=~/tools/node-v24.22.3/bin:$PATH
npm i -g pnpm@11.7.0 --registry=https://registry.npmmirror.com

# 2) 图片流水线用的独立虚拟环境
python3 -m venv ~/tools/media-venv
~/tools/media-venv/bin/pip install pillow

# 3) 环境变量（密钥不入 Git）
mkdir -p infra/docker
# 按 infra/docker/.env.example 生成 infra/docker/.env，并 chmod 600
```

### 1.3 必需环境变量

`infra/docker/.env`（服务器本地，权限 600，**不得提交 Git**）：

| 变量 | 说明 |
| --- | --- |
| `MYSQL_ROOT_PASSWORD` | MySQL root 口令 |
| `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | 应用库与账号 |
| `JWT_ADMIN_SECRET` / `JWT_CUSTOMER_SECRET` | 两类令牌密钥，**必须不同** |
| `STORAGE_DRIVER` | `local`（受控文件存储）或 `oss`（对象存储，未实现） |
| `STORAGE_PUBLIC_BASE_URL` | 图片对外可访问前缀 |
| `STORAGE_MEDIA_ROOT` | 只读媒体根（商品目录生成图）。容器内为 `/app/media`，独立进程模式为 `$ROOT/media`；留空则不额外挂载 |
| `WECHAT_MOCK_AUTH` | `true` 时启用开发期 mock 顾客登录；正式环境必须 `false` |
| `PAYMENT_ENABLED` | V1 固定 `false` |
| `CORS_ORIGINS` | 允许的后台来源，逗号分隔 |

> `WECHAT_MOCK_AUTH=true` 只能在开发/测试环境开启；
> 正式环境必须配 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` 并置为 `false`。

---

## 2. 日常开发回路

```bash
# 本地：改代码
# 同步到服务器
bash infra/scripts/sync-to-server.sh git

# 服务器：类型检查 + 测试 + 构建
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp && bash infra/scripts/build.sh'
```

`build.sh` 依次执行：依赖安装（lockfile 严格）→ 共享契约构建 → 全仓类型检查 →
单元测试 → API 构建 → 后台构建。

带资源监控的构建（记录 CPU/内存峰值与磁盘增量）：

```bash
bash infra/scripts/build-monitored.sh
```

---

## 3. 数据库

```bash
# 迁移（开发库）
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp && set -a && . infra/docker/.env && set +a \
  && export DB_HOST=127.0.0.1 DB_PORT=13316 && pnpm --filter @qinyang/api db:migrate'

# ⚠️ 迁移后必须重建 API 容器（容器内 migrationsRun=false，不会自动迁移）
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp && export PATH=~/tools/node-v24.22.3/bin:$PATH \
  && set -a && . infra/docker/.env && set +a \
  && docker build -f infra/docker/Dockerfile.api -t qinyang/api:local . \
  && docker compose -f infra/docker/docker-compose.test.yml up -d --force-recreate api'

# 数据库层的并发约束（D-028）——「唯一性」由数据库保证，不要在应用层另写一份检查
#   orders.requestId              唯一索引      一个申请只能有一张订单
#   quotes(requestId, version)    唯一索引      同一申请同一版本只能有一条报价
#   quotes.activeRequestId        唯一索引      同一申请同时只能有一条 ACTIVE 报价
#                                 （生成列：ACTIVE 时等于 requestId，否则 NULL）
# 应用层遇到重复键会被翻译成 409；状态流转用条件更新（乐观锁）避免并发覆盖。

# 回滚一步
pnpm --filter @qinyang/api db:revert

# 查看迁移状态
pnpm --filter @qinyang/api db:show

# 种子（幂等）
pnpm --filter @qinyang/api db:seed

# 集成测试库（与开发库物理隔离）
bash infra/scripts/setup-test-db.sh
```

> 红线：**正式配置禁止 `synchronize`**，schema 只能由 migration 演进。
> 集成测试强制使用 `qinyang_mall_test`，`global-setup.ts` 会在发现指向开发库时直接报错。

### 备份与恢复

```bash
# 备份
docker exec qinyang-mysql mysqldump -uqinyang -p"$DB_PASSWORD" \
  --single-transaction --routines qinyang_mall > backup-$(date +%F).sql

# 恢复到新库演练
docker exec qinyang-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" \
  -e "CREATE DATABASE IF NOT EXISTS qinyang_mall_restore DEFAULT CHARSET utf8mb4;"
docker exec -i qinyang-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" qinyang_mall_restore < backup-$(date +%F).sql
```

---

## 4. 启动服务

### 4.1 开发/联调（独立进程）

```bash
bash infra/scripts/run-api.sh          # API → http://127.0.0.1:18110/api/v1
tail -f infra/logs/api.log             # 日志，超过 20MB 自动轮转，保留 5 份
bash infra/scripts/stop-api.sh         # 停止（只停本进程，不动 MySQL 容器）
```

存储布局与容器模式一致：可写上传落在 `storage/`，商品目录图只读挂在 `media/`，
两者共用 `/static` 前缀。

管理后台静态包（构建产物在 `apps/admin-web/dist`）：

```bash
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp/apps/admin-web/dist && python3 -m http.server 18111 --bind 127.0.0.1'
```

### 4.2 Docker Compose（隔离测试栈）

```bash
cd infra/docker
docker compose -f docker-compose.test.yml up -d mysql
# 构建并启动全部服务（镜像构建会占用几分钟，容器内并发已限为 2）
docker compose -f docker-compose.test.yml up -d --build

# 查看状态与日志
docker compose -f docker-compose.test.yml ps
docker compose -f docker-compose.test.yml logs -f api

# 停止并清理（本项目命名空间，不影响其他项目）
docker compose -f docker-compose.test.yml down
```

所有端口只绑定 `127.0.0.1`：MySQL `13316`、API `18110`、后台 `18111`。
容器资源限额合计 **2.5 核 / 3.75 GB**（MySQL 1C/2G + API 1C/1.5G + 后台 0.5C/256M）。

> **网络重建务必连容器一起销毁**：`down` 会删除 `qinyang_default` 网络，
> 旧容器若被复用会持有失效的 network id，出现「容器 Up 但解析不到服务名
> `getaddrinfo EAI_AGAIN`、端口不发布」的故障。重建时用
> `docker compose -f docker-compose.test.yml down --remove-orphans` 后再 `up -d`。

启动顺序由健康检查保证：API 通过容器级健康检查（`/api/v1/health`）后，
后台 nginx 才会启动 —— nginx 在启动时解析上游域名，上游不可用会直接退出。

商品图片走**只读绑定挂载**：`media/` → API 的 `/app/media`、后台的 `/var/www/media`，
不复制、不重建衍生副本。API 的可写存储在 `qinyang_storage` 卷，媒体根由
`STORAGE_MEDIA_ROOT=/app/media` 指定，两者共用 `/static` 前缀。

```bash
# 确认三个容器都在同一网络、端口已发布
docker network inspect qinyang_default --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{println}}{{end}}'
docker inspect qinyang-api --format '{{json .NetworkSettings.Ports}}'
```

### 4.3 本地访问（SSH 隧道）

服务器上的服务**只绑定 127.0.0.1**，不暴露校园网；本地通过 SSH 隧道访问。

```bash
# 保持这个终端不关，另开一个浏览器窗口
ssh -N -L 18110:127.0.0.1:18110 -L 18111:127.0.0.1:18111 sqserver
```

| 入口 | 地址 | 说明 |
| --- | --- | --- |
| 管理后台 | <http://127.0.0.1:18111> | nginx 托管后台静态包，并反代 `/api` 到 API 容器 |
| 后台静态资源 | <http://127.0.0.1:18111/assets/> | 随页面一起加载 |
| 商品图片 | <http://127.0.0.1:18110/static/...> | 图片地址由 API 以绝对地址给出（`STORAGE_PUBLIC_BASE_URL`），因此 **18110 也要开隧道** |
| API 文档 | <http://127.0.0.1:18110/docs> | Swagger UI |
| 接口健康检查 | <http://127.0.0.1:18110/api/v1/health> | 容器健康探针同款 |

管理后台登录账号（仅开发环境）：

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 店主（全部权限） | `owner` | `SEED_ADMIN_PASSWORD`，默认 `Qinyang@2026` |
| 店员（受限权限） | `staff` | 同上 |

> 密码来自服务器 `infra/docker/.env`（权限 600，**不入库**），仓库内只存 `infra/docker/.env.example`。
>
> **小程序本身无法在浏览器预览**：必须用微信开发者工具导入 `apps/miniprogram`（见 §7）。
> 本节只覆盖管理后台。

---

## 5. 图片流水线

原始素材 `images/` 只读；`catalog/products/*/processed/` 为已整理的衍生副本。

```bash
# 1) 同步首批商品的图片到服务器（只传白名单，不传 690 张原始素材）
bash infra/scripts/sync-media.sh

# 2) 在服务器上生成移动端变体（4x5 / 1x1 / 600px 缩略图）
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp && ~/tools/media-venv/bin/python \
  tools/build_media.py --products ED-0001,ED-0003,ED-0006,ED-0007,ED-0008,ED-0009,ED-0018,ED-0021,ED-0024,ED-0032,ED-0043,ED-0060,ED-0062 \
  --output-root media'

# 3) 扩展到全部 76 件时，调整 --products 白名单并同步对应 processed/ 目录
```

产物：`media/products/<PID>/<IMGID>-{4x5,1x1,thumb}.jpg` + `media/manifest.json`。
API 的**只读媒体根** `STORAGE_MEDIA_ROOT` 指向 `media/`（商品目录图），
**可写存储根** `STORAGE_LOCAL_ROOT` 指向 `storage/`（后台新上传），
两者共用 `/static` 对外前缀，`STORAGE_PUBLIC_BASE_URL` 指向该前缀。

---

## 6. 验收

```bash
# 静态自检（本地，无需依赖）
python3 tools/check_miniprogram.py
python3 tools/check_api_contract.py      # 前后端调用 ↔ API 路由表交叉核对
python3 tools/sync_contracts_to_miniprogram.py --check

# 小程序类型检查（服务器，需已安装依赖）
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp && pnpm typecheck:miniprogram'

# 小程序真实流程验证：在 Node 中执行小程序自身代码，打真实 API
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp && node tools/verify_miniprogram_flow.mjs'

# 小程序页面级执行验证：17 个页面逐一加载 + 闭环走页面代码
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp && node tools/verify_miniprogram_pages.mjs'

# 管理后台页面级执行验证（读路径：9 视图 + 布局）
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp && node tools/verify_admin_pages.mjs'

# 管理后台页面级执行验证（写路径：审核 → 报价 → 建单 → 推进 → 发货）
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp && node tools/verify_admin_write.mjs'

# 单元 + 集成测试（服务器）
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp && set -a && . infra/docker/.env && set +a \
  && export DB_HOST=127.0.0.1 DB_PORT=13316 && pnpm --filter @qinyang/api test'

# 对运行中的真实 API 做垂直切片验收（真实商品 + 真实图片）
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp && node infra/scripts/acceptance.mjs'
```

### 服务器被别的作业占满时

服务器 128 核是**共享**的,同一台机器上还跑着别的项目与竞赛作业。
全量流水线默认把构建绑到核 `0-3`（`taskset -c 0-3`）,
若这些核正被别人占满,流水线仍能跑完,但**耗时会明显变长、CPU 峰值数据也会失真**。

```bash
# 先看哪些核是空的（空闲率 > 60% 的核可用来跑构建）
ssh sqserver 'python3 - << "PY"
import time
def snap():
    d = {}
    for line in open("/proc/stat"):
        if line.startswith("cpu") and line[3:4].isdigit():
            p = line.split(); v = [int(x) for x in p[1:]]
            d[p[0]] = (sum(v), v[3] + v[4])
    return d
a = snap(); time.sleep(2); b = snap()
rows = []
for k, (t2, i2) in b.items():
    t1, i1 = a.get(k, (0, 0)); dt = t2 - t1
    rows.append((int(k[3:]), 100.0 * (i2 - i1) / dt if dt else 0))
print([c for c, v in rows if v > 60])
PY'

# 换到空闲核上跑（build.sh 支持 CPU_LIST 覆盖，仍受「≤4 核」约束）
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp && CPU_LIST=112,81,14 bash infra/scripts/build.sh'
```

> 本项目的常驻服务（compose 隔离栈）只占约 1.2% CPU,不构成负载来源;
> 流水线阶段结束后不会留下后台进程。

---

## 7. 微信小程序预览（Windows 侧）

本地与服务器均无微信开发者工具，**预览必须在 Windows 的微信开发者工具中完成**。

1. 打开微信开发者工具 → 导入项目 → 目录选择
   `W:\home\kikun\MyProject\clothing-mall-miniapp\apps\miniprogram`
2. AppID 使用占位 `touristappid`（工具自带测试号）或改用商家正式 AppID。
3. 工具需勾选「使用 TypeScript 编译」（`project.config.json` 已配置 `useCompilerPlugins`）。
4. 后端地址：在小程序「我的 → 服务器地址」切换，或改
   `apps/miniprogram/utils/config.ts` 的默认基址。
   本机调试填 `http://127.0.0.1:18110/api/v1`（需在工具中勾选「不校验合法域名」）。
5. 机型分别选 **iPhone X（375×812）**、**iPhone 12（390×844）**、**iPhone 14 Pro Max（430×932）**，
   逐屏对照 `prototype/screenshots/` 与 `ref/` 原截图。
6. 重点核对：首页羊绒衣橱自动轮播与手势滑动、分类页两级分组、商品详情多图轮播、
   量体表单动态渲染与校验、报价确认、订单进度时间线。

---

## 7bis. 商家日常操作：批量录入商品（CSV 导入）

后台「商品列表 → 批量导入」。首期 76 件商品不必逐件在表单里录。

1. 点「下载导入模板」，得到一份标准表头的 CSV：

   ```
   商品编号,商品名称,分类编号,报价模式,价格(元),材质,副标题,商品简介,洗护说明,量体模板编号,排序
   ```

2. 用 Excel 填写。填写要点：
   - **商品编号**：唯一，已存在的编号会被**跳过**（不会覆盖既有商品）；
   - **分类编号 / 量体模板编号**：填 `code`（如 `knitwear-cardigan`）或 `id` 都可以；
   - **报价模式**：`仅按量体报价` 或 `固定价可直售`；固定价必须填「价格(元)」，
     仅按量体报价时**不要**填价格（填了会被判为该行失败）；
   - 留空的列按「无该项」处理，系统**不会**替你编造名称、价格或材质。
3. 点「选择 CSV 文件」。中文 Windows 的 Excel 另存为 CSV 默认是 GBK 编码，
   面板会自动识别 UTF-8 / GBK，不需要手工另存。
4. 点「**预检**」：只校验不落库，逐行给出结论（哪些行有问题、错在哪）。
5. 确认无误后点「**正式导入**」：好行入库，坏行标红并保留原因。
6. 导入的商品状态一律是「**草稿**」—— 需要店主在列表里逐件（或批量）提交审核并上架。

接口口径见 `docs/api/REST-CONTRACT.md` §3.5，决策见 `docs/agent/DECISIONS.md` D-029。

### 7bis. 小程序发布前必须注入正式服务地址

小程序的 API 基址是**构建期常量**，仓库里是占位值。
发布前必须执行（否则小程序会明确提示「服务地址未配置，请联系客服」，
不会再静默打 127.0.0.1）：

```bash
# 必须在 https 域名下，且必须以 /api/v1 结尾 —— 脚本会强制校验
node tools/set_miniprogram_env.mjs https://<正式域名>/api/v1

# 同步到仓库后再构建小程序
git add apps/miniprogram/config/env.ts && git commit -m "chore: 注入小程序正式服务地址"

# 还原为占位值（开发态）
node tools/set_miniprogram_env.mjs
```

> 「我的 → 服务器地址」面板**只在开发版**出现（`envVersion === 'develop'`）。
> 顾客版看不到它，也无法把小程序指向别的主机 ——
> 顾客能改服务地址等于把登录态与量体资料交给顾客指定的端点。

### 7ter. 已发布商品改价

- **已发布商品的价格 / 报价模式只有店主能改**，店员改会被拒绝（409）。
  理由：顾客是按当前价格下单的，价格在一次「保存」里悄悄变化是钱的问题。
- 文案与资料（名称 / 材质 / 简介 / 洗护 / 分类 / 量体模板）**店员仍可编辑**，
  改动会进审计。
- 商品的**编号**不能改（编号是商家的唯一标识，改了会让历史订单的快照对不上）。

---

## 8. 运维注意事项

| 事项 | 约束 |
| --- | --- |
| 容器资源 | MySQL 2C/2G、API 2C/2G、后台 1C/512M；日志 10MB×3 轮转 |
| 构建并发 | 同时只跑 1 个重型任务；测试最多 2 个 Worker |
| Docker | **禁止**全局清理（`docker system prune` / `docker volume prune`） |
| 其他项目 | 禁止改动 `nmg-pku-alumni`、`schoolwall` 等既有项目的端口、数据库、卷 |
| 磁盘 | 服务器剩余不足 20% 时暂停重型任务 |
| 密钥 | 只用环境变量；不写入日志、代码或 Git |
| 支付 | V1 恒为禁用；接入真实支付需商家明确批准并单独排期 |
| 上传发布 | 体验版由 Windows 开发者工具手动上传；**不自动发布、不自动提审** |
