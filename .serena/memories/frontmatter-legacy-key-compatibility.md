# 2025-03-16 前置件 note-architect-config 向後相容
- frontmatter 標籤 `fast-templater-config` 被視為舊版鍵，與 `note-architect-config` 共用解析流程。
- `resolvePresetConfigIds` 會優先使用新鍵，若不存在則回退到舊鍵；`stripPresetConfigKeys` 用於寫回時移除所有舊鍵。
- 插入模板、綁定/解除預設以及預設重命名流程均改為套用上述工具，確保既有模板仍能讀取舊鍵並在寫入時轉換為新鍵。