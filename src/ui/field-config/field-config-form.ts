import { FrontmatterField, FrontmatterFieldType, DEFAULT_SETTINGS } from '../../types/settings';
import { normalizeStringArray } from '../../utils/data-transformer';

/**
 * FieldConfigForm 配置接口
 */
export interface FieldConfigFormConfig {
	field: FrontmatterField;
	fieldIndex: number;
	onFieldChange: (field: FrontmatterField, fieldIndex: number) => void;
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

	constructor(config: FieldConfigFormConfig) {
		this.config = config;
	}

	/**
	 * 渲染配置表单
	 */
	render(containerEl: HTMLElement): void {
		containerEl.empty();
		containerEl.addClass('note-architect-field-config');

		this.renderKeyInput(containerEl);
		this.renderLabelInput(containerEl);
		this.renderTypeSelect(containerEl);
		this.renderDefaultInput(containerEl);
		this.renderOptionsSection(containerEl);
		this.renderDescriptionInput(containerEl);
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
	 * 销毁组件
	 */
	destroy(): void {
		// 清理缓存
		this.manualDefaultCache.delete(this.config.field);
		this.multiSelectDefaultContainers.delete(this.config.field);
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
			cls: 'note-architect-field-input'
		});

		input.addEventListener('input', () => {
			this.config.field.key = input.value.trim();
			this.notifyFieldChange();
		});
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
			cls: 'note-architect-field-input'
		});

		input.addEventListener('input', () => {
			this.config.field.label = input.value.trim();
			this.notifyFieldChange();
		});
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
			cls: 'note-architect-field-input note-architect-field-select'
		});

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

		select.addEventListener('change', () => {
			this.handleTypeChange(select.value as FrontmatterFieldType);
		});
	}

	/**
	 * 渲染默认值输入框
	 */
	private renderDefaultInput(container: HTMLElement): void {
		const row = this.createFieldRow(container, { stacked: this.config.field.type === 'multi-select' });
		row.createEl('label', {
			text: '默认值:',
			cls: 'note-architect-field-label'
		});

		this.multiSelectDefaultContainers.delete(this.config.field);

		const contentContainer = row.createDiv('note-architect-field-default-content');

		if (this.config.field.type === 'multi-select') {
			this.renderMultiSelectDefaultControls(contentContainer);
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
			cls: 'note-architect-field-input'
		});

		if (!this.config.field.useTemplaterTimestamp) {
			this.manualDefaultCache.set(this.config.field, normalizedDefault);
		}

		input.disabled = this.config.field.useTemplaterTimestamp === true;
		input.addEventListener('input', () => {
			this.config.field.default = input.value;
			if (!this.config.field.useTemplaterTimestamp) {
				this.manualDefaultCache.set(this.config.field, input.value);
			}
			this.notifyFieldChange();
		});

		if (this.config.field.type === 'date') {
			this.renderDateAutoFillControls(container, input);
		}
	}

	/**
	 * 渲染选项配置区域（仅针对 select/multi-select）
	 */
	private renderOptionsSection(container: HTMLElement): void {
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

		const addOptionBtn = row.createEl('button', {
			text: '添加选项',
			cls: 'mod-small note-architect-field-options__btn'
		});
		addOptionBtn.onclick = () => this.addOption(optionsListContainer);
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
			cls: 'note-architect-field-input note-architect-field-textarea'
		});
		// 设置 textarea 的 rows 属性
		(textarea as any).rows = 2;

		textarea.addEventListener('input', () => {
			this.config.field.description = textarea.value.trim();
			this.notifyFieldChange();
		});
	}

	/**
	 * 渲染日期自动填充控件
	 */
	private renderDateAutoFillControls(
		container: HTMLElement,
		inputEl: HTMLInputElement
	): void {
		const row = this.createFieldRow(container, { stacked: true });
		row.addClass('note-architect-date-autofill-row');

		const controls = row.createDiv('note-architect-date-autofill__controls');
		const checkboxId = `note-architect-date-autofill-${Math.random().toString(36).slice(2)}`;
		const checkbox = controls.createEl('input', {
			type: 'checkbox',
			cls: 'note-architect-date-autofill__checkbox',
		});
		checkbox.id = checkboxId;
		checkbox.checked = this.config.field.useTemplaterTimestamp === true;

		const labelEl = controls.createEl('label', {
			cls: 'note-architect-date-autofill__label',
			text: '自动填入当前时间（Templater）',
		});
		labelEl.htmlFor = checkboxId;

		const previewEl = row.createDiv('setting-item-description note-architect-date-autofill__preview');

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
				previewEl.setText(`预览：${templaterExpression}`);
				previewEl.toggleClass('is-hidden', false);
			} else {
				const manualValue = this.manualDefaultCache.get(this.config.field) ?? '';
				this.config.field.default = manualValue;
				inputEl.value = manualValue;
				this.manualDefaultCache.set(this.config.field, manualValue);
				previewEl.empty();
				previewEl.toggleClass('is-hidden', true);
			}

			this.config.field.useTemplaterTimestamp = enabled;
			inputEl.disabled = enabled;
			checkbox.checked = enabled;
			this.notifyFieldChange();
		};

		applyAutoFillState(this.config.field.useTemplaterTimestamp === true, { initial: true });

		checkbox.addEventListener('change', () => {
			applyAutoFillState(checkbox.checked);
		});
	}

	/**
	 * 渲染选项列表
	 */
	private renderOptionsList(containerEl: HTMLElement): void {
		containerEl.empty();

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
				cls: 'note-architect-field-input'
			});
			optionInput.addEventListener('input', () => {
				if (this.config.field.options) {
					this.config.field.options[optionIndex] = optionInput.value.trim();
					this.refreshMultiSelectDefaults();
					this.notifyFieldChange();
				}
			});

			const removeOptionBtn = optionItem.createEl('button', {
				text: '删除',
				cls: 'mod-small mod-warning note-architect-field-options__remove'
			});
			removeOptionBtn.onclick = () => this.removeOption(optionIndex);
		});
	}

	/**
	 * 渲染多选默认值控件
	 */
	private renderMultiSelectDefaultControls(container: HTMLElement): void {
		container.empty();
		this.multiSelectDefaultContainers.set(this.config.field, container);

		const options = Array.isArray(this.config.field.options)
			? this.config.field.options.map(option => option.trim()).filter(Boolean)
			: [];
		const allowedOptions = options.length > 0 ? new Set(options) : undefined;
		const normalizedDefault = normalizeStringArray(
			this.config.field.default,
			allowedOptions && allowedOptions.size > 0 ? allowedOptions : undefined,
		);
		this.config.field.default = normalizedDefault;

		if (options.length === 0) {
			container.createEl('small', {
				text: '请先添加选项以设置默认值。',
				cls: 'setting-item-description'
			});
			return;
		}

		container.createEl('small', {
			text: '勾选需要自动填入的默认选项。',
			cls: 'setting-item-description'
		});

		const checkboxContainer = container.createDiv('note-architect-multi-select-container');

		const syncDefault = () => {
			const selected: string[] = [];
			checkboxContainer.querySelectorAll('input[type="checkbox"]').forEach((node) => {
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

			const optionRow = checkboxContainer.createDiv('note-architect-checkbox-container');
			const checkbox = optionRow.createEl('input', {
				type: 'checkbox',
				value: normalizedOption,
				cls: 'note-architect-form-checkbox'
			}) as HTMLInputElement;

			const currentDefaults = Array.isArray(this.config.field.default) ? this.config.field.default : [];
			checkbox.checked = currentDefaults.includes(normalizedOption);

			checkbox.addEventListener('change', syncDefault);

			const label = optionRow.createEl('label', {
				text: normalizedOption,
				cls: 'note-architect-form-label'
			});
			label.htmlFor = `${checkbox.id}-${normalizedOption}`;
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
		this.config.field.type = newType;

		if (newType !== 'select' && newType !== 'multi-select') {
			this.config.field.options = [];
		}

		if (newType !== 'date') {
			this.config.field.useTemplaterTimestamp = false;
			if (newType !== 'multi-select') {
				const cachedDefault = this.manualDefaultCache.get(this.config.field);
				if (typeof cachedDefault === 'string') {
					this.config.field.default = cachedDefault;
				} else if (Array.isArray(this.config.field.default)) {
					this.config.field.default = this.config.field.default[0] ?? '';
				}
			}
		}

		if (newType === 'multi-select') {
			const normalizedOptions = Array.isArray(this.config.field.options)
				? new Set(this.config.field.options.map(option => option.trim()).filter(Boolean))
				: undefined;
			this.config.field.default = normalizeStringArray(
				this.config.field.default,
				normalizedOptions && normalizedOptions.size > 0 ? normalizedOptions : undefined,
			);
		} else if (Array.isArray(this.config.field.default)) {
			this.config.field.default = this.config.field.default[0] ?? '';
		}

		// 通知父组件重新渲染整个表单
		this.notifyFieldChange();
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
		this.notifyFieldChange();
	}

	/**
	 * 删除选项
	 */
	private removeOption(optionIndex: number): void {
		if (this.config.field.options) {
			this.config.field.options.splice(optionIndex, 1);
		}

		// 通知父组件重新渲染整个表单
		this.notifyFieldChange();
	}

	/**
	 * 刷新多选默认值
	 */
	private refreshMultiSelectDefaults(): void {
		const container = this.multiSelectDefaultContainers.get(this.config.field);
		if (!container) {
			return;
		}
		this.renderMultiSelectDefaultControls(container);
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
}