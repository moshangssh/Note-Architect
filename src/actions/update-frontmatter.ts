import { App, Editor, MarkdownView } from 'obsidian';
import type { FrontmatterPreset } from '@types';
import { getNoteMetadata, updateNoteFrontmatter } from '@utils/frontmatter-editor';
import { mergeFrontmatters } from '@utils/frontmatter/merge';
import { notifySuccess } from '@utils/notify';

type FrontmatterUpdateMode = 'merge' | 'overwrite';

/**
 * 执行 frontmatter 更新操作
 * @param app Obsidian 应用实例
 * @param editor 编辑器实例
 * @param preset 预设
 * @param userFrontmatter 用户输入的 frontmatter 数据
 * @param updateMode 更新模式：'merge' 或 'overwrite'
 * @returns Promise<void>
 */
export async function executeUpdateFrontmatter(
	app: App,
	editor: Editor,
	preset: FrontmatterPreset,
	userFrontmatter: Record<string, unknown>,
	updateMode: FrontmatterUpdateMode,
): Promise<void> {
	const metadata = getNoteMetadata(app);
	const currentFrontmatter = metadata.frontmatter ?? {};
	const nextFrontmatter = updateMode === 'overwrite'
		? { ...userFrontmatter }
		: mergeFrontmatters(currentFrontmatter, userFrontmatter);

	updateNoteFrontmatter(editor, nextFrontmatter, metadata.position);
	const modeHint = updateMode === 'merge' ? '合并' : '覆盖';
	notifySuccess(`笔记 Frontmatter 已使用预设 "${preset.name}" ${modeHint}应用。`);
}
