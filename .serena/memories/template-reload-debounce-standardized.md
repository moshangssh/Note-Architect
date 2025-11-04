## 模板刷新统一使用防抖
- `TemplateManager.scheduleReload` 改为复用 `@utils/timing` 中的 `debounce`，避免重复实现 `setTimeout`。
- 通过类字段持有防抖实例，并在 `stopWatching` 中调用 `cancel`，确保监听停止时不遗留计时器。