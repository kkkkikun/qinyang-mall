#!/usr/bin/env node
/**
 * 管理后台静态自检脚本（无第三方依赖）。
 *
 * 检查项：
 * 1. 禁止在后台出现真实收款相关的状态/按钮文案（V1 未启用线上收款）。
 * 2. 禁止用 any 兜底类型。
 * 3. 禁止使用 @ts-ignore / @ts-expect-error 掩盖类型问题。
 * 4. 每个 .vue / .ts 源文件非空。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(root, 'src');

const FORBIDDEN_PAYMENT_WORDS = [
  '已支付',
  '已付款',
  '去支付',
  '立即支付',
  '支付成功',
  '付款成功',
  '退款',
];

const FORBIDDEN_TYPE_PATTERNS = [
  { pattern: /:\s*any\b/, message: '禁止用 any 作为类型兜底' },
  { pattern: /\bas\s+any\b/, message: '禁止 as any 断言' },
  { pattern: /<any>/, message: '禁止 any 泛型参数' },
  { pattern: /@ts-ignore/, message: '禁止 @ts-ignore' },
  { pattern: /@ts-expect-error/, message: '禁止 @ts-expect-error' },
];

function collectFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      files.push(...collectFiles(full));
    } else if (/\.(ts|vue)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const problems = [];
const files = collectFiles(srcDir);

for (const file of files) {
  const rel = relative(root, file);
  const content = readFileSync(file, 'utf8');

  if (!content.trim()) {
    problems.push(`${rel}: 文件为空`);
    continue;
  }

  for (const word of FORBIDDEN_PAYMENT_WORDS) {
    if (content.includes(word)) {
      problems.push(`${rel}: 出现被禁用的收款文案「${word}」`);
    }
  }

  for (const { pattern, message } of FORBIDDEN_TYPE_PATTERNS) {
    if (pattern.test(content)) {
      problems.push(`${rel}: ${message}`);
    }
  }
}

if (problems.length > 0) {
  console.error('lint 失败：');
  problems.forEach((item) => console.error(`  - ${item}`));
  process.exit(1);
}

console.log(`lint 通过：检查 ${files.length} 个源文件，未发现问题。`);
