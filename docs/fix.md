# 1) 表单→Frontmatter 转换：重复实现（至少 2 处）

* `convertFormDataToFrontmatter(...)` 在代码库中出现了两份几乎一致的实现。 
  重复逻辑包含 `date`、`multi-select`、`text/select` 的分支与空值处理。 
  且两处都把空的多选写成 `''`（这本身还是个 bug）。 
  **建议**：抽成 `@utils/frontmatter/convert.ts` 的单一实现，被 `engine` / `ui` 共用；顺便把空多选落地为 `[]`，修 bug 一步到位。

# 2) Frontmatter 合并：重复实现（至少 2 处）

* `mergeFrontmatters(base, override)` 在两个文件里内容一致（含对 `tags` 的特殊并集合并）。 
  **建议**：抽到 `@utils/frontmatter/merge.ts`；让其它地方全部引用它，避免策略漂移。

# 3) 模板合并总流程：重复实现（至少 2 处）

* `mergeFrontmatterWithUserInput(...)` 的“preset 默认 → 当前笔记 → 模板 → 用户输入”的层叠策略被实现了两遍。 
  之后的“剔除配置键 + 按预设字段排序 + 追加剩余键”的输出序也重复。 
  **建议**：抽到 `@engine/merge-pipeline.ts` 或 `@utils/frontmatter/pipeline.ts`，保证唯一来源。

# 4) 读/写 Frontmatter：重复实现（至少 2 处）

* `getNoteMetadata(app)` 与 `updateNoteFrontmatter(editor, ...)` 各出现两份相同实现。  ； 
  **建议**：抽到 `@utils/frontmatter-editor`（你已有引用占位），统一复用，减少编辑器/YAML 选项分散。

# 5) 纯文本 Frontmatter 解析/更新工具：代码块重复（至少 2 处）

* `composeContent(...)` / `sanitizeFrontmatter(...)` 成对出现在两处，逻辑相同（包含 `stringifyYaml` 配置、规范化换行）。  ； 
  **建议**：沉到 `@utils/frontmatter/text.ts`；提供 `parseFrontmatter`、`composeContent`、`sanitize`、`areEqual` 等成套 API，其他模块只调它。

# 6) 预设 ID 生成：实现高度相似（类重复）

* `PresetManager.generateUniquePresetId(...)` 的核心逻辑（基于 `buildBasePresetId` + 截断 + 递增后缀到 9999 + 时间戳兜底）在两处类里都出现了同样版本。 
  **建议**：将 ID 生成与 `computeNameHash` 独立为 `@utils/preset-id.ts`；`PresetManager` 注入或直接复用，避免未来微改不同步。

# 7) 模板管理 / 监听：相似逻辑分散

* `TemplateManager` 内部的路径校验、加载、监听器注册/释放、重载节流等逻辑集中在一个类里没问题，但“校验路径 + normalizePath + 读取 TFolder”的片段在多处出现，且 `rename` 处理里的新路径未 normalize。 
  **建议**：把“路径规范化 + 取 TFolder + 容错”提炼为 `safeGetFolder(path)` 工具，所有调用点统一；`rename` 分支对新路径也 `normalizePath` 一次（兼容跨平台）。

---

## 快速去重落地方案（建议路线）

1. 建公共工具层（新文件）

* `@utils/frontmatter/convert.ts`：唯一 `convertFormDataToFrontmatter`（修正空多选为 `[]`）。
* `@utils/frontmatter/merge.ts`：唯一 `mergeFrontmatters` 实现（含 `tags` 并集策略）。
* `@utils/frontmatter/pipeline.ts`：唯一 `mergeFrontmatterWithUserInput`。
* `@utils/frontmatter/text.ts`：`parseFrontmatter`（若无）/`composeContent`/`sanitizeFrontmatter`/`areFrontmattersEqual`。
* `@utils/preset-id.ts`：`buildBasePresetId`、`computeNameHash`、`generateUniquePresetId`。

2. 调整引用方

* `engine/TemplateEngine.ts`、UI 相关调用、`PresetManager` 改用上面工具层，删除本地重复实现（以工具层为单一真相）。

3. 顺带修 bug

* 多选空值→`[]`（两处重复实现里都曾写成 `''`）。
* `rename` 事件时的 `watchedFolderPath = normalizePath(file.path)`。