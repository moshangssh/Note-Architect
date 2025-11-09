import { App, TFolder } from 'obsidian';
import { normalizePath } from '@utils/path';

export interface SafeFolderResult {
	folder: TFolder;
	normalizedPath: string;
}

export function safeGetFolder(app: App, rawPath: string | null | undefined): SafeFolderResult | null {
	if (!rawPath) {
		return null;
	}

	const normalizedPath = normalizePath(rawPath);
	if (!normalizedPath) {
		return null;
	}

	const abstractFile = app.vault.getAbstractFileByPath(normalizedPath);
	if (abstractFile instanceof TFolder) {
		return {
			folder: abstractFile,
			normalizedPath,
		};
	}

	return null;
}
