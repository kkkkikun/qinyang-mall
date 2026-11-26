# 琴扬精纺羊绒 QINYANG · 管理后台（admin-web）

店主 / 店员工作台。Vue 3 + Vite + TypeScript + TDesign Vue Next + vue-router + pinia + axios。

## 目录结构

```
apps/admin-web/
├── index.html                 入口 HTML
├── package.json               独立依赖与脚本
├── tsconfig.json              严格模式类型配置（@qinyang/contracts 指向共享契约源码）
├── vite.config.ts             构建配置与 /api 开发代理
├── scripts/lint.mjs           无依赖静态自检（禁用收款文案 / any / ts-ignore）
└── src/
    ├── main.ts                应用入口（pinia、router、TDesign 全局注册、401 处理）
    ├── App.vue                根组件
    ├── api/
    │   ├── http.ts            axios 封装：{code,message,data} 统一解包与错误转换
    │   └── admin.ts           后台 REST 接口集合
    ├── components/            量体资料、报价历史、图集管理等可复用组件
    ├── router/index.ts        路由与登录 / 店主权限守卫
    ├── stores/                pinia（登录态）
    ├── styles/theme.css       品牌色板（沿用 prototype 色板）+ 后台样式
    ├── utils/                 金额换算、权限矩阵、状态文案、表格辅助
    └── views/                 9 个页面
```

## TDesign 使用约定

- 组件在 `src/main.ts` 通过 `app.use(TDesign)` 全局注册，模板里使用 `t-xxx` 标签。
  TDesign 注册名为 `TButton` / `TTable` / `TFormItem` / `TTabPanel` / `TDescriptionsItem` / `TMenuItem` 等，
  布局子组件的注册名是 `THeader` / `TAside` / `TContent`（模板写作 `t-header` / `t-aside` / `t-content`）。
- 表格 / 按钮等在 `h()` 渲染函数中使用时，按需 `import { Button, Tag } from 'tdesign-vue-next'`。
- 按钮 `theme` 仅支持 `default | primary | success | warning | danger`；次要按钮使用 `theme="default"`。
- 表格 `page-change` 事件参数为 `PageInfo`（`current` / `previous` / `pageSize`），不是两个数字。
- 表格 `data` 的类型在 TDesign 中为带索引签名的 `TableRowData`，业务 DTO 是 interface，
  统一经 `src/utils/table.ts` 的 `toTableData()` 收口转换。

## 脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 本地开发（默认 http://127.0.0.1:5173，/api 代理到 127.0.0.1:3000） |
| `pnpm build` | 生产构建，产物在 `dist/` |
| `pnpm preview` | 预览构建产物 |
| `pnpm typecheck` | `vue-tsc --noEmit` 严格类型检查 |
| `pnpm lint` | 静态自检脚本（无第三方依赖） |

> 本机按规定不安装完整依赖树，因此本目录的构建与类型检查需在学校服务器执行。

## 权限说明

- `OWNER`（店主）：全部操作，含商品上下架、分类增删改、报价创建 / 撤回、创建订单、取消订单、量体模板维护、审计日志。
- `STAFF`（店员）：商品新增 / 编辑、图集管理、轮播维护、申请审核、订单制作状态与物流填写。
- 审计日志菜单对店员隐藏，路由亦有守卫拦截。

## 业务约定

- 金额一律以整数分存储与传输；界面上的价格、报价金额按「元」输入，提交前换算为分。
- `pricingMode = QUOTE_ONLY` 且未确认价格时，界面显示「待报价」，不展示 0 或虚构价格。
- 报价每次创建生成新版本，旧版本自动 `SUPERSEDED`，历史版本在申请详情中可查。
- V1 未启用线上收款：后台不提供收款按钮与收款状态，仅以静态文案说明。
