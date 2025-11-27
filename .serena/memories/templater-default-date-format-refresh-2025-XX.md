# 2025-XX Templater默认日期格式刷新
- 问题：用户更改设置中的 defaultDateFormat 后，已有使用 Templater 自动填充时间的字段仍沿用旧格式，因为 parseTemplaterDefaults 直接使用字段存储的默认值。
- 修复：FrontmatterManagerModal 新增 buildTemplaterDateExpression，解析默认值时若字段 useTemplaterTimestamp 为 true，则按当前 plugin.settings.defaultDateFormat 重建 `<% tp.date.now(...) %>` 表达式，再交给 Templater 解析或跳过。
- 影响：无需重新编辑字段即可使用最新的默认日期格式，前置条件是字段勾选“自动填入当前时间（Templater）”。