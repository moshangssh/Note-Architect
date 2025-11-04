## 模板目录扫描优化
- `TemplateManager.loadTemplates` 现改用 `collectTemplateFiles`，直接遍历模板文件夹及其子目录，避免 `vault.getFiles()` 全库扫描导致的性能问题。
- 引入 `collectTemplateFiles(folder: TFolder)` 辅助方法，使用栈深度遍历并仅收集 `.md` 文件。
- `watchedFolderPath` 逻辑保持不变，`npm run build` 已验证通过。