# 2025-03-17 Frontmatter 合併預設行為
- 設定項 `enableFrontmatterMerge` 已移除，前置資料合併成為唯一行為。
- `TemplateSelectorModal` 僅呼叫 `insertTemplateWithFrontmatterMerge`，失敗時仍插入經 Templater 處理後的內容。
- UI 設定面板不再顯示 frontmatter 合併開關，資料檔 `data.json` 不再保存此欄位。