import type { FrontmatterPreset, Template } from '@types';
import * as TemplateEngine from '@engine';

export interface PresetMatchResult {
	preset: FrontmatterPreset;
	score: number;
	reasons: string[];
}

export interface PresetMatchOptions {
	enableFieldNameMatching?: boolean;
	fieldNameWeight?: number;
	filenameMatchWeight?: number;
}

interface TemplateAnalysis {
	variables: string[];
	variableSet: Set<string>;
	templateNameLower: string;
	templatePathLower: string;
	normalizedTemplateName: string;
	normalizedTemplatePath: string;
}

export class PresetMatcher {
	private static readonly DEFAULT_OPTIONS: Required<PresetMatchOptions> = {
		enableFieldNameMatching: true,
		fieldNameWeight: 0.3,
		filenameMatchWeight: 0.7,
	};

	/**
	 * 为给定模板匹配最合适的预设
	 * @param template 模板对象
	 * @param presets 可用预设列表
	 * @param options 匹配选项
	 * @returns 匹配结果列表，按评分降序排列
	 */
	static matchPresets(
		template: Template,
		presets: FrontmatterPreset[],
		options: PresetMatchOptions = {}
	): PresetMatchResult[] {
		const opts = { ...this.DEFAULT_OPTIONS, ...options };
		const analysis = this.analyzeTemplate(template);
		const results: PresetMatchResult[] = [];

		for (const preset of presets) {
			const result = this.calculateMatchScore(analysis, preset, opts);
			results.push(result);
		}

		// 按评分降序排列
		return results.sort((a, b) => b.score - a.score);
	}

	/**
	 * 获取最佳匹配预设
	 * @param template 模板对象
	 * @param presets 可用预设列表
	 * @param options 匹配选项
	 * @returns 最佳匹配预设，如果没有匹配则返回null
	 */
	static getBestMatch(
		template: Template,
		presets: FrontmatterPreset[],
		options: PresetMatchOptions = {}
	): PresetMatchResult | null {
		const results = this.matchPresets(template, presets, options);
		return results.length > 0 && results[0].score > 0 ? results[0] : null;
	}

	/**
	 * 计算模板与预设的匹配评分
	 * @param analysis 模板分析数据
	 * @param preset 预设对象
	 * @param options 匹配选项
	 * @returns 匹配结果
	 */
	private static calculateMatchScore(
		analysis: TemplateAnalysis,
		preset: FrontmatterPreset,
		options: Required<PresetMatchOptions>
	): PresetMatchResult {
		const reasons: string[] = [];
		let totalScore = 0;

		// 1. 文件名命中预设 ID
		if (this.doesTemplateFilenameIncludePresetId(analysis, preset)) {
			totalScore += options.filenameMatchWeight;
			reasons.push('文件名命中：模板文件名包含预设 ID 线索');
		}

		// 2. 字段名匹配评分
		if (options.enableFieldNameMatching) {
			const fieldNameScore = this.calculateFieldNameScore(analysis, preset);
			if (fieldNameScore > 0) {
				totalScore += fieldNameScore * options.fieldNameWeight;
				reasons.push(`字段名匹配度: ${Math.round(fieldNameScore * 100)}%`);
			}
		}

		// 基础评分（至少有字段定义）
		if (preset.fields && preset.fields.length > 0 && totalScore === 0) {
			totalScore = 0.1; // 给一个很小的基础分
			reasons.push('基础匹配：预设包含字段定义');
		}

		return {
			preset,
			score: Math.min(totalScore, 1.0), // 确保评分不超过1.0
			reasons,
		};
	}

	/**
	 * 计算字段名匹配评分
	 */
	private static calculateFieldNameScore(analysis: TemplateAnalysis, preset: FrontmatterPreset): number {
		if (!preset.fields || preset.fields.length === 0) return 0;

		if (analysis.variables.length === 0) return 0;

		let matches = 0;
		for (const field of preset.fields) {
			if (field.key && analysis.variableSet.has(field.key)) {
				matches++;
			}
		}

		return matches / analysis.variables.length;
	}

	/**
	 * 提取模板中的变量引用
	 */
	private static extractTemplateVariables(content: string): string[] {
		const variables = new Set<string>();

		// 匹配 {{variable}} 格式的变量
		const varMatches = content.match(/\{\{([^}]+)\}\}/g);
		if (varMatches) {
			for (const match of varMatches) {
				const varName = match.slice(2, -2).trim();
				variables.add(varName);
			}
		}

		// 匹配 frontmatter 中的变量引用
		const templateData = TemplateEngine.parseTemplateContent(content);
		if (templateData.frontmatter) {
			for (const [key, value] of Object.entries(templateData.frontmatter)) {
				if (typeof value === 'string' && value.includes('{{')) {
					variables.add(key);
				}
			}
		}

		return Array.from(variables);
	}

	/**
	 * 构建模板分析数据，避免重复解析和匹配
	 */
	private static analyzeTemplate(template: Template): TemplateAnalysis {
		const variables = this.extractTemplateVariables(template.content);
		const templateNameLower = template.name.toLowerCase();
		const templatePathLower = template.path.toLowerCase();
		return {
			variables,
			variableSet: new Set(variables),
			templateNameLower,
			templatePathLower,
			normalizedTemplateName: templateNameLower.replace(/[^a-z0-9]+/g, ''),
			normalizedTemplatePath: templatePathLower.replace(/[^a-z0-9]+/g, ''),
		};
	}

	/**
	 * 判断预设 ID 是否出现在模板文件名或路径中
	 */
	private static doesTemplateFilenameIncludePresetId(analysis: TemplateAnalysis, preset: FrontmatterPreset): boolean {
		const presetId = preset.id?.trim();
		if (!presetId) return false;

		const presetIdLower = presetId.toLowerCase();
		if (analysis.templateNameLower.includes(presetIdLower) || analysis.templatePathLower.includes(presetIdLower)) {
			return true;
		}

		const normalizedPresetId = presetIdLower.replace(/[^a-z0-9]+/g, '');
		if (normalizedPresetId) {
			if (analysis.normalizedTemplateName.includes(normalizedPresetId) || analysis.normalizedTemplatePath.includes(normalizedPresetId)) {
				return true;
			}
		}

		const idTokens = presetIdLower.split(/[^a-z0-9]+/).filter(token => token.length >= 3);
		for (const token of idTokens) {
			if (analysis.templateNameLower.includes(token) || analysis.templatePathLower.includes(token)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * 获取预设的推荐语
	 */
	static getRecommendationText(result: PresetMatchResult): string {
		if (result.score >= 0.8) {
			return `强烈推荐：${result.preset.name}（高度匹配）`;
		} else if (result.score >= 0.5) {
			return `推荐：${result.preset.name}（匹配度良好）`;
		} else if (result.score >= 0.3) {
			return `可考虑：${result.preset.name}（部分匹配）`;
		} else {
			return `${result.preset.name}（匹配度较低）`;
		}
	}
}
