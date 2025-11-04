# SettingsManager 持久化入口统一
- 仅 SettingsManager.save 内部会调用 plugin.saveData；所有变更都必须通过 SettingsManager 公共方法完成。
- addPreset/deletePreset/updatePresetFields/addRecentTemplate/updateTemplateFolderPath 现在在更新 this.settings 后会立即 await this.save(..., options)。
- PresetManager 调用上述方法时传入合并后的 SaveSettingsOptions；renamePresetWithIdChange 会获取 settings 快照修改后直接 save(snapshot, options)。
- NoteArchitect 通过 settingsManager.addRecentTemplate/updateTemplateFolderPath 传入默认 SaveSettingsOptions，并在完成后使用 getSettings() 刷新 this.settings。