# 2025-03-20 Frontmatter 解析統一
- `TemplateEngine.parseTemplateContent` 現在直接重用 `parseFrontmatter`，避免分散的正則與 YAML 解析實作。
- 當解析失敗時仍會回退為空 frontmatter 並記錄警告訊息。
- 正常情況下保持 trimmed body（僅對存在 frontmatter 的內容修剪）。