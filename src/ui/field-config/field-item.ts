import type { FrontmatterField } from '@types';
import { isDropAfter } from '@ui/ui-utils';

/**
 * FieldItem 配置，专注于主列表项展示与交互
 */
export interface FieldItemConfig {
	field: FrontmatterField;
	index: number;
	isSelected: boolean;
	getDraggedIndex?: () => number | null;
	onSelect?: (index: number) => void;
	onDragStart?: (index: number) => void;
	onDragEnd?: () => void;
	onReorder?: (fromIndex: number, targetIndex: number, isAfter: boolean) => void;
}

/**
 * 精简后的 FieldItem，只负责列表项的展示与拖拽
 */
export class FieldItem {
	private readonly config: FieldItemConfig;
	private rootEl?: HTMLDivElement;
	private titleEl?: HTMLDivElement;
	private subtitleEl?: HTMLDivElement;
	private clickHandler?: (event: MouseEvent) => void;
	private keydownHandler?: (event: KeyboardEvent) => void;
	private dragOverHandler?: (event: DragEvent) => void;
	private dragLeaveHandler?: () => void;
	private dropHandler?: (event: DragEvent) => void;
	private dragStartHandler?: (event: DragEvent) => void;
	private dragEndHandler?: () => void;
	private dragHandleEl?: HTMLElement;
	private animationEndHandler?: () => void;

	constructor(config: FieldItemConfig) {
		this.config = config;
	}

	/**
	 * 渲染主列表项
	 */
	render(containerEl: HTMLElement): HTMLElement {
		this.rootEl = containerEl.createDiv('note-architect-master-list__item');
		this.rootEl.dataset.index = this.config.index.toString();
		this.rootEl.setAttr('role', 'option');
		this.rootEl.setAttr('tabindex', this.config.isSelected ? '0' : '-1');
		this.rootEl.setAttr('aria-selected', this.config.isSelected ? 'true' : 'false');

		if (this.config.isSelected) {
			this.rootEl.addClass('is-selected');
		}

		this.renderContent();
		this.setupSelectionHandlers();
		this.setupDragHandlers();
		this.triggerEnterAnimation();

		return this.rootEl;
	}

	/**
	 * 更新选中态而不重新渲染 DOM
	 */
	setSelected(isSelected: boolean): void {
		if (!this.rootEl) {
			return;
		}
		this.config.isSelected = isSelected;
		this.rootEl.toggleClass('is-selected', isSelected);
		this.rootEl.setAttr('aria-selected', isSelected ? 'true' : 'false');
		this.rootEl.setAttr('tabindex', isSelected ? '0' : '-1');
	}

	/**
	 * 靶向更新标题及副标题，避免整行重渲染
	 */
	updateSummary(field: FrontmatterField): void {
		this.config.field = field;
		if (this.titleEl) {
			this.titleEl.setText(field.label?.trim() || `字段 ${this.config.index + 1}`);
		}
		if (this.subtitleEl) {
			if (field.key?.trim()) {
				this.subtitleEl.setText(`Frontmatter 键名：${field.key}`);
			} else {
				this.subtitleEl.setText('尚未设置 Frontmatter 键名');
			}
		}
	}

	/**
	 * 聚焦当前列表项
	 */
	focus(): boolean {
		if (!this.rootEl) {
			return false;
		}
		this.rootEl.focus();
		return true;
	}

	/**
	 * 清理所有绑定
	 */
	destroy(): void {
		if (!this.rootEl) {
			return;
		}

		if (this.clickHandler) {
			this.rootEl.removeEventListener('click', this.clickHandler);
		}
		if (this.keydownHandler) {
			this.rootEl.removeEventListener('keydown', this.keydownHandler);
		}
		if (this.dragOverHandler) {
			this.rootEl.removeEventListener('dragover', this.dragOverHandler);
		}
		if (this.dragLeaveHandler) {
			this.rootEl.removeEventListener('dragleave', this.dragLeaveHandler);
		}
		if (this.dropHandler) {
			this.rootEl.removeEventListener('drop', this.dropHandler);
		}
		if (this.dragHandleEl && this.dragStartHandler) {
			this.dragHandleEl.removeEventListener('dragstart', this.dragStartHandler);
		}
		if (this.dragHandleEl && this.dragEndHandler) {
			this.dragHandleEl.removeEventListener('dragend', this.dragEndHandler);
		}
		if (this.rootEl && this.animationEndHandler) {
			this.rootEl.removeEventListener('animationend', this.animationEndHandler);
		}

		this.rootEl = undefined;
		this.dragHandleEl = undefined;
		this.animationEndHandler = undefined;
		this.titleEl = undefined;
		this.subtitleEl = undefined;
	}

	/**
	 * 渲染列表项文本内容
	 */
	private renderContent(): void {
		if (!this.rootEl) {
			return;
		}

		const dragHandle = this.rootEl.createSpan({
			cls: 'note-architect-master-list__drag-handle',
			text: '⠿',
		});
		dragHandle.setAttr('draggable', 'true');
		this.dragHandleEl = dragHandle;

		const content = this.rootEl.createDiv('note-architect-master-list__item-content');
		const title = content.createDiv('note-architect-master-list__item-title');
		title.setText(this.config.field.label?.trim() || `字段 ${this.config.index + 1}`);
		this.titleEl = title;

		const subtitle = content.createDiv('note-architect-master-list__item-subtitle');
		if (this.config.field.key?.trim()) {
			subtitle.setText(`Frontmatter 键名：${this.config.field.key}`);
		} else {
			subtitle.setText('尚未设置 Frontmatter 键名');
		}
		this.subtitleEl = subtitle;
	}

	/**
	 * 设置点击/键盘选择行为
	 */
	private setupSelectionHandlers(): void {
		if (!this.rootEl) {
			return;
		}

		this.clickHandler = () => {
			this.config.onSelect?.(this.config.index);
		};

		this.keydownHandler = (event) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				this.config.onSelect?.(this.config.index);
			}
		};

		this.rootEl.addEventListener('click', this.clickHandler);
		this.rootEl.addEventListener('keydown', this.keydownHandler);
	}

	/**
	 * 设置拖拽交互
	 */
	private setupDragHandlers(): void {
		if (!this.rootEl || !this.dragHandleEl) {
			return;
		}

		this.dragStartHandler = (event) => {
			this.config.onDragStart?.(this.config.index);
			this.rootEl?.addClass('note-architect-master-list__item--dragging');
			event.dataTransfer?.setData('text/plain', `${this.config.index}`);
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move';
			}
		};

		this.dragEndHandler = () => {
			this.rootEl?.classList.remove('note-architect-master-list__item--dragging');
			this.clearDropClasses();
			this.config.onDragEnd?.();
		};

		this.dragHandleEl.addEventListener('dragstart', this.dragStartHandler);
		this.dragHandleEl.addEventListener('dragend', this.dragEndHandler);

		this.dragOverHandler = (event) => {
			const draggedIndex = this.config.getDraggedIndex?.();
			if (draggedIndex === null || draggedIndex === undefined || draggedIndex === this.config.index) {
				return;
			}
			event.preventDefault();
			event.dataTransfer && (event.dataTransfer.dropEffect = 'move');

			const isAfter = isDropAfter(event, this.rootEl!);
			this.rootEl!.classList.toggle('note-architect-master-list__item--drag-over-before', !isAfter);
			this.rootEl!.classList.toggle('note-architect-master-list__item--drag-over-after', isAfter);
		};

		this.dragLeaveHandler = () => {
			this.clearDropClasses();
		};

		this.dropHandler = (event) => {
			const draggedIndex = this.config.getDraggedIndex?.();
			if (draggedIndex === null || draggedIndex === undefined || draggedIndex === this.config.index) {
				return;
			}
			event.preventDefault();

			const isAfter = isDropAfter(event, this.rootEl!);
			this.config.onReorder?.(draggedIndex, this.config.index, isAfter);
			this.clearDropClasses();
		};

		this.rootEl.addEventListener('dragover', this.dragOverHandler);
		this.rootEl.addEventListener('dragleave', this.dragLeaveHandler);
		this.rootEl.addEventListener('drop', this.dropHandler);
	}

	/**
	 * 清除拖拽提示样式
	 */
	clearDropClasses(): void {
		if (!this.rootEl) {
			return;
		}
		this.rootEl.classList.remove('note-architect-master-list__item--drag-over-before');
		this.rootEl.classList.remove('note-architect-master-list__item--drag-over-after');
	}

	getIndex(): number {
		return this.config.index;
	}

	containsElement(element: HTMLElement | null): boolean {
		if (!this.rootEl || !element) {
			return false;
		}
		return this.rootEl === element || this.rootEl.contains(element);
	}

	/**
	 * 渲染完成后触发入场动画
	 */
	private triggerEnterAnimation(): void {
		if (!this.rootEl) {
			return;
		}

		const className = 'note-architect-master-list__item--entering';
		this.rootEl.classList.remove(className);
		// 强制重绘，确保重复渲染时动画可重新触发
		void this.rootEl.offsetHeight;

		const handleAnimationEnd = () => {
			this.rootEl?.classList.remove(className);
			if (this.rootEl && this.animationEndHandler) {
				this.rootEl.removeEventListener('animationend', this.animationEndHandler);
			}
			this.animationEndHandler = undefined;
		};

		this.animationEndHandler = handleAnimationEnd;
		this.rootEl.addEventListener('animationend', handleAnimationEnd);
		this.rootEl.addClass(className);
	}
}
