import type { FrontmatterField } from '@types';
import { isDropAfter } from '@ui/ui-utils';

/**
 * FieldItem 组件配置接口
 */
export interface FieldItemConfig {
	field: FrontmatterField;
	index: number;
	isCollapsed: boolean;
	onDelete: (index: number) => void;
	onDragStart: (index: number) => void;
	onDragEnd: () => void;
	onReorder: (fromIndex: number, targetIndex: number, isAfter: boolean) => void;
	onToggleCollapse: (field: FrontmatterField, collapsed: boolean) => void;
	draggedIndex: number | null;
}

/**
 * FieldItem 组件 - 负责渲染单个字段项的 UI
 * 包含拖拽、折叠、删除等交互功能
 */
export class FieldItem {
	private readonly config: FieldItemConfig;
	private fieldItemEl?: HTMLDivElement;
	private headerEl?: HTMLDivElement;
	private configContainer?: HTMLDivElement;
	private titleEl?: HTMLElement;
	private summaryEl?: HTMLElement;
	private collapsed: boolean;
	private clickHandler?: (event: MouseEvent) => void;
	private keydownHandler?: (event: KeyboardEvent) => void;

	constructor(config: FieldItemConfig) {
		this.config = config;
		this.collapsed = config.isCollapsed;
	}

	/**
	 * 渲染字段项并返回根元素
	 */
	render(containerEl: HTMLElement): HTMLElement {
		// 创建字段项容器
		this.fieldItemEl = containerEl.createDiv('note-architect-field-item');
		this.fieldItemEl.dataset.index = this.config.index.toString();

		// 渲染头部
		this.renderHeader();

		// 创建配置容器
		this.configContainer = this.fieldItemEl.createDiv('note-architect-field-config');

		// 设置折叠行为
		this.setupCollapseBehaviour();

		// 设置初始折叠状态
		this.setCollapsed(this.collapsed);

		return this.fieldItemEl;
	}

	/**
	 * 渲染字段项头部
	 */
	private renderHeader(): void {
		if (!this.fieldItemEl) {
			return;
		}

		this.headerEl = this.fieldItemEl.createDiv('note-architect-field-header');
		this.headerEl.addClass('note-architect-field-header--collapsible');
		this.headerEl.setAttr('tabindex', '0');
		this.headerEl.setAttr('role', 'button');

		// 渲染左侧区域（拖拽手柄 + 标题 + 摘要）
		const headerLeft = this.headerEl.createDiv('note-architect-field-header__left');
		this.renderDragHandle(headerLeft);
		this.titleEl = headerLeft.createEl('h4', { text: `字段 ${this.config.index + 1}` });
		this.summaryEl = headerLeft.createSpan({
			cls: 'note-architect-field-header__summary'
		});

		// 渲染右侧操作按钮
		const headerActions = this.headerEl.createDiv('note-architect-field-header__actions');
		const deleteBtn = headerActions.createEl('button', {
			text: '删除',
			cls: 'mod-warning'
		});
		deleteBtn.onclick = (event) => {
			event.stopPropagation();
			this.config.onDelete(this.config.index);
		};

		// 设置拖拽目标交互
		this.setupDragTargetHandlers();

		// 更新摘要
		this.updateSummary();
	}

	/**
	 * 渲染拖拽手柄
	 */
	private renderDragHandle(headerLeft: HTMLElement): void {
		const dragHandle = headerLeft.createSpan({
			cls: 'note-architect-field-drag-handle',
			text: '⠿'
		});

		dragHandle.setAttr('draggable', 'true');

		dragHandle.addEventListener('dragstart', (event) => {
			this.config.onDragStart(this.config.index);
			this.fieldItemEl?.classList.add('note-architect-field-item--dragging');
			event.dataTransfer?.setData('text/plain', String(this.config.index));
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move';
			}
		});

		dragHandle.addEventListener('dragend', () => {
			this.config.onDragEnd();
			this.fieldItemEl?.classList.remove('note-architect-field-item--dragging');
		});
	}

	/**
	 * 设置拖拽目标交互
	 */
	private setupDragTargetHandlers(): void {
		if (!this.fieldItemEl) {
			return;
		}

		this.fieldItemEl.addEventListener('dragover', (event) => {
			if (this.config.draggedIndex === null) {
				return;
			}
			event.preventDefault();
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = 'move';
			}

			const isAfter = isDropAfter(event, this.fieldItemEl!);
			this.fieldItemEl!.classList.toggle('note-architect-field-item--drag-over-before', !isAfter);
			this.fieldItemEl!.classList.toggle('note-architect-field-item--drag-over-after', isAfter);
		});

		this.fieldItemEl.addEventListener('dragleave', () => {
			this.fieldItemEl?.classList.remove(
				'note-architect-field-item--drag-over-before',
				'note-architect-field-item--drag-over-after'
			);
		});

		this.fieldItemEl.addEventListener('drop', (event) => {
			if (this.config.draggedIndex === null) {
				return;
			}
			event.preventDefault();

			const targetIndex = Number(this.fieldItemEl!.dataset.index);
			if (Number.isNaN(targetIndex)) {
				return;
			}

			const isAfter = isDropAfter(event, this.fieldItemEl!);
			this.config.onReorder(this.config.draggedIndex, targetIndex, isAfter);
		});
	}

	/**
	 * 设置折叠行为
	 */
	private setupCollapseBehaviour(): void {
		if (!this.headerEl || !this.configContainer) {
			return;
		}

		const shouldIgnoreToggle = (target: HTMLElement | null): boolean => {
			if (!target) {
				return false;
			}
			return Boolean(
				target.closest('.note-architect-field-header__actions') ||
				target.closest('.note-architect-field-drag-handle')
			);
		};

		const toggleCollapse = () => {
			const nextState = !this.collapsed;
			this.collapsed = nextState;
			this.setCollapsed(nextState);
			this.config.onToggleCollapse(this.config.field, nextState);
		};

		this.clickHandler = (event) => {
			const target = event.target as HTMLElement | null;
			if (shouldIgnoreToggle(target)) {
				return;
			}
			toggleCollapse();
		};

		this.keydownHandler = (event) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				toggleCollapse();
			}
		};

		this.headerEl.addEventListener('click', this.clickHandler);
		this.headerEl.addEventListener('keydown', this.keydownHandler);
	}

	
	/**
	 * 获取配置容器，供父组件填充表单
	 */
	getConfigContainer(): HTMLElement {
		if (!this.configContainer) {
			throw new Error('FieldItem must be rendered before accessing config container');
		}
		return this.configContainer;
	}

	/**
	 * 更新头部摘要信息
	 */
	updateSummary(): void {
		if (!this.titleEl || !this.summaryEl) {
			return;
		}

		const { field, index } = this.config;

		// 更新标题
		if (field.label?.trim()) {
			this.titleEl.setText(field.label);
		} else {
			this.titleEl.setText(`字段 ${index + 1}`);
		}

		// 更新摘要
		const summaryParts: string[] = [];
		if (field.key?.trim()) {
			summaryParts.push(`键名: ${field.key}`);
		}

		if (summaryParts.length === 0) {
			this.summaryEl.empty();
			return;
		}

		this.summaryEl.setText(summaryParts.join(' | '));
	}

	/**
	 * 设置折叠状态
	 */
	setCollapsed(collapsed: boolean): void {
		if (!this.fieldItemEl || !this.configContainer || !this.headerEl) {
			return;
		}

		this.collapsed = collapsed;
		this.fieldItemEl.classList.toggle('note-architect-field-item--collapsed', collapsed);
		this.configContainer.classList.toggle('note-architect-field-config--collapsed', collapsed);
		this.headerEl.setAttr('aria-expanded', (!collapsed).toString());
		this.headerEl.classList.toggle('note-architect-field-header--collapsed', collapsed);
	}

	/**
	 * 清理组件
	 */
	destroy(): void {
		// 显式移除事件监听器以提高内存管理
		if (this.headerEl && this.clickHandler) {
			this.headerEl.removeEventListener('click', this.clickHandler);
		}
		if (this.headerEl && this.keydownHandler) {
			this.headerEl.removeEventListener('keydown', this.keydownHandler);
		}

		// 清理引用
		this.fieldItemEl = undefined;
		this.headerEl = undefined;
		this.configContainer = undefined;
		this.titleEl = undefined;
		this.summaryEl = undefined;
		this.clickHandler = undefined;
		this.keydownHandler = undefined;
	}
}
