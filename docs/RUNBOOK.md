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
```

管理后台静态包（构建产物在 `apps/admin-web/dist`）：

```bash
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp/apps/admin-web/dist && python3 -m http.server 18111 --bind 127.0.0.1'
```

### 4.2 Docker Compose（隔离测试栈）

```bash
cd infra/docker
docker compose -f docker-compose.test.yml up -d mysql
# 构建并启动全部服务
docker compose -f docker-compose.test.yml up -d --build

# 查看状态与日志
docker compose -f docker-compose.test.yml ps
docker compose -f docker-compose.test.yml logs -f api

# 停止并清理（本项目命名空间，不影响其他项目）
docker compose -f docker-compose.test.yml down
```

所有端口只绑定 `127.0.0.1`：MySQL `13316`、API `18110`、后台 `18111`。

### 4.3 本地访问（SSH 隧道）

```bash
ssh -N -L 18110:127.0.0.1:18110 -L 18111:127.0.0.1:18111 sqserver
# 管理后台：http://127.0.0.1:18111
# API 文档：http://127.0.0.1:18110/docs
```

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
API 的 `STORAGE_LOCAL_ROOT` 指向 `media/`，`STORAGE_PUBLIC_BASE_URL` 指向 `/static` 前缀。

---

## 6. 验收

```bash
# 静态自检（本地，无需依赖）
python3 tools/check_miniprogram.py

# 单元 + 集成测试（服务器）
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp && set -a && . infra/docker/.env && set +a \
  && export DB_HOST=127.0.0.1 DB_PORT=13316 && pnpm --filter @qinyang/api test'

# 对运行中的真实 API 做垂直切片验收（真实商品 + 真实图片）
ssh sqserver 'cd ~/MyProject/clothing-mall-miniapp && node infra/scripts/acceptance.mjs'
```

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
