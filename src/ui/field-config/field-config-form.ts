import { FrontmatterField, FrontmatterFieldType, DEFAULT_SETTINGS } from '../../types/settings';
import { normalizeStringArray } from '../../utils/data-transformer';
import { DomEventManager } from '@ui/dom-event-manager';
import { setIcon } from 'obsidian';
import type { FieldValidationErrors, FieldValidationErrorKey } from './validation';

/**
 * FieldConfigForm 配置接口
 */
export interface FieldConfigFormConfig {
	field: FrontmatterField;
	fieldIndex: number;
	onFieldChange: (field: FrontmatterField, fieldIndex: number) => void;
	onStructuralChange?: (field: FrontmatterField, fieldIndex: number) => void;
	settingsManager?: {
		getSettings: () => { defaultDateFormat?: string };
	};
}

/**
 * 字段配置表单组件
 * 负责渲染和管理单个字段的配置表单
 */
export class FieldConfigForm {
	private readonly config: FieldConfigFormConfig;
	private readonly manualDefaultCache = new WeakMap<FrontmatterField, string>();
	private readonly multiSelectDefaultContainers = new WeakMap<FrontmatterField, HTMLElement>();
	private containerEl?: HTMLElement;
	private readonly formEvents = new DomEventManager();
	private readonly optionsEvents = new DomEventManager();
	private readonly multiSelectDefaultEvents = new DomEventManager();
	private keyInputEl?: HTMLInputElement;
	private labelInputEl?: HTMLInputElement;
	private typeSelectEl?: HTMLSelectElement;
	private defaultInputEl?: HTMLInputElement;
	private descriptionInputEl?: HTMLTextAreaElement;
	private optionsListContainer?: HTMLElement;
	private multiSelectDefaultContainer?: HTMLElement;
	private dateAutoFillCheckbox?: HTMLInputElement;
	private dateAutoFillPreviewEl?: HTMLElement;
	private validationErrors: FieldValidationErrors | null = null;
	private fieldRowRefs: Partial<Record<FieldValidationErrorKey, HTMLDivElement>> = {};
	private errorElements: Partial<Record<FieldValidationErrorKey, HTMLDivElement>> = {};

	constructor(config: FieldConfigFormConfig) {
		this.config = config;
	}

	/**
	 * 渲染配置表单
	 */
	render(containerEl: HTMLElement): void {
		this.containerEl = containerEl;
		this.containerEl.classList.add('note-architect-field-config');
		this.renderFormContents();
	}

	/**
	 * 根据外部状态更新表单
	 * 智能判断是否需要重新渲染：对于结构性变更（类型、选项变化）会重新渲染，
	 * 对于普通值变更只更新内部状态，避免输入框失焦
	 */
	update(field: FrontmatterField, fieldIndex: number): void {
		const oldField = this.config.field;
		const previousIndex = this.config.fieldIndex ?? fieldIndex;
		this.config.field = field;
		this.config.fieldIndex = fieldIndex;

		// 检查是否为结构性变更
		if (this.isStructuralChange(oldField, field, previousIndex, fieldIndex)) {
			// 结构变了，重新渲染
			this.renderFormContents();
			return;
		}

		this.updateFormValues();
	}

	/**
	 * 更新字段数据
	 */
	updateField(field: FrontmatterField): void {
		this.config.field = field;
	}

	/**
	 * 获取当前字段数据
	 */
	getField(): FrontmatterField {
		return { ...this.config.field };
	}

	/**
	 * 从外部注入验证错误并更新内联提示
	 */
	setValidationErrors(errors: FieldValidationErrors | null): void {
		this.validationErrors = errors;
		this.applyAllValidationFeedback();
	}

	/**
	 * 销毁组件
	 */
	destroy(): void {
		// 清理缓存
		this.manualDefaultCache.delete(this.config.field);
		this.multiSelectDefaultContainers.delete(this.config.field);
		this.formEvents.dispose();
		this.optionsEvents.dispose();
		this.multiSelectDefaultEvents.dispose();
		if (this.containerEl) {
			this.containerEl.innerHTML = '';
			this.containerEl.classList.remove('note-architect-field-config');
		}
		this.resetElementRefs();
		this.containerEl = undefined;
	}

	/**
	 * 实际渲染表单结构
	 */
	private renderFormContents(): void {
		if (!this.containerEl) {
			return;
		}

		this.formEvents.dispose();
		this.optionsEvents.dispose();
		this.multiSelectDefaultEvents.dispose();
		this.resetElementRefs();
		this.containerEl.innerHTML = '';
		this.renderKeyInput(this.containerEl);
		this.renderLabelInput(this.containerEl);
		this.renderTypeSelect(this.containerEl);
		this.renderDefaultInput(this.containerEl);
		this.renderOptionsSection(this.containerEl);
		this.renderDescriptionInput(this.containerEl);
		this.applyAllValidationFeedback();
	}

	/**
	 * 重置输入节点引用，避免指向过期 DOM
	 */
	private resetElementRefs(): void {
		this.keyInputEl = undefined;
		this.labelInputEl = undefined;
		this.typeSelectEl = undefined;
		this.defaultInputEl = undefined;
		this.descriptionInputEl = undefined;
		this.optionsListContainer = undefined;
		this.multiSelectDefaultContainer = undefined;
		this.dateAutoFillCheckbox = undefined;
		this.dateAutoFillPreviewEl = undefined;
		this.fieldRowRefs = {};
		this.errorElements = {};
	}

	/**
	 * 渲染键名输入框
	 */
	private renderKeyInput(container: HTMLElement): void {
		const row = this.createFieldRow(container);
		row.createEl('label', {
			text: 'Frontmatter 键名: *',
			cls: 'note-architect-field-label'
		});

		const input = row.createEl('input', {
			type: 'text',
			value: this.config.field.key,
			placeholder: '例如: status, category, priority',
			cls: 'note-architect-input-base note-architect-field-input'
		});
		this.keyInputEl = input;

		this.formEvents.add(input, 'input', () => {
			this.config.field.key = input.value.trim();
			this.notifyFieldChange();
		});

		this.registerValidationSlot('key', row);
		this.applyValidationFeedback('key');
	}

	/**
	 * 渲染显示名称输入框
	 */
	private renderLabelInput(container: HTMLElement): void {
		const row = this.createFieldRow(container);
		row.createEl('label', {
			text: '显示名称: *',
			cls: 'note-architect-field-label'
		});

		const input = row.createEl('input', {
			type: 'text',
			value: this.config.field.label,
			placeholder: '例如: 状态, 分类, 优先级',
			cls: 'note-architect-input-base note-architect-field-input'
		});
		this.labelInputEl = input;

		this.formEvents.add(input, 'input', () => {
			this.config.field.label = input.value.trim();
			this.notifyFieldChange();
		});

		this.registerValidationSlot('label', row);
		this.applyValidationFeedback('label');
	}

	/**
	 * 渲染字段类型选择器
	 */
	private renderTypeSelect(container: HTMLElement): void {
		const row = this.createFieldRow(container);
		row.createEl('label', {
			text: '字段类型: *',
			cls: 'note-architect-field-label'
		});

		const select = row.createEl('select', {
			cls: 'note-architect-input-base note-architect-field-input note-architect-field-select'
		});
		this.typeSelectEl = select;

		const types: FrontmatterFieldType[] = ['text', 'select', 'date', 'multi-select'];
		types.forEach(type => {
			const option = select.createEl('option', {
				value: type,
				text: this.getTypeLabel(type)
			});
			if (type === this.config.field.type) {
				option.selected = true;
			}
		});

		this.formEvents.add(select, 'change', () => {
			this.handleTypeChange(select.value as FrontmatterFieldType);
		});
	}

	/**
	 * 渲染默认值输入框
	 */
	private renderDefaultInput(container: HTMLElement): void {
		const row = this.createFieldRow(container, { stacked: this.config.field.type === 'multi-select' || this.config.field.type === 'select' });
		row.createEl('label', {
			text: '默认值:',
			cls: 'note-architect-field-label'
		});

		this.multiSelectDefaultContainers.delete(this.config.field);
		this.multiSelectDefaultContainer = undefined;
		this.defaultInputEl = undefined;
		this.dateAutoFillCheckbox = undefined;
		this.dateAutoFillPreviewEl = undefined;

		const contentContainer = row.createDiv('note-architect-field-default-content');

		if (this.config.field.type === 'multi-select' || this.config.field.type === 'select') {
			this.multiSelectDefaultContainer = contentContainer;
			this.renderSelectDefaultControls(contentContainer);
			return;
		}

		const normalizedDefault = typeof this.config.field.default === 'string'
			? this.config.field.default
			: Array.isArray(this.config.field.default)
				? this.config.field.default[0] ?? ''
				: '';
		this.config.field.default = normalizedDefault;

		const input = contentContainer.createEl('input', {
			type: 'text',
			value: normalizedDefault,
			placeholder: '默认值或 Templater 宏（可选）',
			cls: 'note-architect-input-base note-architect-field-input'
		});
		this.defaultInputEl = input;

		if (!this.config.field.useTemplaterTimestamp) {
			this.manualDefaultCache.set(this.config.field, normalizedDefault);
		}

		input.disabled = this.config.field.useTemplaterTimestamp === true;
		this.formEvents.add(input, 'input', () => {
			this.config.field.default = input.value;
			if (!this.config.field.useTemplaterTimestamp) {
				this.manualDefaultCache.set(this.config.field, input.value);
			}
			this.notifyFieldChange();
		});

		if (this.config.field.type === 'date') {
			console.log('[renderDefaultInput] Rendering date autofill controls.'); // 添加日志
			this.renderDateAutoFillControls(container, input);
		}
	}

	/**
	 * 渲染选项配置区域（仅针对 select/multi-select）
	 */
	private renderOptionsSection(container: HTMLElement): void {
		this.optionsListContainer = undefined;
		if (this.config.field.type !== 'select' && this.config.field.type !== 'multi-select') {
			return;
		}

		const row = this.createFieldRow(container, { stacked: true });
		row.createEl('label', {
			text: '选项列表:',
			cls: 'note-architect-field-label'
		});

		const optionsListContainer = row.createDiv('note-architect-options-list');
		this.renderOptionsList(optionsListContainer);
		this.optionsListContainer = optionsListContainer;

		const actions = row.createDiv('note-architect-field-options__actions');
		const addOptionBtn = actions.createEl('button', {
			text: '添加选项',
			cls: 'note-architect-field-options__add'
		});
		this.formEvents.add(addOptionBtn, 'click', () => this.addOption(optionsListContainer));

		this.registerValidationSlot('options', row);
		this.applyValidationFeedback('options');
	}

	/**
	 * 渲染描述输入框
	 */
	private renderDescriptionInput(container: HTMLElement): void {
		const row = this.createFieldRow(container);
		row.createEl('label', {
			text: '字段描述:',
			cls: 'note-architect-field-label'
		});

		const textarea = row.createEl('textarea', {
			value: this.config.field.description || '',
			placeholder: '字段描述（可选）',
			cls: 'note-architect-input-base note-architect-field-input note-architect-field-textarea'
		});
		this.descriptionInputEl = textarea;
		// 设置 textarea 的 rows 属性
		(textarea as any).rows = 2;

		this.formEvents.add(textarea, 'input', () => {
			this.config.field.description = textarea.value.trim();
			this.notifyFieldChange();
		});
	}

	/**
	 * 仅更新已有节点的取值，避免整表单重建
	 */
	private updateFormValues(): void {
		this.syncTextInputValue(this.keyInputEl, this.config.field.key ?? '');
		this.syncTextInputValue(this.labelInputEl, this.config.field.label ?? '');
		this.syncTextInputValue(this.descriptionInputEl, this.config.field.description ?? '');

		if (this.typeSelectEl) {
			this.typeSelectEl.value = this.config.field.type;
		}

		this.updateDefaultValueControls();
		this.updateOptionsControls();
	}

	private syncTextInputValue(
		target: HTMLInputElement | HTMLTextAreaElement | undefined,
		value: string,
	): void {
		if (!target) {
			return;
		}
		if (target.value === value) {
			return;
		}
		target.value = value;
	}

	private updateDefaultValueControls(): void {
		if (this.config.field.type === 'multi-select' || this.config.field.type === 'select') {
			if (this.multiSelectDefaultContainer) {
				this.renderSelectDefaultControls(this.multiSelectDefaultContainer);
			}
			return;
		}

		if (!this.defaultInputEl) {
			return;
		}

		const normalizedDefault = this.getScalarDefaultValue(this.config.field);
		this.defaultInputEl.disabled = this.config.field.useTemplaterTimestamp === true;
		this.syncTextInputValue(this.defaultInputEl, normalizedDefault);

		if (!this.config.field.useTemplaterTimestamp) {
			this.manualDefaultCache.set(this.config.field, normalizedDefault);
		}

		if (this.config.field.type === 'date') {
			this.updateDateAutofillPreview(normalizedDefault);
		} else {
			this.dateAutoFillPreviewEl && (this.dateAutoFillPreviewEl.innerHTML = '');
			this.dateAutoFillPreviewEl?.classList.toggle('is-hidden', true);
			if (this.dateAutoFillCheckbox) {
				this.dateAutoFillCheckbox.checked = false;
			}
		}
	}

	private updateOptionsControls(): void {
		if (!this.optionsListContainer) {
			return;
		}

		if (this.config.field.type !== 'select' && this.config.field.type !== 'multi-select') {
			this.optionsListContainer.innerHTML = '';
			return;
		}

		this.renderOptionsList(this.optionsListContainer);
	}

	private getScalarDefaultValue(field: FrontmatterField): string {
		if (typeof field.default === 'string') {
			return field.default;
		}
		if (Array.isArray(field.default)) {
			return field.default[0] ?? '';
		}
		return '';
	}

	private updateDateAutofillPreview(currentValue: string): void {
		if (!this.dateAutoFillCheckbox || !this.dateAutoFillPreviewEl || !this.defaultInputEl) {
			return;
		}
		const templaterEnabled = this.config.field.useTemplaterTimestamp === true;
		this.dateAutoFillCheckbox.checked = templaterEnabled;
		this.defaultInputEl.disabled = templaterEnabled;

		if (templaterEnabled) {
			const displayValue = currentValue || this.buildTemplaterDateExpression();
			if (this.defaultInputEl.value !== displayValue) {
				this.defaultInputEl.value = displayValue;
			}
			this.dateAutoFillPreviewEl.textContent = `预览：${displayValue}`;
			this.dateAutoFillPreviewEl.classList.toggle('is-hidden', false);
		} else {
			this.dateAutoFillPreviewEl.innerHTML = '';
			this.dateAutoFillPreviewEl.classList.toggle('is-hidden', true);
		}
	}

	/**
	 * 渲染日期自动填充控件
	 */
	private renderDateAutoFillControls(
		container: HTMLElement,
		inputEl: HTMLInputElement
	): void {
		const row = this.createFieldRow(container, { stacked: true });
		row.classList.add('note-architect-date-autofill-row');

		const controls = row.createDiv('note-architect-date-autofill__controls');
		const checkboxId = `note-architect-date-autofill-${Math.random().toString(36).slice(2)}`;
		const checkbox = controls.createEl('input', {
			type: 'checkbox',
			cls: 'note-architect-date-autofill__checkbox',
		});
		checkbox.id = checkboxId;
		checkbox.checked = this.config.field.useTemplaterTimestamp === true;
		this.dateAutoFillCheckbox = checkbox;

		const labelEl = controls.createEl('label', {
			cls: 'note-architect-date-autofill__label',
			text: '自动填入当前时间（Templater）',
		});
		labelEl.htmlFor = checkboxId;

		const previewEl = row.createDiv('setting-item-description note-architect-date-autofill__preview');
		this.dateAutoFillPreviewEl = previewEl;

		const applyAutoFillState = (enabled: boolean, options: { initial?: boolean } = {}) => {
			const { initial = false } = options;

			if (enabled) {
				if (!initial && !this.manualDefaultCache.has(this.config.field)) {
					this.manualDefaultCache.set(this.config.field, inputEl.value);
				}
				if (initial && !this.manualDefaultCache.has(this.config.field)) {
					this.manualDefaultCache.set(this.config.field, '');
				}
				const templaterExpression = this.buildTemplaterDateExpression();
				this.config.field.default = templaterExpression;
				inputEl.value = templaterExpression;
				previewEl.textContent = `预览：${templaterExpression}`;
				previewEl.classList.toggle('is-hidden', false);
			} else {
				const manualValue = this.manualDefaultCache.get(this.config.field) ?? '';
				this.config.field.default = manualValue;
				inputEl.value = manualValue;
				this.manualDefaultCache.set(this.config.field, manualValue);
				previewEl.innerHTML = '';
				previewEl.classList.toggle('is-hidden', true);
			}

			this.config.field.useTemplaterTimestamp = enabled;
			inputEl.disabled = enabled;
			checkbox.checked = enabled;
			this.notifyFieldChange();
		};

		applyAutoFillState(this.config.field.useTemplaterTimestamp === true, { initial: true });

		this.formEvents.add(checkbox, 'change', () => {
			applyAutoFillState(checkbox.checked);
		});
	}

	/**
	 * 渲染选项列表
	 */
	private renderOptionsList(containerEl: HTMLElement): void {
		this.optionsEvents.dispose();
		containerEl.innerHTML = '';

		if (!this.config.field.options || this.config.field.options.length === 0) {
			containerEl.createEl('small', {
				text: '暂无选项，点击"添加选项"添加。',
				cls: 'setting-item-description'
			});
			return;
		}

		this.config.field.options.forEach((option, optionIndex) => {
			const optionItem = containerEl.createDiv('note-architect-option-item');

			const optionInput = optionItem.createEl('input', {
				type: 'text',
				value: option,
				placeholder: '选项值',
				cls: 'note-architect-input-base note-architect-field-input'
			});
			this.optionsEvents.add(optionInput, 'input', () => {
				if (this.config.field.options) {
					this.config.field.options[optionIndex] = optionInput.value.trim();
					this.refreshMultiSelectDefaults();
					this.notifyFieldChange();
				}
			});

			const removeOptionBtn = optionItem.createEl('button', {
				cls: 'clickable-icon note-architect-option-remove',
				attr: { 'aria-label': '删除选项' }
			});
			setIcon(removeOptionBtn, 'trash-2');
			this.optionsEvents.add(removeOptionBtn, 'click', () => this.removeOption(optionIndex));
		});
	}

	/**
	 * 渲染选择类型默认值控件（支持单选和多选）
	 */
	private renderSelectDefaultControls(container: HTMLElement): void {
		this.multiSelectDefaultEvents.dispose();
		container.innerHTML = '';
		this.multiSelectDefaultContainers.set(this.config.field, container);
		this.multiSelectDefaultContainer = container;

		const options = Array.isArray(this.config.field.options)
			? this.config.field.options.map(option => option.trim()).filter(Boolean)
			: [];
		const allowedOptions = options.length > 0 ? new Set(options) : undefined;

		// 根据字段类型处理默认值
		if (this.config.field.type === 'multi-select') {
			const normalizedDefault = normalizeStringArray(
				this.config.field.default,
				allowedOptions && allowedOptions.size > 0 ? allowedOptions : undefined,
			);
			this.config.field.default = normalizedDefault;
		} else {
			// 单选字段：确保默认值是字符串或空字符串
			const currentDefault = this.config.field.default;
			const normalizedDefault = typeof currentDefault === 'string' ? currentDefault :
				(Array.isArray(currentDefault) && currentDefault.length > 0 ? currentDefault[0] : '');

			// 验证默认值是否在选项中
			if (allowedOptions && allowedOptions.size > 0 && normalizedDefault && !allowedOptions.has(normalizedDefault)) {
				this.config.field.default = '';
			} else {
				this.config.field.default = normalizedDefault;
			}
		}

		if (options.length === 0) {
			container.createEl('small', {
				text: '请先添加选项以设置默认值。',
				cls: 'setting-item-description'
			});
			return;
		}

		// 根据类型显示不同的提示文本
		const descriptionText = this.config.field.type === 'multi-select'
			? '勾选需要自动填入的默认选项。'
			: '选择一个默认选项（可选）。';

		container.createEl('small', {
			text: descriptionText,
			cls: 'setting-item-description'
		});

		const controlsContainer = container.createDiv('note-architect-multi-select-container');

		if (this.config.field.type === 'multi-select') {
			this.renderMultiSelectCheckboxes(controlsContainer, options);
		} else {
			this.renderSingleSelectRadios(controlsContainer, options);
		}
	}

	/**
	 * 渲染多选复选框
	 */
	private renderMultiSelectCheckboxes(container: HTMLElement, options: string[]): void {
		const syncDefault = () => {
			const selected: string[] = [];
			container.querySelectorAll('input[type="checkbox"]').forEach((node) => {
				const checkbox = node as HTMLInputElement;
				if (checkbox.checked) {
					const value = checkbox.value.trim();
					if (value) {
						selected.push(value);
					}
				}
			});
			this.config.field.default = selected;
			this.notifyFieldChange();
		};

		options.forEach((option) => {
			const normalizedOption = option.trim();
			if (!normalizedOption) {
				return;
			}

			const optionRow = container.createDiv('note-architect-checkbox-container');
			const checkbox = optionRow.createEl('input', {
				type: 'checkbox',
				value: normalizedOption,
				cls: 'note-architect-form-checkbox'
			}) as HTMLInputElement;

			const currentDefaults = Array.isArray(this.config.field.default) ? this.config.field.default : [];
			checkbox.checked = currentDefaults.includes(normalizedOption);

			this.multiSelectDefaultEvents.add(checkbox, 'change', syncDefault);

			const label = optionRow.createEl('label', {
				text: normalizedOption,
				cls: 'note-architect-form-label'
			});
			label.htmlFor = `${checkbox.id}-${normalizedOption}`;
		});
	}

	/**
	 * 渲染单选单选按钮（包含“无默认值”选项）
	 */
	private renderSingleSelectRadios(container: HTMLElement, options: string[]): void {
		const radioGroupName = `select-default-${this.config.fieldIndex}-${Math.random().toString(36).slice(2)}`;

		const syncDefault = () => {
			const selectedRadio = container.querySelector('input[type="radio"]:checked') as HTMLInputElement;
			if (selectedRadio) {
				this.config.field.default = selectedRadio.value;
			} else {
				this.config.field.default = '';
			}
			this.notifyFieldChange();
		};

		// 添加"无默认值"选项
		const noDefaultRow = container.createDiv('note-architect-checkbox-container');
		const noDefaultRadio = noDefaultRow.createEl('input', {
			type: 'radio',
			value: '',
			cls: 'note-architect-form-checkbox'
		}) as HTMLInputElement;
		noDefaultRadio.name = radioGroupName;

		const currentDefault = this.config.field.default;
		noDefaultRadio.checked = !currentDefault || currentDefault === '';

		this.multiSelectDefaultEvents.add(noDefaultRadio, 'change', syncDefault);

		const noDefaultLabel = noDefaultRow.createEl('label', {
			text: '（无默认值）',
			cls: 'note-architect-form-label'
		});
		noDefaultLabel.htmlFor = `${noDefaultRadio.id}-no-default`;

		// 渲染选项单选按钮
		options.forEach((option) => {
			const normalizedOption = option.trim();
			if (!normalizedOption) {
				return;
			}

			const optionRow = container.createDiv('note-architect-checkbox-container');
			const radio = optionRow.createEl('input', {
				type: 'radio',
				value: normalizedOption,
				cls: 'note-architect-form-checkbox'
			}) as HTMLInputElement;
			radio.name = radioGroupName;

			radio.checked = currentDefault === normalizedOption;

			this.multiSelectDefaultEvents.add(radio, 'change', syncDefault);

			const label = optionRow.createEl('label', {
				text: normalizedOption,
				cls: 'note-architect-form-label'
			});
			label.htmlFor = `${radio.id}-${normalizedOption}`;
		});
	}

	/**
	 * 创建字段配置行
	 */
	private createFieldRow(
		container: HTMLElement,
		options?: { stacked?: boolean }
	): HTMLDivElement {
		const classes = ['note-architect-field-row'];
		if (options?.stacked) {
			classes.push('note-architect-field-row--stacked');
		}
		return container.createDiv(classes.join(' '));
	}

	/**
	 * 处理字段类型变更
	 */
	private handleTypeChange(newType: FrontmatterFieldType): void {
		// 创建当前字段的一个深拷贝副本，而不是直接修改
		const updatedField = { ...this.getField(), type: newType };

		if (newType !== 'select' && newType !== 'multi-select') {
			updatedField.options = [];
		}

		if (newType !== 'date') {
			updatedField.useTemplaterTimestamp = false;
			if (newType !== 'multi-select') {
				const cachedDefault = this.manualDefaultCache.get(this.config.field);
				if (typeof cachedDefault === 'string') {
					updatedField.default = cachedDefault;
				} else if (Array.isArray(updatedField.default)) {
					updatedField.default = updatedField.default[0] ?? '';
				}
			}
		}

		if (newType === 'multi-select') {
			const normalizedOptions = Array.isArray(updatedField.options)
				? new Set(updatedField.options.map(option => option.trim()).filter(Boolean))
				: undefined;
			updatedField.default = normalizeStringArray(
				updatedField.default,
				normalizedOptions && normalizedOptions.size > 0 ? normalizedOptions : undefined,
			);
		} else if (Array.isArray(updatedField.default)) {
			updatedField.default = updatedField.default[0] ?? '';
		}

		// 使用修改后的副本通知父组件，避免直接修改内部状态
		if (this.config.onStructuralChange) {
			this.config.onStructuralChange(updatedField, this.config.fieldIndex);
		} else {
			// 如果没有提供结构性变更回调，则使用普通变更回调
			this.config.onFieldChange(updatedField, this.config.fieldIndex);
		}
	}

	/**
	 * 添加选项
	 */
	private addOption(containerEl: HTMLElement): void {
		if (!this.config.field.options) {
			this.config.field.options = [];
		}
		this.config.field.options.push('');
		this.renderOptionsList(containerEl);
		this.refreshMultiSelectDefaults();
		// 选项变更属于结构性变更，需要重新渲染
		this.notifyStructuralChange();
	}

	/**
	 * 删除选项
	 */
	private removeOption(optionIndex: number): void {
		if (this.config.field.options) {
			this.config.field.options.splice(optionIndex, 1);
		}

		// 选项变更属于结构性变更，需要重新渲染
		this.notifyStructuralChange();
	}

	/**
	 * 刷新多选默认值
	 */
	private refreshMultiSelectDefaults(): void {
		const container = this.multiSelectDefaultContainers.get(this.config.field);
		if (!container) {
			return;
		}
		this.renderSelectDefaultControls(container);
	}

	/**
	 * 检查两个字段是否为结构性变更
	 * 结构变更包括：字段类型、选项列表、使用Templater等
	 * 这些变更会触发表单的重新渲染
	 */
	private isStructuralChange(
		oldField: FrontmatterField,
		newField: FrontmatterField,
		previousIndex: number,
		nextIndex: number,
	): boolean {
		// 检查字段类型是否变化
		if (oldField.type !== newField.type) {
			return true;
		}

		// 切换到不同字段时，除类型外的差异只需更新取值
		if (previousIndex !== nextIndex) {
			return false;
		}

		// 检查选项是否变化（仅对 select/multi-select 类型）
		if ((newField.type === 'select' || newField.type === 'multi-select')) {
			const oldOptions = oldField.options || [];
			const newOptions = newField.options || [];

			// 检查选项数量或内容是否变化
			if (oldOptions.length !== newOptions.length) {
				return true;
			}

			for (let i = 0; i < oldOptions.length; i++) {
				if (oldOptions[i] !== newOptions[i]) {
					return true;
				}
			}
		}

		// 检查是否使用 Templater 时间戳的变化
		if (oldField.useTemplaterTimestamp !== newField.useTemplaterTimestamp) {
			return true;
		}

		// 其他的变更（key、label、default、description）不算结构性变更
		return false;
	}

	/**
	 * 构建 Templater 日期表达式
	 */
	private buildTemplaterDateExpression(): string {
		const formatRaw = this.config.settingsManager?.getSettings().defaultDateFormat ?? DEFAULT_SETTINGS.defaultDateFormat;
		const trimmed = typeof formatRaw === 'string' ? formatRaw.trim() : DEFAULT_SETTINGS.defaultDateFormat;
		const format = (trimmed || DEFAULT_SETTINGS.defaultDateFormat)
			.replace(/\\\\/g, '\\\\')
			.replace(/"/g, '\\"');
		return `<% tp.date.now("${format}") %>`;
	}

	/**
	 * 获取类型标签
	 */
	private getTypeLabel(type: FrontmatterFieldType): string {
		const labels: Record<FrontmatterFieldType, string> = {
			'text': '文本',
			'select': '单选',
			'date': '日期',
			'multi-select': '多选'
		};
		return labels[type];
	}

	/**
	 * 通知字段变更
	 */
	private notifyFieldChange(): void {
		this.config.onFieldChange(this.getField(), this.config.fieldIndex);
	}

	/**
	 * 通知结构性变更
	 */
	private notifyStructuralChange(): void {
		if (this.config.onStructuralChange) {
			this.config.onStructuralChange(this.getField(), this.config.fieldIndex);
		} else {
			// 如果没有提供结构性变更回调，则使用普通变更回调
			this.notifyFieldChange();
		}
	}

	private applyAllValidationFeedback(): void {
		const kinds: FieldValidationErrorKey[] = ['key', 'label', 'options'];
		kinds.forEach(kind => this.applyValidationFeedback(kind));
	}

	private applyValidationFeedback(kind: FieldValidationErrorKey): void {
		const row = this.fieldRowRefs[kind];
		const errorEl = this.errorElements[kind];
		const messages = this.validationErrors?.[kind] ?? [];
		const hasErrors = messages.length > 0;

		if (errorEl) {
			errorEl.textContent = hasErrors ? messages.join(' ') : '';
			errorEl.classList.toggle('is-hidden', !hasErrors);
		}

		row?.classList.toggle('note-architect-field-row--error', hasErrors);
		this.toggleInputErrorClass(kind, hasErrors);
	}

	private toggleInputErrorClass(kind: FieldValidationErrorKey, hasErrors: boolean): void {
		switch (kind) {
			case 'key':
				this.keyInputEl?.classList.toggle('note-architect-field-input--error', hasErrors);
				break;
			case 'label':
				this.labelInputEl?.classList.toggle('note-architect-field-input--error', hasErrors);
				break;
			case 'options':
				this.optionsListContainer?.classList.toggle('note-architect-options-list--error', hasErrors);
				break;
		}
	}

	private registerValidationSlot(kind: FieldValidationErrorKey, row: HTMLDivElement): void {
		const errorEl = this.createErrorMessage(row);
		this.fieldRowRefs[kind] = row;
		this.errorElements[kind] = errorEl;
	}

	private createErrorMessage(row: HTMLDivElement): HTMLDivElement {
		const errorEl = row.createDiv('note-architect-field-error is-hidden');
		errorEl.setAttribute('role', 'alert');
		return errorEl;
	}
}
