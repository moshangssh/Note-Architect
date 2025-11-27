import type { FrontmatterField } from '@types';
import type { SettingsManager } from '@settings';
import { FieldConfigForm } from './field-config-form';
import { DomEventManager } from '@ui/dom-event-manager';
import { setIcon } from 'obsidian';
import type { FieldValidationErrors } from './validation';

/**
 * DetailPanelView 配置项
 */
export interface DetailPanelViewConfig {
	containerEl: HTMLElement;
	settingsManager?: SettingsManager;
	onFieldChange?: (fieldIndex: number, field: FrontmatterField) => void;
	onDeleteField?: (fieldIndex: number) => void;
	onNavigateBack?: () => void;
}

/**
 * DetailPanelView 负责渲染右侧详情区域骨架
 */
export class DetailPanelView {
	private readonly containerEl: HTMLElement;
	private readonly config: DetailPanelViewConfig;
	private readonly sectionAnimationHandlers = new Map<HTMLElement, () => void>();
	private headerEl!: HTMLDivElement;
	private titleEl!: HTMLElement;
	private subtitleEl!: HTMLElement;
	private actionsEl!: HTMLDivElement;
	private backButtonEl?: HTMLButtonElement;
	private deleteButtonEl?: HTMLButtonElement;
	private bodyEl!: HTMLDivElement;
	private emptyStateEl!: HTMLDivElement;
	private formContainerEl!: HTMLDivElement;
	private fieldConfigForm?: FieldConfigForm;
	private activeFieldIndex: number | null = null;
	private readonly eventManager = new DomEventManager();
	private pendingValidation?: { fieldIndex: number | null; errors: FieldValidationErrors | null };

	constructor(config: DetailPanelViewConfig) {
		this.containerEl = config.containerEl;
		this.config = config;
		this.containerEl.addClass('note-architect-detail-panel');
		this.initializeLayout();
	}

	/**
	 * 渲染详情面板骨架
	 */
	render(field: FrontmatterField | null, fieldIndex: number | null): void {
		if (!field || fieldIndex === null) {
			this.activeFieldIndex = null;
			this.renderEmptyState();
			return;
		}

		this.activeFieldIndex = fieldIndex;
		this.showFormState();

		this.titleEl.setText(field.label?.trim() || `字段 ${fieldIndex + 1}`);
		this.subtitleEl.setText(field.key?.trim()
			? `Frontmatter 键名：${field.key}`
			: '尚未设置键名');

		if (!this.fieldConfigForm) {
			this.fieldConfigForm = new FieldConfigForm({
				field,
				fieldIndex,
				onFieldChange: (updatedField, idx) => this.config.onFieldChange?.(idx, updatedField),
				onStructuralChange: (updatedField, idx) => {
					this.config.onFieldChange?.(idx, updatedField);
					this.fieldConfigForm?.update(updatedField, idx);
				},
				settingsManager: this.config.settingsManager
			});
			this.fieldConfigForm.render(this.formContainerEl);
		} else {
			this.fieldConfigForm.update(field, fieldIndex);
		}

		this.applyValidationStateToForm();
		this.triggerSectionAnimation(this.formContainerEl);
	}

	/**
	 * 更新当前选中字段的标题和副标题，避免整体重渲
	 */
	updateActiveFieldSummary(field: FrontmatterField, fieldIndex: number): void {
		if (this.activeFieldIndex === null || this.activeFieldIndex !== fieldIndex) {
			return;
		}
		this.titleEl?.setText(field.label?.trim() || `字段 ${fieldIndex + 1}`);
		this.subtitleEl?.setText(field.key?.trim()
			? `Frontmatter 键名：${field.key}`
			: '尚未设置键名');
	}

	/**
	 * 提供聚焦第一个输入控件的能力
	 */
	focusOnFirstInput(): void {
		const firstInput = this.formContainerEl.querySelector<HTMLElement>('input, select, textarea');
		firstInput?.focus();
	}

	/**
	 * 注入外部验证错误以驱动 FieldConfigForm 的内联提示
	 */
	setValidationErrors(fieldIndex: number | null, errors: FieldValidationErrors | null): void {
		this.pendingValidation = { fieldIndex, errors };
		this.applyValidationStateToForm();
	}

	/**
	 * 销毁详情面板
	 */
	destroy(): void {
		this.eventManager.dispose();
		this.cleanupAnimations();
		this.destroyFieldForm();
		this.containerEl.empty();
	}

	private applyValidationStateToForm(): void {
		if (!this.fieldConfigForm) {
			return;
		}
		if (!this.pendingValidation) {
			this.fieldConfigForm.setValidationErrors(null);
			return;
		}
		if (this.activeFieldIndex === this.pendingValidation.fieldIndex) {
			this.fieldConfigForm.setValidationErrors(this.pendingValidation.errors ?? null);
		} else {
			this.fieldConfigForm.setValidationErrors(null);
		}
	}

	private renderEmptyState(): void {
		this.titleEl.setText('字段详情');
		this.subtitleEl.setText('请选择一个字段以开始编辑。');
		this.emptyStateEl.removeClass('is-hidden');
		this.formContainerEl.addClass('is-hidden');
		this.setDeleteButtonState(false);
		this.destroyFieldForm();
		this.triggerSectionAnimation(this.emptyStateEl);
	}

	private showFormState(): void {
		this.emptyStateEl.addClass('is-hidden');
		this.formContainerEl.removeClass('is-hidden');
		this.setDeleteButtonState(true);
	}

	private setDeleteButtonState(enabled: boolean): void {
		if (!this.deleteButtonEl) {
			return;
		}
		if (enabled) {
			this.deleteButtonEl.removeAttribute('disabled');
		} else {
			this.deleteButtonEl.setAttr('disabled', 'true');
		}
	}

	private destroyFieldForm(): void {
		if (this.fieldConfigForm) {
			this.fieldConfigForm.destroy();
			this.fieldConfigForm = undefined;
		}
		this.formContainerEl?.empty();
	}

	private initializeLayout(): void {
		this.containerEl.empty();

		this.headerEl = this.containerEl.createDiv('note-architect-detail-panel__header');
		const titleGroup = this.headerEl.createDiv('note-architect-detail-panel__title-group');
		this.titleEl = titleGroup.createEl('h3', { text: '字段详情' });
		this.subtitleEl = titleGroup.createSpan({
			cls: 'note-architect-detail-panel__subtitle',
			text: '请选择一个字段以开始编辑。'
		});

		this.actionsEl = this.headerEl.createDiv('note-architect-detail-panel__actions');
		this.backButtonEl = this.actionsEl.createEl('button', {
			text: '← 返回列表',
			cls: 'note-architect-detail-panel__back-btn'
		});
		this.deleteButtonEl = this.actionsEl.createEl('button', {
			cls: 'clickable-icon note-architect-detail-panel__delete-btn',
			attr: { 'aria-label': '删除字段' }
		}) as HTMLButtonElement;
		setIcon(this.deleteButtonEl, 'trash-2');

		this.eventManager.add(this.backButtonEl, 'click', () => {
			this.config.onNavigateBack?.();
		});
		this.eventManager.add(this.deleteButtonEl, 'click', () => {
			if (this.activeFieldIndex === null) {
				return;
			}
			this.config.onDeleteField?.(this.activeFieldIndex);
		});

		this.bodyEl = this.containerEl.createDiv('note-architect-detail-panel__body');
		this.emptyStateEl = this.bodyEl.createDiv('note-architect-detail-panel__empty');
		this.emptyStateEl.createEl('h3', { text: '暂无选中字段' });
		this.emptyStateEl.createEl('p', {
			text: '从左侧列表选择一个字段后，可在此处查看和编辑详细配置。'
		});

		this.formContainerEl = this.bodyEl.createDiv('note-architect-detail-panel__form-container');
		this.formContainerEl.addClass('is-hidden');
	}

	private triggerSectionAnimation(target?: HTMLElement): void {
		if (!target || this.prefersReducedMotion()) {
			return;
		}
		const className = 'note-architect-detail-panel__section--fade-in';
		const existingHandler = this.sectionAnimationHandlers.get(target);
		if (existingHandler) {
			target.removeEventListener('animationend', existingHandler);
		}
		target.classList.remove(className);
		void target.offsetHeight;

		const handler = () => {
			target.classList.remove(className);
			target.removeEventListener('animationend', handler);
			this.sectionAnimationHandlers.delete(target);
		};

		this.sectionAnimationHandlers.set(target, handler);
		target.addEventListener('animationend', handler);
		target.classList.add(className);
	}

	private prefersReducedMotion(): boolean {
		return typeof window !== 'undefined' &&
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	private cleanupAnimations(): void {
		this.sectionAnimationHandlers.forEach((handler, element) => {
			element.removeEventListener('animationend', handler);
		});
		this.sectionAnimationHandlers.clear();
	}
}
