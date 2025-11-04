# TemplatePresetBindingModal I/O 优化
- `UiRegistrar.openTemplatePresetBindingModal` 只读取一次模板内容，并将 `Template` 对象传入 `onBind`，防止重复读取。
- `bindPresetToTemplate` 优先使用回调传入的模板内容，并在写回成功后更新同一 `Template` 实例的 `content`，支持多次绑定场景仍保持最新状态。
- 单元测试已覆盖“避免重复读取”“回调参数包含模板”的行为，使用 `jest` 定向测试即可验证。