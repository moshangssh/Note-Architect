# Frontmatter 管理模态按钮样式统一
- 2025-XX 调整：frontmatter 管理模态的确认按钮改为仅使用 Obsidian 原生 `mod-cta` 类，取消按钮不再附加自定义类名。
- `styles.css` 中 `.note-architect-form-btn` 以及 `--cancel`、`--confirm` 相关样式全部删除，后续按钮样式应依赖 Obsidian 原生样式。
- 若需要自定义按钮样式，请优先复用 `mod-cta` 或 Obsidian 默认类，避免恢复旧的 `note-architect-form-btn`。