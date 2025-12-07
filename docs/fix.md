好的，开发思路非常清晰。核心策略是**“组件通用化”**和**“流程分步化”**。

我们将不再让 `TemplatePresetBindingModal` 仅仅服务于绑定功能，而是将其 UI 逻辑抽象出来，或者创建一个通用的**“预设选择器”**，让“绑定预设”和“更新 Frontmatter”这两个功能都调用同一个 UI 组件。

以下是为您规划的开发思路和关键代码结构：

### 核心思路

1.  **UI 抽象 (The View)**：创建一个通用的 `PresetSelectorModal`（或者重构现有的 `TemplatePresetBindingModal` 使其更通用）。该 Modal 只负责展示列表、搜索、并返回用户点击的预设。它不应该包含具体的“绑定”或“更新”业务逻辑。
2.  **业务解耦 (The Controller)**：
    *   **绑定场景**：用户选择 -> 调用 `updateFrontmatter` 写入文件配置。
    *   **更新场景**（您的新需求）：用户选择 -> 关闭选择器 -> 打开 `FrontmatterManagerModal`（填表界面）。

---

### 步骤 1：创建/重构通用的预设选择器 Modal

我们需要一个配置性很强的 Modal。你可以新建一个 `UniversalPresetSelectorModal`，或者改造现有的 Modal。

**关键特性配置：**
*   **标题/副标题**：可定制（"绑定预设" vs "选择预设以更新"）。
*   **当前状态**：传入 `currentPresetId`，用于在列表中标记 "（当前）" 徽标。
*   **操作回调**：`onSelect(preset)`。
*   **清除/跳过选项**：可选配置（绑定场景需要"解绑"，更新场景可能不需要）。

**关键代码结构 (`src/ui/universal-preset-selector-modal.ts`)：**

```typescript
interface PresetSelectorOptions {
    title: string;
    subtitle?: string;
    presets: FrontmatterPreset[];
    currentPresetId?: string; // 用于高亮当前选中的（如果有）
    
    // 核心回调：用户选中某一项时触发
    onSelect: (preset: FrontmatterPreset) => void;
    
    // 可选：是否显示“不使用预设/解绑”的顶部选项
    allowClear?: boolean; 
    onClear?: () => void;
}

export class UniversalPresetSelectorModal extends Modal {
    // ...省略基础属性初始化...

    onOpen() {
        // 1. 渲染通用的头部 (复用你喜欢的 UI 样式)
        this.renderHeader(this.options.title, this.options.subtitle);
        
        // 2. 渲染搜索框 (复用现有的搜索逻辑)
        this.renderSearchInput();
        
        // 3. 渲染列表容器
        this.renderList();
    }

    private renderList() {
        // ...遍历 this.filteredPresets...
        
        for (const preset of this.filteredPresets) {
            const isCurrent = preset.id === this.options.currentPresetId;
            
            // 复用之前的 Setting UI 构建逻辑
            const setting = new Setting(this.listContainer)
                .setName(preset.name)
                .setDesc(this.buildPresetDesc(preset)); // 复用之前的描述构建

            if (isCurrent) {
                // 渲染 "（当前）" 徽标
                // 按钮显示 "当前" 并禁用
            } else {
                // 渲染 "选择" 按钮
                setting.addButton(btn => btn
                    .setButtonText("选择")
                    .setCta()
                    .onClick(() => {
                        this.close(); // 先关闭自己
                        this.options.onSelect(preset); // 触发回调，进入下一步
                    })
                );
            }
        }
    }
}
```

### 步骤 2：修改业务流程入口 (`UiRegistrar.ts`)

在 `handleUpdateFrontmatterCommand` 中，我们将流程改为两步走。

**关键代码逻辑 (`src/core/UiRegistrar.ts`)：**

```typescript
private handleUpdateFrontmatterCommand(checking: boolean): boolean {
    // ... 省略前置检查代码 ...

    if (checking) return true;

    const presets = this.presetManager.getPresets();
    const lastUsedId = this.noteArchitect.settings.lastUsedPresetForUpdate;

    // --- 第一步：打开选择器 ---
    new UniversalPresetSelectorModal(this.plugin.app, {
        title: "选择预设",
        subtitle: "选择一个预设以更新当前笔记的 Frontmatter",
        presets: presets,
        
        // 传入上次使用的 ID，方便用户看到上次选了啥
        currentPresetId: lastUsedId, 

        // --- 第二步：用户选择后的回调 ---
        onSelect: (selectedPreset) => {
            // 打开填表界面 (FrontmatterManagerModal)
            // 注意：这里 presets 数组只传用户选中的这就行，或者传全部但默认选中它
            FrontmatterManagerModal.forFrontmatterUpdate(
                this.plugin.app, 
                this.noteArchitect, 
                { 
                    presets: [selectedPreset], // 重点：只传选中的这个，简化 Modal 逻辑
                    // 或者如果你想保留在 Modal 里切换预设的能力，可以传全部，并指定 activePreset
                }
            ).open();
        }
    }).open();

    return true;
}
```

### 步骤 3：微调填表界面 (`FrontmatterManagerModal`)

由于我们在第一步已经明确了用户想要哪个预设，`FrontmatterManagerModal` 可以简化。

**优化思路：**

*   **构造函数**：如果传入的 `presets` 数组只有一个（来自 Step 2 的回调），那么 UI 上原本那个 "选择预设" 的下拉框 (`presetSwitcherEl`) 就可以自动隐藏，或者显示为只读文本（"当前预设：XXX"）。
*   **逻辑保持**：不需要大改核心逻辑，它依然负责解析默认值、渲染表单、合并/覆盖 Frontmatter。

### 总结

1.  **UI 复用**：通过 `UniversalPresetSelectorModal` 把 "漂亮的列表 UI" 剥离出来。
2.  **绑定流程**：`UiRegistrar` -> `UniversalPresetSelectorModal` (onSelect 执行写入文件配置)。
3.  **更新流程**：`UiRegistrar` -> `UniversalPresetSelectorModal` (onSelect 打开填表 Modal)。

这样既满足了 UI 统一，又完美实现了您期望的交互流程。