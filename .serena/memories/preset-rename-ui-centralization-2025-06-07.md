# 预设重命名 UI 流程集中化
- 2025-06-07：将 `PresetItemUI` 的重命名回调改为只透传请求，上层 `NoteArchitectSettingTab` 统一调用 `presetManager.renamePresetWithIdChange`。
- 成功/失败后由 SettingTab 主动调用 `presetManager.getPresets()` 并通过 `renderPresetsList` 全量刷新列表，禁止局部状态同步。
- 重命名过程中移除 UI 子组件对 `preset` 实例的任何直接修改，确保唯一数据源来自 `PresetManager`。