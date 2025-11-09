# FieldConfigModal Master-Detail Refactor 记要
- 2025-02-14：完成任务 12（性能优化），`MasterListView` 在字段数量 ≥50 时启用虚拟列表，仅渲染视口附近的 FieldItem，并保留键盘聚焦与拖拽功能。
- 新逻辑在 `src/ui/field-config/master-list-view.ts` 中维护字段快照、滚动位置与虚拟窗口，`styles.css` 改用 margin 间距并加入虚拟占位/容器样式。
- 构建验证：`npm run build` 成功。
- 当前等待进一步任务指示。