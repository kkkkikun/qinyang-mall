# 琴扬精纺羊绒 QINYANG · 微信商城 V1 · 顾客端小程序

微信原生小程序（WXML + WXSS + TypeScript），不使用 Taro / uni-app / WebView / 任何运行时框架。
`apps/miniprogram` 下**没有 node_modules**，不引用任何第三方 npm 包。

## 目录

```
apps/miniprogram/
├── app.ts / app.json / app.wxss      小程序入口、全局页面注册与 tabBar、全局视觉令牌
├── project.config.json               开发者工具工程配置（appid=touristappid，typescript 编译插件）
├── tsconfig.json                     严格模式 TS 配置
├── sitemap.json
├── types/
│   ├── contracts.ts                  packages/contracts/src/index.ts 的副本（自包含、无 import）
│   ├── local.ts                      契约未覆盖的返回结构（登录响应、图文指南、导航度量）
│   └── wx.d.ts                       小程序全局 API 的最小类型声明（零依赖）
├── utils/
│   ├── config.ts                     API 基址（默认 http://127.0.0.1:18110/api/v1，可用 wx.setStorageSync 覆盖）
│   ├── token.ts / auth.ts            顾客 token 存取与 wx.login 静默登录
│   ├── request.ts                    wx.request 封装，统一解析 {code,message,data}
│   ├── api.ts                        REST 契约接口封装
│   ├── product.ts                    商品卡展示层模型
│   ├── guide.ts                      图文指南视图模型与示意图映射
│   ├── format.ts                     金额（整数分）与人名日期格式化
│   └── nav.ts                        自定义导航栏度量（真实胶囊位置）
├── data/measure_templates.ts         量体模板本地兜底数据（由 tools 脚本从 prototype 生成）
├── assets/                           品牌 PNG、量体示意图 PNG、图标 PNG（均为本地资源）
├── tools/                            资源与数据生成脚本（可重复执行）
└── pages/                            17 个页面，每个页面 4 个文件
```

## 页面

| 页面 | 目录 | 说明 |
| --- | --- | --- |
| 品牌首页 | `pages/index` | 羊绒衣橱自动轮播（swiper autoplay/circular，4s）、分类入口、新品推荐、定制引导、品牌故事 |
| 商品分类 | `pages/category` | 左侧一级分类栏（选中白底加粗 + 金色左条）、顶部二级分组页签（选中红色）、⌄ 分组浮层 |
| 定制（Tab） | `pages/custom` | 量体指南入口、定制流程、记录入口 |
| 个人中心 | `pages/profile` | 顾客信息、定制记录统计与最近记录、服务器地址切换 |
| 商品搜索 | `pages/search` | 搜索框、热门搜索、无结果退路 |
| 商品详情 | `pages/product` | 多图轮播、价格/报价状态、参数、品牌故事、底部操作栏 |
| 上装量体指南 | `pages/guide-top` | 图文指南（GET /guides/measure-top，无内容时回落到本地量体模板） |
| 长裤量体指南 | `pages/guide-bottom` | 同上（measure-bottom） |
| 羊绒洗护指南 | `pages/guide-care` | 同上（care） |
| 材质定制说明 | `pages/guide-material` | 同上（material） |
| 定制申请表 | `pages/apply` | 按量体模板动态渲染字段、单位 cm、必填与范围校验、进度条、防重复提交 |
| 我的定制申请 | `pages/requests` | 状态筛选页签 + 申请列表 |
| 申请详情 | `pages/request-detail` | 量体资料、当前报价、取消申请 |
| 报价确认 | `pages/quote` | 金额/运费/合计/制作周期/有效期/说明/版本 + 确认按钮 |
| 我的订单 | `pages/orders` | 状态筛选 + 订单列表 |
| 订单详情 | `pages/order-detail` | 状态时间线、商品与量体快照、金额、物流 |
| 客服 | `pages/contact` | `button open-type="contact"`，不自建聊天 |

## 接口路由对应

| 页面 | REST 路由 |
| --- | --- |
| index / category / search / product | `GET /banners`、`GET /categories`、`GET /products`、`GET /products/:id` |
| guide-* | `GET /guides/:slug`（measure-top / measure-bottom / care / material） |
| apply | `GET /measurement-templates/resolve?productId=`、`GET /products/:id`、`POST /customization-requests` |
| requests / request-detail | `GET /customization-requests`、`GET /customization-requests/:id`、`POST /customization-requests/:id/cancel` |
| quote | `GET /customization-requests/:id`、`POST /customization-requests/:id/confirm-quote` |
| orders / order-detail | `GET /orders`、`GET /orders/:id` |
| profile | `GET /auth/me`、`GET /customization-requests`、`GET /orders` |
| 全局 | `POST /auth/login`（wx.login code 换 token） |

## 本地预览

1. 微信开发者工具导入 `apps/miniprogram` 目录（appid 使用占位 `touristappid`）。
2. API 默认地址 `http://127.0.0.1:18110/api/v1`；需要切换时，在「我的 → 服务器地址」里填写，
   或在控制台执行 `wx.setStorageSync('qy_api_base_url', 'http://<host>:<port>/api/v1')`。
3. 资源脚本（可重复执行）：
   - `python3 apps/miniprogram/tools/build_assets.py` —— 品牌 PNG、量体示意图 SVG→PNG、图标 PNG
   - `python3 apps/miniprogram/tools/build_measure_templates.py` —— 量体模板本地兜底数据

## 约定

- 价格未确认（`priceCents === null`）时一律显示金色「待报价」，不展示任何推测金额。
- 图片加载失败显示占位块，不出现破图；列表页均有加载中 / 空态 / 错误态。
- 顶部导航使用自定义模式并按 `wx.getMenuButtonBoundingClientRect()` 预留真实胶囊位置，不模拟胶囊。
- 图标为本地 PNG（由原型内联 SVG 转写），不使用 emoji、图标字体与外链图片。
