"""Stage: static HTML review page + contact sheets (docs/p1.md §9).

Produces:
  catalog/review/index.html            self-contained review UI (data embedded)
  catalog/review/contact_sheets/*.jpg  per-category contact sheets
  catalog/review/review_schema.json     field definition for the export file

The page is a *developer review tool*, not a storefront: neutral layout,
path / role / confidence always visible, and every human decision can be
exported to JSON + CSV (never only kept in browser memory).
"""
from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C

CATEGORY_CN = {
    "shirts": "衬衫",
    "scarves": "围巾",
    "knitwear": "针织服饰",
    "clothing": "其他服装",
    "accessories": "其他配饰",
    "unknown": "待人工确认",
}
ROLE_CN = {
    "cover": "商品主图",
    "front": "正面图",
    "back": "背面图",
    "side": "侧面图",
    "detail": "细节图",
    "fabric": "面料特写",
    "model": "模特展示图",
    "flatlay": "平铺图",
    "size_chart": "尺码图",
    "description": "详情说明图",
    "other": "其他",
}


def build_contact_sheets(products: list[dict], labels: dict, inv: dict, out_dir: Path) -> list[str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    made = []
    by_cat: dict[str, list[dict]] = defaultdict(list)
    for p in products:
        by_cat[p["category"]].append(p)

    for cat, prods in by_cat.items():
        tiles = []
        for p in prods:
            cover = p.get("cover_source")
            if not cover:
                continue
            tiles.append((p["product_id"], cover))
        if not tiles:
            continue
        cols = 6
        rows = (len(tiles) + cols - 1) // cols
        cell = 230
        sheet = Image.new("RGB", (cols * cell, rows * (cell + 26)), (250, 247, 241))
        draw = ImageDraw.Draw(sheet)
        for i, (pid, src) in enumerate(tiles):
            x = (i % cols) * cell
            y = (i // cols) * (cell + 26)
            try:
                with Image.open(C.PROJECT_ROOT / src) as im:
                    im = im.convert("RGB")
                    im.thumbnail((cell - 8, cell - 8), Image.LANCZOS)
                    sheet.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
            except Exception:  # noqa: BLE001
                draw.rectangle([x + 10, y + 10, x + cell - 10, y + cell - 10], outline=(200, 190, 175))
            draw.text((x + 6, y + cell + 4), pid, fill=(122, 92, 66))
        name = f"contact_{cat}.jpg"
        sheet.save(out_dir / name, "JPEG", quality=82, optimize=True)
        made.append(name)
    return made


HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>鄂多蘭 · 商品素材审核台</title>
<style>
  :root{
    --cream:#FAF7F1; --oat:#F0E8DB; --sand:#E4D9C7; --line:#DCD0BE;
    --brown:#7A5C42; --brown-deep:#4E3B2C; --ink:#2F2822; --muted:#8B7B6B;
    --warn:#B4643C; --ok:#5F7A55; --accent:#A8763E;
    --radius:10px; --shadow:0 1px 2px rgba(78,59,44,.06),0 8px 24px rgba(78,59,44,.07);
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--cream);color:var(--ink);
    font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;}
  header{position:sticky;top:0;z-index:30;background:linear-gradient(180deg,var(--cream) 80%,rgba(250,247,241,.92));
    border-bottom:1px solid var(--line);padding:14px 22px;}
  .hrow{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
  h1{font-size:17px;margin:0;font-weight:600;letter-spacing:.06em;color:var(--brown-deep)}
  h1 span{color:var(--muted);font-weight:400;font-size:12px;margin-left:10px;letter-spacing:0}
  .stats{display:flex;gap:14px;flex-wrap:wrap;color:var(--muted);font-size:12px}
  .stats b{color:var(--brown-deep);font-weight:600;font-size:14px}
  .tools{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  input[type=search],input[type=text]{background:#fff;border:1px solid var(--line);border-radius:8px;
    padding:7px 11px;font:inherit;color:var(--ink);min-width:180px;outline:none}
  input:focus{border-color:var(--accent)}
  button{font:inherit;border:1px solid var(--line);background:#fff;color:var(--brown-deep);
    border-radius:8px;padding:7px 12px;cursor:pointer;transition:.15s}
  button:hover{border-color:var(--accent);color:var(--accent)}
  button.primary{background:var(--brown);color:#fff;border-color:var(--brown)}
  button.primary:hover{background:var(--brown-deep);color:#fff}
  .chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px;align-items:center}
  .chips .clabel{font-size:12px;color:var(--muted);margin-right:2px;letter-spacing:.04em}
  .chip{background:var(--oat);border:1px solid transparent;color:var(--muted);border-radius:999px;
    padding:4px 12px;font-size:12px;cursor:pointer;transition:.15s;user-select:none}
  .chip:hover{color:var(--brown)}
  .chip.on{background:var(--brown);color:#fff}
  .chip b{font-weight:600;opacity:.7;margin-left:4px}
  main{display:grid;grid-template-columns:290px 1fr;gap:0;align-items:start}
  aside{position:sticky;top:96px;height:calc(100vh - 96px);overflow:auto;border-right:1px solid var(--line);
    padding:12px;background:rgba(255,255,255,.35)}
  .plist{list-style:none;margin:0;padding:0}
  .plist li{border:1px solid var(--line);background:#fff;border-radius:var(--radius);padding:9px 10px;
    margin-bottom:8px;cursor:pointer;transition:.15s}
  .plist li:hover{border-color:var(--accent)}
  .plist li.on{border-color:var(--brown);box-shadow:var(--shadow);background:#fffdf9}
  .pid{font-weight:600;color:var(--brown-deep);font-size:13px;display:flex;justify-content:space-between;gap:6px}
  .pmeta{color:var(--muted);font-size:11.5px;margin-top:3px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  section{padding:20px 24px 60px;min-width:0}
  .empty{color:var(--muted);padding:60px 0;text-align:center}
  .phead{display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start;margin-bottom:18px}
  .cover{width:250px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--line);background:#fff;box-shadow:var(--shadow)}
  .cover img{width:100%;display:block}
  .cover .cap{padding:7px 10px;font-size:11.5px;color:var(--muted);border-top:1px solid var(--line);
    background:#fffdf9;word-break:break-all}
  .info{flex:1;min-width:280px}
  .info h2{margin:0 0 6px;font-size:18px;color:var(--brown-deep)}
  .kv{display:grid;grid-template-columns:auto 1fr;gap:5px 14px;font-size:12.5px;color:var(--muted)}
  .kv b{color:var(--ink);font-weight:500}
  .notes{margin-top:10px;background:#fff;border:1px solid var(--line);border-left:3px solid var(--accent);
    border-radius:6px;padding:8px 11px;font-size:12.5px;color:var(--brown-deep)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
  .card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;
    box-shadow:var(--shadow);display:flex;flex-direction:column}
  .thumb{position:relative;background:var(--oat);aspect-ratio:1/1;overflow:hidden;cursor:zoom-in}
  .thumb img{width:100%;height:100%;object-fit:contain;display:block}
  .tagrow{position:absolute;left:7px;top:7px;display:flex;gap:5px;flex-wrap:wrap;max-width:95%}
  .tag{background:rgba(78,59,44,.86);color:#fff;font-size:10.5px;padding:2px 7px;border-radius:4px;letter-spacing:.03em}
  .tag.warn{background:rgba(180,100,60,.9)}
  .tag.ok{background:rgba(95,122,85,.9)}
  .card .body{padding:8px 10px;font-size:11.5px;color:var(--muted);line-height:1.45}
  .card .path{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;color:#9b8b7a;
    word-break:break-all;margin-top:4px}
  .review{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
  .review button{padding:3px 8px;font-size:11px;border-radius:5px}
  .review button.on{background:var(--ok);color:#fff;border-color:var(--ok)}
  .review button.warnbtn.on{background:var(--warn);color:#fff;border-color:var(--warn)}
  .lightbox{position:fixed;inset:0;background:rgba(38,29,22,.94);z-index:100;display:none;
    align-items:center;justify-content:center;flex-direction:column}
  .lightbox.on{display:flex}
  .lightbox img{max-width:94vw;max-height:82vh;object-fit:contain;transition:transform .12s ease;cursor:grab}
  .lightbox .lmeta{color:#e8ded0;font-size:12px;margin-top:10px;text-align:center;max-width:90vw}
  .lightbox .lbar{position:absolute;top:14px;right:18px;display:flex;gap:8px}
  .lightbox button{background:rgba(255,255,255,.14);color:#fff;border-color:rgba(255,255,255,.25)}
  .badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);
    background:var(--oat);color:var(--brown)}
  .badge.warn{border-color:#e0c3ae;background:#f6e6da;color:var(--warn)}
  .badge.ok{border-color:#cdd9c4;background:#e9f0e4;color:var(--ok)}
  .toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--brown-deep);color:#fff;
    padding:9px 18px;border-radius:8px;font-size:13px;opacity:0;pointer-events:none;transition:.25s;z-index:200}
  .toast.on{opacity:1}
  .hint{color:var(--muted);font-size:12px;margin-bottom:12px}
  table.lay{width:100%;border-collapse:collapse;font-size:12.5px}
  table.lay td,table.lay th{border:1px solid var(--line);padding:6px 9px;text-align:left;background:#fff}
  table.lay th{background:var(--oat);color:var(--brown-deep);font-weight:600}
  details{margin-top:14px;border:1px solid var(--line);border-radius:var(--radius);background:#fff;padding:10px 14px}
  summary{cursor:pointer;color:var(--brown-deep);font-weight:600;font-size:13px}
</style>
</head>
<body>
<header>
  <div class="hrow">
    <h1>鄂多蘭 · 商品素材审核台<span>商品数字资产库 / 人工复核</span></h1>
    <div class="stats" id="stats"></div>
    <div class="tools">
      <input type="search" id="q" placeholder="搜索商品编号 / 名称…">
      <button id="exportJson">导出审核结果 JSON</button>
      <button id="exportCsv">导出审核结果 CSV</button>
      <button class="primary" id="resetAll">重置本地修改</button>
    </div>
  </div>
  <div class="chips" id="chips"></div>
</header>
<main>
  <aside><ul class="plist" id="plist"></ul></aside>
  <section id="detail"><div class="empty">请选择一个商品分组（左侧列表）。</div></section>
</main>
<div class="lightbox" id="lb">
  <div class="lbar">
    <button id="lbZoomOut">缩小</button><button id="lbZoomIn">放大</button>
    <button id="lbReset">适应</button><button id="lbClose">关闭 (Esc)</button>
  </div>
  <img id="lbImg" alt="">
  <div class="lmeta" id="lbMeta"></div>
</div>
<div class="toast" id="toast"></div>
<script id="catalog-data" type="application/json">__DATA__</script>
<script>
const DATA = JSON.parse(document.getElementById('catalog-data').textContent);
const STATUS_CN = {auto_recognized:'自动识别', needs_manual_review:'待人工确认', human_confirmed:'人工已确认'};
const LS_KEY = 'ed_catalog_review_v1';
const state = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
const saveState = () => localStorage.setItem(LS_KEY, JSON.stringify(state));
let filter = 'all', query = '', current = null;

const toast = m => { const t=document.getElementById('toast'); t.textContent=m; t.classList.add('on');
  setTimeout(()=>t.classList.remove('on'), 2200); };

function st(pid){ return state[pid] || (state[pid] = {category:null, reviewStatus:null, notes:'', images:{}}); }

function renderStats(){
  const imgs = DATA.products.reduce((a,p)=>a+p.images.length,0);
  document.getElementById('stats').innerHTML =
    `<span>商品分组 <b>${DATA.products.length}</b></span><span>图片 <b>${imgs}</b></span>`+
    `<span>类别 <b>${DATA.categories.length-1}</b></span><span>待确认 <b>${DATA.needsReview.length}</b></span>`+
    `<span>疑似重复 <b>${DATA.duplicates}</b></span><span>低分辨率 <b>${DATA.lowRes.length}</b></span>`;
}

function renderChips(){
  const cats = DATA.categories.filter(c=>c.count>0 || c.id==='all');
  const el = document.getElementById('chips'); let html='<span class="clabel">商品分类筛选：</span>';
  cats.forEach(c=>{ html += `<div class="chip ${filter===c.id?'on':''}" data-f="${c.id}">${c.label}<b>${c.count}</b></div>`; });
  html += `<div class="chip ${filter==='review'?'on':''}" data-f="review">待人工确认<b>${DATA.needsReview.length}</b></div>`;
  html += `<div class="chip ${filter==='dup'?'on':''}" data-f="dup">疑似重复<b>${DATA.duplicates}</b></div>`;
  html += `<div class="chip ${filter==='lowres'?'on':''}" data-f="lowres">低分辨率<b>${DATA.lowRes.length}</b></div>`;
  el.innerHTML = html;
  el.querySelectorAll('.chip').forEach(c=>c.onclick=()=>{filter=c.dataset.f;renderChips();renderList();});
}

function match(p){
  if(query){
    const q=query.toLowerCase();
    if(!(p.product_id.toLowerCase().includes(q)||(p.product_name||'').toLowerCase().includes(q))) return false;
  }
  if(filter==='all') return true;
  if(filter==='review') return p.review_status==='needs_manual_review';
  if(filter==='dup') return p.images.some(i=>i.flags&&i.flags.includes('疑似重复'));
  if(filter==='lowres') return p.images.some(i=>i.flags&&i.flags.includes('低分辨率'));
  const c = (state[p.product_id]&&state[p.product_id].category)||p.category;
  return c===filter;
}

function renderList(){
  const list = DATA.products.filter(match);
  document.getElementById('plist').innerHTML = list.map(p=>{
    const s = st(p.product_id);
    const cat = s.category||p.category;
    const stt = s.reviewStatus||p.review_status;
    const flag = stt==='needs_manual_review' ? '<span class="badge warn">待确认</span>'
             : stt==='human_confirmed' ? '<span class="badge ok">已确认</span>'
             : '<span class="badge">自动识别</span>';
    return `<li data-p="${p.product_id}" class="${current===p.product_id?'on':''}">
      <div class="pid"><span>${p.product_id}</span>${flag}</div>
      <div class="pmeta"><span class="badge">${p.category_label}</span><span>${p.image_count} 图</span>
      <span>置信 ${(p.confidence*100).toFixed(0)}%</span></div></li>`;
  }).join('') || '<li style="border:none;background:none;color:var(--muted)">没有匹配的商品分组</li>';
  document.querySelectorAll('#plist li[data-p]').forEach(li=>li.onclick=()=>select(li.dataset.p));
}

function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function select(pid){
  current = pid; const p = DATA.products.find(x=>x.product_id===pid); if(!p) return;
  const s = st(pid);
  const catOpts = DATA.categories.map(c=>`<option value="${c.id}" ${(s.category||p.category)===c.id?'selected':''}>${c.label}</option>`).join('');
  const stOpts = [['auto_recognized','自动识别'],['needs_manual_review','待人工确认'],['human_confirmed','人工已确认']]
    .map(([v,l])=>`<option value="${v}" ${(s.reviewStatus||p.review_status)===v?'selected':''}>${l}</option>`).join('');
  const cards = p.images.map(im=>{
    const flags = (im.flags||[]).map(f=>`<span class="tag ${f==='疑似重复'||f==='待确认'?'warn':'ok'}">${esc(f)}</span>`).join('');
    const ist = s.images[im.image_id]||{};
    return `<div class="card">
      <div class="thumb" data-img="${esc(im.processed||im.source_path)}" data-meta="${esc(im.source_path)} · ${esc(im.role_label)} · 置信 ${(im.confidence*100).toFixed(0)}%">
        <img loading="lazy" src="${esc(im.thumbnail)}" alt="">
        <div class="tagrow"><span class="tag">${esc(im.role_label)}</span>${flags}</div>
      </div>
      <div class="body">
        <div>${esc(im.image_id)} · ${im.width}×${im.height} · ${(im.file_size_kb/1024).toFixed(1)}MB</div>
        <div class="path"><b>原始文件路径：</b>${esc(im.source_path)}</div>
        <div class="review">
          <button class="ok ${ist.ok?'on':''}" data-ok="${im.image_id}">可用</button>
          <button class="warnbtn ${ist.ng?'on':''}" data-ng="${im.image_id}">不可用</button>
          <button data-copy="${esc(im.source_path)}">复制路径</button>
        </div>
      </div></div>`;
  }).join('');

  document.getElementById('detail').innerHTML = `
    <div class="phead">
      <div class="cover"><img src="${esc(p.cover_thumb)}" alt="cover">
        <div class="cap">主图候选 · ${esc(p.cover_source)}</div></div>
      <div class="info">
        <h2>${esc(p.product_id)} · ${esc(p.product_name)}</h2>
        <div class="kv">
          <b>商品类别</b><span>${esc(p.category_label)}</span>
          <b>视觉颜色</b><span>${esc(p.visual_color||'—')}</span>
          <b>图片数量</b><span>${p.image_count}</span>
          <b>识别置信度</b><span>${(p.confidence*100).toFixed(0)}%</span>
          <b>审核状态</b><span id="stText">${esc(STATUS_CN[p.review_status]||p.review_status)}</span>
          <b>原始来源</b><span>${esc(p.original_source)}</span>
          <b>商品目录</b><span>${esc(p.product_dir)}</span>
          <b>正面/背面</b><span>${p.front_count} 正面 · ${p.back_count} 背面</span>
        </div>
        <div class="notes">${esc(p.notes||'无附加说明')}</div>
        <div class="review" style="margin-top:10px">
          <select id="catSel">${catOpts}</select>
          <select id="stSel">${stOpts}</select>
          <input type="text" id="noteInput" placeholder="人工备注…" value="${esc(s.notes||'')}" style="min-width:220px">
          <button id="saveBtn" class="primary">保存本商品</button>
        </div>
      </div>
    </div>
    <div class="hint">共 ${p.images.length} 张关联图片 · 点击缩略图放大查看原图 · 标记结果可通过右上角按钮导出（不会只保存在浏览器内存中）</div>
    <div class="grid">${cards}</div>
    <details><summary>商品字段表（可复制到 TypeScript / 小程序数据）</summary>
      <table class="lay">${Object.entries(p.fieldTable).map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
    </details>`;

  document.getElementById('catSel').onchange = e=>{ s.category=e.target.value; saveState(); renderChips(); renderList(); };
  document.getElementById('stSel').onchange = e=>{ s.reviewStatus=e.target.value; saveState(); renderList(); };
  document.getElementById('noteInput').onchange = e=>{ s.notes=e.target.value; saveState(); };
  document.getElementById('saveBtn').onclick = ()=>{ saveState(); toast('已保存到本地草稿，可导出为 JSON / CSV'); renderList(); };
  document.querySelectorAll('[data-ok]').forEach(b=>b.onclick=()=>{ const id=b.dataset.ok;
    s.images[id]=s.images[id]||{}; s.images[id].ok=!s.images[id].ok; if(s.images[id].ok) s.images[id].ng=false; saveState(); select(pid); });
  document.querySelectorAll('[data-ng]').forEach(b=>b.onclick=()=>{ const id=b.dataset.ng;
    s.images[id]=s.images[id]||{}; s.images[id].ng=!s.images[id].ng; if(s.images[id].ng) s.images[id].ok=false; saveState(); select(pid); });
  document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{ try{ await navigator.clipboard.writeText(b.dataset.copy); toast('已复制路径'); }catch(e){ toast('复制失败，请手动选择'); }});
  document.querySelectorAll('.thumb').forEach(t=>t.onclick=()=>openLb(t.dataset.img, t.dataset.meta));
  renderList();
}

/* ---------- lightbox with zoom ---------- */
let lbScale=1, lbDrag=null;
const lb=document.getElementById('lb'), lbImg=document.getElementById('lbImg');
function openLb(src,meta){ lbImg.src=src; document.getElementById('lbMeta').textContent=meta||''; lbScale=1;
  lbImg.style.transform='scale(1)'; lb.classList.add('on'); }
function closeLb(){ lb.classList.remove('on'); lbImg.src=''; }
document.getElementById('lbClose').onclick=closeLb;
lb.onclick = e => { if(e.target===lb) closeLb(); };
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeLb();
  if(lb.classList.contains('on')){ if(e.key==='+'||e.key==='=') lbScale=Math.min(6,lbScale*1.25),apply(); if(e.key==='-') lbScale=Math.max(.3,lbScale/1.25),apply(); }});
document.getElementById('lbZoomIn').onclick=()=>{lbScale=Math.min(6,lbScale*1.25);apply();};
document.getElementById('lbZoomOut').onclick=()=>{lbScale=Math.max(.3,lbScale/1.25);apply();};
document.getElementById('lbReset').onclick=()=>{lbScale=1;apply();};
function apply(){ lbImg.style.transform=`scale(${lbScale})`; }
lbImg.addEventListener('wheel', e=>{ e.preventDefault(); lbScale=Math.min(6,Math.max(.3, lbScale*(e.deltaY<0?1.12:0.89))); apply(); }, {passive:false});
lbImg.addEventListener('mousedown', e=>{ lbDrag={x:e.clientX,y:e.clientY}; lbImg.style.cursor='grabbing'; });
window.addEventListener('mouseup', ()=>{ lbDrag=null; lbImg.style.cursor='grab'; });
window.addEventListener('mousemove', e=>{ if(lbDrag){ lbImg.style.transform=`scale(${lbScale}) translate(${(e.clientX-lbDrag.x)/lbScale}px,${(e.clientY-lbDrag.y)/lbScale}px)`; }});

/* ---------- export ---------- */
function buildExport(){
  const rows=[];
  DATA.products.forEach(p=>{
    const s=state[p.product_id]||{};
    (p.images||[]).forEach(im=>{
      const si=(s.images||{})[im.image_id]||{};
      rows.push({
        product_id:p.product_id,
        image_id:im.image_id,
        source_path:im.source_path,
        category_auto:p.category,
        category_final:(s.category||p.category),
        role:im.role, role_label:im.role_label,
        confidence_auto:p.confidence,
        review_status:(s.reviewStatus||p.review_status),
        image_usable: si.ok? 'yes' : (si.ng? 'no' : ''),
        flags:(im.flags||[]).join('|'),
        notes:s.notes||''
      });
    });
  });
  return {generatedAt:new Date().toISOString(),
    source:'catalog/review/index.html',
    products:DATA.products.map(p=>({product_id:p.product_id,
      category_auto:p.category, category_final:(state[p.product_id]||{}).category||p.category,
      review_status:(state[p.product_id]||{}).reviewStatus||p.review_status,
      notes:(state[p.product_id]||{}).notes||'',
      image_count:p.image_count})),
    images:rows};
}
function download(name, text, type){
  const b=new Blob([text],{type:type||'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
document.getElementById('exportJson').onclick=()=>{
  download('ed_catalog_review.json', JSON.stringify(buildExport(),null,2), 'application/json');
  toast('已导出 ed_catalog_review.json'); };
document.getElementById('exportCsv').onclick=()=>{
  const rows=buildExport().images; if(!rows.length){toast('没有数据');return;}
  const head=Object.keys(rows[0]);
  const csv=[head.join(',')].concat(rows.map(r=>head.map(h=>`"${String(r[h]==null?'':r[h]).replace(/"/g,'""')}"`).join(','))).join('\n');
  download('ed_catalog_review.csv','\ufeff'+csv,'text/csv'); toast('已导出 ed_catalog_review.csv'); };
document.getElementById('resetAll').onclick=()=>{ if(confirm('清除本地所有人工修改？')){ localStorage.removeItem(LS_KEY); location.reload(); } };
document.getElementById('q').oninput = e=>{ query=e.target.value.trim(); renderList(); };

renderStats(); renderChips(); renderList();
</script>
</body>
</html>
"""


def main() -> int:
    with C.Stage("09_review_page") as stage:
        C.ensure_dirs()
        rows = C.load_cache("catalog_rows.json").get("products", [])
        if not rows:
            stage.log("no catalog rows - run tools/build_catalog.py first")
            return 2
        inv = C.load_cache("inventory.json")
        labels = C.load_cache("labels.json")
        feats = C.load_cache("features.json")
        dup = C.load_cache("duplicates.json")

        dup_paths = set()
        for members in dup.get("exact_groups", {}).values():
            dup_paths.update(members)
        for pr in dup.get("near_pairs", []):
            dup_paths.add(pr["b"])

        products = []
        prods_cache = C.load_cache("products.json")
        member_of = {}
        for p in prods_cache.get("products", []):
            for m in p["members"]:
                member_of[m] = p["product_id"]

        # Paths embedded in the page must resolve relative to catalog/review/,
        # while the exported CSV keeps project-root relative paths.
        def browser_rel(p: str) -> str:
            if p.startswith("catalog/"):
                return "../" + p[len("catalog/"):]
            if p.startswith("images/"):
                return "../../" + p
            return p

        out_products = []
        for r in rows:
            pid = r["product_id"]
            recs = []
            for key, rec in sorted(inv.items()):
                if member_of.get(key) != pid:
                    continue
                lab = labels.get(key, {})
                f = feats.get(key, {})
                flags = []
                if key in dup_paths:
                    flags.append("疑似重复")
                if rec.get("is_low_resolution"):
                    flags.append("低分辨率")
                if lab.get("needs_review"):
                    flags.append("待确认")
                if f.get("blurry"):
                    flags.append("模糊")
                if f.get("overexposed"):
                    flags.append("过曝")
                if f.get("underexposed"):
                    flags.append("欠曝")
                if f.get("bg_uniform") is False:
                    flags.append("背景干扰")
                if f.get("subject_complete") is False and f.get("touches_border", 0) >= 2:
                    flags.append("主体裁切")
                role = lab.get("role", "other")
                if key == r.get("cover_source"):
                    role = "cover"
                img_id = rec.get("image_id", "")
                recs.append(
                    {
                        "image_id": img_id,
                        "source_path": C.rel(key),
                        "project_path": C.rel(key),
                        "processed": browser_rel(C.rel(C.PROJECT_ROOT / "catalog" / "products" / pid / "processed" / f"{img_id}.jpg")),
                        "thumbnail": browser_rel(C.rel(C.PROJECT_ROOT / "catalog" / "products" / pid / "thumbnails" / f"{img_id}.jpg")),
                        "role": role,
                        "role_label": ROLE_CN.get(role, "其他"),
                        "confidence": lab.get("confidence", 0.0),
                        "width": rec.get("width", 0),
                        "height": rec.get("height", 0),
                        "file_size_kb": round(rec.get("file_size_bytes", 0) / 1024, 1),
                        "visual_color": lab.get("visual_color", ""),
                        "flags": flags,
                    }
                )
            gallery = [i for i in recs if i["role"] in ("cover", "front", "back", "side", "flatlay", "model", "other")]
            detailish = [i for i in recs if i["role"] in ("detail", "fabric", "size_chart")]
            ordered = gallery + detailish
            cover_src = r.get("cover_source")
            cover_thumb = next(
                (i["thumbnail"] for i in ordered if i["source_path"] == cover_src), ordered[0]["thumbnail"] if ordered else ""
            )
            field_table = {
                "product_id": pid,
                "product_name": r["product_name"],
                "category": r["category"],
                "category_label": r["category_label"],
                "visual_color": r["visual_color"],
                "material": "(待确认)",
                "price": "(待确认)",
                "stock": "(待确认)",
                "sizes": "(待确认)",
                "cover_image": r["cover_image"],
                "gallery_images": r["gallery_images"],
                "detail_images": r["detail_images"],
                "model_images": r["model_images"],
                "original_source": r["original_source"],
                "confidence": r["confidence"],
                "review_status": r["review_status"],
                "notes": r["notes"],
            }
            out_products.append(
                {
                    "product_id": pid,
                    "product_name": r["product_name"],
                    "category": r["category"],
                    "category_label": r["category_label"],
                    "visual_color": r["visual_color"],
                    "confidence": r["confidence"],
                    "review_status": r["review_status"],
                    "original_source": r["original_source"],
                    "product_dir": r["product_dir"],
                    "image_count": r["image_count"],
                    "cover_source": cover_src,
                    "cover_thumb": cover_thumb,
                    "front_count": sum(1 for i in recs if i["role"] in ("cover", "front")),
                    "back_count": sum(1 for i in recs if i["role"] == "back"),
                    "notes": r["notes"],
                    "images": ordered,
                    "fieldTable": field_table,
                }
            )

        cats = []
        from collections import Counter

        cc = Counter(p["category"] for p in out_products)
        for cid in ["shirts", "scarves", "knitwear", "clothing", "accessories", "unknown"]:
            cats.append({"id": cid, "label": CATEGORY_CN[cid], "count": cc.get(cid, 0)})
        cats.insert(0, {"id": "all", "label": "全部", "count": len(out_products)})

        needs_review = [p["product_id"] for p in out_products if p["review_status"] == "needs_manual_review"]
        dup_count = len(dup.get("near_pairs", [])) + sum(len(v) - 1 for v in dup.get("exact_groups", {}).values())
        lowres = [p["product_id"] for p in out_products for i in p["images"] if "低分辨率" in i["flags"]]

        data = {
            "generatedAt": C.time.strftime("%Y-%m-%d %H:%M:%S"),
            "categories": cats,
            "products": out_products,
            "needsReview": needs_review,
            "duplicates": dup_count,
            "lowRes": lowres,
        }
        html = HTML_TEMPLATE.replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))
        out_html = C.CATALOG_DIR / "review" / "index.html"
        out_html.parent.mkdir(parents=True, exist_ok=True)
        out_html.write_text(html, "utf-8")
        stage.log(f"wrote {out_html} ({out_html.stat().st_size // 1024} KB)")

        # contact sheets
        sheets = build_contact_sheets(out_products, labels, inv, out_html.parent / "contact_sheets")
        stage.log(f"wrote contact sheets: {sheets}")

        # export schema
        (out_html.parent / "review_schema.json").write_text(
            json.dumps(
                {
                    "exportFiles": ["ed_catalog_review.json", "ed_catalog_review.csv"],
                    "productFields": [
                        "product_id", "category_auto", "category_final", "review_status", "notes", "image_count",
                    ],
                    "imageFields": [
                        "product_id", "image_id", "source_path", "category_auto", "category_final",
                        "role", "role_label", "confidence_auto", "review_status", "image_usable", "flags", "notes",
                    ],
                    "reviewStatusValues": ["auto_recognized", "needs_manual_review", "human_confirmed"],
                },
                ensure_ascii=False,
                indent=2,
            ),
            "utf-8",
        )
        stage.log("DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
