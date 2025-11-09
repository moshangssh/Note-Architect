import { App } from 'obsidian';
import { parseFrontmatter, getNoteMetadata } from '@utils/frontmatter-editor';
import type NoteArchitect from '@core/plugin';
import type {
	FrontmatterPreset,
	ParsedTemplateContent,
	Template,
	TemplateProcessingResult,
	TemplatePreparationResult
} from '@types';
import type { TemplaterPort } from './TemplaterPort';
import { ObsidianTemplaterAdapter } from './ObsidianTemplaterAdapter';
import { mergeFrontmatterWithUserInput } from './merge-pipeline';

export async function processTemplateContent(app: App, plugin: NoteArchitect, template: Template): Promise<TemplateProcessingResult> {
	let processedContent = template.content;
	let usedTemplater = false;
	let error: string | undefined;

	if (plugin.settings.enableTemplaterIntegration) {
		const templater: TemplaterPort = new ObsidianTemplaterAdapter(app);
		if (templater.isAvailable()) {
			try {
				processedContent = await templater.processTemplate(template);
				usedTemplater = true;
			} catch (templaterError) {
				console.warn('Note Architect: Templater 处理失败，使用原始模板内容', templaterError);
				error = 'Templater 处理失败，使用原始模板内容';
			}
		}
	}

	return { content: processedContent, usedTemplater, error };
}

export function parseTemplateContent(content: string): ParsedTemplateContent {
	try {
		const parsed = parseFrontmatter(content);

		if (parsed.hasFrontmatter) {
			return {
				frontmatter: parsed.frontmatter,
				body: parsed.body.trim(),
			};
		}

		return {
			frontmatter: {},
			body: parsed.body,
		};
	} catch (error) {
		console.warn('Note Architect: Frontmatter 解析失败', error);
		return { frontmatter: {}, body: content };
	}
}

export async function prepareTemplateWithUserInput(
	app: App,
	plugin: NoteArchitect,
	template: Template,
	preset: FrontmatterPreset,
	userFrontmatter: Record<string, unknown>,
): Promise<TemplatePreparationResult> {
	const {
		content: processedContent,
		usedTemplater,
		error: templaterError,
	} = await processTemplateContent(app, plugin, template);

	const { frontmatter: templateFM, body: templateBody } = parseTemplateContent(processedContent);
	const mergedFrontmatter = await mergeFrontmatterWithUserInput(
		app,
		plugin,
		preset,
		templateFM,
		userFrontmatter,
	);

	const noteMetadata = getNoteMetadata(app);
	const trimmedBody = templateBody.trim();
	const hasTemplateBody = trimmedBody.length > 0;

	return {
		usedTemplater,
		templaterError,
		mergedFrontmatter,
		templateBody,
		hasTemplateBody,
		noteMetadata,
		mergeCount: Object.keys(mergedFrontmatter).length,
	};
}

export { mergeFrontmatterWithUserInput };
export { convertFormDataToFrontmatter } from '@utils/frontmatter/convert';
export { mergeFrontmatters } from '@utils/frontmatter/merge';
export { getNoteMetadata, updateNoteFrontmatter } from '@utils/frontmatter-editor';
