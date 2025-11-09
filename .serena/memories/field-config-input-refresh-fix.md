## 字段详情输入防刷新逻辑
- `FieldConfigModal.handleFieldChange` 现改为只更新本地字段数组并调用 `MasterListView.updateItemSummary` 与 `DetailPanelView.updateActiveFieldSummary`，避免整页 `updateUI` 导致输入控件失焦。
- `MasterListView` 新增 `updateItemSummary`，配合 `FieldItem.updateSummary` 靶向刷新标题/副标题；虚拟列表不可见项通过内部 `currentFields` 缓存保持最新数据。
- `DetailPanelView` 提供 `updateActiveFieldSummary`，确保右侧标题/副标题实时跟随输入同步显示。