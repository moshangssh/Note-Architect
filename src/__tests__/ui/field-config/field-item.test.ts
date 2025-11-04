/**
 * @jest-environment jsdom
 */

// 导入 Obsidian API mock
import '../../../../obsidian.mock';

import { FieldItem, type FieldItemConfig } from '@ui/field-config/field-item';
import type { FrontmatterField } from '@types';

// 模拟 DOM 环境
const createMockContainer = (): HTMLElement => {
	const container = document.createElement('div');
	return container;
};

// 创建测试用的 FrontmatterField
const createTestField = (overrides?: Partial<FrontmatterField>): FrontmatterField => ({
	key: 'test-key',
	type: 'text',
	label: 'Test Label',
	default: '',
	...overrides,
});

// 创建测试用的 FieldItemConfig
const createTestConfig = (overrides?: Partial<FieldItemConfig>): FieldItemConfig => ({
	field: createTestField(),
	index: 0,
	isCollapsed: false,
	onDelete: jest.fn(),
	onDragStart: jest.fn(),
	onDragEnd: jest.fn(),
	onReorder: jest.fn(),
	onToggleCollapse: jest.fn(),
	draggedIndex: null,
	...overrides,
});

describe('FieldItem', () => {
	describe('基本渲染', () => {
		it('应该创建正确的 DOM 结构', () => {
			const container = createMockContainer();
			const config = createTestConfig();
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			// 验证字段项容器
			const fieldItemEl = container.querySelector('.note-architect-field-item');
			expect(fieldItemEl).toBeTruthy();
			expect(fieldItemEl?.getAttribute('data-index')).toBe('0');

			// 验证头部
			const headerEl = container.querySelector('.note-architect-field-header');
			expect(headerEl).toBeTruthy();
			expect(headerEl?.getAttribute('tabindex')).toBe('0');
			expect(headerEl?.getAttribute('role')).toBe('button');

			// 验证拖拽手柄
			const dragHandle = container.querySelector('.note-architect-field-drag-handle');
			expect(dragHandle).toBeTruthy();
			expect(dragHandle?.getAttribute('draggable')).toBe('true');

			// 验证标题
			const titleEl = container.querySelector('h4');
			expect(titleEl?.textContent).toBe('Test Label');

			// 验证摘要
			const summaryEl = container.querySelector('.note-architect-field-header__summary');
			expect(summaryEl).toBeTruthy();
			expect(summaryEl?.textContent).toContain('键名: test-key');

			// 验证删除按钮
			const deleteBtn = container.querySelector('.note-architect-field-header__actions button');
			expect(deleteBtn).toBeTruthy();
			expect(deleteBtn?.textContent).toBe('删除');

			// 验证配置容器
			const configContainer = container.querySelector('.note-architect-field-config');
			expect(configContainer).toBeTruthy();
		});

		it('应该正确设置初始折叠状态', () => {
			const container = createMockContainer();
			const config = createTestConfig({ isCollapsed: true });
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			const fieldItemEl = container.querySelector('.note-architect-field-item');
			expect(fieldItemEl?.classList.contains('note-architect-field-item--collapsed')).toBe(true);

			const headerEl = container.querySelector('.note-architect-field-header');
			expect(headerEl?.getAttribute('aria-expanded')).toBe('false');
		});
	});

	describe('拖拽交互', () => {
		it('dragstart 事件应该调用 onDragStart 回调', () => {
			const container = createMockContainer();
			const config = createTestConfig();
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			const dragHandle = container.querySelector('.note-architect-field-drag-handle') as HTMLElement;
			expect(dragHandle).toBeTruthy();

			const dragStartEvent = new DragEvent('dragstart', {
				bubbles: true,
				cancelable: true,
				dataTransfer: new DataTransfer(),
			});

			dragHandle.dispatchEvent(dragStartEvent);

			expect(config.onDragStart).toHaveBeenCalledWith(0);
		});

		it('dragend 事件应该调用 onDragEnd 回调', () => {
			const container = createMockContainer();
			const config = createTestConfig();
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			const dragHandle = container.querySelector('.note-architect-field-drag-handle') as HTMLElement;
			const dragEndEvent = new DragEvent('dragend', {
				bubbles: true,
				cancelable: true,
			});

			dragHandle.dispatchEvent(dragEndEvent);

			expect(config.onDragEnd).toHaveBeenCalled();
		});

		it('应该在 dragstart 时添加 dragging 样式类', () => {
			const container = createMockContainer();
			const config = createTestConfig();
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			const dragHandle = container.querySelector('.note-architect-field-drag-handle') as HTMLElement;
			const fieldItemEl = container.querySelector('.note-architect-field-item');

			const dragStartEvent = new DragEvent('dragstart', {
				bubbles: true,
				cancelable: true,
				dataTransfer: new DataTransfer(),
			});

			dragHandle.dispatchEvent(dragStartEvent);

			expect(fieldItemEl?.classList.contains('note-architect-field-item--dragging')).toBe(true);
		});

		it('drop 事件应该调用 onReorder 回调', () => {
			const container = createMockContainer();
			const config = createTestConfig({ draggedIndex: 1 });
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			const fieldItemEl = container.querySelector('.note-architect-field-item') as HTMLElement;

			// 模拟 drop 事件，假设拖拽到元素下半部（isAfter = true）
			const dropEvent = new DragEvent('drop', {
				bubbles: true,
				cancelable: true,
				clientY: 100, // 假设元素高度为 100px，这个值会导致 isAfter = true
			});

			// 模拟 getBoundingClientRect
			jest.spyOn(fieldItemEl, 'getBoundingClientRect').mockReturnValue({
				top: 50,
				height: 50,
				bottom: 100,
				left: 0,
				right: 0,
				width: 0,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});

			fieldItemEl.dispatchEvent(dropEvent);

			expect(config.onReorder).toHaveBeenCalledWith(1, 0, true);
		});
	});

	describe('删除按钮交互', () => {
		it('点击删除按钮应该调用 onDelete 回调', () => {
			const container = createMockContainer();
			const config = createTestConfig({ index: 2 });
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			const deleteBtn = container.querySelector('.note-architect-field-header__actions button') as HTMLButtonElement;
			expect(deleteBtn).toBeTruthy();

			deleteBtn.click();

			expect(config.onDelete).toHaveBeenCalledWith(2);
		});

		it('点击删除按钮应该阻止事件冒泡', () => {
			const container = createMockContainer();
			const config = createTestConfig();
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			const deleteBtn = container.querySelector('.note-architect-field-header__actions button') as HTMLButtonElement;
			const headerEl = container.querySelector('.note-architect-field-header') as HTMLElement;

			// 监听头部点击事件
			const headerClickSpy = jest.fn();
			headerEl.addEventListener('click', headerClickSpy);

			deleteBtn.click();

			// 验证头部点击事件没有被触发（因为事件冒泡被阻止）
			expect(headerClickSpy).not.toHaveBeenCalled();
		});
	});

	describe('折叠/展开功能', () => {
		it('点击头部应该切换折叠状态', () => {
			const container = createMockContainer();
			const field = createTestField();
			const config = createTestConfig({ field, isCollapsed: false });
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			const titleEl = container.querySelector('h4') as HTMLElement;

			// 模拟点击标题元素（用户实际会点击的区域）
			const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
			Object.defineProperty(clickEvent, 'target', { value: titleEl, writable: false });

			// 触发点击事件
			titleEl.dispatchEvent(clickEvent);

			expect(config.onToggleCollapse).toHaveBeenCalledWith(field, true);
		});

		it('Enter 键应该切换折叠状态', () => {
			const container = createMockContainer();
			const field = createTestField();
			const config = createTestConfig({ field, isCollapsed: false });
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			const headerEl = container.querySelector('.note-architect-field-header') as HTMLElement;
			const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
			// 键盘事件的目标应该是 headerEl，因为它具有 tabindex
			headerEl.dispatchEvent(enterEvent);

			expect(config.onToggleCollapse).toHaveBeenCalledWith(field, true);
		});

		it('Space 键应该切换折叠状态', () => {
			const container = createMockContainer();
			const field = createTestField();
			const config = createTestConfig({ field, isCollapsed: false });
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			const headerEl = container.querySelector('.note-architect-field-header') as HTMLElement;
			const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
			headerEl.dispatchEvent(spaceEvent);

			expect(config.onToggleCollapse).toHaveBeenCalledWith(field, true);
		});

		it('点击拖拽手柄不应该触发折叠', () => {
			const container = createMockContainer();
			const config = createTestConfig();
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			const dragHandle = container.querySelector('.note-architect-field-drag-handle') as HTMLElement;
			dragHandle.click();

			expect(config.onToggleCollapse).not.toHaveBeenCalled();
		});

		it('setCollapsed 应该正确切换 CSS 类和 aria 属性', () => {
			const container = createMockContainer();
			const config = createTestConfig({ isCollapsed: false });
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			// 设置为折叠
			fieldItem.setCollapsed(true);

			const fieldItemEl = container.querySelector('.note-architect-field-item');
			const configContainer = container.querySelector('.note-architect-field-config');
			const headerEl = container.querySelector('.note-architect-field-header');

			expect(fieldItemEl?.classList.contains('note-architect-field-item--collapsed')).toBe(true);
			expect(configContainer?.classList.contains('note-architect-field-config--collapsed')).toBe(true);
			expect(headerEl?.classList.contains('note-architect-field-header--collapsed')).toBe(true);
			expect(headerEl?.getAttribute('aria-expanded')).toBe('false');

			// 设置为展开
			fieldItem.setCollapsed(false);

			expect(fieldItemEl?.classList.contains('note-architect-field-item--collapsed')).toBe(false);
			expect(configContainer?.classList.contains('note-architect-field-config--collapsed')).toBe(false);
			expect(headerEl?.classList.contains('note-architect-field-header--collapsed')).toBe(false);
			expect(headerEl?.getAttribute('aria-expanded')).toBe('true');
		});
	});

	describe('摘要更新', () => {
		it('updateSummary 应该根据 field.label 更新标题', () => {
			const container = createMockContainer();
			const field = createTestField({ label: 'Custom Label' });
			const config = createTestConfig({ field });
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			const titleEl = container.querySelector('h4');
			expect(titleEl?.textContent).toBe('Custom Label');

			// 更新 field.label
			field.label = 'Updated Label';
			fieldItem.updateSummary();

			expect(titleEl?.textContent).toBe('Updated Label');
		});

		it('无 label 时应该使用默认标题 "字段 N"', () => {
			const container = createMockContainer();
			const field = createTestField({ label: '' });
			const config = createTestConfig({ field, index: 3 });
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);
			fieldItem.updateSummary();

			const titleEl = container.querySelector('h4');
			expect(titleEl?.textContent).toBe('字段 4');
		});

		it('field.key 应该正确显示在摘要中', () => {
			const container = createMockContainer();
			const field = createTestField({ key: 'custom-key' });
			const config = createTestConfig({ field });
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			const summaryEl = container.querySelector('.note-architect-field-header__summary');
			expect(summaryEl?.textContent).toContain('键名: custom-key');
		});

		it('无 key 时摘要应该为空', () => {
			const container = createMockContainer();
			const field = createTestField({ key: '' });
			const config = createTestConfig({ field });
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);
			fieldItem.updateSummary();

			const summaryEl = container.querySelector('.note-architect-field-header__summary');
			expect(summaryEl?.textContent).toBe('');
		});
	});

	describe('getConfigContainer', () => {
		it('应该返回配置容器元素', () => {
			const container = createMockContainer();
			const config = createTestConfig();
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);

			const configContainer = fieldItem.getConfigContainer();
			expect(configContainer).toBeTruthy();
			expect(configContainer.classList.contains('note-architect-field-config')).toBe(true);
		});

		it('render 之前调用应该抛出错误', () => {
			const config = createTestConfig();
			const fieldItem = new FieldItem(config);

			expect(() => fieldItem.getConfigContainer()).toThrow('FieldItem must be rendered before accessing config container');
		});
	});

	describe('destroy', () => {
		it('应该清理所有内部引用', () => {
			const container = createMockContainer();
			const config = createTestConfig();
			const fieldItem = new FieldItem(config);

			fieldItem.render(container);
			fieldItem.destroy();

			// 验证 destroy 后 getConfigContainer 会抛出错误
			expect(() => fieldItem.getConfigContainer()).toThrow();
		});
	});
});
