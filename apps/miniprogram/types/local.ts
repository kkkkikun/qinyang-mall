/**
 * 顾客端本地类型补充。
 *
 * 说明：`packages/contracts/src/index.ts` 是唯一权威数据契约，本文件只补充契约中
 * 尚未定义、但顾客端页面确实需要读取的返回结构（图文指南 / 登录响应）。
 * 一旦后端在 contracts 中补齐对应 DTO，应改为直接引用 contracts 的类型。
 */

/** 顾客登录响应（POST /auth/login → { token, customer }） */
export interface CustomerLoginResponse {
  token: string;
  customer: {
    id: string;
    nickname: string;
    phoneMasked?: string;
    createdAt: string;
  };
}

/** 图文指南分节（GET /guides/:slug） */
export interface GuideSection {
  /** 分节标题，例如「净体测量」「成衣平量」 */
  title: string;
  /** 分节说明 */
  description?: string;
  /** 条目列表（说明 / 要点） */
  items?: string[];
  /** 示意图资源标识，可为相对路径或完整 URL；为空时使用小程序内置线稿 */
  illustration?: string | null;
  /** 量体字段编码列表，用于关联内置量体示意图 */
  fieldCodes?: string[];
}

/** 图文指南（GET /guides/:slug） */
export interface GuideContent {
  slug: string;
  title: string;
  summary?: string | null;
  sections: GuideSection[];
}

/** 分类节点（GET /categories 返回树形结构时的辅助类型） */
export interface CategoryNode {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  level: number;
  sortOrder: number;
  status: 'ACTIVE' | 'DISABLED';
  productCount?: number;
  children?: CategoryNode[];
}

/** 后台自定义导航栏度量（真实胶囊位置，不模拟胶囊） */
export interface NavMetrics {
  /** 状态栏高度（px） */
  statusBarHeight: number;
  /** 胶囊按钮区域高度（px） */
  menuHeight: number;
  /** 导航栏内容区高度（px），不含状态栏 */
  barHeight: number;
  /** 右侧为真实胶囊预留的宽度（px） */
  capsuleGap: number;
  /** 窗口宽度（px） */
  windowWidth: number;
}
