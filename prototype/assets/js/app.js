/* 琴扬精纺羊绒 · 定制服装商城原型 V1 — 公共逻辑
 *
 * 数据来源：prototype/data/products.json + measurement_templates.json
 *   （由 tools/build_prototype_data.py 从 catalog/ 自动生成，勿手改 data.js）
 * 视觉基准：客户原小程序截图 ref/
 *
 * 所有原型数据只存浏览器 localStorage，属于演示数据，不是正式用户数据。
 */
(function () {
  "use strict";

  var DATA = window.ED_DATA || { products: { products: [], categories: [] }, templates: { templates: [] } };
  var PRODUCTS = DATA.products.products || [];
  var CATEGORIES = DATA.products.categories || [];
  var TEMPLATES = DATA.templates.templates || [];

  var LS = {
    draft: "ed_proto_draft",
    measurements: "ed_proto_measurements",
    cart: "ed_proto_cart",
    orders: "ed_proto_orders",
    address: "ed_proto_address"
  };

  /* ---------------- storage ---------------- */
  function read(key, fallback) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 演示环境忽略 */ }
  }

  /* ---------------- helpers ---------------- */
  function qs(name) {
    var m = new RegExp("[?&]" + name + "=([^&#]*)").exec(location.search);
    return m ? decodeURIComponent(m[1]) : "";
  }
  function img(path) {
    if (!path) return "";
    if (/^(https?:|data:)/.test(path)) return path;
    return "../" + path.replace(/^\/+/, "");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function productById(id) {
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].product_id === id) return PRODUCTS[i];
    return null;
  }
  function templateById(id) {
    for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].template_id === id) return TEMPLATES[i];
    return null;
  }
  function allFields(tpl) {
    var out = [];
    (tpl.measurement_sections || []).forEach(function (s) {
      (s.measurement_fields || []).forEach(function (f) {
        out.push({
          field_code: f.field_code, field_name: f.field_name,
          measurement_type: f.measurement_type, unit: f.unit, required: f.required,
          instruction: f.instruction, illustration: f.illustration, tips: f.tips || [],
          min: f.min, max: f.max, step: f.step, section_id: s.section_id, section_title: s.title
        });
      });
    });
    return out;
  }
  function priceText(p) {
    return (p && p.price != null) ? "¥" + p.price : "待确认";
  }
  function nowISO() { return new Date().toISOString(); }
  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("on");
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove("on"); }, 2000);
  }
  function lightbox(src, caption) {
    var box = document.getElementById("lightbox");
    if (!box) {
      box = document.createElement("div");
      box.id = "lightbox"; box.className = "lightbox";
      box.innerHTML = '<button class="lb-close" aria-label="关闭">' + ic.close + '</button>' +
        '<img alt=""><div class="lmeta"></div>';
      document.body.appendChild(box);
      box.querySelector(".lb-close").onclick = function () { box.classList.remove("on"); };
      box.onclick = function (e) { if (e.target === box) box.classList.remove("on"); };
    }
    box.querySelector("img").src = src;
    box.querySelector(".lmeta").textContent = caption || "";
    box.classList.add("on");
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { var b = document.getElementById("lightbox"); if (b) b.classList.remove("on"); }
  });

  /* ---------------- 图标（全部内联 SVG，不使用 emoji / 图标字体） ---------------- */
  var ic = {
    home: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10.6 12 3.8l8.5 6.8V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z"/></svg>',
    category: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3.5 6.5h6M3.5 12h6M3.5 17.5h6"/><circle cx="16.2" cy="9.6" r="4.1"/><path d="M19.4 13.2 21.5 15.4"/></svg>',
    cart: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h2.3l2.4 11.2h9.9l2-7.6H6.2"/><circle cx="9.2" cy="19" r="1.4"/><circle cx="16.6" cy="19" r="1.4"/></svg>',
    user: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.7"/><path d="M4.6 20.2c0-3.8 3.3-6.2 7.4-6.2s7.4 2.4 7.4 6.2"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="10.6" cy="10.6" r="6.4"/><path d="M15.4 15.4 20 20"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5 8 12l6.5 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 5 16 12l-6.5 7"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5 12 15.5l6-6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15"/><path d="M13 6l6 6-6 6"/></svg>',
    /* 细长线条箭头（材质定制卡，对齐 ref 首页4） */
    arrowLong: '<svg viewBox="0 0 40 16" width="34" height="14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h34"/><path d="M29 2.5 36 8l-7 5.5"/></svg>',
    /* 方框带外箭头（小程序分享/跳转，对齐 ref 悬浮按钮） */
    shareBox: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.6 7.6H9.8a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-4.6"/><path d="M11.6 12.4A5.6 5.6 0 0 1 17.2 6.8H21"/><path d="M17.2 2.8 21 6.6l-3.8 3.8"/></svg>',
    more: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/></svg>',
    dash: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5.5 12h13"/></svg>',
    circle: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="6.4"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6 6 18 18 M18 6 6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 5.5v13M5.5 12h13"/></svg>',
    minus: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5.5 12h13"/></svg>',
    heart: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7.5-4.4-7.5-9.4A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 3C19.5 15.6 12 20 12 20z"/></svg>',
    share: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11"/><path d="M8 7l4-3.5L16 7"/><path d="M5 12.5v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/></svg>',
    store: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5 5.2 4h13.6L20 9.5"/><path d="M4 9.5h16V20H4z"/><path d="M9.5 20v-5.5h5V20"/></svg>',
    chat: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h16v11H10l-5 3.5v-3.5H4z"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h9M17 17h3"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="15" cy="17" r="2"/></svg>',
    pin: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6.5-6.2 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 14.8 12 21 12 21z"/><circle cx="12" cy="10.4" r="2.3"/></svg>',
    qr: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h3v3h-3zM19 14h1M19 18h1M14 19h1"/></svg>',
    truck: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.5h11v10h-11z"/><path d="M13.5 10h4l3 3v3.5h-7z"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/></svg>',
    shield: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2 19 6v6c0 4-3 7.3-7 8.8C8 19.3 5 16 5 12V6z"/><path d="M9 12l2.2 2.2L15.5 10"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M17.5 3.5V7H14"/></svg>',
    headset: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2"/><path d="M4.5 13.5h2v5h-2zM17.5 13.5h2v5h-2z"/><path d="M19.5 18.5c0 1.4-1.8 2.5-4 2.5"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M3.5 10h17"/><circle cx="16.5" cy="14" r="1.2"/></svg>',
    gift: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="8.5" width="17" height="12" rx="1.5"/><path d="M3.5 12.5h17M12 8.5V20.5"/><path d="M12 8.5S9.5 3.5 7 5.5s3 3 5 3zM12 8.5s2.5-5 5-3-3 3-5 3z"/></svg>',
    coupon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5h17v3a2 2 0 0 0 0 3v3h-17v-3a2 2 0 0 0 0-3z"/><path d="M13 8.5v1.5M13 12v1.5M13 15.5v1"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1"/></svg>',
    clipboard: '<svg viewBox="0 0 24 24" width="80" height="80" fill="none" stroke="#DCDCDC" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4.5" width="12" height="16" rx="2"/><path d="M9.5 4.5V3.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v.7"/><path d="M9 10h6M9 13.5h6M9 17h4"/></svg>',
    ruler: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="8" width="19" height="8" rx="1.5"/><path d="M6.5 8v3M10 8v2M13.5 8v3M17 8v2"/></svg>',
    scissors: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="17" r="2.5"/><circle cx="6.5" cy="7" r="2.5"/><path d="M8.6 8.3 20 18M20 6 8.6 15.7"/></svg>',
    box: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5 3.5 16.5z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/></svg>'
  };

  /* ---------------- measurement store ---------------- */
  function getDraft() { return read(LS.draft, null); }
  function setDraft(d) { write(LS.draft, d); }
  function clearDraft() { localStorage.removeItem(LS.draft); }
  function measurements() { return read(LS.measurements, []); }
  function measurementById(id) {
    var all = measurements();
    for (var i = 0; i < all.length; i++) if (all[i].measurement_id === id) return all[i];
    return null;
  }
  function saveMeasurement(productId, values) {
    var p = productById(productId);
    var tpl = templateById(p.measurement_template_id);
    var fields = allFields(tpl);
    var recs = [];
    fields.forEach(function (f) {
      var v = values[f.field_code];
      if (v === undefined || v === null || v === "") return;
      recs.push({
        measurement_id: "", product_id: productId,
        measurement_type: f.measurement_type, field_code: f.field_code,
        field_name: f.field_name, value: String(v), unit: f.unit, created_at: nowISO()
      });
    });
    if (!recs.length) return null;
    var mid = "M-" + stamp();
    recs.forEach(function (r) { r.measurement_id = mid; });
    var record = {
      measurement_id: mid, product_id: productId,
      product_name: p.product_name, template_id: tpl.template_id,
      template_name: tpl.template_name, created_at: nowISO(),
      fields: recs
    };
    var all = measurements(); all.push(record); write(LS.measurements, all);
    return record;
  }

  /* ---------------- cart store ---------------- */
  function cart() { return read(LS.cart, []); }
  function setCart(c) { write(LS.cart, c); }
  function addToCart(productId, measurementId, quantity) {
    var c = cart();
    var p = productById(productId);
    // 同一商品的不同量体数据必须是不同的购物车条目
    var found = null;
    c.forEach(function (it) { if (it.product_id === productId && it.measurement_id === measurementId) found = it; });
    if (found) { found.quantity = (found.quantity || 1) + (quantity || 1); }
    else {
      c.push({
        cart_item_id: "C-" + stamp() + "-" + Math.floor(Math.random() * 900 + 100),
        product_id: productId, product_name: p.product_name,
        cover_image: p.cover_image, price: p.price,
        quantity: quantity || 1, measurement_id: measurementId, created_at: nowISO()
      });
    }
    setCart(c); return c;
  }
  function removeCartItem(cartItemId) {
    setCart(cart().filter(function (i) { return i.cart_item_id !== cartItemId; }));
  }
  function setQty(cartItemId, q) {
    var c = cart();
    c.forEach(function (i) { if (i.cart_item_id === cartItemId) i.quantity = Math.max(1, q); });
    setCart(c);
  }

  /* ---------------- orders ---------------- */
  function orders() { return read(LS.orders, []); }
  function saveOrder(order) { var o = orders(); o.unshift(order); write(LS.orders, o); return order; }
  function orderById(id) {
    var o = orders();
    for (var i = 0; i < o.length; i++) if (o[i].order_id === id) return o[i];
    return null;
  }
  function address() {
    return read(LS.address, {
      name: "（待填写）", phone: "（待填写）",
      region: "（待填写）", detail: "原型演示地址，请勿填写真实个人信息", isDefault: true
    });
  }
  function setAddress(a) { write(LS.address, a); }

  /* ---------------- 公共组件 ---------------- */
  function capsule() {
    return '<div class="capsule">' +
      '<span class="ci">' + ic.more + '</span><span class="sep"></span>' +
      '<span class="ci">' + ic.dash + '</span><span class="sep"></span>' +
      '<span class="ci">' + ic.circle + '</span></div>';
  }
  function navBar(title, opt) {
    opt = opt || {};
    var left = opt.left === "search"
      ? '<a class="back" href="search.html" aria-label="搜索">' + ic.search + '</a>'
      : (opt.back === false ? '<span class="back"></span>' : '<a class="back" href="javascript:history.back()" aria-label="返回">' + ic.back + '</a>');
    return '<header class="wx-nav">' + left +
      '<div class="title">' + esc(title || "") + '</div>' +
      '<span class="spacer"></span>' + capsule() + '</header>';
  }
  function tabBar(active) {
    var count = cart().reduce(function (n, i) { return n + i.quantity; }, 0);
    var tabs = [
      ["index.html", "首页", ic.home, "home"],
      ["category.html", "分类", ic.category, "category"],
      ["cart.html", "购物车", ic.cart, "cart"],
      ["profile.html", "我的", ic.user, "profile"]
    ];
    return '<nav class="wx-tabbar">' + tabs.map(function (t) {
      var badge = (t[3] === "cart" && count) ? '<i class="badge">' + count + '</i>' : "";
      return '<a href="' + t[0] + '" class="' + (t[3] === active ? "on" : "") + '">' +
        '<span class="ic">' + t[2] + badge + '</span><span>' + t[1] + '</span></a>';
    }).join("") + '</nav>';
  }
  function fab() {
    var count = cart().reduce(function (n, i) { return n + i.quantity; }, 0);
    return '<a class="fab" href="cart.html" aria-label="购物车">' + ic.cart +
      (count ? '<i class="badge">' + count + '</i>' : '') + '</a>';
  }
  /* 右下角悬浮分享按钮（对齐 ref 首页/详情/指南页的圆形分享按钮） */
  function shareFab() {
    return '<button class="fab-share" id="shareFab" type="button" aria-label="分享">' + ic.shareBox + '</button>';
  }
  function brandHead(withSearch) {
    return '<div class="brand-head">' +
      '<img class="wm" src="' + img("prototype/assets/img/brand/qinyang-word.png") + '" alt="QINYANG">' +
      '<div class="cn">琴扬</div>' +
      (withSearch ? '<a class="search" href="search.html" aria-label="搜索">' + ic.search + '</a>' : '') +
      '</div>';
  }
  function brandLogoBand() {
    return '<div class="footer-band">' +
      '<img class="wm" src="' + img("prototype/assets/img/brand/qinyang-word.png") + '" alt="QINYANG">' +
      '<div class="t cn">琴 扬</div></div>';
  }
  /* 页面底部：微信小店「提供技术支持」尾注（对齐 ref 首页7 底部） */
  function shopFooter() {
    return '<div class="wx-footer">' +
      '<div class="t">琴扬精纺羊绒</div>' +
      '<div class="t2">— 微信<span class="shop-badge">小店</span>提供技术支持 —</div></div>';
  }
  function productCard(p, opt) {
    opt = opt || {};
    var price = p.price != null
      ? '<span class="price"><span class="cur">¥</span>' + p.price + '</span>'
      : '<span class="price--tbd">待确认</span>';
    /* noName：ref 的「琴扬甄选」横滑卡只有图片 + 价格，不显示商品名 */
    var name = opt.noName ? '' :
      '<div class="pn"><span class="brand">QINYANG</span>｜' +
      esc(opt.short || p.product_name.replace(/^QINYANG\s*｜\s*/, "")) + '</div>';
    return '<a class="pcard' + (opt.noName ? ' pcard--bare' : '') + '" href="product.html?id=' + p.product_id + '">' +
      '<div class="ph"><span class="wm">QINYANG</span>' +
      '<img loading="lazy" src="' + img(p.cover_image) + '" alt="' + esc(p.product_name) + '"></div>' +
      '<div class="pb">' + name +
      '<div class="ship">包邮</div>' +
      '<div class="foot">' + price + '<span class="addcart">' + ic.cart + '</span></div>' +
      '</div></a>';
  }
  function catLabel(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i].label;
    return id;
  }
  function productShort(p) {
    var n = p.product_name.replace(/^QINYANG\s*｜\s*/, "").replace(/（临时命名·待确认）/, "");
    return n;
  }
  /* 横幅/卡片用的短标题：剥离备注性括号后截断，避免长临时名撑破版式 */
  function displayName(p, max) {
    var n = productShort(p).replace(/[（(][^）)]*[）)]/g, "").trim();
    max = max || 9;
    return n.length > max ? n.slice(0, max) + "…" : n;
  }
  /* 品类型别（从临时命名中取，不新增任何客户未确认的描述） */
  var TYPES = ["开衫", "衬衫", "上衣", "开衫衫", "长裤", "裤", "裙", "围巾", "披肩", "外套", "大衣", "马甲"];
  function itemType(p) {
    var n = productShort(p);
    for (var i = 0; i < TYPES.length; i++) if (n.indexOf(TYPES[i]) >= 0) return TYPES[i];
    return p.category_label;
  }
  function sectionTitle(t, eyebrow, go) {
    return '<div class="mod-title"><span class="t">' + esc(t) + '</span>' +
      (eyebrow ? '<span class="e">' + esc(eyebrow) + '</span>' : '') +
      (go ? '<a class="go" href="' + go[1] + '">' + esc(go[0]) + '</a>' : '') + '</div>';
  }

  /* 模板短名（对齐原小程序的「上装 / 长裤」称呼） */
  var TPL_SHORT = {
    "TPL-KNIT-TOPS": "上装",
    "TPL-BOTTOM": "长裤",
    "TPL-OUTER": "外套",
    "TPL-SCARF": "围巾",
    "TPL-GENERIC": "通用"
  };
  function tplShort(tpl) { return TPL_SHORT[tpl.template_id] || tpl.template_name; }

  /* ---------------- pages ---------------- */
  var PAGES = {};

  /* ---- 首页 ---- */
  PAGES.home = function () {
    var cats = CATEGORIES.filter(function (c) { return c.count > 0; });
    var hero = PRODUCTS.filter(function (p) { return p.product_id === "ED-0032"; })[0] || PRODUCTS[0];
    var showcase = PRODUCTS.filter(function (p) { return p.product_id === "ED-0006"; })[0] || PRODUCTS[1];
    var fabric = PRODUCTS.filter(function (p) { return p.product_id === "ED-0001"; })[0] || PRODUCTS[2];
    var sel = PRODUCTS.filter(function (p) {
      return ["ED-0032", "ED-0006", "ED-0001", "ED-0056"].indexOf(p.product_id) >= 0;
    });
    var more = PRODUCTS.filter(function (p) { return sel.indexOf(p) < 0; });

    document.getElementById("app").innerHTML =
      navBar("琴扬精纺羊绒", { back: false }) +
      brandHead(true) +
      '<div class="cat-nav">' + cats.map(function (c) {
        return '<a href="category.html?c=' + c.id + '">' + esc(c.label) + '</a>';
      }).join("") + '</div>' +

      '<section class="hero"><img src="' + img(hero.cover_display_4x5 || hero.cover_display_1x1 || hero.cover_image) + '" alt="">' +
      '<div class="ov"><div class="t">' + esc(hero.visual_color || hero.category_label) + '</div>' +
      '<div class="s">' + esc(itemType(hero)) + ' · 专属定制</div>' +
      '<a class="go" href="product.html?id=' + hero.product_id + '">探索此款</a></div></section>' +

      '<section>' +
      sectionTitle("羊绒衣橱", "THE WARDROBE") +
      '<div class="mod-body"><a href="product.html?id=' + showcase.product_id + '">' +
      '<img src="' + img(showcase.cover_image) + '" style="width:100%;aspect-ratio:3/4;object-fit:cover" alt="">' +
      '</a></div>' +
      '<div class="mod-line"></div>' +
      '<div class="row row-b" style="padding:0 14px 4px">' +
      '<span class="serif" style="font-size:19px;letter-spacing:.12em">' + esc(showcase.visual_color || displayName(showcase, 8)) + '</span>' +
      '<a href="product.html?id=' + showcase.product_id + '" class="fs12 muted-2" style="text-decoration:underline">探索此款</a></div>' +
      '<div class="mod-note mod-note--left">向左滑动，浏览衣橱</div>' +
      '</section>' +

      '<section>' +
      '<a href="product.html?id=' + fabric.product_id + '">' +
      '<img src="' + img(fabric.cover_image) + '" style="width:100%;aspect-ratio:4/3;object-fit:cover" alt=""></a>' +
      '<div class="mod-line"></div>' +
      '<div class="row row-b" style="padding:0 14px 4px">' +
      '<span class="serif" style="font-size:19px;letter-spacing:.12em">精纺羊绒</span>' +
      '<span class="fs12 muted-2">细密格纹，自然柔韧</span></div>' +
      '</section>' +

      '<a class="dark-card" href="sizing-guide.html"><div>' +
      '<div class="t">材质定制</div><div class="d">查看定制说明</div></div>' +
      '<span class="arrow">' + ic.arrowLong + '</span></a>' +

      '<section class="sec" style="margin-top:8px">' +
      sectionTitle("量体定制") +
      '<div class="mod-body" style="padding-bottom:6px"><div class="fs13 muted-2">从一件合身的衣物开始。</div></div>' +
      '<div class="guide-2">' +
      '<a class="guide-item" href="sizing-guide.html?template=TPL-KNIT-TOPS">' +
      '<span class="ill"><img src="' + img("prototype/assets/img/guide/top.svg") + '" alt="上装"></span>' +
      '<div class="t">上装</div><span class="go">查看量体说明</span></a>' +
      '<a class="guide-item" href="sizing-guide.html?template=TPL-BOTTOM">' +
      '<span class="ill"><img src="' + img("prototype/assets/img/guide/bottom.svg") + '" alt="长裤"></span>' +
      '<div class="t">长裤</div><span class="go">查看量体说明</span></a>' +
      '</div>' +
      '<div class="mod-note mod-note--left">自然平铺，不拉伸。依商品页的量体图记录尺寸。</div>' +
      '<div class="mod-line mod-line--hair"></div>' +
      '<div class="mod-hint">订购前，与店铺客服核对尺寸及定制细节。</div>' +
      '</section>' +

      '<section class="sec" style="margin-top:22px">' +
      sectionTitle("衣物养护") +
      '<a class="list-row" href="sizing-guide.html?template=TPL-KNIT-TOPS"><span>洗护指南</span><span class="go">' + ic.right + '</span></a>' +
      '<a class="list-row" href="sizing-guide.html"><span>护理服务</span><span class="go">' + ic.right + '</span></a>' +
      '</section>' +

      '<section class="sec" style="margin-top:8px">' +
      sectionTitle("琴扬甄选", null, ["全部款式", "category.html"]) +
      '<div class="hscroll">' + sel.map(function (p) { return productCard(p, { short: productShort(p), noName: true }); }).join("") + '</div>' +
      '<div class="mod-note mod-note--dash">向左滑动，浏览全部款式</div>' +
      '</section>' +

      brandLogoBand() +

      '<section class="sec" style="margin-top:8px">' +
      sectionTitle("更多商品") +
      '<div class="mod-body"><div class="pgrid">' +
      more.slice(0, 10).map(function (p) { return productCard(p, { short: productShort(p) }); }).join("") +
      '</div></div></section>' +
      shopFooter() +
      shareFab() +
      tabBar("home");
  };

  /* ---- 分类页 ---- */
  /* 结构对齐 ref 分类页：左侧一级分类栏 + 顶部二级分组页签（全部 / 分组 / ⌄ 展开） */
  var CAT_VISIBLE_GROUPS = 3;
  PAGES.category = function () {
    var cats = CATEGORIES.filter(function (c) { return c.count > 0; });
    var cur = qs("c");
    var cat = null;
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === cur && CATEGORIES[i].count > 0) cat = CATEGORIES[i];
    }
    if (!cat) cat = cats[0];
    cur = cat.id;
    var groups = cat.groups || [];
    var g = qs("g") || "";
    var gOK = false;
    for (var j = 0; j < groups.length; j++) if (groups[j].id === g) gOK = true;
    if (!gOK) g = "";
    var list = PRODUCTS.filter(function (p) {
      return p.category === cur && (!g || p.group === g);
    });
    var shown = groups.slice(0, CAT_VISIBLE_GROUPS);
    var others = cats.filter(function (c) { return c.id !== cur; });

    document.getElementById("app").innerHTML =
      navBar("商品分类", { left: "search" }) +
      '<div class="cat-wrap">' +
      '<div class="side-cat">' +
      '<div class="side-head' + (g ? ' drilled' : '') + '">' + esc(cat.label) + '</div>' +
      groups.map(function (x) {
        return '<a href="category.html?c=' + cur + '&g=' + x.id + '" class="' + (g === x.id ? "on" : "") + '">' +
          esc(x.label) + '</a>';
      }).join("") +
      others.map(function (c) {
        return '<a href="category.html?c=' + c.id + '" class="other">' + esc(c.label) + '</a>';
      }).join("") +
      '</div>' +
      '<div class="cat-right">' +
      '<div class="cat-tabs-row">' +
      '<div class="tabs cat-tabs">' +
      '<a href="category.html?c=' + cur + '" class="' + (g ? '' : "on") + '">全部</a>' +
      shown.map(function (x) {
        return '<a href="category.html?c=' + cur + '&g=' + x.id + '" class="' + (g === x.id ? "on" : "") + '">' +
          esc(x.label) + '</a>';
      }).join("") +
      '</div>' +
      '<button class="cat-toggle" id="catToggle" type="button" aria-label="展开全部分组">' + ic.down + '</button>' +
      '</div>' +
      '<div class="group-pop" id="groupPop" hidden>' +
      '<div class="gp-title">' + esc(cat.label) + ' · 全部分组</div>' +
      '<a href="category.html?c=' + cur + '" class="' + (g ? '' : "on") + '">全部<span>' + cat.count + '</span></a>' +
      groups.map(function (x) {
        return '<a href="category.html?c=' + cur + '&g=' + x.id + '" class="' + (g === x.id ? "on" : "") + '">' +
          esc(x.label) + '<span>' + x.count + '</span></a>';
      }).join("") +
      '</div>' +
      '<div class="cat-main"><div class="pgrid">' +
      list.map(function (p) { return productCard(p, { short: productShort(p) }); }).join("") +
      '</div><div class="hint">没有更多了</div></div>' +
      '</div></div>' + tabBar("category");
  };

  /* ---- 搜索页 ---- */
  PAGES.search = function () {
    var kw = qs("q") || "";
    var res = kw ? PRODUCTS.filter(function (p) {
      return (p.product_name + p.category_label + p.product_id + (p.visual_color || "")).toLowerCase().indexOf(kw.toLowerCase()) >= 0;
    }) : [];
    document.getElementById("app").innerHTML =
      navBar("搜索") +
      '<div class="searchbar"><div class="searchbox">' + ic.search +
      '<input id="q" placeholder="搜索商品名称、颜色或编号" value="' + esc(kw) + '"></div>' +
      '<a class="search-go" id="doSearch">搜索</a></div>' +
      (kw
        ? (res.length
          ? '<section class="sec"><div class="sec-pad fs12 muted">找到 ' + res.length + ' 件与「' + esc(kw) + '」相关的商品</div>' +
          '<div class="mod-body"><div class="pgrid pgrid--gap">' +
          res.map(function (p) { return productCard(p, { short: productShort(p) }); }).join("") + '</div></div></section>'
          : '<div class="empty"><div class="t">没有找到相关商品</div><div class="d">试试「针织」「围巾」或商品编号</div></div>')
        : '<section class="sec" style="margin-top:8px"><div class="sec-pad fs13" style="font-weight:600">店铺分类</div>' +
        '<div class="sec-pad" style="padding-top:0">' + CATEGORIES.filter(function (c) { return c.count > 0; }).map(function (c) {
          return '<a class="row row-b" href="category.html?c=' + c.id + '" style="padding:12px 0;border-bottom:1px solid var(--line)">' +
            '<span class="fs14">' + esc(c.label) + '</span><span class="muted" style="display:flex;align-items:center;gap:6px">' +
            c.count + ' 件 ' + ic.right + '</span></a>';
        }).join("") + '</div></section>') +
      fab();
    document.getElementById("doSearch").onclick = function () {
      location.href = "search.html?q=" + encodeURIComponent(document.getElementById("q").value.trim());
    };
  };

  /* ---- 商品详情页 ---- */
  PAGES.product = function () {
    var id = qs("id") || "ED-0032";
    var p = productById(id);
    if (!p) { document.getElementById("app").innerHTML = navBar("商品详情") + '<div class="empty">商品不存在</div>'; return; }
    var tpl = templateById(p.measurement_template_id);
    var gal = p.gallery || [];
    var details = gal.filter(function (g) { return g.role === "detail"; });
    var fabrics = gal.filter(function (g) { return g.role === "fabric"; });
    var gallery = gal.filter(function (g) { return g.role !== "fabric"; });
    var requiredCount = tpl ? allFields(tpl).filter(function (f) { return f.required; }).length : 0;

    document.getElementById("app").innerHTML =
      navBar(productShort(p)) +
      '<div class="pd-brand"><img class="wm" src="' + img("prototype/assets/img/brand/qinyang-word.png") + '" alt="QINYANG"></div>' +
      '<section class="pd-gallery">' +
      '<div class="track" id="track">' + gallery.map(function (g) {
        return '<div class="slide" data-full="' + img(g.full) + '" data-cap="' + esc(g.role_label) + ' · ' + esc(g.image_id) + '">' +
          '<img src="' + img(g.thumbnail) + '" alt="' + esc(g.role_label) + '" loading="lazy"></div>';
      }).join("") + '</div>' +
      '<div class="count" id="gcount">1 / ' + gallery.length + '</div>' +
      '</section>' +

      '<section class="pd-price"><div class="p">' +
      (p.price != null ? '<span class="cur">¥</span>' + p.price : esc(p.price_display)) + '</div>' +
      '<div class="fs12 muted-2" style="margin-top:4px">商品价格以商家确认为准</div></section>' +

      '<section class="pd-title" style="position:relative">' +
      '<span class="fav">' + ic.share + '</span>' +
      '<h1>QINYANG｜' + esc(productShort(p)) + '</h1>' +
      '<div class="sub">纯山羊绒 · 视觉颜色：' + esc(p.visual_color || "待确认") + ' · 专属定制</div>' +
      '<div class="row gap8" style="margin-top:9px">' +
      '<span class="tag">支持储值下单抵扣</span><span class="tag tag--gray">名称待确认</span>' +
      '<span class="tag tag--gray">材质待确认</span><span class="tag tag--gray">' + esc(p.product_id) + '</span>' +
      '</div></section>' +

      '<section class="pd-kv">' +
      '<div class="row"><span class="k">配送</span><span class="v">快递配送，运费与时效待确认</span><span class="go">' + ic.right + '</span></div>' +
      '<div class="row"><span class="k">运费</span><span class="v">待确认</span><span class="go">' + ic.right + '</span></div>' +
      '<div class="row"><span class="k">参数</span><span class="v">材质 / 工艺 / 洗护待确认</span><span class="go">' + ic.right + '</span></div>' +
      '<div class="row"><span class="k">定制</span><span class="v">按量体数据制作，不选颜色与尺码</span></div>' +
      '</section>' +

      '<section class="pd-svc">' +
      '<span class="s">' + ic.truck + '配送</span>' +
      '<span class="s">' + ic.refresh + '退换</span>' +
      '<span class="s">' + ic.shield + '品质</span>' +
      '<span class="s">' + ic.ruler + '专属定制</span>' +
      '</section>' +

      '<section class="pd-story">' +
      '<div class="eyebrow">QINYANG</div>' +
      '<h3>' + esc(productShort(p)) + '</h3>' +
      '<p>商品简短介绍、商品特点、材质与工艺信息<span class="accent">以客户后续提供的资料为准</span>，本原型不做任何推测性描述。</p>' +
      '</section>' +

      '<section class="pd-story" style="padding-top:4px">' +
      '<div class="img"><img src="' + img(gal.length ? gal[1].thumbnail : p.cover_image) + '" alt=""></div>' +
      '<div class="eyebrow" style="margin-top:20px">THE WARDROBE</div>' +
      '<h3>羊绒衣橱</h3>' +
      '<p>一件一码的定制体验。您提交的量体数据会随订单送达商家，<span class="accent">按您的尺寸制作</span>。</p>' +
      '</section>' +

      '<section class="sec-pad" style="background:var(--card)">' +
      '<div class="row row-b mb12"><span style="font-size:15px;font-weight:600">商品详情</span><span class="fs12 muted">共 ' + p.image_count + ' 张实拍</span></div>' +
      '<div class="gal4">' + gallery.map(function (g) {
        return '<img loading="lazy" src="' + img(g.thumbnail) + '" data-full="' + img(g.full) + '" data-cap="' + esc(g.role_label) + '" alt="">';
      }).join("") + '</div>' +
      (details.length || fabrics.length
        ? '<div class="row row-b mb12" style="margin-top:16px"><span style="font-size:15px;font-weight:600">商品细节</span>' +
        '<span class="fs12 muted">' + (details.length + fabrics.length) + ' 张</span></div>' +
        '<div class="gal4">' + details.concat(fabrics).map(function (g) {
          return '<img loading="lazy" src="' + img(g.thumbnail) + '" data-full="' + img(g.full) + '" data-cap="' + esc(g.role_label) + '" alt="">';
        }).join("") + '</div>' : '') +
      '</section>' +

      '<section class="pd-story" style="text-align:left">' +
      '<div class="eyebrow">MAKE TO MEASURE</div>' +
      '<h3 style="text-align:left">专属定制说明</h3>' +
      '<p>· 本商品不提供常规 S/M/L 尺码选择，商家依据您提交的量体数据制作。<br>' +
      '· 可自行测量身体尺寸，或量取一件合身衣物的平铺尺寸作为参考。<br>' +
      '· 确认页每一项数据都可返回修改，修改后需重新确认。<br>' +
      '· 相同商品的不同量体数据会作为独立订单项制作，不会合并。</p>' +
      '</section>' +

      '<a class="dark-card" href="sizing-guide.html?template=' + esc(p.measurement_template_id) + '">' +
      '<div><div class="t">量体指南</div><div class="d">本商品需 ' + requiredCount + ' 项必填数据 · 查看测量方法</div></div>' +
      '<span class="arrow">' + ic.arrow + '</span></a>' +

      '<a class="dark-card" href="measurement.html?product=' + esc(p.product_id) + '">' +
      '<div><div class="t">开始量体</div><div class="d">填写身体与成衣尺寸</div></div>' +
      '<span class="arrow">' + ic.arrow + '</span></a>' +

      '<section class="sec-pad" style="background:var(--card)">' +
      '<div class="row row-b"><div><div style="font-size:15px;font-weight:600">联系商家</div>' +
      '<div class="fs12 muted-2" style="margin-top:3px">沟通定制细节 / 咨询量体问题</div></div>' +
      '<button class="btn btn--ghost btn--sm" id="contactBtn">' + ic.chat + '联系</button></div>' +
      '</section>' +

      '<div class="pd-bar">' +
      '<a class="ico" href="javascript:void(0)" id="chatBtn"><span class="ic">' + ic.chat + '</span>联系商家</a>' +
      '<a class="ico" href="index.html"><span class="ic">' + ic.store + '</span>店铺</a>' +
      '<a class="ico" href="cart.html"><span class="ic">' + ic.cart + '<i class="badge" id="cartBadge"></i></span>购物车</a>' +
      '<button class="btn btn--ink" id="addBtn">加入购物车</button>' +
      '<button class="btn btn--tan" id="buyBtn">立即购买</button>' +
      '</div>';

    var badge = document.getElementById("cartBadge");
    var cc = cart().reduce(function (n, i) { return n + i.quantity; }, 0);
    if (badge && cc) badge.textContent = cc;

    /* carousel */
    var track = document.getElementById("track");
    var counter = document.getElementById("gcount");
    track.addEventListener("scroll", function () {
      var i = Math.round(track.scrollLeft / track.clientWidth);
      counter.textContent = (i + 1) + " / " + gallery.length;
    });
    Array.prototype.forEach.call(track.querySelectorAll(".slide"), function (s) {
      s.onclick = function () { lightbox(s.dataset.full, s.dataset.cap); };
    });
    Array.prototype.forEach.call(document.querySelectorAll(".gal4 img"), function (im) {
      im.onclick = function () { lightbox(im.dataset.full, im.dataset.cap); };
    });

    document.getElementById("addBtn").onclick = function () {
      var m = latestMeasurementFor(p.product_id);
      if (!m) { toast("请先完成量体数据"); location.href = "measurement.html?product=" + p.product_id; return; }
      addToCart(p.product_id, m.measurement_id, 1);
      toast("加入购物车成功"); setTimeout(function () { location.href = "cart.html"; }, 700);
    };
    document.getElementById("buyBtn").onclick = function () {
      var m = latestMeasurementFor(p.product_id);
      if (!m) { toast("请先完成量体数据"); location.href = "measurement.html?product=" + p.product_id; return; }
      addToCart(p.product_id, m.measurement_id, 1);
      location.href = "order-confirm.html";
    };
    document.getElementById("contactBtn").onclick = function () { contactSheet(p); };
    document.getElementById("chatBtn").onclick = function () { contactSheet(p); };
  };

  function latestMeasurementFor(pid) {
    var all = measurements().filter(function (m) { return m.product_id === pid; });
    return all.length ? all[all.length - 1] : null;
  }

  function contactSheet(p) {
    var box = document.createElement("div");
    box.className = "lightbox";
    box.style.background = "rgba(0,0,0,.55)";
    box.style.alignItems = "flex-end";
    box.innerHTML = '<div style="background:var(--card);width:100%;max-width:520px;border-radius:14px 14px 0 0;padding:18px 16px 26px;position:relative">' +
      '<button class="lb-close" style="color:var(--text-2);top:14px;right:14px">' + ic.close + '</button>' +
      '<div style="font-size:15px;font-weight:600;margin-bottom:8px">联系商家</div>' +
      '<div class="notice notice--gold">商家联系方式（微信 / 电话 / 营业时间）待客户提供，本原型不做虚构。</div>' +
      '<textarea id="msgBox" rows="4" placeholder="想咨询的内容，例如：这件开衫能否按肩宽 38cm 定制？" ' +
      'style="width:100%;margin-top:12px;padding:11px;border:1px solid var(--line-2);border-radius:5px;background:var(--card)"></textarea>' +
      '<button class="btn btn--tan btn--block" id="sendMsg" style="margin-top:10px">生成咨询内容</button>' +
      '<div class="fs11 muted" id="msgOut" style="margin-top:10px;white-space:pre-wrap"></div>' +
      '</div>';
    document.body.appendChild(box);
    box.classList.add("on");
    box.onclick = function (e) { if (e.target === box) box.remove(); };
    box.querySelector(".lb-close").onclick = function () { box.remove(); };
    box.querySelector("#sendMsg").onclick = function () {
      var v = box.querySelector("#msgBox").value.trim();
      box.querySelector("#msgOut").textContent = v
        ? "（原型演示）已整理以下咨询内容，原型不发送任何消息：\n商品：" + p.product_name + "（" + p.product_id + "）\n" + v
        : "请输入咨询内容";
    };
  }

  /* ---- 量体指南 ---- */
  PAGES.guide = function () {
    var tid = qs("template");
    var tpl = tid ? templateById(tid) : TEMPLATES[0];
    var tpls = TEMPLATES.filter(function (t) { return t.measurement_sections && t.measurement_sections.length; });
    var bodySec = (tpl.measurement_sections || []).filter(function (s) { return s.measurement_type === "body"; });
    var flatSec = (tpl.measurement_sections || []).filter(function (s) { return s.measurement_type === "garment_flat"; });

    function fieldFig(f, wide) {
      return '<div class="' + (wide ? "one" : "") + '">' +
        '<img src="' + img(f.illustration) + '" alt="' + esc(f.field_name) + '">' +
        '<div class="cap">' + esc(f.field_name) + '</div>' +
        '<div class="sub">' + esc(f.instruction) + '</div></div>';
    }
    function fieldCard(f, wide) {
      return '<div class="' + (wide ? "one" : "") + '">' +
        '<img src="' + img(f.illustration) + '" alt="' + esc(f.field_name) + '">' +
        '<div class="cap">' + esc(f.field_name) + '</div>' +
        '<div class="sub">' + esc(f.instruction) + '</div></div>';
    }

    document.getElementById("app").innerHTML =
      navBar(tplShort(tpl) + "量体指南") +
      '<section class="guide-hero">' +
      '<div class="eyebrow">量体指南</div>' +
      '<h1>' + esc(tplShort(tpl)) + '</h1>' +
      '<div class="desc">' + esc(tpl.summary) + '</div>' +
      '</section>' +

      bodySec.map(function (s) {
        return '<section class="guide-sec"><h2>净体测量</h2>' +
          '<div class="d">' + esc(s.description || "") + '</div>' +
          '<div class="guide-fig">' +
          s.measurement_fields.map(function (f, i) { return fieldFig(f, i === 0); }).join("") +
          '</div></section>';
      }).join("") +

      flatSec.map(function (s) {
        return '<section class="guide-sec"><h2>成衣平量</h2>' +
          '<div class="d">' + esc(s.description || "") + '</div>' +
          '<div class="guide-fig">' +
          s.measurement_fields.map(function (f, i) { return fieldCard(f, i < 2); }).join("") +
          '</div></section>';
      }).join("") +

      '<section class="guide-note">同时记录身高（cm）和体重（kg）。</section>' +

      '<section class="sec" style="margin-top:8px">' +
      '<div class="sec-pad fs13" style="font-weight:600">选择量体模板</div>' +
      '<div class="sec-pad" style="padding-top:0">' + tpls.map(function (t) {
        return '<a class="row row-b" href="sizing-guide.html?template=' + esc(t.template_id) + '" style="padding:12px 0;border-bottom:1px solid var(--line)">' +
          '<span class="fs14">' + esc(t.template_name) + '</span>' +
          '<span class="muted" style="display:flex;align-items:center;gap:6px">' +
          allFields(t).filter(function (f) { return f.required; }).length + ' 项必填 ' + ic.right + '</span></a>';
      }).join("") + '</div></section>' +

      '<div style="padding:14px 14px 4px">' +
      '<a class="btn btn--tan btn--block" href="measurement.html?template=' + esc(tpl.template_id) + '">用此模板开始量体</a></div>' +
      '<div class="notice" style="margin-top:10px">量体数据仅保存在本浏览器（原型演示），下单前可随时修改。</div>' +
      tabBar("home");
  };

  /* ---- 量体填写页 ---- */
  PAGES.measure = function () {
    var pid = qs("product");
    var p = pid ? productById(pid) : null;
    var tid = qs("template") || (p ? p.measurement_template_id : "TPL-KNIT-TOPS");
    var tpl = templateById(tid);
    var draft = getDraft();
    if (!draft || draft.template_id !== tid || (pid && draft.product_id !== pid)) {
      draft = { product_id: pid || "", template_id: tid, values: {}, step: 0 };
      setDraft(draft);
    }
    var fields = allFields(tpl);
    var required = fields.filter(function (f) { return f.required; });
    function filled() {
      return required.filter(function (f) {
        var v = draft.values[f.field_code];
        return v !== undefined && v !== null && String(v).trim() !== "";
      });
    }
    var done = filled();

    document.getElementById("app").innerHTML =
      navBar("填写尺寸") +
      '<div class="steps">' +
      ['量体指南', '填写尺寸', '确认数据'].map(function (s, i) {
        return '<div class="s ' + (i === 1 ? "on" : (i === 0 ? "done" : "")) + '"><span>' + (i + 1) + '</span>' + s + '</div>';
      }).join("") + '</div>' +
      '<div class="prog"><i style="width:' + Math.round(done.length / Math.max(1, required.length) * 100) + '%"></i></div>' +
      '<div class="sec-pad fs12 muted">必填项完成 ' + done.length + '/' + required.length + '</div>' +

      (p ? '<div class="sec" style="margin-top:0"><div class="row gap10 sec-pad">' +
        '<img src="' + img(p.cover_image) + '" style="width:52px;height:52px;object-fit:cover;border-radius:4px" alt="">' +
        '<div><div class="fs13">QINYANG｜' + esc(productShort(p)) + '</div>' +
        '<div class="fs11 muted-2" style="margin-top:3px">量体模板：' + esc(tpl.template_name) + '</div></div></div></div>' : '') +

      tpl.measurement_sections.map(function (s) {
        return '<div class="sec-pad" style="background:var(--card);padding-bottom:2px">' +
          '<div class="row row-b"><span class="serif" style="font-size:17px;letter-spacing:.1em">' + esc(s.title) + '</span>' +
          '<span class="tag ' + (s.measurement_type === "body" ? "" : "tag--gray") + '">' +
          (s.measurement_type === "body" ? "身体测量" : "合身衣物平铺测量") + '</span></div></div>' +
          (s.measurement_fields || []).map(function (f) {
            var v = draft.values[f.field_code] || "";
            return '<div class="mcard" data-field="' + esc(f.field_code) + '">' +
              '<div class="mh"><div class="ill"><img src="' + img(f.illustration) + '" alt="' + esc(f.field_name) + '示意图"></div>' +
              '<div class="mi">' +
              '<div class="mn">' + esc(f.field_name) + (f.required ? '<span class="req">必填</span>' : '<span class="opt">选填</span>') + '</div>' +
              '<div class="mt">' + (f.measurement_type === "body" ? "身体测量" : "合身衣物平铺测量") + ' · 单位 ' + esc(f.unit) + '</div>' +
              '<div class="ins">' + esc(f.instruction) + '</div>' +
              (f.tips && f.tips.length ? '<ul class="tips">' + f.tips.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + '</ul>' : '') +
              '<div class="mfield"><input type="number" inputmode="decimal" step="' + (f.step || 0.5) + '" placeholder="请输入" value="' + esc(v) + '" data-code="' + esc(f.field_code) + '">' +
              '<span class="unit">' + esc(f.unit) + '</span></div>' +
              '<div class="err">请填写' + esc(f.field_name) + (f.required ? "（必填）" : "") + '</div>' +
              '</div></div></div>';
          }).join("");
      }).join("") +

      '<div class="notice notice--gold" style="margin-top:8px">数据保存在本浏览器（原型演示）。填错可直接修改，提交前会再次确认。</div>' +

      '<div class="pd-bar" style="gap:10px">' +
      '<button class="btn btn--ghost" id="prevBtn" style="flex:0 0 96px">上一步</button>' +
      '<div class="grow" style="text-align:center"><div class="fs11 muted">已完成</div>' +
      '<div class="serif" style="font-size:17px" id="counter">' + done.length + '/' + required.length + ' 项</div></div>' +
      '<button class="btn btn--tan" id="nextBtn" style="flex:0 0 120px">下一步</button>' +
      '</div>';

    Array.prototype.forEach.call(document.querySelectorAll(".mfield input"), function (input) {
      input.addEventListener("input", function () {
        draft.values[input.dataset.code] = input.value;
        setDraft(draft);
        var card = input.closest(".mcard");
        if (card && String(input.value).trim() !== "") card.classList.remove("bad");
        var n = filled().length;
        var pct = Math.round(n / Math.max(1, required.length) * 100);
        var bar = document.querySelector(".prog i");
        if (bar) bar.style.width = pct + "%";
        var txt = document.querySelector(".sec-pad.fs12.muted");
        if (txt) txt.textContent = "必填项完成 " + n + "/" + required.length;
        var c = document.getElementById("counter");
        if (c) c.textContent = n + "/" + required.length + " 项";
      });
    });
    document.getElementById("prevBtn").onclick = function () { location.href = "sizing-guide.html?template=" + tid; };
    document.getElementById("nextBtn").onclick = function () {
      var missing = [];
      required.forEach(function (f) {
        var v = draft.values[f.field_code];
        if (v === undefined || v === null || String(v).trim() === "") missing.push(f);
      });
      Array.prototype.forEach.call(document.querySelectorAll(".mcard"), function (c) { c.classList.remove("bad"); });
      if (missing.length) {
        missing.forEach(function (f) {
          var card = document.querySelector('.mcard[data-field="' + f.field_code + '"]');
          if (card) card.classList.add("bad");
        });
        toast("还有 " + missing.length + " 项必填数据未完成");
        var first = document.querySelector(".mcard .mfield.bad");
        if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      var out = [];
      fields.forEach(function (f) {
        var v = draft.values[f.field_code];
        if (v === undefined || v === null || String(v).trim() === "") return;
        var num = parseFloat(v);
        if (f.min != null && num < f.min) out.push(f.field_name + " 不得小于 " + f.min + f.unit);
        if (f.max != null && num > f.max) out.push(f.field_name + " 不得大于 " + f.max + f.unit);
      });
      if (out.length) { toast(out[0]); return; }
      location.href = "measurement-confirm.html" + (pid ? "?product=" + pid : "");
    };
  };

  /* ---- 量体确认页 ---- */
  PAGES.measureConfirm = function () {
    var pid = qs("product");
    var p = pid ? productById(pid) : null;
    var draft = getDraft();
    if (!draft) { location.href = "index.html"; return; }
    var tpl = templateById(draft.template_id);
    var fields = allFields(tpl);
    var required = fields.filter(function (f) { return f.required; });
    var missing = required.filter(function (f) {
      var v = draft.values[f.field_code];
      return v === undefined || v === null || String(v).trim() === "";
    });

    document.getElementById("app").innerHTML =
      navBar("确认量体数据") +
      '<div class="steps">' +
      ['量体指南', '填写尺寸', '确认数据'].map(function (s, i) {
        return '<div class="s ' + (i === 2 ? "on" : "done") + '"><span>' + (i + 1) + '</span>' + s + '</div>';
      }).join("") + '</div>' +
      '<div class="prog"><i style="width:' + Math.round((required.length - missing.length) / Math.max(1, required.length) * 100) + '%"></i></div>' +

      (p ? '<div class="sec confirm-head" style="margin-top:8px"><div class="row gap10">' +
        '<img src="' + img(p.cover_image) + '" style="width:58px;height:58px;object-fit:cover;border-radius:4px" alt="">' +
        '<div class="grow"><div class="fs13">QINYANG｜' + esc(productShort(p)) + '</div>' +
        '<div class="fs11 muted-2" style="margin-top:3px">' + esc(p.product_id) + ' · ' + esc(p.category_label) + '</div></div>' +
        '</div></div>' : '') +

      (missing.length ? '<div class="notice notice--red" style="margin-top:8px">还有 ' + missing.length +
        ' 项必填数据未完成：' + missing.map(function (f) { return esc(f.field_name); }).join("、") + '</div>' : '') +

      tpl.measurement_sections.map(function (s) {
        return '<div class="sec-pad" style="background:var(--card);padding-bottom:2px">' +
          '<div class="row row-b"><span class="serif" style="font-size:17px;letter-spacing:.1em">' + esc(s.title) + '</span>' +
          '<span class="tag ' + (s.measurement_type === "body" ? "" : "tag--gray") + '">' +
          (s.measurement_type === "body" ? "身体测量" : "合身衣物平铺测量") + '</span></div></div>' +
          (s.measurement_fields || []).map(function (f) {
            var v = draft.values[f.field_code];
            var has = v !== undefined && v !== null && String(v).trim() !== "";
            return '<div class="confirm-row"><div class="k">' + esc(f.field_name) +
              '<small>' + (f.measurement_type === "body" ? "身体测量" : "合身衣物平铺测量") + '</small></div>' +
              '<div class="row gap8"><span class="v ' + (has ? "" : (f.required ? "warn" : "mute")) + '">' +
              (has ? esc(v) + " " + esc(f.unit) : (f.required ? "未填写" : "未填写（选填）")) + '</span>' +
              '<a class="edit" href="measurement.html' + (p ? "?product=" + p.product_id : "?template=" + tpl.template_id) + '#' + esc(f.field_code) + '">修改</a>' +
              '</div></div>';
          }).join("");
      }).join("") +

      '<div class="notice notice--gold" style="margin-top:8px">确认后将生成一份与该商品绑定的量体数据记录，并随订单提交给商家。您可以随时返回修改。</div>' +

      '<div class="pd-bar" style="gap:10px">' +
      '<button class="btn btn--ghost" id="backBtn" style="flex:0 0 104px">返回修改</button>' +
      '<button class="btn btn--tan" id="confirmBtn" style="flex:1">确认数据并加入购物车</button>' +
      '</div>';

    document.getElementById("backBtn").onclick = function () {
      location.href = "measurement.html" + (p ? "?product=" + p.product_id : "?template=" + tpl.template_id);
    };
    document.getElementById("confirmBtn").onclick = function () {
      if (missing.length) { toast("还有必填数据未完成"); return; }
      if (!p) { toast("请从商品详情页进入量体流程"); return; }
      var rec = saveMeasurement(p.product_id, draft.values);
      if (!rec) { toast("量体数据为空"); return; }
      clearDraft();
      addToCart(p.product_id, rec.measurement_id, 1);
      toast("加入购物车成功");
      setTimeout(function () { location.href = "cart.html"; }, 800);
    };
  };

  /* ---- 购物车 ---- */
  PAGES.cart = function () {
    var c = cart();
    var html = navBar("购物车") + '<div class="cart-tabs">' +
      '<a class="on">全部(' + c.length + ')</a><a>降价(0)</a>' +
      '<span class="mgr">' + ic.sliders + '管理</span></div>';
    if (!c.length) {
      html += '<div class="empty"><div class="ic">' + ic.clipboard + '</div>' +
        '<div class="t">购物车是空的</div>' +
        '<div class="d">先去挑选商品，完成量体后加入购物车</div>' +
        '<a class="btn btn--tan btn--sm" href="category.html" style="margin-top:16px">去逛逛</a></div>';
    } else {
      html += '<section class="sec" style="margin-top:0">' +
        '<div class="shop-head"><span class="radio"></span>' + ic.store +
        '<span class="sn">琴扬服饰</span><span class="muted" style="display:flex;align-items:center">' + ic.right + '</span></div>' +
        c.map(function (it) {
          var m = measurementById(it.measurement_id);
          return '<div class="cart-item">' +
            '<span class="radio"></span>' +
            '<a class="thumb" href="product.html?id=' + it.product_id + '"><img src="' + img(it.cover_image) + '" alt=""></a>' +
            '<div class="ci">' +
            '<a href="product.html?id=' + it.product_id + '"><div class="t">QINYANG｜' + esc(productShort(productById(it.product_id) || { product_name: it.product_name })) + '</div></a>' +
            '<div class="row gap6" style="margin-top:5px"><span class="tag">包邮</span>' +
            '<span class="tag tag--gray">量体 ' + esc(it.measurement_id) + '</span></div>' +
            (m ? '<div class="fs11 muted-2" style="margin-top:6px;line-height:1.6">' +
              esc(m.fields.map(function (f) { return f.field_name + " " + f.value + f.unit; }).join(" · ")) + '</div>' : '') +
            '<div class="mb">' +
            '<div class="stepper"><button data-dec="' + it.cart_item_id + '">' + ic.minus + '</button>' +
            '<span>' + it.quantity + '</span>' +
            '<button data-inc="' + it.cart_item_id + '">' + ic.plus + '</button></div>' +
            '<div class="row gap10">' +
            '<span class="price">' + (it.price != null ? '<span class="cur">¥</span>' + (it.price * it.quantity) : "金额待确认") + '</span>' +
            '<button class="btn btn--link" data-del="' + it.cart_item_id + '">删除</button></div>' +
            '</div></div></div>';
        }).join("") +
        '</section>' +
        '<section class="sec sec-pad">' +
        '<div class="row row-b fs13"><span class="muted-2">商品金额</span><span>待确认</span></div>' +
        '<div class="row row-b fs13" style="margin-top:8px"><span class="muted-2">运费</span><span>待确认</span></div>' +
        '<div class="row row-b fs13" style="margin-top:8px;padding-top:10px;border-top:1px solid var(--line)">' +
        '<span style="font-weight:600">合计</span><span style="font-weight:600">待确认</span></div>' +
        '<div class="fs11 muted-2" style="margin-top:8px">价格、运费与合计金额以客户后续提供的资料为准，本原型不做任何金额推测。</div>' +
        '</section>';
    }
    html += tabBar("cart");
    if (c.length) {
      html += '<div class="cart-bar" style="bottom:var(--tab-h)">' +
        '<span class="radio"></span><span class="fs13">全选</span>' +
        '<span class="tot">总计：<b>待确认</b></span>' +
        '<button class="btn btn--tan" id="toOrder">结算(' + c.length + ')</button></div>';
    }
    document.getElementById("app").innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll("[data-inc]"), function (b) {
      b.onclick = function () {
        var id = b.dataset.inc, it = cart().filter(function (i) { return i.cart_item_id === id; })[0];
        setQty(id, it.quantity + 1); PAGES.cart();
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-dec]"), function (b) {
      b.onclick = function () {
        var id = b.dataset.dec, it = cart().filter(function (i) { return i.cart_item_id === id; })[0];
        setQty(id, it.quantity - 1); PAGES.cart();
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-del]"), function (b) {
      b.onclick = function () { removeCartItem(b.dataset.del); toast("已移除"); PAGES.cart(); };
    });
    var to = document.getElementById("toOrder");
    if (to) to.onclick = function () {
      var c2 = cart();
      var noMeasure = c2.filter(function (i) { return !measurementById(i.measurement_id); });
      if (noMeasure.length) { toast("有商品缺少量体数据"); return; }
      location.href = "order-confirm.html";
    };
  };

  /* ---- 订单确认页 ---- */
  PAGES.orderConfirm = function () {
    var c = cart();
    if (!c.length) { location.href = "cart.html"; return; }
    var addr = address();
    document.getElementById("app").innerHTML =
      navBar("确认订单") +
      '<div class="sec" style="margin-top:8px">' +
      '<div class="addr">' + ic.pin +
      '<div class="t"><div>' + esc(addr.name) + '　' + esc(addr.phone) + '</div>' +
      '<div class="fs12 muted-2" style="margin-top:3px">' + esc(addr.region) + ' ' + esc(addr.detail) + '</div></div>' +
      '<button class="btn btn--link" id="editAddr">收货地址</button></div>' +
      '</div>' +

      '<section class="sec sec-pad">' +
      '<div class="row row-b mb12"><span style="font-size:15px;font-weight:600">商品与量体数据</span>' +
      '<span class="fs12 muted">' + c.length + ' 件</span></div>' +
      c.map(function (it) {
        var m = measurementById(it.measurement_id);
        var p = productById(it.product_id);
        return '<div class="order-line">' +
          '<a class="thumb" href="product.html?id=' + it.product_id + '"><img src="' + img(it.cover_image) + '" alt=""></a>' +
          '<div class="grow"><div class="t">QINYANG｜' + esc(productShort(p || { product_name: it.product_name })) + '</div>' +
          '<div class="m">数量 ' + it.quantity + ' · 单价 ' + (it.price != null ? "¥" + it.price : "待确认") + '</div>' +
          '<div class="m">量体 ' + esc(it.measurement_id) + '</div></div>' +
          '<div class="amt">' + (it.price != null ? "¥" + (it.price * it.quantity) : "待确认") + '</div></div>' +
          (m ? '<table class="tbl" style="margin:8px 0 12px"><tbody>' +
            m.fields.map(function (f) {
              return '<tr><th>' + esc(f.field_name) + '</th><td>' + esc(f.value) + " " + esc(f.unit) +
                '<span class="mtype">' + (f.measurement_type === "body" ? "身体测量" : "成衣平量") + '</span></td></tr>';
            }).join("") + '</tbody></table>'
            : '<div class="notice notice--red" style="margin:8px 0 12px">缺少量体数据，请返回购物车处理。</div>');
      }).join("") +
      '</section>' +

      '<section class="sec sec-pad">' +
      '<div class="row row-b fs13"><span class="muted-2">运费</span><span>待确认</span></div>' +
      '<div style="margin-top:12px"><div class="fs13 mb8">留言</div>' +
      '<textarea id="remark" rows="3" placeholder="给卖家的留言，例如：袖长请按 58cm 制作" ' +
      'style="width:100%;padding:11px;border:1px solid var(--line-2);border-radius:5px;background:var(--card);font-size:13px"></textarea></div>' +
      '</section>' +

      '<section class="sec sec-pad">' +
      '<div class="amt"><span>商品金额</span><span>待确认</span></div>' +
      '<div class="amt"><span>运费</span><span>待确认</span></div>' +
      '<div class="amt" style="border-top:1px solid var(--line)"><span style="font-weight:600">合计</span><b>待确认</b></div>' +
      '<div class="fs11 muted-2" style="margin-top:8px">原型阶段不接入真实支付，也不计算金额；实际金额以商家确认为准。</div>' +
      '</section>' +

      '<section class="sec sec-pad">' +
      '<div class="fs13 mb8">支付方式</div>' +
      '<label class="pay-row on" id="pay1"><span>支付方式待客户提供</span><span class="r"></span></label>' +
      '<label class="pay-row" id="pay2"><span>原型演示（不实际扣款）</span><span class="r"></span></label>' +
      '<div class="fs11 muted-2" style="margin-top:8px">仅用于流程演示，不会跳转任何支付渠道。</div>' +
      '</section>' +

      '<div class="cart-bar" style="position:sticky;bottom:0">' +
      '<button class="btn btn--ghost" id="backCart">返回购物车</button>' +
      '<button class="btn btn--tan" id="submitOrder" style="flex:1">提交订单</button>' +
      '</div>';

    document.getElementById("backCart").onclick = function () { location.href = "cart.html"; };
    document.getElementById("editAddr").onclick = function () { editAddress(); };
    var picked = "待客户确认";
    document.getElementById("pay1").onclick = function () {
      picked = "待客户确认"; this.classList.add("on"); document.getElementById("pay2").classList.remove("on");
    };
    document.getElementById("pay2").onclick = function () {
      picked = "原型演示（不实际扣款）"; this.classList.add("on"); document.getElementById("pay1").classList.remove("on");
    };
    document.getElementById("submitOrder").onclick = function () {
      var c2 = cart();
      if (!c2.length) { toast("购物车为空"); return; }
      var noM = c2.filter(function (i) { return !measurementById(i.measurement_id); });
      if (noM.length) { toast("有商品缺少量体数据，无法提交"); return; }
      var order = {
        order_id: "ED" + stamp(),
        created_at: nowISO(),
        status: "created",
        pay_method: picked,
        address: address(),
        remark: document.getElementById("remark").value.trim(),
        items: c2.map(function (it) {
          var m = measurementById(it.measurement_id);
          return {
            product_id: it.product_id, product_name: it.product_name,
            cover_image: it.cover_image, price: it.price, quantity: it.quantity,
            measurement_id: it.measurement_id,
            measurement_summary: m ? m.fields.map(function (f) {
              return f.field_name + " " + f.value + f.unit;
            }).join(" / ") : "",
            measurement_fields: m ? m.fields : []
          };
        }),
        product_total: null, freight: null, total: null
      };
      saveOrder(order);
      setCart([]);
      toast("订单已生成");
      setTimeout(function () { location.href = "order-detail.html?id=" + order.order_id; }, 700);
    };
  };

  function editAddress() {
    var a = address();
    var box = document.createElement("div");
    box.className = "lightbox";
    box.style.background = "rgba(0,0,0,.55)";
    box.style.alignItems = "flex-end";
    box.innerHTML = '<div style="background:var(--card);width:100%;max-width:520px;border-radius:14px 14px 0 0;padding:18px 16px 26px;position:relative">' +
      '<button class="lb-close" style="color:var(--text-2);top:14px;right:14px">' + ic.close + '</button>' +
      '<div style="font-size:15px;font-weight:600;margin-bottom:10px">收货地址</div>' +
      '<input id="aName" placeholder="收货人" value="' + esc(a.name) + '" style="width:100%;height:40px;padding:0 11px;margin-bottom:8px;border:1px solid var(--line-2);border-radius:5px">' +
      '<input id="aPhone" placeholder="联系电话" value="' + esc(a.phone) + '" style="width:100%;height:40px;padding:0 11px;margin-bottom:8px;border:1px solid var(--line-2);border-radius:5px">' +
      '<input id="aRegion" placeholder="省 / 市 / 区" value="' + esc(a.region) + '" style="width:100%;height:40px;padding:0 11px;margin-bottom:8px;border:1px solid var(--line-2);border-radius:5px">' +
      '<textarea id="aDetail" rows="2" placeholder="详细地址" style="width:100%;padding:11px;border:1px solid var(--line-2);border-radius:5px">' + esc(a.detail) + '</textarea>' +
      '<button class="btn btn--tan btn--block" id="aSave" style="margin-top:12px">保存</button>' +
      '<div class="fs11 muted-2" style="margin-top:8px">原型演示，请勿填写真实个人信息。</div></div>';
    document.body.appendChild(box); box.classList.add("on");
    box.onclick = function (e) { if (e.target === box) box.remove(); };
    box.querySelector(".lb-close").onclick = function () { box.remove(); };
    box.querySelector("#aSave").onclick = function () {
      setAddress({
        name: box.querySelector("#aName").value.trim() || "（待填写）",
        phone: box.querySelector("#aPhone").value.trim() || "（待填写）",
        region: box.querySelector("#aRegion").value.trim() || "（待填写）",
        detail: box.querySelector("#aDetail").value.trim() || "（待填写）"
      });
      box.remove(); toast("地址已更新"); PAGES.orderConfirm();
    };
  }

  /* ---- 个人中心 ---- */
  PAGES.profile = function () {
    var o = orders();
    var ms = measurements();
    document.getElementById("app").innerHTML =
      navBar("个人中心", { back: false }) +
      '<section class="me-head">' +
      '<div class="ava">客</div>' +
      '<div><div class="nm">顾客（原型演示）</div>' +
      '<div class="sub">原型未接入登录，数据仅存于本浏览器</div></div>' +
      '<a class="qr" href="profile.html"><span class="b">' + ic.qr + '</span>会员码</a>' +
      '</section>' +

      '<section class="me-stats">' +
      '<div class="s"><b>' + ms.length + '</b><span>量体记录</span></div>' +
      '<div class="s"><b>' + o.length + '</b><span>全部订单</span></div>' +
      '<div class="s"><b>' + o.filter(function (x) { return x.status === "made"; }).length + '</b><span>制作中</span></div>' +
      '</section>' +

      '<section class="me-card">' +
      '<div class="hd"><span class="t">我的订单</span><a class="go" href="orders.html">查看全部订单 ' + ic.right + '</a></div>' +
      '<div class="me-grid">' +
      [['待付款', ic.wallet, ''], ['待发货', ic.truck, ''], ['待收货', ic.box, ''], ['待评价', ic.chat, ''], ['退款/售后', ic.refresh, '']]
        .map(function (g) {
          return '<a class="g" href="orders.html"><span class="ic">' + g[1] + '</span>' + g[0] + '</a>';
        }).join("") +
      '</div></section>' +

      '<section class="me-card">' +
      '<div class="me-grid">' +
      [['购物车', ic.cart, 'ic--red'], ['量体记录', ic.ruler, 'ic--red'], ['收藏商品', ic.heart, 'ic--red'],
       ['我的礼品卡', ic.gift, 'ic--red'], ['优惠券', ic.coupon, 'ic--red'], ['联系客服', ic.headset, 'ic--blue'], ['账户设置', ic.gear, 'ic--green'],
       ['量体指南', ic.clipboard, 'ic--green'], ['护理服务', ic.scissors, 'ic--green']]
        .map(function (g, i) {
          var href = g[0] === "购物车" ? "cart.html" : (g[0] === "量体指南" ? "sizing-guide.html"
            : (g[0] === "量体记录" ? "profile.html#m" : "profile.html"));
          return '<a class="g" href="' + href + '"><span class="ic ' + g[2] + '">' + g[1] + '</span>' + g[0] + '</a>';
        }).join("") +
      '</div></section>' +

      '<section class="me-card" id="m">' +
      '<div class="hd"><span class="t">我的量体记录</span><span class="fs12 muted">' + ms.length + ' 条</span></div>' +
      '<div style="padding:4px 14px 14px">' +
      (ms.length ? ms.map(function (m) {
        return '<div style="padding:11px 0;border-top:1px solid var(--line)">' +
          '<div class="row row-b"><span class="fs13">QINYANG｜' + esc(productShort(productById(m.product_id) || { product_name: m.product_name })) + '</span>' +
          '<span class="fs11 muted">' + esc(m.measurement_id) + '</span></div>' +
          '<div class="fs12 muted-2" style="margin-top:5px;line-height:1.7">' +
          esc(m.fields.map(function (f) { return f.field_name + " " + f.value + f.unit; }).join(" · ")) + '</div></div>';
      }).join("") : '<div class="empty" style="padding:34px 0"><div class="t">还没有量体记录</div>' +
        '<div class="d">完成一次定制下单后，量体数据会显示在这里</div></div>') +
      '</div></section>' +

      '<section class="me-card sec-pad"><div class="center fs13">切换账号</div></section>' +
      brandLogoBand() +
      tabBar("profile");
  };

  /* ---- 我的订单 ---- */
  PAGES.orders = function () {
    var o = orders();
    document.getElementById("app").innerHTML =
      navBar("我的订单") +
      '<div class="searchbar"><div class="searchbox">' + ic.search + '<input placeholder="搜索我的订单"></div></div>' +
      '<div class="tabs">' +
      ['全部', '待付款', '待发货', '待收货', '待评价'].map(function (t, i) {
        return '<a class="' + (i === 0 ? "on" : "") + '">' + t + '</a>';
      }).join("") + '</div>' +
      (o.length ? o.map(function (x) {
        return '<a class="order-card" style="display:block" href="order-detail.html?id=' + x.order_id + '">' +
          '<div class="hd"><span>' + esc(x.order_id) + '</span><span class="st">' + (x.status === "made" ? "制作中" : "已提交") + '</span></div>' +
          x.items.map(function (it) {
            var p = productById(it.product_id);
            return '<div class="order-line">' +
              '<span class="thumb"><img src="' + img(it.cover_image) + '" alt=""></span>' +
              '<div class="grow"><div class="t">QINYANG｜' + esc(productShort(p || { product_name: it.product_name })) + '</div>' +
              '<div class="m">量体 ' + esc(it.measurement_id) + ' · 金额待确认</div></div>' +
              '<div class="amt">×' + it.quantity + '</div></div>';
          }).join("") +
          '<div class="order-total"><span>' + esc(x.created_at.slice(0, 16).replace("T", " ")) + '</span>' +
          '<span>合计待确认 ' + ic.right + '</span></div></a>';
      }).join("") : '<div class="empty"><div class="ic">' + ic.clipboard + '</div>' +
        '<div class="t">没有相关订单</div><div class="d">完成一次定制下单后，订单会显示在这里</div></div>') +
      tabBar("profile");
  };

  /* ---- 订单详情 ---- */
  PAGES.orderDetail = function () {
    var id = qs("id");
    var o = orderById(id);
    if (!o) { document.getElementById("app").innerHTML = navBar("订单详情") + '<div class="empty">订单不存在</div>'; return; }
    document.getElementById("app").innerHTML =
      navBar("订单详情") +
      '<section class="sec" style="margin-top:8px;padding:16px 14px">' +
      '<div class="row row-b"><span class="serif" style="font-size:19px">' + (o.status === "made" ? "制作中" : "已提交") + '</span>' +
      '<span class="fs12 muted">订单号 ' + esc(o.order_id) + '</span></div>' +
      '<div class="fs12 muted-2" style="margin-top:6px">' + esc(o.created_at.slice(0, 16).replace("T", " ")) + ' · 支付方式：' + esc(o.pay_method) + '</div>' +
      '</section>' +

      '<section class="sec sec-pad">' +
      '<div class="row gap8 mb12"><span style="font-size:15px;font-weight:600">收货地址</span></div>' +
      '<div class="row gap8">' + ic.pin + '<div><div class="fs13">' + esc(o.address.name) + '　' + esc(o.address.phone) + '</div>' +
      '<div class="fs12 muted-2" style="margin-top:3px">' + esc(o.address.region) + ' ' + esc(o.address.detail) + '</div></div></div>' +
      '</section>' +

      '<section class="sec sec-pad">' +
      '<div class="row row-b mb12"><span style="font-size:15px;font-weight:600">商品与量体数据</span>' +
      '<span class="fs12 muted">' + o.items.length + ' 件</span></div>' +
      o.items.map(function (it) {
        var p = productById(it.product_id);
        return '<div class="order-line">' +
          '<span class="thumb"><img src="' + img(it.cover_image) + '" alt=""></span>' +
          '<div class="grow"><div class="t">QINYANG｜' + esc(productShort(p || { product_name: it.product_name })) + '</div>' +
          '<div class="m">数量 ' + it.quantity + ' · 金额待确认</div></div></div>' +
          '<table class="tbl" style="margin:8px 0 14px"><tbody>' +
          (it.measurement_fields || []).map(function (f) {
            return '<tr><th>' + esc(f.field_name) + '</th><td>' + esc(f.value) + " " + esc(f.unit) +
              '<span class="mtype">' + (f.measurement_type === "body" ? "身体测量" : "成衣平量") + '</span></td></tr>';
          }).join("") + '</tbody></table>';
      }).join("") +
      '</section>' +

      (o.remark ? '<section class="sec sec-pad"><div class="fs13 mb8">留言</div>' +
        '<div class="fs13">' + esc(o.remark) + '</div></section>' : '') +

      '<section class="sec sec-pad">' +
      '<div class="amt"><span>商品金额</span><span>待确认</span></div>' +
      '<div class="amt"><span>运费</span><span>待确认</span></div>' +
      '<div class="amt" style="border-top:1px solid var(--line)"><span style="font-weight:600">合计</span><b>待确认</b></div>' +
      '</section>' +

      '<section class="sec sec-pad">' +
      '<button class="btn btn--ink btn--block" id="simulate">模拟商家开始制作</button>' +
      '<div class="notice notice--gold" style="margin-top:10px">原型演示按钮：模拟商家收到量体数据后开始制作。真实流程中由商家在后台操作。</div>' +
      '</section>';

    document.getElementById("simulate").onclick = function () {
      var all = orders();
      all.forEach(function (x) { if (x.order_id === o.order_id) x.status = "made"; });
      write(LS.orders, all);
      toast("已模拟为制作中");
      PAGES.orderDetail();
    };
  };

  /* ---------------- boot ---------------- */
  document.addEventListener("DOMContentLoaded", function () {
    var page = document.body.getAttribute("data-page");
    var fn = PAGES[page];
    if (fn) fn();
  });

  /* 悬浮分享按钮：微信「转发」为小程序原生能力，Web 原型仅作视觉占位 */
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target : null;
    if (el && el.closest("#shareFab")) {
      toast("分享为小程序原生能力，Web 原型暂不实现");
      return;
    }
    var pop = document.getElementById("groupPop");
    if (!pop) return;
    if (el && el.closest("#catToggle")) {
      pop.hidden = !pop.hidden;
      return;
    }
    if (!pop.hidden && !(el && el.closest(".group-pop"))) pop.hidden = true;
  });

  window.ED = {
    products: PRODUCTS, templates: TEMPLATES, categories: CATEGORIES,
    cart: cart, addToCart: addToCart, measurements: measurements,
    measurementById: measurementById, orders: orders, orderById: orderById,
    toast: toast, img: img, esc: esc, allFields: allFields,
    templateById: templateById, productById: productById,
    saveMeasurement: saveMeasurement, clearDraft: clearDraft, getDraft: getDraft,
    setDraft: setDraft, address: address, setAddress: setAddress, icons: ic
  };
})();
