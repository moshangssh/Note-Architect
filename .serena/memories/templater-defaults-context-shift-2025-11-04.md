# Templater 默认值解析上下文调整

**日期**: 2025-11-04
**涉及文件**:
- `src/engine/TemplateEngine.ts`
- `src/ui/frontmatter-manager-modal.ts`

## 变更摘要
- `extractPresetDefaults` 仅返回预设中声明的原始默认值，不再尝试执行 Templater。
- `FrontmatterManagerModal.parseTemplaterDefaults` 在模态打开后统一解析含 `<%` 的默认值，并在缺少活动文件或适配器不可用时优雅跳过。

## 设计意图
- 避免在设置界面等无活动文件的上下文中错误执行 Templater。
- 将 Templater 表达式解析延迟到真正需要的 UI 环境，保持性能与稳定性。

## 注意事项
- 解析逻辑依赖 `this.app.workspace.getActiveFile()`，若不存在会保留原始表达式并标记为已跳过。
- 如果需要扩展到其它入口，确保在真正的文件上下文中调用同样的解析策略。