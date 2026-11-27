/**
 * CSV 下载。
 *
 * 后台跑在浏览器里，用 Blob + <a download> 落盘。
 * 非浏览器环境（Node 端页面级自动化验证）没有 createObjectURL，
 * 此时跳过落盘但把内容交给调用方 —— 验证仍然能检查导出的内容是否正确。
 */

/** 是否处于可以落盘的浏览器环境 */
export function canDownloadInBrowser(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  );
}

/**
 * 触发 CSV 下载。
 *
 * @returns 是否真的落盘（false 表示当前环境不支持，仍已返回内容）
 */
export function downloadCsv(text: string, filename: string): boolean {
  if (!canDownloadInBrowser()) {
    return false;
  }
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}
