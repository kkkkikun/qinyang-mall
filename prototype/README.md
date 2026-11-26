# 琴扬精纺羊绒 · 定制服装商城 HTML 原型 V1

> 品牌 **QINYANG / 琴扬精纺羊绒**。以「自主量体 + 专属定制」为核心的品牌商城原型。
> 非标准尺码服装商城：用户不选颜色、不选 S/M/L，而是提交量体数据，商家按数据制作。

本原型**完全复刻客户原小程序（微信小店）的视觉语言**，12 个页面全部真实可交互，商品图片全部来自 `catalog/` 已整理的真实素材（76 件 / 690 张）。

---

## 一、快速开始

```bash
# 1) 在项目根目录起一个本地静态服务（服务根必须是项目根，因为商品图在 catalog/ 下）
cd /home/kikun/MyProject/clothing-mall-miniapp
python3 -m http.server 8765 --bind 127.0.0.1

# 2) 浏览器打开（建议开发者工具切到手机视口 390×844）
http://127.0.0.1:8765/prototype/index.html
```

演示商品入口：`http://127.0.0.1:8765/prototype/product.html?id=ED-0032`
（ED-0032 = 藏青针织水手领开衫，12 张真实图片，含正面 / 背面 / 8 张细节 / 2 张面料）

> 直接双击 `prototype/index.html` 用 `file://` 打开也能渲染页面，但 **localStorage 在部分浏览器下被限制**，演示下单流程请务必用 http 服务。

---

## 二、视觉复刻说明

### 2.1 设计基准

全部视觉来自客户提供的原小程序截图 `ref/`（53 张），本原型逐屏对照还原：

| 原小程序 | 原型对应页 |
|---------|-----------|
| 首页（QINYANG 头图 / 羊绒衣橱 / 材质定制 / 量体定制 / 琴扬甄选） | `index.html` |
| 商品分类（左分类栏 + 右商品网格） | `category.html` |
| 搜索页（搜索框 + 店铺分类 + 悬浮购物车） | `search.html` |
| 商品详情（品牌带 / 轮播 / 价格 / 参数 / 品牌故事 / 底部操作栏） | `product.html` |
| 上装量体指南 / 长裤量体指南（净体测量 · 成衣平量） | `sizing-guide.html` |
| 购物车（全部 / 降价 / 管理 + 店铺行 + 结算条） | `cart.html` |
| 立即购买半屏弹层（地址 / 商品 / 数量 / 留言 / 支付方式 / 支付按钮） | `order-confirm.html` |
| 个人中心（头像 / 金币余额 / 我的订单 / 功能宫格 / 切换账号） | `profile.html` |
| 我的订单（搜索 + 状态页签 + 订单卡） | `orders.html` |
| 登录页（琴扬书法 logo + 精纺羊绒标题） | 品牌视觉并入首页/个人中心 |

### 2.2 取色（自 `ref/` 像素采样）

| 用途 | 色值 |
|------|------|
| 主色 · 金（搜索按钮、分类激活条、底部标签激活、下划线） | `#D29B5E` |
| 主要按钮 · 麦金（立即购买 / 结算 / 提交订单） | `#CD9150` |
| 次要按钮 · 炭黑（加入购物车） | `#272727` |
| 强调红（全部页签、价格红、角标） | `#F53939` |
| 页面底 / 卡片 / 输入框 | `#F2F2F2` / `#FFFFFF` / `#F7F7F7` |
| 量体指南标题带 | `#F3F4F1` |
| 正文 / 次要 / 三级文字 | `#1A1A1A` / `#666666` / `#999999` |

### 2.3 品牌标识

从客户截图中无损提取为透明 PNG 资产（`prototype/assets/img/brand/`）：

- `qinyang-word.png` — QINYANG 字标（特宽字距黑体，A 为三角 Λ 造型）
- `qinyang-cn.png` — 琴扬 书法 logo（取自登录页）

### 2.4 字体

- 标题：思源宋体 / 宋体（`Songti SC, STSong, Noto Serif SC, Source Han Serif SC, SimSun, serif`）——对应原小程序的宋体大标题
- 正文：苹方 / 微软雅黑（`-apple-system, PingFang SC, Microsoft YaHei`）

### 2.5 量体示意图

15 张自绘 SVG 线稿（`prototype/assets/img/measure/`），风格对齐原小程序的量体页：

- **身体测量类**（胸围 / 腰围 / 臀围 / 肩宽（身体））：柔和米色人体 + 白色细线羊绒衫 + 带刻度的量带
- **成衣平量类**（肩宽 / 胸宽 / 衣长 / 袖长 / 腰围（平铺）/ 臀围（平铺））：平铺白色羊绒衫 / 长裤 + 棕色双箭头测量线
- 描边 `#9A948C` 1.3px，测量线 `#7A5B3E` 1.6px，织物填充 `#FFFFFF`，人体填充 `#EDE2D7`，罗纹辅助线 `#B8B1A8`

全部由 `tools/build_measure_illustrations.py` 生成（几何镜像 / 路径闭合均为自实现，不依赖任何绘图库）。

另有 2 张首页「量体定制」模块用的服装线描（`prototype/assets/img/guide/top.svg`、`bottom.svg`），
由 `tools/build_guide_icons.py` 生成：细灰线衬衫 / 阔腿裤 + 右侧竖向虚线量尺，对齐 `ref/首页4.png` 的插图形态。

### 2.6 图标

**全部为内联 SVG**，不使用 emoji、不使用图标字体、不引入任何外部依赖。共 35 个图标（搜索 / 购物车 / 分类 / 我的 / 返回 / 箭头 / 细长箭头 / 加减 / 关闭 / 心 / 分享 / 方框外箭头 / 尺 / 剪刀 / 客服 等），集中在 `app.js` 的 `ic` 对象中。

### 2.7 首页与 ref 的逐项修订（第一批：7 项差异）

首页是本批次的复刻重点，逐屏对照 `ref/首页1~7.png` 后修订了 7 项差异，
并为每一项补了浏览器回归断言（见 `prototype/test-report.md` 第 8–17 条）：

| # | 差异 | 修订 | ref 量测依据 |
|---|------|------|--------------|
| ① | 缺右下角悬浮圆形分享按钮 | 新增 `.fab-share`（白圆 + 方框带外箭头，40px，右 16px，距底 118px） | `首页1.png` 圆按钮 447–498 / 769–820 |
| ② | hero 文案紧贴右边缘 | `.hero .ov` 改 `right:30%`，仍右对齐 | 三行文字右缘分别为 358 / 361 / 363（等距 → 右对齐） |
| ③ | 量体定制 / 衣物养护 / 琴扬甄选 / 更多商品 带英文眉标 | 删除 `MEASURE & MAKE` / `CARE` / `SELECTED` / `MORE`，仅保留「羊绒衣橱」的 `THE WARDROBE` | `首页4/5/6.png` 这四处标题无英文 |
| ④ | 材质定制卡有圆角、箭头过粗 | `.dark-card` 去圆角、左右外边距 22px；箭头换 34px 细长线条箭头 `ic.arrowLong` | `首页4.png` 深色卡 30–490 边距、箭头 420–455 |
| ⑤ | 量体插画带卡片边框且偏小 | `.guide-item` 去边框去圆角，插画换新线描图标并放大到 150px，改为定宽两栏（126px） | `首页4.png` 插图 45–157 / 231–312，标签中心 100 / 265 |
| ⑥ | 缺下单前提示行 | 「量体定制」模块末尾加分隔线 + 「订购前，与店铺客服核对尺寸及定制细节。」 | `首页5.png` |
| ⑦ | 顶部分类行有加粗选中态 | 移除 `knitwear` 的 `on` 类及 `.cat-nav a.on` 规则 | `首页1.png` 四个分类字重一致 |

**实施中另外发现的首页差异（第一批未改）**：

- 「自然平铺，不拉伸。…」「向左滑动，浏览衣橱」两条说明在 ref 中为**左对齐**（x≈30），原型为居中
- hero 图片高度：ref 约 499 CSS px，原型 430px
- 「琴扬甄选」横滑商品卡在 ref 中只显示 QINYANG 水印 + 图片 + 价格，无商品名
- ref 底部页脚为「琴扬精纺羊绒 / 微信小店提供技术支持」，原型为「定制服装商城原型演示」

### 2.8 第二批修订：首页剩余 4 项 + 分类页重构

首页剩余 4 项已按 ref 落地：

| # | 差异 | 修订 | ref 量测依据 |
|---|------|------|--------------|
| ⑧ | 两条说明行居中 | 改左对齐（`.mod-note--left`）；「向左滑动，浏览全部款式」加前导短线（`.mod-note--dash`，38px） | `首页2/4/6.png` 说明行左边缘 x≈30 / 32 |
| ⑨ | hero 图片偏矮 | `.hero img` 改 `aspect-ratio:4/5`（390 宽 → 488 高），并改用 `cover_display_4x5` 竖图补边 | `首页1.png` hero 图 240–905 → 高 499 CSS |
| ⑩ | 「琴扬甄选」卡显示商品名 | `productCard` 增加 `noName` 选项：隐藏商品名与「包邮」，只留图 + 价格 | `首页6.png` 横滑卡只有图与 ¥ 价格 |
| ⑪ | 页脚文案不对 | 中段品牌带改「QINYANG + 琴 扬」；页脚新增 `.wx-footer`「琴扬精纺羊绒 / — 微信小店提供技术支持 —」 | `首页6.png` 品牌带、`首页7.png` 页脚 |

分类页按 ref 重构为「一级分类栏 + 顶部二级分组页签」两层结构：

| # | 差异 | 修订 | ref 量测依据 |
|---|------|------|--------------|
| ⑫ | 无分组层 | 左侧 87px 灰底栏放当前一级分类 + 其二级分组 + 其他一级分类；选中项白底加粗 + 金色左条（`--gold #D29B5E`） | `分类页1/2.png` 左栏 0–116、金色竖条 x=0–3 |
| ⑬ | 顶部无分组页签 | 顶部右侧加二级分组页签「全部 / 分组…」，选中态无下划线 | `分类页1.png` 全部/外形/裤装 |
| ⑭ | 「全部」不是红色 | 选中页签改 `--red #F53939`，去掉金色下划线 | `分类页1.png` 「全部」取色 #F53939 |
| ⑮ | 缺 ⌄ 展开按钮 | 最右加 ⌄ 按钮，点击展开「全部分组」浮层（含件数），点击外部收起 | `分类页1.png` 右侧 x≈485–505 的 ⌄ |
| ⑯ | 商品卡有圆角/比例不符 | 分类页卡片 `border-radius:0`、无边框，图片比例 0.86，标题 2 行截断加省略号 | `分类页1.png` 图片 160×185 |
| ⑰ | 无二级分组数据 | 数据层新增 `product.group` / `product.group_label` 与 `categories[].groups`，由 `GROUP_RULES` 按命名中的品类词归类 | — |

**仍不与 ref 对齐（业务硬约束，非缺陷）**：

- 价格显示「待确认」（金色）而非 ref 的 ¥ 数字；商品正式名称仍为临时命名
- 二级分组（开衫 / polo / 衬衫 / 背心 / 针织衫 / 裤装 / 裙装…）是按命名关键词推断的展示层分组，客户确认正式分类后整表替换即可，页面代码无需改动

---

## 三、目录结构

```
prototype/
├── index.html                 首页            data-page="home"
├── category.html              商品分类        data-page="category"
├── search.html                商品搜索        data-page="search"
├── product.html               商品详情        data-page="product"        ?id=ED-0032
├── sizing-guide.html          量体指南        data-page="guide"          ?template=TPL-KNIT-TOPS
├── measurement.html           量体数据填写    data-page="measure"        ?product=ED-0032
├── measurement-confirm.html   量体数据确认    data-page="measureConfirm" ?product=ED-0032
├── cart.html                  购物车          data-page="cart"
├── order-confirm.html         订单确认        data-page="orderConfirm"
├── profile.html               个人中心        data-page="profile"
├── orders.html                我的订单        data-page="orders"
├── order-detail.html          订单详情        data-page="orderDetail"    ?id=ED2026...
├── data/
│   ├── products.json              76 件商品配置（脚本从 catalog/ 生成）
│   └── measurement_templates.json 5 套量体模板（人工编写）
├── assets/
│   ├── css/app.css                品牌样式（复刻原小程序）
│   ├── js/data.js                 数据包（window.ED_DATA，自动生成，勿手改）
│   ├── js/app.js                  共享逻辑 + 12 个页面渲染函数 + 图标库
│   ├── img/brand/*.png            QINYANG 字标 / 琴扬书法 logo
│   ├── img/guide/*.svg            2 张首页量体模块服装线描（上装 / 长裤）
│   └── img/measure/*.svg          15 张自绘测量线稿示意图
├── screenshots/                21 张浏览器实测截图
└── test-report.md               浏览器测试记录
```

页面壳由 `tools/build_prototype_pages.py` 生成；页面内容全部由 `app.js` 中 `PAGES[data-page]` 渲染，**新增页面只需加一个 `body[data-page]` 键 + 一个 HTML 壳**。

---

## 四、核心业务流程

```
商品详情 → 量体指南 → 填写尺寸（必填校验 / 单位 / 进度） → 确认尺寸
        → 加入购物车 → 订单确认（地址 / 留言 / 金额 / 支付方式） → 提交订单 → 订单详情
```

关键约束与实现：

| 业务规则 | 实现方式 |
|---------|---------|
| 不出现颜色 / S·M·L 尺码选择器 | 详情页无任何 SKU / 尺码控件（测试用例断言命中数为 0） |
| 一个商品必须绑定一份量体数据 | 购物车条目必含 `measurement_id`，缺失时禁止结算与下单 |
| 同一商品不同量体数据不得合并 | 条目唯一键 = `product_id` + `measurement_id`，实测两件同品不同尺寸 → 购物车 2 个独立条目 |
| 价格 / 材质 / 工艺 / 洗护 / 名称未知 | 一律显示「待确认」，原型不做任何推测性描述 |
| 不接入真实支付 | 支付方式仅「待客户确认」「原型演示（不实际扣款）」两项 |
| 不开发后端 | 全部数据存浏览器 localStorage，界面注明「演示数据，非正式用户数据」 |

---

## 五、商品数据结构

数据源：`prototype/data/products.json`（由 `tools/build_prototype_data.py` 从
`catalog/reports/image_manifest.json` + `catalog/reports/product_catalog.csv` 生成）。

### 5.1 商品对象

```json
{
  "product_id": "ED-0032",
  "product_name": "藏青针织水手领开衫(白条饰)（临时命名·待确认）",
  "category": "knitwear",
  "category_label": "针织服饰",
  "group": "cardigan",
  "group_label": "开衫",
  "visual_color": "藏青色",
  "price": null,
  "price_display": "待确认",
  "cover_image": "catalog/products/ED-0032/thumbnails/IMG-0241.jpg",
  "cover_full": "catalog/products/ED-0032/processed/IMG-0241.jpg",
  "cover_display_1x1": "catalog/products/ED-0032/display/IMG-0241_1x1.jpg",
  "cover_display_4x5": "catalog/products/ED-0032/display/IMG-0241_4x5.jpg",
  "gallery_images": ["catalog/products/ED-0032/thumbnails/IMG-0241.jpg", "..."],
  "description": null,
  "material": null,
  "craftsmanship": null,
  "care_instructions": null,
  "measurement_template_id": "TPL-KNIT-TOPS",
  "publish_status": "pending_client_confirmation",
  "image_count": 12,
  "original_source": "04.21。 鄂多蘭   40件/未命名文件夹 32",
  "confidence": "0.925",
  "review_status": "auto_recognized",
  "notes": "缺少模特展示图; 缺少尺码图",
  "detail_count": 8,
  "fabric_count": 2,
  "back_count": 1,
  "gallery": [
    {
      "image_id": "IMG-0241",
      "role": "cover",
      "role_label": "商品主图",
      "width": 4523,
      "height": 4524,
      "thumbnail": "catalog/products/ED-0032/thumbnails/IMG-0241.jpg",
      "full": "catalog/products/ED-0032/processed/IMG-0241.jpg",
      "display_1x1": "catalog/products/ED-0032/display/IMG-0241_1x1.jpg",
      "display_4x5": "catalog/products/ED-0032/display/IMG-0241_4x5.jpg"
    }
  ]
}
```

字段说明：

| 字段 | 说明 |
|------|------|
| `product_id` | 稳定唯一编号（ED-XXXX），来自 catalog |
| `product_name` | 当前为视觉模型给出的**临时命名**，带「（临时命名·待确认）」后缀，客户确认后替换 |
| `category` / `category_label` | 一级分类机器值 / 中文标签 |
| `group` / `group_label` | 二级分组机器值 / 中文标签（分类页「全部 / 开衫 / polo…」层），**按临时命名中的品类词归类，非客户确认的正式分类**，规则见 `tools/build_prototype_data.py` 的 `GROUP_RULES` |
| `visual_color` | **视觉判定**的颜色，非客户确认色；未经确认不得作为 SKU 使用 |
| `price` / `price_display` | 客户未提供价格 → `null` / `"待确认"`（不写死任何数字） |
| `cover_image` / `cover_full` / `cover_display_1x1` / `cover_display_4x5` | 缩略图 600px / 全尺寸 / 1:1 补边图 / 4:5 竖图补边图（首页 hero 用） |
| `gallery[]` | 该商品全部图片，含 `role`（cover/front/back/detail/fabric）与四套尺寸路径 |
| `description` / `material` / `craftsmanship` / `care_instructions` | 客户未提供 → 全部 `null`，界面显示「待确认」 |
| `measurement_template_id` | 关联的量体模板（见下节） |
| `publish_status` | 全部为 `pending_client_confirmation`，确认后可改为 `published` |
| `image_count` / `detail_count` / `fabric_count` / `back_count` | 图片构成统计，供详情页分区展示 |
| `original_source` / `confidence` / `review_status` / `notes` | 数据溯源信息，来自 catalog 审核结果 |

### 5.2 路径约定

所有图片路径均相对**项目根目录**；页面内统一经 `img()` 加上 `../` 前缀，因此：

- HTML 页面必须放在 `prototype/` 根目录；
- http 服务的根目录必须是**项目根**（`/catalog/...` 才能解析）。

---

## 六、量体模板配置

独立文件：`prototype/data/measurement_templates.json`，共 5 套：

| template_id | 模板名 | 短名 | 适用类别 | 覆盖商品数 |
|-------------|--------|------|----------|-----------|
| `TPL-KNIT-TOPS` | 针织上装 / 衬衫量体模板 | 上装 | knitwear, shirts | 58 |
| `TPL-BOTTOM` | 下装量体模板 | 长裤 | clothing（裤 / 裙） | 7 |
| `TPL-OUTER` | 外套量体模板 | 外套 | clothing（外套 / 大衣） | 6 |
| `TPL-SCARF` | 围巾 / 配饰量体模板 | 围巾 | scarves | 5 |
| `TPL-GENERIC` | 通用兜底模板 | 通用 | 全部 | 0（备用） |

### 6.1 模板结构

```json
{
  "template_id": "TPL-KNIT-TOPS",
  "template_name": "针织上装 / 衬衫量体模板",
  "applicable_category": ["knitwear", "shirts"],
  "summary": "先量身体三围（胸围 / 身高 / 体重），再量一件合身上衣的肩宽、胸宽与衣长，取两组数据的参考组合下单制作。",
  "measurement_sections": [
    {
      "section_id": "body",
      "title": "身体测量",
      "measurement_type": "body",
      "description": "穿贴身衣物、赤脚或着薄鞋测量，数据最接近真实身体状态。",
      "measurement_fields": [
        {
          "field_code": "chest_bust",
          "field_name": "胸围",
          "measurement_type": "body",
          "unit": "cm",
          "required": true,
          "instruction": "围量胸部最丰满处一周。软尺保持水平，贴合身体但不要勒紧；自然站立、双手自然下垂，平静呼吸后读数。",
          "tips": ["软尺不要扭转", "建议测量两次取平均", "穿过外套测量会偏大"],
          "illustration": "prototype/assets/img/measure/chest.svg",
          "min": 60,
          "max": 140,
          "step": 0.5
        }
      ]
    },
    {
      "section_id": "garment_flat",
      "title": "合身衣物平铺测量",
      "measurement_type": "garment_flat",
      "description": "准备一件穿着合身、款式相近的上衣，平铺后量取实际尺寸，比单量身体更贴近想要的合身度。",
      "measurement_fields": [
        {
          "field_code": "shoulder_flat",
          "field_name": "肩宽",
          "measurement_type": "garment_flat",
          "unit": "cm",
          "required": true,
          "instruction": "选择一件合身的上衣，自然平铺在平面上，不要拉伸衣身。肩宽从两侧肩缝端点平直量取。",
          "tips": ["不要拉伸衣身", "肩缝端点到肩缝端点平直量取", "使用硬尺更准"],
          "illustration": "prototype/assets/img/measure/shoulder_flat.svg",
          "min": 30,
          "max": 70,
          "step": 0.5
        }
      ]
    }
  ]
}
```

### 6.2 measurement_field 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `field_code` | ✔ | 字段唯一编码，落库与配对使用 |
| `field_name` | ✔ | 中文显示名 |
| `measurement_type` | ✔ | `body`（身体测量）/ `garment_flat`（合身衣物平铺测量） |
| `unit` | ✔ | `cm` / `kg` 等，展示在输入框右侧 |
| `required` | ✔ | 必填 / 选填，必填项参与提交校验与进度计算 |
| `instruction` | ✔ | 操作说明，直接渲染在测量卡片内 |
| `tips` | | 要点列表，追加在说明下方 |
| `illustration` | ✔ | 示意图路径（相对项目根） |
| `min` / `max` / `step` | | 数值合理区间与步进，提交时做范围校验 |

### 6.3 扩展方式（无需改页面布局代码）

- **加字段**：在对应 `measurement_fields` 里追加一个对象 → 量体指南页、量体填写页、确认页、购物车摘要、订单详情表全部自动多出一行。
- **加测量类型**：新增一个 `measurement_sections`（如 `sleeve`），页面按 `measurement_type` 自动分组并打标签。
- **加模板**：在 `templates` 数组中新建模板，并在 `tools/build_prototype_data.py` 的 `CATEGORY_TEMPLATE` 中做类别映射，同时在 `app.js` 的 `TPL_SHORT` 中补一个短名（用于量体指南标题）。

---

## 七、量体记录数据结构

提交确认后写入 localStorage `ed_proto_measurements`。**一次量体 = 一条记录 + 一组扁平的 field 行**，每个 field 行独立携带 `measurement_id / product_id / measurement_type / field_code / field_name / value / unit / created_at`，满足规格要求的扁平结构，同时保留记录级上下文。

实测抓取的真实结构：

```json
{
  "measurement_id": "M-20261116-090143",
  "product_id": "ED-0032",
  "product_name": "藏青针织水手领开衫(白条饰)（临时命名·待确认）",
  "template_id": "TPL-KNIT-TOPS",
  "template_name": "针织上装 / 衬衫量体模板",
  "created_at": "2026-11-16T01:01:43.808Z",
  "fields": [
    {
      "measurement_id": "M-20261116-090143",
      "product_id": "ED-0032",
      "measurement_type": "body",
      "field_code": "chest_bust",
      "field_name": "胸围",
      "value": "92",
      "unit": "cm",
      "created_at": "2026-11-16T01:01:43.807Z"
    },
    {
      "measurement_id": "M-20261116-090143",
      "product_id": "ED-0032",
      "measurement_type": "garment_flat",
      "field_code": "shoulder_flat",
      "field_name": "肩宽",
      "value": "39",
      "unit": "cm",
      "created_at": "2026-11-16T01:01:43.808Z"
    }
  ]
}
```

`measurement_type` 取值：`body`（身体测量）、`garment_flat`（合身衣物平铺测量）。

### 购物车条目

```json
{
  "cart_item_id": "C-20261116-090143-969",
  "product_id": "ED-0032",
  "product_name": "藏青针织水手领开衫(白条饰)（临时命名·待确认）",
  "cover_image": "catalog/products/ED-0032/thumbnails/IMG-0241.jpg",
  "price": null,
  "quantity": 1,
  "measurement_id": "M-20261116-090143",
  "created_at": "2026-11-16T01:01:43.808Z"
}
```

**唯一键 = `product_id` + `measurement_id`**：同商品不同量体数据生成不同 `cart_item_id`，不会合并；同商品同量体数据再加入则只累加数量。

### 订单对象

```json
{
  "order_id": "ED20261116-085701",
  "created_at": "2026-11-16T01:01:43.808Z",
  "status": "created",
  "pay_method": "原型演示（不实际扣款）",
  "address": { "name": "...", "phone": "...", "region": "...", "detail": "..." },
  "remark": "袖长按 56cm 制作，肩部请略放松。",
  "items": [
    {
      "product_id": "ED-0032",
      "product_name": "...",
      "quantity": 1,
      "measurement_id": "M-20261116-090143",
      "measurement_summary": "胸围 92cm / 身高 165cm / ...",
      "measurement_fields": [ /* 同上扁平 field 行 */ ]
    }
  ],
  "product_total": null,
  "freight": null,
  "total": null
}
```

订单项内嵌了量体数据的**完整快照**，即使后续量体记录被修改也不影响已下订单。

---

## 八、复现方式

### 8.1 重新生成数据与页面

```bash
cd /home/kikun/MyProject/clothing-mall-miniapp

python3 tools/build_prototype_data.py        # catalog/ → products.json + assets/js/data.js
python3 tools/build_measure_illustrations.py # 生成 15 张测量示意图 SVG
python3 tools/build_guide_icons.py           # 生成 2 张首页量体线描图标 SVG
python3 tools/build_prototype_pages.py       # 生成 12 个 HTML 页面壳
```

> `prototype/assets/js/data.js` 由脚本生成，**请勿手工修改**；改商品数据请改 `tools/build_prototype_data.py` 或 `prototype/data/*.json` 后重新生成。

### 8.2 跑浏览器实测（自动起服务 + 出截图 + 出报告）

```bash
python3 tools/test_prototype.py
```

输出：`prototype/screenshots/*.png`（21 张）、`prototype/test-report.md`（用例明细 + 控制台输出）。
脚本会自行在 `127.0.0.1:8765` 启动 http 服务（服务根 = 项目根），跑完自动关闭。

### 8.3 生成 ref ↔ 原型并排对比图（复刻调校用）

```bash
python3 tools/compare_home.py
```

输出 `/tmp/cmp_home1.png`、`/tmp/cmp_home4.png`、`/tmp/cmp_home5.png`：左边是 `ref/` 原截图，右边是当前原型同一区块，用于逐项核对差异。

---

## 九、浏览器测试记录摘要

详见 [`prototype/test-report.md`](test-report.md)。

- **100 / 100 用例通过，0 控制台错误**
- 覆盖：12 个页面渲染、**首页与 ref 的 7+4 项差异回归**、**分类页分组层重构**、商品详情内容校验、量体指南、量体填写（必填校验 / 单位 / 进度 / 错误态清除）、量体确认、返回修改数据保留、加入购物车、同品不同量体不合并、订单确认、提交订单、订单详情、模拟制作、我的订单、个人中心、搜索、样式表完整性、量体示意图完整性（含首页 2 张线描图标）
- 演示商品：**ED-0032 藏青针织水手领开衫**（12 张真实图片）

关键断言：

| 断言 | 结果 |
|------|------|
| 首页 7 项差异（悬浮分享按钮 / hero 文案位置 / 英文眉标 / 深色卡圆角与箭头 / 量体插画 / 提示行 / 分类行选中态） | 14 条断言全过 ✅ |
| 首页第二批 4 项（说明行左对齐 / 前导短线 / hero 4:5 / 横滑卡无商品名 / 页脚尾注 / 品牌带） | 6 条断言全过 ✅ |
| 分类页重构（87px 一级栏 + 金色选中条 / 红色「全部」页签 / ⌄ 展开面板 / 无边框卡片 / 分组筛选） | 11 条断言全过 ✅ |
| 详情页 `[data-sku] / [data-size] / .sku-select / .size-select` 命中数 | 0 ✅ |
| 空表单点「下一步」→ 必填字段标红并停留当前页 | 6 项标红 ✅ |
| 填写后进度条实时更新 | 0% → 100% ✅ |
| 同商品两组量体数据（胸围 92 / 100）→ 购物车条目数 | 2 个独立条目，量体编号不同 ✅ |
| 样式表完整解析（购物车条目 flex / 缩略图 78px / 标签栏 flex） | ✅ 通过 |
| 单价 / 运费 / 合计 | 一律「待确认」 ✅ |
| 支付方式选项数 | 2（待客户确认 / 原型演示，不实际扣款） ✅ |
| emoji / 图标字体残留 | 0 ✅ |
| 15 张示意图 + 2 张首页线描图标为合法 XML、无缺失 moveto 的路径 | ✅ 通过 |
| 每张示意图可见墨迹 ≥3%、内容未被裁切 | ✅ 通过 |

---

## 十、尚需客户确认的业务问题

### A. 品牌与商品资料（阻塞正式上线）

1. **品牌中文名的写法**：小程序内为「**琴扬**」（提手旁），本次按截图复刻为「琴扬」；若正式使用「琴杨」（木字旁）请确认，我改一处品牌文案即可。
2. 76 件商品的**正式名称**（当前为视觉模型临时命名，均带「待确认」后缀）。
3. 每件商品的**售价**、货币单位、是否有折扣 / 会员价机制。
4. **材质成分**（如羊毛 / 羊绒含量）、**工艺细节**、**洗护说明**。
5. 是否需要**颜色 SKU**？当前原型按单款单色处理，若同一款式存在多个颜色，需要引入颜色维度并重新定义与量体数据的关系。
6. 76 件商品中**哪些先上架**？当前 `publish_status` 统一为 `pending_client_confirmation`。
7. 商城主体名称：截图里为「**琴扬服饰**」（购物车店铺行），是否就是这个？
8. **正式的商品分类树**：原小程序是「女装区 / 男装区 / 小羊 / 配饰」一级 + 「全部 / 外形 / 裤装」二级；当前原型的一级分类来自图片聚类（针织服饰 / 衬衫 / 围巾 / 其他服装），二级分组是按临时命名里的品类词推断出来的（开衫 / polo / 衬衫 / 背心 / 针织衫 / 外套 / 卫衣 / 裤装 / 裙装 / 围巾 / 披肩）。请提供正式分类表，改 `tools/build_prototype_data.py` 的 `GROUP_RULES` 即可整表替换，页面代码无需改动。

### B. 量体规则（影响模板配置）
9. 各品类**必填字段的最终清单**（当前针织上装模板：胸围 / 身高 / 体重 / 肩宽 / 胸宽 / 衣长 为必填，肩宽（身体）/ 袖长为选填）。
10. **尺寸容差与打版规则**：测量数据与成衣尺寸之间是否加放量？是否接受 ±X cm 偏差？
11. 是否需要**更多测量类型**（如臂围、腰围、臀围、下装裤长、裙长）？当前下装 / 外套模板为通用占位，字段待确认。
12. 是否允许顾客**只提交部分量体数据**（改为客服沟通确认）？当前逻辑为必填项未完成不可下单。
13. 是否需要**上传照片**（正面 / 侧面 / 背面）辅助打版？原型未包含。
14. 量体数据**保存时长**与**是否允许顾客复用历史量体数据**下单（当前每次确认生成新的 `measurement_id`）。

### C. 订单与履约

15. **制作周期**（下单到发货的天数），是否需要在订单页展示预计送达时间。
16. **运费规则**（是否包邮 / 按地区 / 按件）。
17. **支付方式**：微信支付 / 支付宝 / 对公转账？当前原型仅占位。
18. **退换货与修改规则**：下单后能否修改量体数据？修改是否需要商家重新报价？（当前原型下单后量体数据即冻结）
19. **订单状态流转**定义：当前仅 `created`（已提交）/ `made`（制作中），是否沿用小程序的「待付款 / 待发货 / 待收货 / 待评价 / 退款售后」？
20. 定制商品是否允许**与常规商品混单**（例如同一订单里既有定制款又有现货款）？
21. 「**储值下单抵扣**」「会员码」「金币 / 余额 / 卡券包」等小程序已有的账户能力，是否要在定制商城里保留？

### D. 平台与账号

22. 是否需要**账号体系**（微信授权登录 / 手机号）？当前原型无登录，数据仅存本浏览器。
23. 是否需要**收藏 / 分享**功能？
24. 76 件商品全部**缺少模特展示图**（catalog 已记录该缺口），是否补拍？

---

## 十一、工程约束遵守情况

| 约束 | 落实情况 |
|------|---------|
| 保护 `images/` 与 `catalog/` 原始资产 | 未修改、未移动；原型只读引用 catalog 产物 |
| 复用真实商品图片 | 76 件商品 690 张图全部来自 catalog，未生成任何 AI 商品图 |
| 不上传图片到第三方平台 | 全部本地处理，无任何外发 |
| 不接入真实支付 | 仅占位选项 |
| 不开发正式后端 | 纯静态 + localStorage |
| 不虚构客户商品信息 | 价格 / 材质 / 工艺 / 洗护 / 正式名称一律「待确认」 |
| 页面适配手机屏幕 | 520px 最大宽度居中，实测视口 390×844 |
| 优先复用现有前端技术栈 | 沿用项目既有的原生 HTML/CSS/JS 风格，无新增依赖 |
| 不重复创建商品数据资产 | 商品数据只从 catalog 派生，模板独立成文件，页面不含硬编码商品数据 |
| 图标规范 | 全部内联 SVG（33 个），不使用 emoji 与图标字体 |
| 视觉复刻 | 逐屏对照 `ref/` 53 张原小程序截图还原版式与配色 |
