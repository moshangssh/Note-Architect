/**
 * 将路径转换为使用正斜杠并移除首尾多余字符，统一跨平台处理。
 */
export function normalizePath(path: string): string {
	if (!path) {
		return "";
	}

	return path.replace(/\\/g, "/").trim().replace(/^\/*|\/*$/g, "");
}

/**
 * 检查文件路径是否在指定的模板文件夹内。
 * 支持精确匹配和子目录检查。
 */
export function isInsideTemplateFolder(filePath: string, folderPath: string): boolean {
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

