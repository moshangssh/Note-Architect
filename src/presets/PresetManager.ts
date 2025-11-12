import type { SaveSettingsOptions, SettingsManager } from '@settings';
import type {
	NoteArchitectSettings,
	FrontmatterField,
	FrontmatterPreset,
} from '@types';
import {
	cloneFrontmatterField,
	normalizeFieldDefault,
	sanitizeFrontmatterField,
} from '@utils/frontmatter/field';
import {
	generateUniquePresetId as generateUniquePresetIdUtil,
	generateUniquePresetIdFromOriginalId,
} from '@utils/preset-id';

export type PresetImportStrategy = 'merge' | 'replace';

export interface ImportPresetsOptions {
	strategy?: PresetImportStrategy;
	saveOptions?: SaveSettingsOptions;
}

export interface ImportPresetsResult {
	strategy: PresetImportStrategy;
	appliedPresets: FrontmatterPreset[];
	renamedPresets: Array<{ originalId: string; newId: string }>;
}

export interface PresetCollectionExportPayload {
	type: 'note-architect-presets';
	version: 1;
	exportedAt: string;
	presets: FrontmatterPreset[];
}

export class PresetImportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PresetImportError';
	}
}

export interface PresetIdValidationResult {
	isValid: boolean;
	error?: string;
}

export interface CreatePresetPayload {
	id?: string;
	name: string;
	fields?: FrontmatterField[];
}

export interface RenamePresetOptions {
	newId?: string;
	saveOptions?: SaveSettingsOptions;
}

export interface RenamePresetResult {
	preset: FrontmatterPreset;
	previousId: string;
	idChanged: boolean;
}

export class PresetManager {
	private saveOptionsFactory?: () => SaveSettingsOptions | undefined;

	constructor(
		private readonly settingsManager: SettingsManager,
		saveOptionsFactory?: () => SaveSettingsOptions | undefined,
	) {
		this.saveOptionsFactory = saveOptionsFactory;
	}

	private get settings(): NoteArchitectSettings {
		return this.settingsManager.getSettings();
	}

	private get presets(): FrontmatterPreset[] {
		return this.settings.frontmatterPresets;
	}

	setSaveOptionsFactory(factory?: () => SaveSettingsOptions | undefined): void {
		this.saveOptionsFactory = factory;
	}

	generateUniquePresetId(name: string): string {
		return generateUniquePresetIdUtil(name, {
			existingIds: this.presets.map(preset => preset.id),
			isValidId: (candidate) => this.isPresetIdFormatValid(candidate),
			isIdAvailable: (candidate) => !this.getPresetById(candidate),
		});
	}

	private isPresetIdFormatValid(id: string): boolean {
		return this.getPresetIdFormatError(id) === null;
	}

	private getPresetIdFormatError(id: string): string | null {
		if (!id) {
			return '预设ID不能为空';
		}

		if (id.length < 2) {
			return '预设ID长度至少为2个字符';
		}

		if (id.length > 50) {
			return '预设ID长度不能超过50个字符';
		}

		if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id)) {
			return '预设ID只能包含字母、数字、连字符和下划线，且必须以字母开头';
		}

		return null;
	}

	getPresets(): FrontmatterPreset[] {
		return this.presets;
	}

	getPresetById(presetId: string): FrontmatterPreset | undefined {
		return this.presets.find((preset) => preset.id === presetId);
	}

	exportAllPresets(): string {
		const payload: PresetCollectionExportPayload = {
			type: 'note-architect-presets',
			version: 1,
			exportedAt: new Date().toISOString(),
			presets: this.presets.map((preset) => ({
				id: preset.id,
				name: preset.name,
				fields: preset.fields.map((field) => ({
					key: field.key,
					type: field.type,
					label: field.label,
					default: Array.isArray(field.default) ? [...field.default] : field.default,
					...(Array.isArray(field.options) && field.options.length > 0
						? { options: [...field.options] }
						: {}),
					...(field.useTemplaterTimestamp ? { useTemplaterTimestamp: true } : {}),
				})),
			})),
		};

		return JSON.stringify(payload, null, 2);
	}

	async importPresets(
		jsonString: string,
		options: ImportPresetsOptions = {},
	): Promise<ImportPresetsResult> {
		const sanitizedPresets = this.parseImportedPresets(jsonString);
		if (sanitizedPresets.length === 0) {
			throw new PresetImportError('导入失败：未找到任何预设定义');
		}

		const strategy: PresetImportStrategy = options.strategy ?? 'merge';
		const renamedPresets: Array<{ originalId: string; newId: string }> = [];
		let appliedPresets: FrontmatterPreset[] = [];
		const saveOptions = this.buildSaveOptions(options.saveOptions);

		if (strategy === 'replace') {
			const clonedPresets = sanitizedPresets.map((preset) => ({
				id: preset.id,
				name: preset.name,
				fields: preset.fields.map((field) => cloneFrontmatterField(field)),
			}));

			await this.settingsManager.replacePresets(clonedPresets, saveOptions);

			appliedPresets = clonedPresets.map((preset) => ({
				id: preset.id,
				name: preset.name,
				fields: preset.fields.map((field) => cloneFrontmatterField(field)),
			}));
		} else {
			const newlyAdded: FrontmatterPreset[] = [];
			const existingIds = new Set(this.presets.map((preset) => preset.id));
			const presetsToAppend: FrontmatterPreset[] = [];

			for (const preset of sanitizedPresets) {
				let targetId = preset.id;
				if (existingIds.has(targetId)) {
					const generatedId = generateUniquePresetIdFromOriginalId(preset.id, {
						existingIds: existingIds,
						isValidId: (candidate) => this.isPresetIdFormatValid(candidate),
						isIdAvailable: (candidate) => !this.getPresetById(candidate),
					});
					renamedPresets.push({ originalId: preset.id, newId: generatedId });
					targetId = generatedId;
				}

				const newPreset: FrontmatterPreset = {
					id: targetId,
					name: preset.name,
					fields: preset.fields.map((field) => cloneFrontmatterField(field)),
				};

				presetsToAppend.push(newPreset);
				existingIds.add(targetId);

				newlyAdded.push({
					id: newPreset.id,
					name: newPreset.name,
					fields: newPreset.fields.map((field) => cloneFrontmatterField(field)),
				});
			}

			if (presetsToAppend.length > 0) {
				await this.settingsManager.appendPresets(presetsToAppend, saveOptions);
			}

			appliedPresets = newlyAdded;
		}

		return {
			strategy,
			appliedPresets,
			renamedPresets,
		};
	}

	validateFormData(
		preset: FrontmatterPreset,
		formData: Record<string, unknown>,
	): { isValid: boolean; errors: string[]; fieldErrors: Record<string, string[]> } {
		const errors: string[] = [];
		const fieldErrors: Record<string, string[]> = {};

		const appendFieldError = (fieldKey: string, inlineMessage: string, summaryMessage: string): void => {
			errors.push(summaryMessage);
			if (!fieldErrors[fieldKey]) {
				fieldErrors[fieldKey] = [];
			}
			fieldErrors[fieldKey].push(inlineMessage);
		};

		preset.fields.forEach((field, index) => {
			const value = formData[field.key];
			const fieldKey = field.key || `__index_${index}`;

			if (field.type === 'date') {
				if (field.useTemplaterTimestamp) {
					return;
				}

				if (value && typeof value === 'string' && value.trim() !== '') {
					const date = new Date(value as string);
					if (isNaN(date.getTime())) {
						appendFieldError(
							fieldKey,
							'请输入有效的日期格式',
							`字段 "${field.label}" 的日期格式无效`
						);
					}
				}
			}
		});

		return {
			isValid: errors.length === 0,
			errors,
			fieldErrors,
		};
	}

	validatePresetId(id: string): PresetIdValidationResult {
		const trimmedId = id.trim();

		const formatError = this.getPresetIdFormatError(trimmedId);
		if (formatError) {
			return { isValid: false, error: formatError };
		}

		const existingPreset = this.getPresetById(trimmedId);
		if (existingPreset) {
			return {
				isValid: false,
				error: `预设ID "${trimmedId}" 已存在，请使用其他ID`,
			};
		}

		return { isValid: true };
	}

	validatePresetIdForUpdate(
		id: string,
		options: { ignorePresetId?: string } = {},
	): PresetIdValidationResult {
		const trimmedId = id.trim();

		const formatError = this.getPresetIdFormatError(trimmedId);
		if (formatError) {
			return { isValid: false, error: formatError };
		}

		const conflict = this.presets.find(
			(preset) => preset.id === trimmedId && preset.id !== options.ignorePresetId,
		);

		if (conflict) {
			return {
				isValid: false,
				error: `预设ID "${trimmedId}" 已存在，请使用其他ID`,
			};
		}

		return { isValid: true };
	}

	async createPreset(
		payload: CreatePresetPayload,
		options?: SaveSettingsOptions,
	): Promise<FrontmatterPreset> {
		const trimmedName = payload.name.trim();
		if (!trimmedName) {
			throw new Error('预设名称不能为空');
		}

		let presetId = payload.id?.trim();

		if (presetId) {
			const validation = this.validatePresetId(presetId);
			if (!validation.isValid) {
				throw new Error(validation.error ?? '预设ID无效');
			}
		} else {
			presetId = this.generateUniquePresetId(trimmedName);
			const validation = this.validatePresetId(presetId);
			if (!validation.isValid) {
				throw new Error(validation.error ?? '预设ID无效');
			}
		}

		const newPreset: FrontmatterPreset = {
			id: presetId,
			name: trimmedName,
			fields: payload.fields?.map((field) => cloneFrontmatterField(field)) ?? [],
		};

		await this.settingsManager.addPreset(newPreset, this.buildSaveOptions(options));

		return newPreset;
	}

	async renamePresetWithIdChange(
		presetId: string,
		newName: string,
		options?: RenamePresetOptions,
	): Promise<RenamePresetResult> {
		const trimmedName = newName.trim();
		if (!trimmedName) {
			throw new Error('预设名称不能为空');
		}

		const settingsSnapshot = this.settingsManager.getSettings();
		const preset = settingsSnapshot.frontmatterPresets.find((item) => item.id === presetId);
		if (!preset) {
			throw new Error(`未找到 ID 为 "${presetId}" 的预设`);
		}

		const previousId = preset.id;
		let targetId = previousId;
		let idChanged = false;

		if (options?.newId !== undefined) {
			const candidateId = options.newId.trim();
			if (!candidateId) {
				throw new Error('预设ID不能为空');
			}
			if (candidateId !== previousId) {
				const validation = this.validatePresetIdForUpdate(candidateId, {
					ignorePresetId: previousId,
				});
				if (!validation.isValid) {
					throw new Error(validation.error ?? '预设ID无效');
				}
				targetId = candidateId;
				idChanged = true;
			}
		}

		const nameChanged = preset.name !== trimmedName;
		if (!nameChanged && !idChanged) {
			return { preset, previousId, idChanged: false };
		}

		if (nameChanged) {
			preset.name = trimmedName;
		}

		if (idChanged) {
			preset.id = targetId;
		}

		const saveOptions = this.buildSaveOptions(options?.saveOptions);
		await this.settingsManager.save(settingsSnapshot, saveOptions);

		return { preset, previousId, idChanged };
	}

	async renamePreset(
		presetId: string,
		newName: string,
		options?: SaveSettingsOptions,
	): Promise<FrontmatterPreset> {
		const result = await this.renamePresetWithIdChange(presetId, newName, {
			saveOptions: options,
		});
		return result.preset;
	}

	async deletePreset(
		presetId: string,
		options?: SaveSettingsOptions,
	): Promise<void> {
		await this.settingsManager.deletePreset(presetId, this.buildSaveOptions(options));
	}

	async updatePresetFields(
		presetId: string,
		fields: FrontmatterField[],
		options?: SaveSettingsOptions,
	): Promise<FrontmatterPreset> {
		await this.settingsManager.updatePresetFields(
			presetId,
			fields.map((field) => cloneFrontmatterField(field)),
			this.buildSaveOptions(options),
		);

		const updatedPreset = this.getPresetById(presetId);
		if (!updatedPreset) {
			throw new Error(`未找到 ID 为 "${presetId}" 的预设`);
		}
		return updatedPreset;
	}

	private buildSaveOptions(
		options?: SaveSettingsOptions,
	): SaveSettingsOptions | undefined {
		const defaultOptions = this.saveOptionsFactory?.();
		if (!defaultOptions && !options) {
			return undefined;
		}

		return {
			...(defaultOptions ?? {}),
			...(options ?? {}),
		};
	}

	private parseImportedPresets(jsonString: string): FrontmatterPreset[] {
		let rawData: unknown;

		try {
			rawData = JSON.parse(jsonString);
		} catch {
			throw new PresetImportError('导入失败：无法解析 JSON 数据');
		}

		const payload = this.extractPresetsPayload(rawData);
		if (!Array.isArray(payload)) {
			throw new PresetImportError('导入失败：数据格式无效');
		}

		const sanitizedPresets = payload.map((preset, index) => this.sanitizeImportedPreset(preset, index));

		const seenIds = new Set<string>();
		for (const preset of sanitizedPresets) {
			if (seenIds.has(preset.id)) {
				throw new PresetImportError(`导入失败：存在重复的预设 ID "${preset.id}"`);
			}
			seenIds.add(preset.id);
		}

		return sanitizedPresets;
	}

	private extractPresetsPayload(rawData: unknown): unknown {
		if (Array.isArray(rawData)) {
			return rawData;
		}

		if (!rawData || typeof rawData !== 'object') {
			throw new PresetImportError('导入失败：数据格式无效');
		}

		if ('presets' in rawData) {
			const structured = rawData as Partial<PresetCollectionExportPayload> & { presets?: unknown };
			if (structured.type && structured.type !== 'note-architect-presets') {
				throw new PresetImportError('导入失败：JSON 类型标识不匹配');
			}
			if (!Array.isArray(structured.presets)) {
				throw new PresetImportError('导入失败：缺少有效的预设列表');
			}
			return structured.presets;
		}

		if ('preset' in rawData) {
			const legacy = rawData as { preset?: unknown };
			return legacy.preset ? [legacy.preset] : [];
		}

		return [rawData];
	}

	private sanitizeImportedPreset(data: unknown, presetIndex: number): FrontmatterPreset {
		if (!data || typeof data !== 'object') {
			throw new PresetImportError(`导入失败：第 ${presetIndex + 1} 个预设数据格式无效`);
		}

		const { id, name, fields } = data as Partial<FrontmatterPreset>;

		if (typeof id !== 'string' || !id.trim()) {
			throw new PresetImportError(`导入失败：第 ${presetIndex + 1} 个预设缺少有效的 ID`);
		}

		const trimmedId = id.trim();
		if (!this.isPresetIdFormatValid(trimmedId)) {
			throw new PresetImportError(`导入失败：第 ${presetIndex + 1} 个预设的 ID "${trimmedId}" 格式无效`);
		}

		if (typeof name !== 'string' || !name.trim()) {
			throw new PresetImportError(`导入失败：第 ${presetIndex + 1} 个预设缺少名称`);
		}

		if (!Array.isArray(fields)) {
			throw new PresetImportError(`导入失败：第 ${presetIndex + 1} 个预设的字段数据格式无效`);
		}

		const sanitizedFields = fields.map((field, fieldIndex) =>
			this.sanitizeImportedField(field, presetIndex, fieldIndex),
		);

		return {
			id: trimmedId,
			name: name.trim(),
			fields: sanitizedFields,
		};
	}

	private sanitizeImportedField(field: unknown, presetIndex: number, fieldIndex: number): FrontmatterField {
		try {
			const sanitized = sanitizeFrontmatterField(field, { strict: true });
			if (!sanitized) {
				throw new Error('字段为空');
			}
			return sanitized;
		} catch (error) {
			const message = error instanceof Error ? error.message : '未知错误';
			throw new PresetImportError(
				`导入失败：第 ${presetIndex + 1} 个预设的第 ${fieldIndex + 1} 个字段 ${message}`,
			);
		}
	}
}
