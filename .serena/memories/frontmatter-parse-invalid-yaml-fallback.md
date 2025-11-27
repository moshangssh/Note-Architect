## Frontmatter 解析容错（模板绑定弹窗报“读取模板内容失败”）
- `parseFrontmatter` 现捕获 `yaml` 解析异常并返回空对象 + 保留正文（`hasFrontmatter: true`，`body` 为原正文），仅打印 warn，不再抛出。
- 目的：避免模板 frontmatter 语法错误时 `openTemplatePresetBindingModal` 等流程直接失败，保证可继续绑定/解除预设。
- 回归测试：`src/utils/frontmatter-editor.test.ts` 新增 invalid yaml 场景，验证 `parseFrontmatter` 不抛错且 `updateFrontmatter` 能重写无效 frontmatter。