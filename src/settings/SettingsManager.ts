import type NoteArchitect from "@core/plugin";
import { handleError } from "@core/error";
import { DEFAULT_SETTINGS } from "@types";
import type {
	NoteArchitectSettings,
	FrontmatterField,
	FrontmatterFieldDefault,
	FrontmatterPreset,
} from "@types";
import { normalizeStringArray } from "@utils/data-transformer";

export interface SaveSettingsOptions {
	onAfterSave?: () => void;
	reloadTemplates?: () => Promise<unknown>;
}

type PartialSettings = Partial<NoteArchitectSettings>;

const VALID_FIELD_TYPES: FrontmatterField["type"][] = ["text", "select", "date", "multi-select"];
const MAX_RECENT_TEMPLATES = 5;

export class SettingsManager {
	private readonly plugin: NoteArchitect;
	private settings: NoteArchitectSettings;

	constructor(plugin: NoteArchitect) {
		this.plugin = plugin;
		this.settings = { ...DEFAULT_SETTINGS };
	}

	getSettings(): NoteArchitectSettings {
		return structuredClone(this.settings);
	}

	async load(): Promise<NoteArchitectSettings> {
		try {
			const rawData = await this.plugin.loadData();
			this.settings = this.normalizeSettings(rawData as PartialSettings);
		} catch (error) {
			handleError(error, {
				context: "SettingsManager.load",
				userMessage: "Note Architect: 加载设置失败，使用默认设置",
			});
			this.settings = { ...DEFAULT_SETTINGS };
		}

		return this.settings;
	}

	async save(settings: NoteArchitectSettings = this.settings, options: SaveSettingsOptions = {}): Promise<NoteArchitectSettings> {
		this.settings = this.normalizeSettings(settings);

		try {
			await this.plugin.saveData(this.settings);

			options.onAfterSave?.();
			if (options.reloadTemplates) {
				await options.reloadTemplates();
			}
		} catch (error) {
			handleError(error, {
				context: "SettingsManager.save",
				userMessage: "Note Architect: 保存设置失败",
			});
		}

		return this.settings;
	}

	async addPreset(preset: FrontmatterPreset, options?: SaveSettingsOptions): Promise<void> {
		const sanitizedPreset: FrontmatterPreset = {
			...preset,
			fields: this.sanitizeFrontmatterFields(preset.fields ?? []),
		};
		this.settings.frontmatterPresets.push(structuredClone(sanitizedPreset));
		await this.save(this.settings, options);
	}

	async deletePreset(presetId: string, options?: SaveSettingsOptions): Promise<void> {
		const targetIndex = this.settings.frontmatterPresets.findIndex((preset) => preset.id === presetId);
		if (targetIndex === -1) {
			throw new Error(`未找到 ID 为 "${presetId}" 的预设`);
		}
		this.settings.frontmatterPresets.splice(targetIndex, 1);
		await this.save(this.settings, options);
	}

	async updatePresetFields(
		presetId: string,
		fields: FrontmatterField[],
		options?: SaveSettingsOptions,
	): Promise<void> {
		const preset = this.settings.frontmatterPresets.find((item) => item.id === presetId);
		if (!preset) {
			throw new Error(`未找到 ID 为 "${presetId}" 的预设`);
		}
		preset.fields = this.sanitizeFrontmatterFields(fields);
		await this.save(this.settings, options);
	}

	async addRecentTemplate(templateId: string, options?: SaveSettingsOptions): Promise<void> {
		const updatedList = this.settings.recentlyUsedTemplates.filter((id) => id !== templateId);
		updatedList.unshift(templateId);
		this.settings.recentlyUsedTemplates = updatedList.slice(0, MAX_RECENT_TEMPLATES);
		await this.save(this.settings, options);
	}

	async updateTemplateFolderPath(path: string, options?: SaveSettingsOptions): Promise<void> {
		const normalizedPath = path.trim().replace(/^\/+|\/+$/g, "");
		this.settings.templateFolderPath = normalizedPath;
		await this.save(this.settings, options);
	}

	private migrateSettingsData(data: PartialSettings): PartialSettings {
		if (!data || typeof data !== "object") {
			return {};
		}

		const sanitizedData: PartialSettings = {
			...data,
			frontmatterPresets: Array.isArray(data.frontmatterPresets) ? data.frontmatterPresets : [],
		};

		if (typeof data.defaultDateFormat === "string") {
			const trimmed = data.defaultDateFormat.trim();
			if (trimmed) {
				sanitizedData.defaultDateFormat = trimmed;
			} else {
				delete sanitizedData.defaultDateFormat;
			}
		}

		return sanitizedData;
	}

	private normalizeSettings(data: PartialSettings): NoteArchitectSettings {
		const migrated = this.migrateSettingsData(data);

		return {
			...DEFAULT_SETTINGS,
			...migrated,
			defaultDateFormat: this.normalizeDefaultDateFormat(migrated.defaultDateFormat),
			frontmatterPresets: this.sanitizeFrontmatterPresets(migrated.frontmatterPresets),
		};
	}

	private sanitizeFrontmatterPresets(presets: FrontmatterPreset[] | undefined): FrontmatterPreset[] {
		if (!Array.isArray(presets)) {
			return [];
		}

		const normalizedPresets = presets
			.filter((preset) => {
				return Boolean(
					preset &&
					typeof preset === "object" &&
					preset.id &&
					preset.name &&
					Array.isArray(preset.fields)
				);
			})
			.map((preset) => ({
				...preset,
				fields: this.sanitizeFrontmatterFields(preset.fields),
			}));
		// 允许创建后再配置字段，因此不再过滤空字段预设
		return normalizedPresets;
	}

	private sanitizeFrontmatterFields(fields: FrontmatterField[]): FrontmatterField[] {
		return fields
			.filter((field) => {
				return Boolean(
					field &&
					typeof field === "object" &&
					field.key &&
					field.type &&
					field.label
				);
			})
			.map((field) => {
				const type = VALID_FIELD_TYPES.includes(field.type) ? field.type : "text";
				const sanitizedDefault = this.normalizeFieldDefault(type, field.default);
				const sanitized: FrontmatterField = {
					key: field.key,
					type,
					label: field.label,
					default: sanitizedDefault,
				};

				if (Array.isArray(field.options) && field.options.length > 0) {
					sanitized.options = field.options.map((option) => String(option).trim()).filter(Boolean);
				}

				if (field.useTemplaterTimestamp === true) {
					sanitized.useTemplaterTimestamp = true;
				}

				return sanitized;
			});
	}

	private normalizeFieldDefault(
		type: FrontmatterField["type"],
		rawDefault: unknown,
	): FrontmatterFieldDefault {
		if (type === "multi-select") {
			return normalizeStringArray(rawDefault);
		}

		if (typeof rawDefault === "string") {
			return rawDefault;
		}

		if (rawDefault === undefined || rawDefault === null) {
			return "";
		}

		return String(rawDefault);
	}

	private normalizeDefaultDateFormat(value: PartialSettings["defaultDateFormat"]): string {
		if (typeof value !== "string") {
			return DEFAULT_SETTINGS.defaultDateFormat;
		}

		const trimmed = value.trim();
		return trimmed || DEFAULT_SETTINGS.defaultDateFormat;
	}
}
