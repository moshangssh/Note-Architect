# 2025-05-10 设置保存精简
- SettingsManager.save 现已直接调用 plugin.saveData(this.settings)，依赖 normalizeSettings 输出的数据结构，无需再手写 serializeSettings。
- sanitizeFrontmatterPresets 仍负责过滤与裁剪字段，后续更新设置结构时应在 normalizeSettings 中扩展默认值与迁移逻辑。
- ui 相关逻辑缓存了 NoteArchitect 实例属性，避免重复类型转换，可直接访问 templateManager 等子管理器。