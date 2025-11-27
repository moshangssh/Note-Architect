import type NoteArchitect from "@core/plugin";
import { handleError } from "@core/error";
import { DEFAULT_SETTINGS } from "@types";
import type {
  NoteArchitectSettings,
  FrontmatterField,
  FrontmatterFieldDefault,
  FrontmatterPreset,
} from "@types";
import { sanitizeFrontmatterFields } from "@utils/frontmatter/field";

export interface SaveSettingsOptions {
  onAfterSave?: () => void;
  reloadTemplates?: () => Promise<unknown>;
}

type PartialSettings = Partial<NoteArchitectSettings>;

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

  async save(
    settings: NoteArchitectSettings = this.settings,
    options: SaveSettingsOptions = {}
  ): Promise<NoteArchitectSettings> {
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

  async addPreset(
    preset: FrontmatterPreset,
    options?: SaveSettingsOptions
  ): Promise<void> {
    const sanitizedPreset: FrontmatterPreset = {
      ...preset,
      fields: sanitizeFrontmatterFields(preset.fields ?? []),
    };
    this.settings.frontmatterPresets.push(structuredClone(sanitizedPreset));
    await this.save(this.settings, options);
  }

  async replacePresets(
    presets: FrontmatterPreset[],
    options?: SaveSettingsOptions
  ): Promise<void> {
    const sanitizedPresets = presets.map((preset) => ({
      ...preset,
      fields: sanitizeFrontmatterFields(preset.fields ?? []),
    }));
    this.settings.frontmatterPresets = sanitizedPresets.map((preset) =>
      structuredClone(preset)
    );
    await this.save(this.settings, options);
  }

  async appendPresets(
    presets: FrontmatterPreset[],
    options?: SaveSettingsOptions
  ): Promise<void> {
    if (presets.length === 0) {
      return;
    }
    const sanitizedPresets = presets.map((preset) => ({
      ...preset,
      fields: sanitizeFrontmatterFields(preset.fields ?? []),
    }));
    this.settings.frontmatterPresets.push(
      ...sanitizedPresets.map((preset) => structuredClone(preset))
    );
    await this.save(this.settings, options);
  }

  async deletePreset(
    presetId: string,
    options?: SaveSettingsOptions
  ): Promise<void> {
    const targetIndex = this.settings.frontmatterPresets.findIndex(
      (preset) => preset.id === presetId
    );
    if (targetIndex === -1) {
      throw new Error(`未找到 ID 为 "${presetId}" 的预设`);
    }
    this.settings.frontmatterPresets.splice(targetIndex, 1);
    await this.save(this.settings, options);
  }

  async updatePresetFields(
    presetId: string,
    fields: FrontmatterField[],
    options?: SaveSettingsOptions
  ): Promise<void> {
    const preset = this.settings.frontmatterPresets.find(
      (item) => item.id === presetId
    );
    if (!preset) {
      throw new Error(`未找到 ID 为 "${presetId}" 的预设`);
    }
    preset.fields = sanitizeFrontmatterFields(fields);
    await this.save(this.settings, options);
  }

  async addRecentTemplate(
    templateId: string,
    options?: SaveSettingsOptions
  ): Promise<void> {
    const updatedList = this.settings.recentlyUsedTemplates.filter(
      (id) => id !== templateId
    );
    updatedList.unshift(templateId);
    this.settings.recentlyUsedTemplates = updatedList.slice(
      0,
      MAX_RECENT_TEMPLATES
    );
    await this.save(this.settings, options);
  }

  async updateTemplateFolderPath(
    path: string,
    options?: SaveSettingsOptions
  ): Promise<void> {
    const normalizedPath = path.trim().replace(/^\/+|\/+$/g, "");
    this.settings.templateFolderPath = normalizedPath;
    await this.save(this.settings, options);
  }

  async setLastUsedPresetForUpdate(
    presetId: string,
    options?: SaveSettingsOptions
  ): Promise<void> {
    if (this.settings.lastUsedPresetForUpdate === presetId) {
      return;
    }
    this.settings.lastUsedPresetForUpdate = presetId;
    await this.save(this.settings, options);
  }

  private migrateSettingsData(data: PartialSettings): PartialSettings {
    if (!data || typeof data !== "object") {
      return {};
    }

    const sanitizedData: PartialSettings = {
      ...data,
      frontmatterPresets: Array.isArray(data.frontmatterPresets)
        ? data.frontmatterPresets
        : [],
    };

    // 迁移旧的 enableDynamicPresetSelection 配置
    if (
      typeof (data as any).enableDynamicPresetSelection === "boolean" &&
      !data.noPresetBehavior
    ) {
      sanitizedData.noPresetBehavior = (data as any)
        .enableDynamicPresetSelection
        ? "ask"
        : "do-nothing";
    }

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
      defaultDateFormat: this.normalizeDefaultDateFormat(
        migrated.defaultDateFormat
      ),
      frontmatterPresets: this.sanitizeFrontmatterPresets(
        migrated.frontmatterPresets
      ),
    };
  }

  private sanitizeFrontmatterPresets(
    presets: FrontmatterPreset[] | undefined
  ): FrontmatterPreset[] {
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
        fields: sanitizeFrontmatterFields(preset.fields),
      }));
    // 允许创建后再配置字段，因此不再过滤空字段预设
    return normalizedPresets;
  }

  private normalizeDefaultDateFormat(
    value: PartialSettings["defaultDateFormat"]
  ): string {
    if (typeof value !== "string") {
      return DEFAULT_SETTINGS.defaultDateFormat;
    }

    const trimmed = value.trim();
    return trimmed || DEFAULT_SETTINGS.defaultDateFormat;
  }
}
