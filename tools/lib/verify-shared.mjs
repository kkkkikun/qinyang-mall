/**
 * 页面级执行验证的共享前置逻辑。
 *
 * 背景（第十一轮）：
 * 小程序侧的两套验证（流程 / 页面）都需要「已发布的商品」——
 * 顾客端只看得到 PUBLISHED 的商品，而种子里的商品全是 DRAFT
 * （要商家在后台显式上架）。
 *
 * 此前它们能跑通，靠的是「上一轮验证遗留的已发布商品」——
 * **依赖残留状态**：把验证数据清干净后，整条流水线就红，
 * 而且失败信息指向「顾客端没有商品」，很难联想到是工具自己的锅。
 *
 * 现在自己临时上架若干件，跑完复原，不留残留、不依赖历史。
 */

/**
 * 管理端直连（与顾客端无关，只为准备前置条件）。
 */
export async function adminCall(apiBase, path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, body: payload };
}

/** 一级分类 → 其下所有分组 id（用于判断商品归属哪个一级分类） */
async function topCategoryMap(apiBase) {
  const map = new Map();
  const res = await adminCall(apiBase, '/categories');
  const tree = res.body?.data ?? [];
  for (const node of tree) {
    map.set(node.id, node.id);
    for (const child of node.children ?? []) {
      map.set(child.id, node.id);
    }
  }
  return map;
}

/**
 * 确保有一批**已发布**商品供顾客端验证使用。
 *
 * 要上架多少件、挑哪几件，是有讲究的：
 *
 * - **至少 2 件**：首页把商品列表的第 1 件当「主推」、第 2–5 件当「精选」，
 *   只上架 1 件的话精选区必然是空的（断言会红，而问题不在页面）；
 * - **尽量覆盖不同的一级分类**：分类页默认落在一级分类上，
 *   若上架的商品全在同一个一级分类下，别的分类页就是空的；
 * - **必须有图集**：`coverUrl` 为空的是探针商品，
 *   商品详情页的「图集有多张」「带出量体模板名称」会红。
 *
 * @returns {{ restore: () => Promise<void> }} 复原动作（把临时上架的商品放回原状态）
 */
export async function ensurePublishedProducts(apiBase, { log = console.log, count = 3 } = {}) {
  const user = process.env.SEED_OWNER_USERNAME ?? 'owner';
  const pass = process.env.SEED_ADMIN_PASSWORD ?? 'Qinyang@2026';

  const login = await adminCall(apiBase, '/admin/auth/login', {
    method: 'POST',
    body: { username: user, password: pass }
  });
  if (login.status !== 200) {
    log(`⚠️  管理员登录失败（${login.status}），跳过「准备已发布商品」前置`);
    return { restore: async () => undefined };
  }
  const token = login.body?.data?.token;

  const list = await adminCall(apiBase, '/admin/products?pageSize=50', { token });
  const items = list.body?.data?.items ?? [];
  const withMedia = (item) => Boolean(item?.coverUrl);

  const topOf = await topCategoryMap(apiBase);

  // 已发布且带图集的就直接用
  const alreadyPublished = items.filter((item) => item.status === 'PUBLISHED' && withMedia(item));
  const published = alreadyPublished.slice(0, count);
  if (published.length >= count) {
    log(`前置：已有 ${published.length} 件已发布商品（含图集），直接使用`);
    return { restore: async () => undefined };
  }

  // 候选：草稿 + 有图集；优先覆盖不同的一级分类
  const candidates = items.filter((item) => item.status === 'DRAFT' && withMedia(item));
  const chosen = [];
  const seenTops = new Set();
  for (const item of candidates) {
    if (chosen.length >= count) break;
    const top = topOf.get(item.categoryId) ?? item.categoryId;
    if (seenTops.has(top)) continue;
    seenTops.add(top);
    chosen.push(item);
  }
  for (const item of candidates) {
    if (chosen.length >= count) break;
    if (!chosen.includes(item)) chosen.push(item);
  }
  if (!chosen.length) {
    log('⚠️  库里没有带图集的草稿商品，顾客端验证可能取不到商品');
    return { restore: async () => undefined };
  }

  const setStatus = (id, status) =>
    adminCall(apiBase, `/admin/products/${id}/status`, {
      method: 'POST',
      body: { status },
      token
    });

  const lifted = [];
  for (const item of chosen) {
    /*
     * 商品状态机：草稿 → 待审核 → 已发布。
     * 直接 DRAFT → PUBLISHED 会被服务端 409 拒绝（这一步是有意的：
     * 上架必须经过店主审核），所以这里按状态机分两步走。
     */
    const submit = await setStatus(item.id, 'PENDING_REVIEW');
    if (submit.status !== 200) {
      log(`⚠️  临时提交审核 ${item.code} 失败（${submit.status}）`);
      continue;
    }
    const publish = await setStatus(item.id, 'PUBLISHED');
    if (publish.status !== 200) {
      log(`⚠️  临时上架 ${item.code} 失败（${publish.status}）`);
      await setStatus(item.id, 'DRAFT');
      continue;
    }
    lifted.push(item);
  }

  if (!lifted.length) {
    return { restore: async () => undefined };
  }
  log(`前置：临时上架 ${lifted.map((i) => i.code).join('、')} 供顾客端验证使用（跑完复原）`);

  return {
    restore: async () => {
      // PUBLISHED → OFFLINE → DRAFT，按状态机一步步退回去
      for (const item of lifted) {
        await setStatus(item.id, 'OFFLINE');
        await setStatus(item.id, 'DRAFT');
      }
    }
  };
}
