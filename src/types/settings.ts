export type FrontmatterFieldType = 'text' | 'select' | 'date' | 'multi-select';
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

export interface NoteArchitectSettings {
  templateFolderPath: string;
  enableTemplaterIntegration: boolean;
  frontmatterPresets: FrontmatterPreset[];
  defaultDateFormat: string;
  recentlyUsedTemplates: string[];
  enableDynamicPresetSelection: boolean;
}

export const DEFAULT_SETTINGS: NoteArchitectSettings = {
  templateFolderPath: 'Templates',
  enableTemplaterIntegration: true,
  frontmatterPresets: [],
  defaultDateFormat: 'YYYYMMDDHHmmss',
  recentlyUsedTemplates: [],
  enableDynamicPresetSelection: true,
};
