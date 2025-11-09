import type { FrontmatterField } from '@types';
import { FieldItem } from './field-item';
import { DomEventManager } from '@ui/dom-event-manager';

/**
 * MasterListView 配置项
 */
export interface MasterListViewConfig {
	containerEl: HTMLElement;
	onSelect?: (index: number) => void;
	onAddField?: () => void;
	onReorder?: (fromIndex: number, targetIndex: number, isAfter: boolean) => void;
}

/**
 * MasterListView 负责渲染主列表区域，并在字段较多时启用虚拟列表以优化性能
 */
export class MasterListView {
	private readonly containerEl: HTMLElement;
	private readonly config: MasterListViewConfig;
	private readonly eventManager = new DomEventManager();
	private readonly fieldItems = new Map<number, FieldItem>();
	private currentFields: FrontmatterField[] = [];
	private draggedIndex: number | null = null;
	private addButtonEl?: HTMLButtonElement;
	private pendingFocusIndex: number | null = null;
	private currentSelectedIndex: number | null = null;
	private pendingFocusAttempts = 0;

	private listEl?: HTMLDivElement;
	private virtualItemsContainer?: HTMLDivElement;
	private virtualTopSpacerEl?: HTMLDivElement;
	private virtualBottomSpacerEl?: HTMLDivElement;
	private isVirtualized = false;
	private listViewportHeight = 0;
	private lastKnownScrollTop = 0;
	private virtualizationState = { startIndex: 0, endIndex: -1 };

	private readonly virtualizationThreshold = 50;
	private readonly estimatedItemHeight = 84;
	private readonly virtualizationOverscan = 6;
	private readonly defaultViewportHeight = 360;

	constructor(config: MasterListViewConfig) {
		this.containerEl = config.containerEl;
		this.config = config;
		this.containerEl.addClass('note-architect-master-list');
	}

	/**
	 * 渲染字段列表视图
	 */
	render(fields: FrontmatterField[], selectedIndex: number | null): void {
		const previousScrollTop = this.listEl?.scrollTop ?? this.lastKnownScrollTop ?? 0;

		this.destroyFieldItems();
		this.eventManager.dispose();
		this.containerEl.empty();
		this.addButtonEl = undefined;
		this.listEl = undefined;
		this.virtualItemsContainer = undefined;
		this.virtualTopSpacerEl = undefined;
		this.virtualBottomSpacerEl = undefined;
		this.isVirtualized = false;
		this.listViewportHeight = 0;
		this.virtualizationState = { startIndex: 0, endIndex: -1 };

		this.currentFields = fields;
		this.currentSelectedIndex = selectedIndex;
		this.lastKnownScrollTop = Math.max(0, previousScrollTop);
		this.pendingFocusAttempts = 0;

		const header = this.containerEl.createDiv('note-architect-master-list__header');
		header.createEl('h3', { text: '字段列表' });

		const listEl = this.containerEl.createDiv('note-architect-master-list__items');
		listEl.setAttr('role', 'listbox');
		listEl.setAttr('aria-label', '字段列表');
		listEl.setAttr('aria-orientation', 'vertical');
		this.eventManager.add(listEl, 'keydown', this.handleListKeydown);
		this.listEl = listEl;

		this.renderListBody(listEl);

		if (!this.isVirtualized) {
			this.restoreScrollForStaticList();
		}

		const footer = this.containerEl.createDiv('note-architect-master-list__footer');
		const addBtn = footer.createEl('button', {
			text: '添加字段',
			cls: 'mod-cta note-architect-master-list__add-btn',
		});
		this.eventManager.add(addBtn, 'click', () => {
			this.config.onAddField?.();
		});
		this.addButtonEl = addBtn;

		this.applyPendingFocus();
	}

	/**
	 * 仅更新选中项的高亮，避免整列表重渲染
	 */
	updateSelection(selectedIndex: number | null): void {
		if (selectedIndex !== null && (selectedIndex < 0 || selectedIndex > this.currentFields.length - 1)) {
			return;
		}

		if (selectedIndex === this.currentSelectedIndex) {
			return;
		}

		const previousIndex = this.currentSelectedIndex;
		this.currentSelectedIndex = selectedIndex;

		if (previousIndex !== null) {
			this.fieldItems.get(previousIndex)?.setSelected(false);
		}

		if (selectedIndex === null) {
			return;
		}

		if (!this.ensureItemRendered(selectedIndex)) {
			// 虚拟列表场景下需要强制滚动确保节点已挂载
			this.pendingFocusIndex = selectedIndex;
			this.applyPendingFocus();
		}

		this.fieldItems.get(selectedIndex)?.setSelected(true);
	}

	/**
	 * 靶向更新指定列表项摘要信息，避免整列表刷新
	 */
	updateItemSummary(index: number, field: FrontmatterField): void {
		if (index < 0 || index > this.currentFields.length - 1) {
			return;
		}

		this.currentFields[index] = field;
		const fieldItem = this.fieldItems.get(index);
		fieldItem?.updateSummary(field);
	}

	/**
	 * 销毁主列表视图
	 */
	destroy(): void {
		this.destroyFieldItems();
		this.eventManager.dispose();
		this.containerEl.empty();
		this.addButtonEl = undefined;
		this.listEl = undefined;
		this.virtualItemsContainer = undefined;
		this.virtualTopSpacerEl = undefined;
		this.virtualBottomSpacerEl = undefined;
		this.isVirtualized = false;
		this.currentFields = [];
		this.pendingFocusIndex = null;
		this.pendingFocusAttempts = 0;
		this.lastKnownScrollTop = 0;
		this.virtualizationState = { startIndex: 0, endIndex: -1 };
	}

	/**
	 * 聚焦主列表（优先选中项，其次第一项，最后“添加字段”按钮）
	 */
	focusList(selectedIndex: number | null): void {
		if (selectedIndex !== null) {
			this.pendingFocusIndex = selectedIndex;
			this.applyPendingFocus();
			if (this.pendingFocusIndex === null) {
				return;
			}
		}

		const firstItem = this.getFirstRenderedItem();
		if (firstItem?.focus()) {
			return;
		}

		this.addButtonEl?.focus();
	}

	private handleDragStart(index: number): void {
		this.draggedIndex = index;
	}

	private handleDragEnd(): void {
		this.draggedIndex = null;
		this.fieldItems.forEach(item => item.clearDropClasses());
	}

	private destroyFieldItems(): void {
		if (this.fieldItems.size === 0) {
			return;
		}
		this.fieldItems.forEach(item => item.destroy());
		this.fieldItems.clear();
	}

	private readonly handleListKeydown = (event: KeyboardEvent): void => {
		const totalCount = this.currentFields.length;
		if (totalCount === 0) {
			return;
		}

		const validKeys = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End']);
		if (!validKeys.has(event.key)) {
			return;
		}

		const fallbackIndex = this.getNavigationStartIndex(event.target) ?? this.currentSelectedIndex ?? 0;
		let nextIndex = fallbackIndex;

		if (event.key === 'ArrowUp') {
			nextIndex = Math.max(0, fallbackIndex - 1);
		} else if (event.key === 'ArrowDown') {
			nextIndex = Math.min(totalCount - 1, fallbackIndex + 1);
		} else if (event.key === 'Home') {
			nextIndex = 0;
		} else if (event.key === 'End') {
			nextIndex = totalCount - 1;
		}

		if (nextIndex === fallbackIndex) {
			return;
		}

		event.preventDefault();
		this.moveSelectionByKeyboard(nextIndex);
	};

	private getNavigationStartIndex(target: EventTarget | null): number | null {
		if (!(target instanceof HTMLElement)) {
			return null;
		}
		for (const item of this.fieldItems.values()) {
			if (item.containsElement(target)) {
				return item.getIndex();
			}
		}
		return null;
	}

	private moveSelectionByKeyboard(targetIndex: number): void {
		const totalCount = this.currentFields.length;
		if (targetIndex < 0 || targetIndex > totalCount - 1) {
			return;
		}

		if (targetIndex === this.currentSelectedIndex) {
			this.pendingFocusIndex = targetIndex;
			this.applyPendingFocus();
			return;
		}

		this.pendingFocusIndex = targetIndex;
		if (this.config.onSelect) {
			this.config.onSelect(targetIndex);
		} else {
			this.applyPendingFocus();
		}
	}

	private applyPendingFocus(): void {
		if (this.pendingFocusIndex === null) {
			this.pendingFocusAttempts = 0;
			return;
		}
		if (!this.ensureItemRendered(this.pendingFocusIndex)) {
			this.scheduleFocusRetry();
			return;
		}

		const targetItem = this.fieldItems.get(this.pendingFocusIndex);
		if (targetItem?.focus()) {
			this.pendingFocusIndex = null;
			this.pendingFocusAttempts = 0;
			return;
		}

		this.scheduleFocusRetry();
	}

	private scheduleFocusRetry(): void {
		if (this.pendingFocusAttempts >= 2) {
			this.pendingFocusIndex = null;
			this.pendingFocusAttempts = 0;
			return;
		}
		this.pendingFocusAttempts += 1;
		if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
			window.requestAnimationFrame(() => this.applyPendingFocus());
		} else {
			window.setTimeout(() => this.applyPendingFocus(), 0);
		}
	}

	private ensureItemRendered(index: number): boolean {
		if (!this.isVirtualized || !this.listEl) {
			return true;
		}

		const { startIndex, endIndex } = this.virtualizationState;
		if (index >= startIndex && index <= endIndex) {
			return true;
		}

		const viewportHeight = this.listViewportHeight || this.defaultViewportHeight;
		const desiredScrollTop = Math.max(0, index * this.estimatedItemHeight - viewportHeight / 2);
		this.updateVirtualizedWindow({ force: true, scrollTopOverride: desiredScrollTop });

		const updatedRange = this.virtualizationState;
		return index >= updatedRange.startIndex && index <= updatedRange.endIndex;
	}

	private renderListBody(listEl: HTMLDivElement): void {
		listEl.removeClass('note-architect-master-list__items--virtualized');

		if (this.currentFields.length === 0) {
			this.renderEmptyState(listEl);
			return;
		}

		if (this.shouldUseVirtualization()) {
			this.renderVirtualizedList(listEl);
		} else {
			this.renderStandardList(listEl);
		}
	}

	private renderEmptyState(listEl: HTMLDivElement): void {
		this.isVirtualized = false;
		const emptyEl = listEl.createDiv('note-architect-master-list__empty');
		emptyEl.setText('暂无字段，稍后可通过“添加字段”按钮创建。');
		this.lastKnownScrollTop = 0;
	}

	private renderStandardList(listEl: HTMLDivElement): void {
		this.isVirtualized = false;
		this.currentFields.forEach((field, index) => {
			const fieldItem = this.createFieldItem(field, index, listEl);
			this.fieldItems.set(index, fieldItem);
		});
	}

	private renderVirtualizedList(listEl: HTMLDivElement): void {
		this.isVirtualized = true;
		listEl.addClass('note-architect-master-list__items--virtualized');
		this.virtualTopSpacerEl = listEl.createDiv('note-architect-master-list__virtual-spacer');
		this.virtualItemsContainer = listEl.createDiv('note-architect-master-list__virtual-items');
		this.virtualBottomSpacerEl = listEl.createDiv('note-architect-master-list__virtual-spacer');
		this.listViewportHeight = this.getViewportHeight(listEl);
		this.virtualizationState = { startIndex: 0, endIndex: -1 };
		this.eventManager.add(listEl, 'scroll', this.handleVirtualScroll);
		this.eventManager.add(window, 'resize', this.handleWindowResize);
		this.updateVirtualizedWindow({ force: true, scrollTopOverride: this.lastKnownScrollTop });
	}

	private restoreScrollForStaticList(): void {
		if (!this.listEl) {
			return;
		}
		const maxScroll = Math.max(0, this.listEl.scrollHeight - this.listEl.clientHeight);
		const targetScroll = Math.max(0, Math.min(this.lastKnownScrollTop, maxScroll));
		if (targetScroll > 0) {
			this.listEl.scrollTop = targetScroll;
		}
		this.lastKnownScrollTop = targetScroll;
	}

	private updateVirtualizedWindow(options?: { force?: boolean; scrollTopOverride?: number }): void {
		if (
			!this.isVirtualized ||
			!this.listEl ||
			!this.virtualItemsContainer ||
			!this.virtualTopSpacerEl ||
			!this.virtualBottomSpacerEl
		) {
			return;
		}

		const total = this.currentFields.length;
		if (total === 0) {
			this.virtualItemsContainer.empty();
			this.virtualTopSpacerEl.style.height = '0px';
			this.virtualBottomSpacerEl.style.height = '0px';
			this.destroyFieldItems();
			this.lastKnownScrollTop = 0;
			return;
		}

		const viewportHeight = this.getViewportHeight(this.listEl);
		this.listViewportHeight = viewportHeight;

		const maxScroll = Math.max(0, total * this.estimatedItemHeight - viewportHeight);
		const rawScrollTop = typeof options?.scrollTopOverride === 'number'
			? options.scrollTopOverride
			: this.listEl.scrollTop;
		const normalizedScrollTop = Math.max(0, Math.min(rawScrollTop, maxScroll));

		const itemsPerViewport = Math.max(1, Math.ceil(viewportHeight / this.estimatedItemHeight));
		const overscan = this.virtualizationOverscan;
		let startIndex = Math.floor(normalizedScrollTop / this.estimatedItemHeight) - overscan;
		startIndex = Math.max(0, startIndex);
		let endIndex = startIndex + itemsPerViewport + overscan * 2 - 1;
		endIndex = Math.min(total - 1, endIndex);

		if (
			!options?.force &&
			startIndex === this.virtualizationState.startIndex &&
			endIndex === this.virtualizationState.endIndex
		) {
			this.lastKnownScrollTop = normalizedScrollTop;
			return;
		}

		this.virtualizationState = { startIndex, endIndex };
		this.renderVirtualizedItems(startIndex, endIndex);

		const topPadding = startIndex * this.estimatedItemHeight;
		const bottomPadding = Math.max(0, (total - endIndex - 1) * this.estimatedItemHeight);
		this.virtualTopSpacerEl.style.height = `${topPadding}px`;
		this.virtualBottomSpacerEl.style.height = `${bottomPadding}px`;

		this.listEl.scrollTop = normalizedScrollTop;
		this.lastKnownScrollTop = normalizedScrollTop;

		this.applyPendingFocus();
	}

	private renderVirtualizedItems(startIndex: number, endIndex: number): void {
		if (!this.virtualItemsContainer) {
			return;
		}

		this.destroyFieldItems();
		this.virtualItemsContainer.empty();

		for (let index = startIndex; index <= endIndex; index++) {
			const field = this.currentFields[index];
			if (!field) {
				continue;
			}
			const fieldItem = this.createFieldItem(field, index, this.virtualItemsContainer);
			this.fieldItems.set(index, fieldItem);
		}
	}

	private createFieldItem(field: FrontmatterField, index: number, containerEl: HTMLElement): FieldItem {
		const fieldItem = new FieldItem({
			field,
			index,
			isSelected: this.currentSelectedIndex === index,
			getDraggedIndex: () => this.draggedIndex,
			onSelect: (idx) => this.config.onSelect?.(idx),
			onDragStart: (idx) => this.handleDragStart(idx),
			onDragEnd: () => this.handleDragEnd(),
			onReorder: (from, target, isAfter) => this.config.onReorder?.(from, target, isAfter),
		});
		fieldItem.render(containerEl);
		return fieldItem;
	}

	private shouldUseVirtualization(): boolean {
		return this.currentFields.length >= this.virtualizationThreshold;
	}

	private getViewportHeight(listEl: HTMLDivElement): number {
		const height = listEl.clientHeight;
		if (height > 0) {
			return height;
		}
		return this.listViewportHeight || this.defaultViewportHeight;
	}

	private readonly handleVirtualScroll = (): void => {
		this.updateVirtualizedWindow();
	};

	private readonly handleWindowResize = (): void => {
		if (!this.isVirtualized) {
			return;
		}
		this.updateVirtualizedWindow({ force: true });
	};

	private getFirstRenderedItem(): FieldItem | null {
		const iterator = this.fieldItems.values().next();
		return iterator.done ? null : iterator.value;
	}
}
