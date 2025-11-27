这是一份基于“**显式绑定优先，全局配置兜底**”原则的完整修改规划。这份规划旨在安全地移除过度设计，同时实现更确定的用户交互逻辑。

---

# Note Architect 重构规划书

## 🎯 核心目标
1.  **移除** `FieldConfig` 中的虚拟滚动（Virtualization），回归简单可靠的 DOM 渲染。
2.  **移除** 不确定的“动态预设匹配算法”（Heuristic Matching）。
3.  **新增** “未绑定预设时的默认行为”配置（询问 / 使用默认 / 无动作）。

---

## 📅 阶段一：配置层改造 (Configuration Layer)

**目标**：在修改核心逻辑前，先建立数据基础。

### 1. 修改 `src/types/settings.ts`
定义新的配置项类型。

```typescript
// 新增类型定义
export type NoPresetBehavior = 'ask' | 'use-default' | 'do-nothing';

export interface NoteArchitectSettings {
  // ... 现有字段
  
  // [变更] 移除 enableDynamicPresetSelection
  // [新增] 未绑定预设时的行为策略
  noPresetBehavior: NoPresetBehavior;
  // [新增] 默认预设 ID (当 noPresetBehavior 为 'use-default' 时使用)
  defaultPresetId: string;
}

export const DEFAULT_SETTINGS: NoteArchitectSettings = {
  // ... 其他默认值
  noPresetBehavior: 'ask', // 保持向后兼容，默认为询问
  defaultPresetId: '',
};
```

### 2. 修改 `src/settings/SettingsManager.ts`
确保新字段能被正确加载和保存（通常只需确保 `DEFAULT_SETTINGS` 更新即可，无需大量逻辑修改，但需清理旧的 `enableDynamicPresetSelection` 迁移逻辑）。

### 3. 修改 `src/ui/note-architect-setting-tab.ts`
移除旧开关，添加新的下拉菜单和默认预设选择器。

*   **移除**: `renderDynamicPresetSelectionSetting` 函数。
*   **新增**: `renderNoPresetBehaviorSetting` 函数。
    *   下拉菜单选择：`ask`, `use-default`, `do-nothing`。
    *   条件渲染：仅当选择 `use-default` 时，显示“选择默认预设”的下拉框。

---

## 🛠️ 阶段二：UI 简化 (UI De-bloating)

**目标**：移除过度设计的虚拟列表，简化预设选择弹窗。

### 4. 重构 `src/ui/field-config/master-list-view.ts`
移除虚拟滚动逻辑，实现简单的列表渲染。

*   **删除属性**: `virtualItemsContainer`, `virtualTopSpacerEl`, `virtualizationState`, `lastKnownScrollTop`, `estimatedItemHeight` 等。
*   **删除方法**: `renderVirtualizedList`, `updateVirtualizedWindow`, `handleVirtualScroll`。
*   **重写 `renderListBody`**:
    ```typescript
    private renderListBody(listEl: HTMLDivElement): void {
        listEl.removeClass('note-architect-master-list__items--virtualized');
        
        if (this.currentFields.length === 0) {
            this.renderEmptyState(listEl);
            return;
        }

        // 直接循环渲染所有字段，不再判断数量
        this.currentFields.forEach((field, index) => {
            const fieldItem = this.createFieldItem(field, index, listEl);
            this.fieldItems.set(index, fieldItem);
        });
    }
    ```

### 5. 重构 `src/ui/dynamic-preset-selector-modal.ts`
将其改造为 `SimplePresetSelectorModal`（建议重命名文件以反映其实质）。

*   **移除**: 构造函数中的 `PresetMatcher.matchPresets` 调用。
*   **移除**: 所有关于 `matchResults`, `score`, `reasons` 的逻辑。
*   **移除**: “推荐”徽标逻辑。
*   **保留**: 简单的预设列表展示、搜索过滤功能。

---

## 🧠 阶段三：核心逻辑迁移 (Core Logic Migration)

**目标**：连接配置与交互，实现新的决策流。

### 6. 修改 `src/ui/template-selector-modal.ts`
重写 `handleTemplateClick` 方法，实现优先级判断。

*   **逻辑流**:
    1.  解析模板 Frontmatter。
    2.  `if (configIds.length > 0)`:
        *   **是**: 按照**显式绑定**逻辑处理（打开表单）。
        *   **否**: 读取 `settings.noPresetBehavior` 并执行 switch-case 逻辑：
            *   `do-nothing`: 直接调用 `insertTemplate`。
            *   `use-default`: 获取 `defaultPresetId`，找到预设并打开表单。
            *   `ask`: 打开第 5 步重构后的 `SimplePresetSelectorModal`。

---

## 🗑️ 阶段四：清理死代码 (Cleanup)

**目标**：移除不再需要的“智能匹配”引擎。

### 7. 删除文件
*   🗑️ `src/utils/preset-matcher.ts` (整个文件)

### 8. 清理引用
*   检查并移除 `src/utils/note-architect-config.ts` 或其他文件中对 `PresetMatcher` 的引用（如有）。

---

## ✅ 验证清单 (Verification Checklist)

在提交代码前，请按此顺序进行测试：

1.  **场景 A：已绑定预设的模板**
    *   [ ] 点击模板 -> 应该**直接打开**表单，**忽略**全局设置。
2.  **场景 B：未绑定预设 + 设置为“总是询问”**
    *   [ ] 点击模板 -> 应该弹出简化的预设选择列表。
3.  **场景 C：未绑定预设 + 设置为“使用默认预设”**
    *   [ ] 若已配置默认预设 -> 直接打开表单。
    *   [ ] 若默认预设ID无效 -> 降级弹出选择列表或警告。
4.  **场景 D：未绑定预设 + 设置为“直接插入”**
    *   [ ] 点击模板 -> 直接插入内容，不弹出任何窗口。
5.  **场景 E：字段配置列表**
    *   [ ] 打开一个包含 20+ 字段的预设 -> 列表应正常显示，滚动流畅，且无虚拟滚动的空白占位 Bug。

---

**执行建议**：建议按照 **阶段二 -> 阶段一 -> 阶段三 -> 阶段四** 的顺序执行。先简化 UI 组件，再准备配置数据，最后修改核心逻辑连接两者，最安全。