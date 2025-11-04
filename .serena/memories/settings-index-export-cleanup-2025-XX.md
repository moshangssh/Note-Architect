# settings/index 导出调整
- 自 2025-XX 起，`src/settings/index.ts` 仅 re-export `SettingsManager`，不再透传 `@types`。
- 任何类型定义需从 `@types` 导入，例如 `import { NoteArchitectSettings } from "@types";`。
- 清理了与 `src/types/index.ts` 的循环依赖，避免未来引入双向引用。