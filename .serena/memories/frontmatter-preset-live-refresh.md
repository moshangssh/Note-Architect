# 前置需求
- 模板插入流程需要始终读取最新的 frontmatter 预设配置，避免使用已缓存的 `plugin.settings.frontmatterPresets`。

# 2025-??-?? 更新
- `TemplateSelectorModal` 新增 `getAvailablePresets()`，统一通过 `presetManager.getPresets()` 读取实时预设，并据此匹配/判定动态选择。
- `DynamicPresetSelectorModal` 构造时也改为通过 `presetManager` 拉取最新预设，保证匹配结果不会滞后。