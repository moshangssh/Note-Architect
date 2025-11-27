对 styles.css 进行了重复样式清理：
- 将 master 列表、字段列表、表单的滚动条样式合并为统一选择器，并在字段/表单上保留轨道底色，位置约在 styles.css:587-612。
- 删除 fields/form 原有重复滚动条定义块，避免覆盖冲突。
- 合并 note-architect-preset-actions 的基础样式为单一声明（包含 margin/flex 对齐/gap/flex-shrink），删除重复块，基准位置约 styles.css:1791-1799；保留媒体查询覆盖。
用途：后续修改滚动条或预设操作区样式时从统一块出发，避免再次分散定义。