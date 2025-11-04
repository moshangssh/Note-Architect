## 模板目录重命名监听修复
- `TemplateManager.handleVaultRename` 现在会在监视的模板文件夹被重命名时更新 `watchedFolderPath`，并仅在新路径仍是文件夹时触发重新加载。
- 对文件夹内部文件的重命名仍保持原有逻辑：命中监视范围则触发重新扫描。