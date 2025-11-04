## TemplateManager 设置源统一
- TemplateManager 现在通过 SettingsManager 获取设置，构造函数签名变为 `(app, settingsManager)`。
- 内部加载流程调用 `settingsManager.getSettings()`，彻底移除闭包式 `resolveSettings`。