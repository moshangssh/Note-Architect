# 预设ID生成器更新
- buildBasePresetId 简化为先对名称进行 NFKD 归一化并移除变音符号，再将连字符分隔的 ASCII slug 作为基础，超出条件时自动补齐前缀。
- 对完全无法生成 ASCII slug 的名称，新增 computeNameHash，将原始名称的字符编码通过 31 次方散列转换为 base36，拼接 `preset-` 前缀保证稳定可重复的回退 ID。
- 新逻辑维持 2-50 字符限制及首字母要求，并继续与 generateUniquePresetId 的递增后缀机制配合，测试覆盖更新至使用 `preset-fmst8y` 作为中文示例。