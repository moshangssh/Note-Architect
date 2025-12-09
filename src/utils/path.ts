/**
 * 使用 Obsidian 官方的路径规范化函数,确保跨平台兼容性。
 * 官方实现能更好地处理不同操作系统(Windows/Mac/Linux)下的路径分隔符和边缘情况。
 */
import { normalizePath } from "obsidian";
export { normalizePath };

/**
 * 检查文件路径是否在指定的模板文件夹内。
 * 支持精确匹配和子目录检查。
 */
export function isInsideTemplateFolder(
  filePath: string,
  folderPath: string
): boolean {
  const normalizedFolder = normalizePath(folderPath);
  if (!normalizedFolder) {
    return false;
  }

  const normalizedFile = normalizePath(filePath);
  return (
    normalizedFile === normalizedFolder ||
    normalizedFile.startsWith(`${normalizedFolder}/`)
  );
}
