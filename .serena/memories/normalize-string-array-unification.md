# 多選預設值正規化統一
- 在 `src/utils/data-transformer.ts` 新增 `normalizeStringArray`，專責將未知輸入整理為去重的字串陣列並支援允許選項過濾。
- `TemplateEngine`、`FieldConfigModal`、`FrontmatterManagerModal`、`PresetManager` 與 `SettingsManager` 均改為匯入此工具，移除原本重複的多選預設值清理邏輯。
- 後續處理 multi-select 預設值時請優先使用該工具函式，若需要限定選項記得事先建構非空的 `Set` 傳入。