# Story 1.2: 隔离 FieldConfigForm 配置表单

## Status

ready

## Story

**作为** 开发人员,
**我想要** 将 `field-config-modal.ts` 中的字段配置表单逻辑提取到独立的 `FieldConfigForm` 组件中,
**以便** 进一步简化主模态框文件，提高表单逻辑的可维护性和可复用性。

## Acceptance Criteria

1. 创建一个新的 `FieldConfigForm` 组件类/模块，专门负责渲染和管理单个字段的配置表单
2. 新组件包含以下功能：
   - 渲染字段配置表单（键、标签、类型、默认值、选项列表等）
   - 处理表单输入事件和数据更新
   - 管理选项列表的增删改
   - 管理模板时间戳选项
   - 处理字段类型切换时的表单状态变化
3. `field-config-modal.ts` 成功调用并使用新的 `FieldConfigForm` 组件
4. 所有现有的表单交互功能保持不变（输入验证、选项管理、数据同步）
5. 代码通过 TypeScript 类型检查（严格模式）
6. 表单行为和外观与重构前完全一致

## Tasks / Subtasks

### 任务 1: 分析现有代码并设计 FieldConfigForm 接口 (AC: 1, 2)
- [ ] 分析 `field-config-modal.ts` 中的 `renderFieldConfig()` 方法（约 200 行代码）
- [ ] 识别需要提取的表单元素：
  - 键输入框 (keyInput)
  - 标签输入框 (labelInput)
  - 类型选择器 (typeSelect)
  - 默认值输入框 (defaultInput)
  - 选项列表管理 (optionsContainer, addOptionButton)
  - 模板时间戳选项 (useTemplaterTimestampCheckbox)
  - 描述输入框 (descriptionInput)
- [ ] 设计组件接口和公共 API：
  ```typescript
  export interface FieldConfigFormConfig {
    field: FrontmatterField;
    fieldIndex: number;
    onFieldChange: (field: FrontmatterField, fieldIndex: number) => void;
  }
  ```

### 任务 2: 创建 FieldConfigForm 组件文件 (AC: 1)
- [ ] 在 `src/ui/field-config/` 目录下创建 `field-config-form.ts`
- [ ] 定义 `FieldConfigFormConfig` 接口
- [ ] 创建 `FieldConfigForm` 类，实现以下方法：
  - `constructor(config: FieldConfigFormConfig)` - 初始化组件
  - `render(containerEl: HTMLElement): void` - 渲染配置表单
  - `updateField(field: FrontmatterField): void` - 更新字段数据
  - `getField(): FrontmatterField` - 获取当前字段数据
  - `destroy(): void` - 清理组件

### 任务 3: 实现基础表单字段渲染 (AC: 2)
- [ ] 实现 `renderBasicFields()` 私有方法：
  - 渲染 keyInput：`setPlaceholder('键名')`
  - 渲染 labelInput：`setPlaceholder('显示标签')`
  - 渲染 typeSelect：添加所有字段类型选项
  - 渲染 descriptionInput：`setPlaceholder('字段描述（可选）')`
- [ ] 实现输入事件绑定：
  - 绑定所有输入框的 `change` 事件
  - 调用 `updateFieldData()` 方法同步数据
  - 触发 `onFieldChange` 回调通知父组件

### 任务 4: 实现字段类型特定的渲染逻辑 (AC: 2, 6)
- [ ] 实现 `renderTypeSpecificFields()` 私有方法：
  - 根据 field.type 渲染不同的配置选项
  - text/date 类型：渲染 defaultInput
  - select/multi-select 类型：渲染 optionsContainer
- [ ] 实现 `handleTypeChange()` 私有方法：
  - 清空现有类型特定字段
  - 根据新类型重新渲染相应字段
  - 更新字段默认值（如需要）

### 任务 5: 实现选项列表管理功能 (AC: 2, 4)
- [ ] 实现 `renderOptionsContainer()` 私有方法：
  - 渲染选项列表容器
  - 为每个选项渲染输入框和删除按钮
  - 实现 `addOption()` 功能
- [ ] 实现 `addOption()` 私有方法：
  - 创建新的选项输入框
  - 绑定输入和删除事件
  - 更新 field.options 数组
- [ ] 实现 `removeOption()` 私有方法：
  - 从 DOM 中移除选项元素
  - 从 field.options 数组中移除对应选项
  - 重新渲染选项列表

### 任务 6: 实现模板时间戳选项 (AC: 2, 4)
- [ ] 实现 `renderTemplaterTimestampOption()` 私有方法：
  - 仅在 date 类型且 Templater 插件可用时显示
  - 渲染 useTemplaterTimestampCheckbox
  - 绑定 change 事件更新 field.useTemplaterTimestamp
- [ ] 实现 `checkTemplaterAvailability()` 辅助方法：
  - 检查 Templater 插件是否安装并启用
  - 返回 boolean 值控制组件显示

### 任务 7: 实现数据同步和验证 (AC: 2, 4)
- [ ] 实现 `updateFieldData()` 私有方法：
  - 从所有表单元素读取当前值
  - 更新内部 field 对象
  - 处理特殊情况（如选项数组的去重、去空）
- [ ] 实现 `validateField()` 私有方法：
  - 检查必填字段（key, label）
  - 验证字段格式
  - 显示验证错误（如果需要）

### 任务 8: 重构 field-config-modal.ts 以使用新组件 (AC: 3, 4)
- [ ] 在 `FieldConfigModal` 中导入 `FieldConfigForm`
- [ ] 添加 `fieldFormInstances` 私有属性来跟踪 FieldConfigForm 实例：
  ```typescript
  private readonly fieldFormInstances = new Map<number, FieldConfigForm>();
  ```
- [ ] 重构 `renderFieldConfig()` 方法：
  - 创建 `FieldConfigForm` 实例
  - 调用 `fieldConfigForm.render(configContainer)`
  - 存储实例到 `fieldFormInstances` Map
- [ ] 实现回调函数：
  - `onFieldChange: (field, fieldIndex) => this.updateFieldData(fieldIndex, field)`
- [ ] 移除以下不再需要的私有方法：
  - `renderFieldConfig()` 的原有实现
  - `createOptionInput()` 
  - `addOption()`
  - `removeOption()`
  - 相关的辅助方法

### 任务 9: 编写单元测试 (AC: 5)
- [ ] 创建 `src/__tests__/ui/field-config/field-config-form.test.ts`
- [ ] 测试用例：
  - FieldConfigForm 正确渲染所有表单字段
  - 输入事件正确触发 onFieldChange 回调
  - 字段类型切换正确显示/隐藏相关字段
  - 选项列表的增删功能正常工作
  - 模板时间戳选项的显示逻辑正确
  - 数据验证和同步功能正常
- [ ] 运行测试：`npm test field-config-form.test.ts`

### 任务 10: 验证和手动测试 (AC: 4, 6)
- [ ] 构建项目：`npm run build`
- [ ] 在测试 vault 中加载插件
- [ ] 手动测试所有表单交互：
  - 打开字段配置模态框
  - 测试各种字段类型的切换
  - 测试表单输入和数据同步
  - 测试选项列表的增删
  - 测试模板时间戳选项
  - 验证表单外观与重构前一致
- [ ] 检查控制台无错误
- [ ] 验证 TypeScript 编译无错误：`npm run build`

## Dev Notes

### 与 FieldItem 组件的集成
**[来源: Story 1.1 已完成]** 

FieldConfigForm 将被 FieldItem 组件调用：
```typescript
// 在 FieldItem.render() 中
const configContainer = this.getConfigContainer();
const fieldForm = new FieldConfigForm({
  field: this.config.field,
  fieldIndex: this.config.index,
  onFieldChange: this.config.onFieldChange
});
fieldForm.render(configContainer);
```

### 需要提取的现有方法分析
**[来源: src/ui/field-config-modal.ts]**

**主要方法**:
- `renderFieldConfig(containerEl, field, index)` - 约 200 行，包含所有表单渲染逻辑
- `createOptionInput(option, field, index)` - 创建选项输入框
- `addOption(field, index, containerEl)` - 添加新选项
- `removeOption(button, field, index, containerEl)` - 删除选项

**辅助方法**:
- `updateFieldData(index, field)` - 更新字段数据到 fields 数组
- `checkTemplaterAvailability()` - 检查 Templater 插件可用性

### 表单元素和 CSS 类名约定
**[来源: src/ui/field-config-modal.ts + styles.css]**

- `.note-architect-field-config` - 配置表单容器
- `.note-architect-field-config-row` - 表单行容器
- `.note-architect-field-config-label` - 标签
- `.note-architect-field-config-input` - 输入框
- `.note-architect-field-config-select` - 选择器
- `.note-architect-field-config-textarea` - 文本域
- `.note-architect-field-config-options` - 选项列表容器
- `.note-architect-field-config-option` - 单个选项容器
- `.note-architect-field-config-option-input` - 选项输入框
- `.note-architect-field-config-option-delete` - 选项删除按钮

### 字段类型特定配置
**[来源: src/types/settings.ts]**

```typescript
export type FrontmatterFieldType = 'text' | 'select' | 'date' | 'multi-select';

// 每种类型需要的配置：
// text: key, label, type, default, description
// select: key, label, type, default, options, description  
// date: key, label, type, default, useTemplaterTimestamp, description
// multi-select: key, label, type, default, options, description
```

### 数据同步策略
**[来源: Story 1.1 经验]**

采用与 FieldItem 相同的回调模式：
- FieldConfigForm 通过 `onFieldChange` 回调通知父组件数据变更
- 父组件负责更新 fields 数组和管理全局状态
- 避免直接修改传入的 field 对象，创建新对象进行更新

### 预期代码减少量
**[来源: 当前 field-config-modal.ts 约 750 行（Story 1.1 后）]**

- `renderFieldConfig()` 方法：约 200 行
- 相关辅助方法：约 100 行
- **预期减少**: 约 300 行代码（从 750 行减少到约 450 行）
- **新增文件**: `field-config-form.ts` 约 350-400 行

### 兼容性和向后兼容
**[来源: docs/prd/epic.md 兼容性需求]**

- ✅ `FieldConfigModal` 的公共接口必须保持不变
- ✅ 所有表单交互行为必须与新结构中保持功能一致
- ✅ 与 `PresetManager` 和 `SettingsManager` 的数据格式不变

### 风险和注意事项
**[来源: Story 1.1 经验 + docs/prd/epic.md 风险缓解]** 

- ⚠️ **主要风险**：表单逻辑复杂，提取时可能丢失数据同步逻辑
- ✅ **缓解措施**：
  1. 仔细分析现有数据流和事件处理
  2. 编写全面的单元测试覆盖表单交互
  3. 完成后进行彻底的手动测试
  4. 依赖 TypeScript 捕获类型错误
- ✅ **回滚计划**：通过 Git 恢复文件

### 测试标准

**测试文件位置**: `src/__tests__/ui/field-config/field-config-form.test.ts`

**测试框架**: Jest 30.2.0 + ts-jest 29.4.5

**必须覆盖的测试用例**:
1. **基本渲染测试**:
   - 所有表单字段正确渲染
   - 根据 field.type 显示正确的字段组合
   - 模板时间戳选项在适当条件下显示/隐藏

2. **输入事件测试**:
   - 所有输入框的 change 事件触发 onFieldChange 回调
   - 回调参数包含正确的 field 和 fieldIndex
   - 输入值正确同步到内部 field 对象

3. **字段类型切换测试**:
   - 类型切换事件正确处理
   - 字段特定字段正确显示/隐藏
   - 默认值在类型切换时合理处理

4. **选项管理测试**:
   - addOption() 正确添加新选项
   - removeOption() 正确删除指定选项
   - 选项输入变化正确同步到 field.options

5. **数据验证测试**:
   - 必填字段验证逻辑正确
   - 数据格式验证（去重、去空等）
   - 错误状态正确显示

**运行测试**:
```bash
npm test field-config-form.test.ts
```

### 与已完成 Story 1.1 的协调
**[来源: Story 1.1 完成记录]** 

Story 1.1 已经创建了 `field-config/` 目录和基础结构，Story 1.2 应该：
1. 在相同目录下创建 `field-config-form.ts`
2. 遵循相同的组件设计模式（回调通信、职责分离）
3. 复用已经建立的测试结构和 mock 配置
4. 确保与 FieldItem 组件的良好集成

### 依赖关系
- **前置依赖**: Story 1.1 (FieldItem 提取) 必须完成
- **后置影响**: 为 Story 1.3 (重构主模态框) 做准备
- **并行开发**: 可与 Story 1.3 的规划阶段并行进行