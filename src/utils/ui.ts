/**
 * UI 相关工具函数
 */

/**
 * 将文本复制到剪贴板
 * @param text 要复制的文本内容
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    } else {
      // 降级方案：使用临时 textarea 元素
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  } catch (error) {
    console.warn("Note Architect: 复制到剪贴板失败", error);
    // 即使复制失败也不抛出错误，以免影响主要流程
  }
}
