import { createPinia } from 'pinia';

/** 全局 pinia 实例：router 守卫与 main.ts 共用，避免激活时机问题 */
export const pinia = createPinia();
