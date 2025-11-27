## 2025-11-22 TemplatePresetBindingModal createFragment 兼容修复
- 背景：Obsidian 运行环境报 `(0 , createFragment) is not a function`，`obsidian.createFragment` 在当前版本不可用，导致 TemplatePresetBindingModal 渲染描述时报错。
- 处理：移除 `createFragment` 引用，改用原生 `document.createDocumentFragment` 和 `document.createElement` 组装描述片段，保留原有文本与样式类；新增 `buildPresetDesc` 辅助函数。
- 额外：`handleClear` 调用 runWithBusy 时优先取 `triggerEl.buttonEl`，兼容测试桩与按钮元素两种传参形式。
- 验证：`npm test -- template-preset-binding-modal` 通过（仅有 ts-jest 旧配置警告）。