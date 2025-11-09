/**
 * @jest-environment jsdom
 */

import '../../../../obsidian.mock';

import { FieldItem, type FieldItemConfig } from '@ui/field-config/field-item';
import type { FrontmatterField } from '@types';

const createMockContainer = (): HTMLElement => document.createElement('div');

const createTestField = (overrides?: Partial<FrontmatterField>): FrontmatterField => ({
	key: 'test-key',
	type: 'text',
	label: '测试字段',
	default: '',
	...overrides,
});

const createTestConfig = (overrides?: Partial<FieldItemConfig>): FieldItemConfig => ({
	field: createTestField(),
	index: 0,
	isSelected: false,
	getDraggedIndex: () => null,
	onSelect: jest.fn(),
	onDragStart: jest.fn(),
	onDragEnd: jest.fn(),
	onReorder: jest.fn(),
	...overrides,
});

describe('FieldItem', () => {
	it('渲染字段标题与键名副标题，并根据选中状态添加类名', () => {
		const container = createMockContainer();
		const config = createTestConfig({
			isSelected: true,
			field: createTestField({ label: '项目状态', key: 'status' }),
		});
		const item = new FieldItem(config);

		item.render(container);

		const root = container.querySelector('.note-architect-master-list__item');
		expect(root).toBeTruthy();
		expect(root?.classList.contains('is-selected')).toBe(true);

		const title = container.querySelector('.note-architect-master-list__item-title');
		expect(title?.textContent).toBe('项目状态');

		const subtitle = container.querySelector('.note-architect-master-list__item-subtitle');
		expect(subtitle?.textContent).toContain('status');
	});

	it('点击列表项会触发 onSelect 回调', () => {
		const container = createMockContainer();
		const config = createTestConfig();
		const item = new FieldItem(config);

		item.render(container);

		const root = container.querySelector('.note-architect-master-list__item') as HTMLElement;
		root.click();

		expect(config.onSelect).toHaveBeenCalledWith(0);
	});

	it('按下 Enter 键会触发 onSelect 回调', () => {
		const container = createMockContainer();
		const config = createTestConfig();
		const item = new FieldItem(config);

		item.render(container);

		const root = container.querySelector('.note-architect-master-list__item') as HTMLElement;
		const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
		root.dispatchEvent(event);

		expect(config.onSelect).toHaveBeenCalledWith(0);
	});

	it('dragstart/dragend 会触发对应回调并切换拖拽样式', () => {
		const container = createMockContainer();
		const config = createTestConfig();
		const item = new FieldItem(config);

		item.render(container);

		const dragHandle = container.querySelector('.note-architect-master-list__drag-handle') as HTMLElement;
		const root = container.querySelector('.note-architect-master-list__item');

		const dragStart = new DragEvent('dragstart', {
			bubbles: true,
			cancelable: true,
			dataTransfer: new DataTransfer(),
		});
		dragHandle.dispatchEvent(dragStart);
		expect(config.onDragStart).toHaveBeenCalledWith(0);
		expect(root?.classList.contains('note-architect-master-list__item--dragging')).toBe(true);

		const dragEnd = new DragEvent('dragend', { bubbles: true, cancelable: true });
		dragHandle.dispatchEvent(dragEnd);
		expect(config.onDragEnd).toHaveBeenCalled();
		expect(root?.classList.contains('note-architect-master-list__item--dragging')).toBe(false);
	});

	it('drop 事件会根据 getDraggedIndex 调用 onReorder', () => {
		const container = createMockContainer();
		const config = createTestConfig({
			index: 1,
			getDraggedIndex: () => 0,
		});
		const item = new FieldItem(config);
		item.render(container);

		const root = container.querySelector('.note-architect-master-list__item') as HTMLElement;

		jest.spyOn(root, 'getBoundingClientRect').mockReturnValue({
			top: 0,
			bottom: 100,
			height: 100,
			left: 0,
			right: 0,
			width: 0,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		});

		const dropEvent = new DragEvent('drop', {
			bubbles: true,
			cancelable: true,
			clientY: 80,
		});

		root.dispatchEvent(dropEvent);

		expect(config.onReorder).toHaveBeenCalledWith(0, 1, true);
	});
});
