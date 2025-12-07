# 预设选择模态窗口重构记录

## 📋 重构目标
消除代码重复，统一预设选择模态窗口实现为单一的 `UniversalPresetSelectorModal` 类。

## 🔧 删除的文件
1. ✅ `src/ui/template-preset-binding-modal.ts` (169 行) - 模板预设绑定专用模态窗口
2. ✅ `src/ui/dynamic-preset-selector-modal.ts` (345 行) - 包含 `GeneralPresetSelectorModal` 和 `DynamicPresetSelectorModal`
3. ✅ `src/__tests__/ui/template-preset-binding-modal.test.ts` (177 行) - 过时的测试文件

**总计删除：691 行代码**

## ✨ 增强的 UniversalPresetSelectorModal

### 核心配置接口
```typescript
interface UniversalPresetSelectorOptions {
  onSelect: (presetId: string | null) => void | Promise<void>;
  allowClear?: boolean;
  clearText?: string;
  customButtons?: CustomButton[];
  asyncSelectMode?: boolean;
  keepOpenAfterSelect?: boolean;
  showCurrentBound?: boolean;
}

interface CustomButton {
  text: string;
  variant?: 'primary' | 'default' | 'plain';
  callback: () => void | Promise<void>;
}
```

### 关键特性
1. **异步支持** - `asyncSelectMode` 启用异步回调，自动显示加载状态
2. **多次选择** - `keepOpenAfterSelect` 支持选择后不关闭窗口（模板绑定场景）
3. **自定义按钮** - `customButtons` 支持添加底部操作按钮（如"直接插入"）
4. **状态显示** - `showCurrentBound` 显示当前已绑定的预设
5. **加载保护** - 异步操作时禁用所有交互，防止重复点击

## 📂 更新的调用方
1. **UiRegistrar.ts** (第 246 行)
   - `showTemplatePresetBindingModal()` 方法
   - 使用场景：批量绑定预设到模板
   - 特点：异步模式 + 保持打开 + 显示当前绑定

2. **TemplateSelectorModal.ts** (第 337 行)
   - `showPresetSelector()` 方法
   - 使用场景：插入模板时动态选择预设
   - 特点：自定义"跳过预设"按钮 + 单次选择关闭

## ⚠️ 关键实现细节

### 异步处理模式
```typescript
private async handleSelect(presetId: string | null): Promise<void> {
  if (this.options.asyncSelectMode) {
    this.setElementsDisabled(true);
    try {
      await runWithBusy(this.contentEl, async () => {
        await this.options.onSelect(presetId);
      });
      if (this.options.keepOpenAfterSelect) {
        // 刷新列表以反映最新状态
        this.renderPresetList();
      }
    } finally {
      this.setElementsDisabled(false);
    }
  } else {
    // 同步模式，直接调用
    this.options.onSelect(presetId);
  }
  
  if (!this.options.keepOpenAfterSelect) {
    this.close();
  }
}
```

### 自定义按钮渲染
```typescript
private renderCustomButtons(): void {
  if (!this.options.customButtons?.length) return;
  
  this.options.customButtons.forEach((btn) => {
    const button = this.buttonContainer.createEl("button", {
      text: btn.text,
      cls: btn.variant === 'primary' ? 'mod-cta' : 'note-architect-button',
    });
    
    button.addEventListener("click", async () => {
      if (this.isAsyncCallback(btn.callback)) {
        await runWithBusy(button, btn.callback);
      } else {
        btn.callback();
      }
    });
  });
}
```

## 🎯 最佳实践

### 场景 1：模板预设绑定（多次绑定）
```typescript
new UniversalPresetSelectorModal(app, presets, currentBoundId, {
  asyncSelectMode: true,           // 启用异步模式
  keepOpenAfterSelect: true,       // 绑定后保持打开
  allowClear: true,                // 允许清除绑定
  showCurrentBound: true,          // 显示当前绑定
  onSelect: async (id) => {
    await templateManager.setPresetBinding(templateId, id);
  }
})
```

### 场景 2：动态预设选择（单次选择）
```typescript
new UniversalPresetSelectorModal(app, presets, currentBoundId, {
  customButtons: [{
    text: '直接插入（跳过预设）',
    variant: 'default',
    callback: () => insertTemplateDirectly()
  }],
  onSelect: (id) => {
    if (id) {
      insertTemplateWithPreset(id);
    }
  }
})
```

## 🔍 验证结果
- ✅ TypeScript 编译无错误
- ✅ 所有功能场景覆盖
- ✅ 异步加载状态正确显示
- ✅ 键盘导航正常工作（Enter/Escape）
- ✅ 搜索过滤功能正常

## 💡 技术要点
1. **事件委托优化** - 列表项点击使用事件委托，减少内存占用
2. **状态管理** - `setElementsDisabled()` 统一管理交互状态
3. **类型安全** - 完整的 TypeScript 类型定义
4. **错误处理** - 使用 `runWithBusy` 统一异步错误处理
5. **UI 一致性** - 保持与 Obsidian 原生模态窗口一致的样式

## 📌 注意事项
⚠️ **异步模式必须使用 `runWithBusy`** - 确保加载状态正确显示，防止用户重复操作
⚠️ **`keepOpenAfterSelect` 时需刷新列表** - 反映最新的绑定状态
⚠️ **自定义按钮回调支持异步** - 系统会自动检测并处理异步回调
