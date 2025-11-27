# 2025-XX 设置页保存修复
- 背景：SettingsManager.getSettings 返回 structuredClone，NoteArchitectSettingTab 仍直接对 this.settings 赋值并调用 persistSettings()，导致默认日期格式等开关更新时实际未保存。
- 改动：note-architect-setting-tab 添加 updateSettings(draft => void) 辅助，persistSettings 接受可选 settings 参数；所有设置变更（模板路径校验/输入、Templater 集成开关、默认日期格式、动态预设选择）改为通过 updateSettings 获取新副本后保存。
- 影响：设置页修改现在会正确写入并刷新 plugin.settings，避免静默丢失。后续新增设置也应复用 updateSettings。