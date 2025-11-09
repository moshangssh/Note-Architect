### **整合版：`FieldConfigModal` UI重构执行方案 (v2)**

**目标**: 将现有的“手风琴”式字段配置界面重构为高效的“主从（Master-Detail）”布局，并在此过程中优化代码架构、用户体验和可维护性。

**核心架构原则**:
1.  **组件化**: 将UI逻辑拆分为独立的、可管理的类 (`MasterListView`, `DetailPanelView`)。
2.  **单一状态源**: `FieldConfigModal` 作为“协调器”，持有UI状态（字段列表、选中项），并驱动所有UI更新。
3.  **单向数据流**: 交互从视图（View）触发回调 -> 协调器（Modal）更新状态 -> 状态驱动视图重新渲染。

---

### **阶段一：架构基础与结构重构**

**目标**: 搭建新的组件化结构，建立清晰的状态管理模型，并完成核心UI的骨架。

#### **任务 1: 定义并实现组件“骨架”**
*   **目标**: 创建新的视图管理类，将UI职责分离。
*   **步骤**:
    1.  创建新文件 `src/ui/field-config/master-list-view.ts`，定义 `MasterListView` 类。它将负责渲染左侧的字段列表、处理拖拽和选择。
    2.  创建新文件 `src/ui/field-config/detail-panel-view.ts`，定义 `DetailPanelView` 类。它将负责渲染右侧的配置表单或空状态提示。
    3.  在 `FieldConfigModal` (`src/ui/field-config-modal.ts`) 中，移除所有直接的DOM操作逻辑。
    4.  在 `FieldConfigModal` 的构造函数或 `onOpen` 中，实例化 `MasterListView` 和 `DetailPanelView`。

#### **任务 2: 在 `FieldConfigModal` 中建立核心状态管理**
*   **目标**: 将 `FieldConfigModal` 转变为一个状态协调器。
*   **步骤**:
    1.  确认核心状态属性：`private fields: FrontmatterField[]` 和 `private selectedFieldIndex: number | null`。
    2.  创建一个核心的UI更新方法：`private updateUI(): void`。此方法将成为所有UI渲染的唯一入口。
    3.  `updateUI` 的职责是：调用 `masterListView.render(...)` 和 `detailPanelView.render(...)`，并向它们传递最新的状态数据。

#### **任务 3: 实现 `MasterListView` (左侧列表)**
*   **目标**: 渲染可交互的字段列表。
*   **步骤**:
    1.  简化 `FieldItem` (`src/ui/field-config/field-item.ts`)，移除所有配置表单和折叠逻辑，使其成为一个纯粹的、接收`props`的展示组件。它只负责显示摘要信息和响应点击/拖拽。
    2.  在 `MasterListView` 中实现 `render(fields, selectedIndex)` 方法。
    3.  该方法会遍历 `fields` 数组，为每一项创建一个 `FieldItem` 实例，并为选中的项添加 `.is-selected` 样式。
    4.  为 `FieldItem` 绑定 `onSelect` 回调，该回调会通知 `FieldConfigModal` 更新选中的索引。
    5.  在列表底部渲染“添加新字段”按钮，并为其绑定 `onAddField` 回调。

#### **任务 4: 实现 `DetailPanelView` (右侧详情)**
*   **目标**: 根据选择状态，显示配置表单或空状态。
*   **步骤**:
    1.  在 `DetailPanelView` 中实现 `render(field: FrontmatterField | null, fieldIndex: number | null)` 方法。
    2.  如果 `field` 为 `null`，则渲染“请选择一个字段...”的空状态提示。
    3.  如果 `field` 不为 `null`，则渲染 `FieldConfigForm`。
    4.  重构 `FieldConfigForm`：
        *   确保它有一个公共方法 `update(field, index)`，用于接收新数据并完全重绘其内部表单。
        *   当表单内的数据发生变化时（例如用户输入），它会通过 `onFieldChange` 回调通知 `FieldConfigModal` 更新 `this.fields` 数组中的数据。

---

### **阶段二：交互逻辑与数据流**

**目标**: 将所有组件连接起来，实现完整的用户交互流程。

#### **任务 5: "连线"协调器、主列表和详情面板**
*   **目标**: 实现完整的单向数据流。
*   **步骤**:
    1.  在 `FieldConfigModal` 中，实现 `MasterListView` 触发的回调逻辑：
        *   `onSelect(index)` -> 调用 `this.selectedFieldIndex = index; this.updateUI();`
        *   `onAddField()` -> 向 `this.fields` 添加新字段，然后设置 `this.selectedFieldIndex` 为新字段的索引，最后调用 `this.updateUI()`。
        *   `onReorder(from, to)` -> 更新 `this.fields` 数组顺序，调用 `this.updateUI()`。
    2.  实现 `DetailPanelView` 触发的回调逻辑：
        *   `onFieldChange(index, updatedField)` -> 更新 `this.fields[index]` 的数据，调用 `this.updateUI()`。
        *   `onDeleteField(index)` -> 弹出确认框，确认后从 `this.fields` 移除字段，设置 `this.selectedFieldIndex = null`，调用 `this.updateUI()`。

#### **任务 6: 优化焦点管理与用户体验**
*   **目标**: 让交互更智能、更顺畅。
*   **步骤**:
    1.  在 `onAddField` 逻辑执行后，调用 `detailPanelView.focusOnFirstInput()` 方法，将焦点自动设置到新表单的第一个输入框。
    2.  在 `onDeleteField` 逻辑执行后，计算下一个应该被选中的索引（例如，被删除项的前一项），并更新 `selectedFieldIndex`，然后将焦点设置回主列表。
    3.  **(可选)** 增加“未保存更改”的检测。在 `onClose` 时，如果内存中的 `fields` 状态与初始状态不同，则弹窗提示用户确认。

---

### **阶段三：样式、响应式与视觉润色**

**目标**: 应用符合规格书的视觉设计，并确保在不同设备上表现良好。

#### **任务 7: 实现桌面端 Master-Detail 布局样式**
*   **目标**: 使用 CSS Flexbox 或 Grid 实现双栏布局。
*   **步骤**:
    1.  在 `styles.css` 中，为 `FieldConfigModal` 的新容器编写样式。
    2.  定义主列表（左）和详情面板（右）的宽度比例（例如 35% / 65%）。
    3.  为主列表项的选中状态 `.is-selected` 添加清晰的视觉高亮。

#### **任务 8: 实现窄视口的“堆叠导航”**
*   **目标**: 在小屏幕上提供优化的单栏浏览体验。
*   **步骤**:
    1.  使用媒体查询 (`@media (max-width: 600px)`) 覆盖桌面端布局样式。
    2.  在 `DetailPanelView` 中，添加一个“< 返回列表”的按钮，仅在窄视口下显示。
    3.  通过在 `FieldConfigModal` 的主容器上切换一个类（如 `.detail-view-active`）来控制主列表和详情面板的显示与隐藏，并配合 CSS `transform` 实现平滑的滑动动画。

#### **任务 9: 添加动画与微交互**
*   **目标**: 提升界面的精致感和响应性。
*   **步骤**:
    1.  为详情面板的内容切换添加淡入淡出 (`opacity`) 的 CSS 过渡。
    2.  为列表项的添加/删除添加高度和透明度的过渡效果。
    3.  当拖拽字段时，让其他列表项平滑地移动“让位”。

---

### **阶段四：最终化与健壮性**

**目标**: 确保代码的健壮性、可访问性和性能。

#### **任务 10: 实现键盘可访问性 (A11y)**
*   **目标**: 确保无需鼠标即可完成所有操作。
*   **步骤**:
    1.  为 `MasterListView` 添加键盘事件监听，支持使用 `↑` / `↓` 键在列表项之间导航。
    2.  为所有可交互元素添加正确的 ARIA 角色和属性（`listbox`, `option`, `aria-selected`）。
    3.  确保所有控件都有清晰的焦点状态 (`:focus-visible`)。

#### **任务 11: 实现组件的清理逻辑**
*   **目标**: 避免在模态窗口关闭后产生内存泄漏。
*   **步骤**:
    1.  为 `MasterListView`, `DetailPanelView`, 和 `FieldConfigForm` 添加一个 `destroy()` 方法。
    2.  该方法负责移除所有手动添加的事件监听器。
    3.  在 `FieldConfigModal` 的 `onClose` 方法中，依次调用所有子视图实例的 `destroy()` 方法。
*   **进度**:
    - ✅ 通过新增 `DomEventManager` 统一登记 DOM 事件，三大视图在 `destroy()` 与重新渲染时都会 `dispose()`，并补充动画监听的清理；`FieldConfigModal.onClose()` 也会调用子视图的 `destroy()`，`npm run build` 验证通过。

#### **任务 12: (可选) 性能优化**
*   **目标**: 确保在字段数量非常多（>50）的情况下，UI依然流畅。
*   **步骤**:
    1.  评估是否需要列表虚拟化。对于大多数用例，此步骤可以省略。
    2.  如果需要，将 `MasterListView` 的渲染逻辑替换为使用虚拟滚动库或自定义实现，只渲染视口内可见的 `FieldItem`。
