# 2025-05-17 Multi-select 預設值支援
- FrontmatterField.default 現在支援 string | string[]，SettingsManager 與 PresetManager 會去除空值與重複並保持 options 限制。
- FieldConfigModal 新增多選預設值勾選介面，切換類型時會自動轉換 default 型態。
- FrontmatterManagerModal 會尊重陣列預設值，UI 預勾選多個選項並過濾無效值。
- TemplateEngine.extractPresetDefaults 會輸出多選預設值陣列，合併流程保持 YAML 陣列語義。
- 測試建議使用 `npm test -- --runInBand` 避免 Windows 上的 Jest worker crash。