export type FrontmatterFieldType = "text" | "select" | "date" | "multi-select";
export type FrontmatterFieldDefault = string | string[];

export interface FrontmatterField {
  key: string;
  type: FrontmatterFieldType;
  label: string;
  default: FrontmatterFieldDefault;
  options?: string[];
  useTemplaterTimestamp?: boolean;
  description?: string;
}

export interface FrontmatterPreset {
  id: string;
  name: string;
  fields: FrontmatterField[];
  description?: string;
}

// 未绑定预设时的行为策略
export type NoPresetBehavior = "ask" | "use-default" | "do-nothing";

export interface NoteArchitectSettings {
  templateFolderPath: string;
  enableTemplaterIntegration: boolean;
  frontmatterPresets: FrontmatterPreset[];
  defaultDateFormat: string;
  recentlyUsedTemplates: string[];
  // 未绑定预设时的行为策略
  noPresetBehavior: NoPresetBehavior;
  // 默认预设 ID (当 noPresetBehavior 为 'use-default' 时使用)
  defaultPresetId: string;
  lastUsedPresetForUpdate?: string;
}

export const DEFAULT_SETTINGS: NoteArchitectSettings = {
  templateFolderPath: "Templates",
  enableTemplaterIntegration: true,
  frontmatterPresets: [],
  defaultDateFormat: "YYYYMMDDHHmmss",
  recentlyUsedTemplates: [],
  noPresetBehavior: "ask", // 保持向后兼容，默认为询问
  defaultPresetId: "",
  lastUsedPresetForUpdate: undefined,
};
