# PresetMatcher 模板分析缓存 (2025-04-20)

## 场景
- 动态预设匹配在 `PresetMatcher.matchPresets` 里对每个预设重复解析模板、执行全文 includes，导致 `O(T * P * F)` 的性能瓶颈。

## 处理措施
- 新增 `TemplateAnalysis` 缓存结构（模板小写全文、变量列表/Set、关键词命中缓存）。
- `matchPresets` 在进入循环前构建模板分析数据并复用。
- 评分相关函数改为接收 `TemplateAnalysis`，避免重复的 `extractTemplateVariables`。
- 新增 `includesKeyword`，对关键词匹配结果做 Map 缓存，降低重复 `includes` 成本。

## 后续参考
- 如需进一步优化，可考虑对模板内容做分词或索引，避免长关键词的 substring 搜索开销。
- 若要增加并发或异步匹配，注意共享缓存的线程安全问题。