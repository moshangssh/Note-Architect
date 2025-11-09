import { App, Modal, MarkdownView } from 'obsidian';
import type NoteArchitect from '@core/plugin';
import type { FrontmatterPreset, Template, TemplateInsertionResult, FrontmatterField } from '@types';
import { prepareTemplateWithUserInput } from '@engine/TemplateEngine';
import { handleError } from '@core/error';
import { notifyInfo, notifySuccess, notifyWarning } from '@utils/notify';
import { normalizeStringArray } from '@utils/data-transformer';
import { convertFormDataToFrontmatter } from '@utils/frontmatter/convert';
import { updateNoteFrontmatter } from '@utils/frontmatter-editor';
import { createMergedPreset } from './frontmatter/preset-field-merger';

export class FrontmatterManagerModal extends Modal {
	private readonly plugin: NoteArchitect;
	private readonly template: Template;
	private readonly sourcePresets: FrontmatterPreset[];
	private readonly mergedPreset: FrontmatterPreset;
	private readonly sourcePresetIds: string[];
	private readonly sourcePresetNames: string[];
	private formData: Record<string, unknown>;
	private readonly multiSelectFieldRefs: Map<string, HTMLElement> = new Map();
	private readonly fieldContainerRefs: Map<string, HTMLElement> = new Map();
	private readonly fieldErrorRefs: Map<string, HTMLElement> = new Map();
	private readonly fieldInputRefs: Map<string, HTMLElement> = new Map();
	private resolvedDefaults: Map<string, string | string[]> = new Map();
	private templaterDefaultsSkipped: Set<string> = new Set();
	private isResolving = true;
	private touchedFieldKeys: Set<string> = new Set();
	private currentFieldErrors: Record<string, string[]> = {};

	constructor(app: App, plugin: NoteArchitect, template: Template, presets: FrontmatterPreset[]) {
		super(app);
		this.plugin = plugin;
		this.template = template;
		this.sourcePresets = presets.length > 0 ? presets : [];
		const { mergedPreset, sourcePresetIds } = createMergedPreset(this.sourcePresets);
		this.mergedPreset = mergedPreset;
		this.sourcePresetIds = sourcePresetIds;
		this.sourcePresetNames = this.sourcePresets.map(preset => preset.name);
		this.formData = {};
	}

	onOpen() {
		const { contentEl } = this;

		// 设置模态窗口大小
		this.modalEl.style.width = '90vw';
		this.modalEl.style.maxWidth = '650px';
		this.modalEl.style.height = 'auto';
		this.modalEl.style.maxHeight = '85vh';

		// 创建标题
		contentEl.createEl('h2', {
			text: `配置模板: ${this.template.name}`,
			cls: 'note-architect-form-title'
		});

		// 创建主容器
		const mainContainer = contentEl.createDiv('note-architect-frontmatter-manager-container');

		// 创建说明区域
		const descriptionContainer = mainContainer.createDiv('note-architect-form-description');
		const descriptionText = this.sourcePresetNames.length > 1
			? `此模板引用了多个预设（${this.sourcePresetNames.join('、')}），请填写以下字段：`
			: `此模板引用了预设 "${this.mergedPreset.name}"，请填写以下字段：`;
		descriptionContainer.createEl('p', {
			text: descriptionText,
			cls: 'note-architect-form-description-text'
		});

		// 创建表单容器
		const formContainer = mainContainer.createDiv('note-architect-form-container');

		// 创建操作按钮容器
		const actionsContainer = mainContainer.createDiv('note-architect-form-actions');

		// 取消按钮
		const cancelBtn = actionsContainer.createEl('button', {
			text: '取消',
			cls: ''
		});
		cancelBtn.onclick = () => this.handleCancel();

		// 确认按钮（暂时禁用，等 Templater 解析完成后启用）
		const confirmBtn = actionsContainer.createEl('button', {
			text: '确认插入',
			cls: 'mod-cta'
		});
		confirmBtn.disabled = true;
		confirmBtn.onclick = () => this.handleConfirm();

		// 先解析 Templater 默认值，再渲染表单
		this.parseTemplaterDefaults().then(() => {
			this.isResolving = false;
			this.renderFormFields(formContainer);
			confirmBtn.disabled = false;
		}).catch((error) => {
			handleError(error, {
				context: 'FrontmatterManagerModal.parseTemplaterDefaults',
			});
			notifyWarning('部分默认值解析失败，已使用原始字段默认值。');
			this.isResolving = false;
			this.renderFormFields(formContainer);
			confirmBtn.disabled = false;
		});
	}

	/**
	 * 渲染表单字段
	 */
	private renderFormFields(containerEl: HTMLElement): void {
		containerEl.empty();
		this.multiSelectFieldRefs.clear();
		this.fieldContainerRefs.clear();
		this.fieldErrorRefs.clear();
		this.fieldInputRefs.clear();

		this.mergedPreset.fields.forEach((field) => {
			const fieldContainer = containerEl.createDiv('note-architect-form-field');
			fieldContainer.setAttr('data-field-key', field.key);
			this.fieldContainerRefs.set(field.key, fieldContainer);

			// 字段标签
			fieldContainer.createEl('label', {
				text: `${field.label}:`,
				cls: 'note-architect-form-label'
			});

			// 获取解析后的默认值
			const resolvedDefault = this.getResolvedDefault(field);
			const isTemplaterDefaultSkipped = this.templaterDefaultsSkipped.has(field.key);
			const isTemplaterAutofill = field.type === 'date' && field.useTemplaterTimestamp === true;
			const allowedOptions = this.buildAllowedOptionsSet(field.options);

			if (!(field.key in this.formData)) {
				if (field.type === 'multi-select') {
					this.formData[field.key] = normalizeStringArray(
						resolvedDefault,
						allowedOptions,
					);
				} else {
					this.formData[field.key] = typeof resolvedDefault === 'string' ? resolvedDefault : '';
				}
			}

			let inputEl: HTMLInputElement | HTMLSelectElement | undefined;

			if (isTemplaterAutofill) {
				const previewValue = this.coerceToString(this.formData[field.key]);
				const previewInput = fieldContainer.createEl('input', {
					type: 'text',
					cls: 'note-architect-form-input note-architect-form-input--readonly'
				}) as HTMLInputElement;
				previewInput.value = previewValue;
				previewInput.readOnly = true;
				previewInput.tabIndex = -1;

				const hintText = previewValue.includes('<%')
					? 'Templater 未执行，将写入原始表达式。'
					: '已自动填入当前时间，保存时将写入以上格式。';
				fieldContainer.createEl('small', {
					cls: 'setting-item-description',
					text: hintText
				});

				if (isTemplaterDefaultSkipped) {
					fieldContainer.createEl('small', {
						cls: 'setting-item-description',
						text: '检测到 Templater 表达式，此处不会预执行。'
					});
				}
			} else {
				switch (field.type) {
					case 'text': {
						const input = fieldContainer.createEl('input', {
							type: 'text',
							cls: 'note-architect-form-input'
						}) as HTMLInputElement;
						inputEl = input;
						this.fieldInputRefs.set(field.key, input);
						break;
					}

					case 'date': {
						const input = fieldContainer.createEl('input', {
							type: 'date',
							cls: 'note-architect-form-input'
						}) as HTMLInputElement;
						inputEl = input;
						this.fieldInputRefs.set(field.key, input);
						break;
					}

					case 'select': {
						const selectEl = fieldContainer.createEl('select', {
							cls: 'note-architect-form-select'
						}) as HTMLSelectElement;
						inputEl = selectEl;
						this.fieldInputRefs.set(field.key, selectEl);

						selectEl.createEl('option', {
							value: '',
							text: '请选择...'
						});

						if (field.options) {
							field.options.forEach(option => {
								selectEl.createEl('option', {
									value: option,
									text: option
								});
							});
						}
						break;
					}

					case 'multi-select': {
						const multiSelectContainer = fieldContainer.createDiv('note-architect-multi-select-container');
						this.multiSelectFieldRefs.set(field.key, multiSelectContainer);

						const currentSelection = normalizeStringArray(
							this.formData[field.key] ?? resolvedDefault,
							allowedOptions,
						);
						this.formData[field.key] = currentSelection;

						if (field.options && field.options.length > 0) {
							field.options.forEach(option => {
								const normalizedOption = option.trim();
								const optionContainer = multiSelectContainer.createDiv('note-architect-checkbox-container');

								const checkbox = optionContainer.createEl('input', {
									type: 'checkbox',
									value: normalizedOption,
									cls: 'note-architect-form-checkbox'
								}) as HTMLInputElement;

								checkbox.addEventListener('change', () => {
									this.collectMultiSelectData();
									this.handleFieldInteraction(field.key);
								});

								if (currentSelection.includes(normalizedOption)) {
									checkbox.checked = true;
								}

								optionContainer.createEl('label', {
									text: normalizedOption,
									cls: 'note-architect-checkbox-label'
								});
							});
						} else {
							multiSelectContainer.createEl('small', {
								text: '暂无可用选项',
								cls: 'setting-item-description'
							});
						}
						break;
					}

					default: {
						const input = fieldContainer.createEl('input', {
							type: 'text',
							cls: 'note-architect-form-input'
						}) as HTMLInputElement;
						inputEl = input;
						this.fieldInputRefs.set(field.key, input);
						break;
					}
				}

				if (inputEl && (field.type === 'text' || field.type === 'date' || field.type === 'select')) {
					if (field.type === 'text' || field.type === 'date') {
						(inputEl as HTMLInputElement).value = this.coerceToString(this.formData[field.key]);
					} else if (field.type === 'select') {
						const selectEl = inputEl as HTMLSelectElement;
						const currentValue = this.coerceToString(this.formData[field.key]);
						const matchingOption = Array.from(selectEl.options).find(option => option.value === currentValue);
						if (matchingOption) {
							selectEl.value = currentValue;
						}
					}

					inputEl.addEventListener('input', () => {
						this.formData[field.key] = field.type === 'select'
							? inputEl!.value
							: (inputEl as HTMLInputElement).value;
					});

					if (field.type === 'select') {
						inputEl.addEventListener('change', () => {
							this.handleFieldInteraction(field.key);
						});
					} else {
						inputEl.addEventListener('blur', () => {
							this.handleFieldInteraction(field.key);
						});
					}
				}
			}

			if (isTemplaterDefaultSkipped) {
				fieldContainer.createEl('small', {
					cls: 'setting-item-description',
					text: '检测到 Templater 表达式，此处不会预执行。'
				});
			}

			const errorEl = fieldContainer.createDiv('note-architect-form-error is-hidden');
			errorEl.setAttr('role', 'alert');
			this.fieldErrorRefs.set(field.key, errorEl);
			this.updateFieldErrorUI(field.key);
		});

		// 在所有字段渲染完成后，收集一次多选框数据以捕获默认选中的值
		setTimeout(() => {
			this.collectMultiSelectData();
		}, 0);
		this.applyFieldErrors();
	}

	private handleFieldInteraction(fieldKey: string): void {
		if (!fieldKey || this.isResolving) {
			return;
		}
		this.touchedFieldKeys.add(fieldKey);
		this.runInlineValidation();
	}

	private runInlineValidation(options?: { showAll?: boolean }): void {
		if (this.isResolving) {
			return;
		}
		const validation = this.plugin.presetManager.validateFormData(this.mergedPreset, this.formData);
		this.updateFieldValidationErrors(validation.fieldErrors, options);
	}

	private updateFieldValidationErrors(
		errors: Record<string, string[]>,
		options?: { showAll?: boolean },
	): void {
		this.currentFieldErrors = errors;
		this.applyFieldErrors(options);
	}

	private applyFieldErrors(options?: { showAll?: boolean }): void {
		for (const fieldKey of this.fieldContainerRefs.keys()) {
			this.updateFieldErrorUI(fieldKey, options);
		}
	}

	private updateFieldErrorUI(fieldKey: string, options?: { showAll?: boolean }): void {
		const container = this.fieldContainerRefs.get(fieldKey);
		const errorEl = this.fieldErrorRefs.get(fieldKey);
		if (!container || !errorEl) {
			return;
		}
		const messages = this.currentFieldErrors[fieldKey] ?? [];
		const shouldShow = options?.showAll === true || this.touchedFieldKeys.has(fieldKey);
		const hasErrors = shouldShow && messages.length > 0;
		errorEl.setText(hasErrors ? messages.join(' ') : '');
		errorEl.toggleClass('is-hidden', !hasErrors);
		container.toggleClass('note-architect-form-field--error', hasErrors);

		const inputEl = this.fieldInputRefs.get(fieldKey);
		if (inputEl) {
			inputEl.toggleClass('note-architect-form-input--error', hasErrors);
		} else {
			const multiSelectContainer = this.multiSelectFieldRefs.get(fieldKey);
			multiSelectContainer?.toggleClass('note-architect-multi-select-container--error', hasErrors);
		}
	}

	private markAllFieldsTouched(): void {
		this.touchedFieldKeys = new Set(this.mergedPreset.fields.map(field => field.key));
	}

	/**
	 * 收集默认值，执行 Templater 表达式解析
	 */
	private async parseTemplaterDefaults(): Promise<void> {
		this.templaterDefaultsSkipped.clear();

		const shouldParseTemplater = this.plugin.settings.enableTemplaterIntegration;
		let templaterInitFailed = false;
		let templater: { isAvailable(): boolean; processTemplate: (template: Template) => Promise<string> } | null = null;

		const ensureTemplater = async () => {
			if (templater || templaterInitFailed) {
				return templater;
			}

			try {
				const { ObsidianTemplaterAdapter } = await import('@engine/ObsidianTemplaterAdapter');
				templater = new ObsidianTemplaterAdapter(this.app);
				return templater;
			} catch (error) {
				console.warn('Note Architect: 初始化 Templater 适配器失败', error);
				templaterInitFailed = true;
				return null;
			}
		};

		for (const field of this.mergedPreset.fields) {
			const allowedOptions = this.buildAllowedOptionsSet(field.options);
			if (field.type === 'multi-select') {
				const normalized = normalizeStringArray(field.default, allowedOptions);
				this.resolvedDefaults.set(field.key, normalized);
				continue;
			}

			const defaultValue = this.coerceToString(field.default);

			// 默认值不包含 Templater 表达式，直接存储
			if (!defaultValue.includes('<%')) {
				this.resolvedDefaults.set(field.key, defaultValue);
				continue;
			}

			// 包含 Templater 表达式，但未启用解析或缺少上下文时，记为跳过
			if (!shouldParseTemplater) {
				this.templaterDefaultsSkipped.add(field.key);
				this.resolvedDefaults.set(field.key, defaultValue);
				continue;
			}

			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) {
				console.warn(`Note Architect: 无活动文件，跳过字段 ${field.key} 的 Templater 默认值解析`);
				this.templaterDefaultsSkipped.add(field.key);
				this.resolvedDefaults.set(field.key, defaultValue);
				continue;
			}

			try {
				const adapter = await ensureTemplater();
				if (adapter?.isAvailable()) {
					const tempTemplate = {
						id: 'temp-default',
						name: 'temp-default',
						content: defaultValue,
						path: '' // 空字符串表示没有模板文件路径
					};
					const resolvedValue = await adapter.processTemplate(tempTemplate);
					this.resolvedDefaults.set(field.key, resolvedValue);
				} else {
					this.templaterDefaultsSkipped.add(field.key);
					this.resolvedDefaults.set(field.key, defaultValue);
				}
			} catch (error) {
				console.warn(`Note Architect: 解析字段 ${field.key} 的 Templater 表达式失败`, error);
				this.templaterDefaultsSkipped.add(field.key);
				this.resolvedDefaults.set(field.key, defaultValue);
			}
		}
	}

	private getResolvedDefault(field: FrontmatterField): string | string[] {
		const allowedOptions = this.buildAllowedOptionsSet(field.options);
		if (this.resolvedDefaults.has(field.key)) {
			const stored = this.resolvedDefaults.get(field.key);
			if (field.type === 'multi-select') {
				return normalizeStringArray(stored, allowedOptions);
			}
			return this.coerceToString(stored);
		}

		if (field.type === 'multi-select') {
			return normalizeStringArray(field.default, allowedOptions);
		}

		return this.coerceToString(field.default);
	}

	private buildAllowedOptionsSet(options?: string[]): Set<string> | undefined {
		if (!Array.isArray(options)) {
			return undefined;
		}
		const normalized = options.map(option => option.trim()).filter(Boolean);
		if (normalized.length === 0) {
			return undefined;
		}
		return new Set(normalized);
	}

	private coerceToString(value: unknown): string {
		if (typeof value === 'string') {
			return value;
		}

		if (value === undefined || value === null) {
			return '';
		}

		return String(value);
	}

	
	/**
	 * 收集多选框数据
	 */
	private collectMultiSelectData(): void {
		for (const [fieldKey, container] of this.multiSelectFieldRefs.entries()) {
			const checkboxes = container.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
			const selectedValues: string[] = [];

			checkboxes.forEach((checkbox) => {
				if (checkbox.checked && checkbox.value) {
					const value = checkbox.value.trim();
					if (value) {
						selectedValues.push(value);
					}
				}
			});

			this.formData[fieldKey] = selectedValues;
		}
	}

	
	/**
	 * 处理取消按钮点击事件
	 */
	private handleCancel(): void {
		this.close();
	}

	private notifyValidationFailure(errors: string[]): void {
		const header = '表单验证失败，请根据字段下方的提示修正。';
		if (errors.length === 0) {
			notifyWarning(header, { prefix: false });
			return;
		}
		notifyWarning(`${header}\n${errors.join('\n')}`, { prefix: false });
	}

	private handleInsertionResult(result: TemplateInsertionResult): void {
		if (result.templaterError) {
			notifyWarning(`${result.templaterError}，将使用原始模板内容进行插入`);
		}

		if (result.fallbackToBodyOnly) {
			notifyWarning('Frontmatter 更新失败，已插入模板正文内容。');
			return;
		}

		const details: string[] = [];
		if (result.usedTemplater) {
			details.push('并使用 Templater 处理');
		}
		if (result.mergeCount > 0) {
			details.push(`已合并 ${result.mergeCount} 个 frontmatter 字段`);
		}

		const suffix = details.length > 0 ? `（${details.join('，')}）` : '';
		notifySuccess(`模板 "${this.template.name}" 已插入${suffix}。`);
	}

	private handleInsertionFailure(error: unknown): void {
		const normalizedError = handleError(error, {
			context: 'FrontmatterManagerModal.handleConfirm',
			userMessage: '插入模板失败，请稍后重试。',
		});

		const message = normalizedError.message || '';
		if (message.includes('编辑器')) {
			notifyInfo('提示：请确保在 Markdown 文件中使用此功能');
		} else if (message.includes('Templater')) {
			notifyInfo('提示：可以尝试禁用 Templater 集成后重试');
		}
	}

	/**
	 * 处理确认按钮点击事件 - 核心逻辑实现
	 * Task 1: 表单数据收集和预处理
	 * Task 2-6: 完整的模板插入流程
	 */
	private async handleConfirm(): Promise<void> {
		this.collectMultiSelectData();

		const validation = this.plugin.presetManager.validateFormData(this.mergedPreset, this.formData);
		if (!validation.isValid) {
			this.markAllFieldsTouched();
			this.updateFieldValidationErrors(validation.fieldErrors, { showAll: true });
			this.notifyValidationFailure(validation.errors);
			return;
		}

		try {
			const userFrontmatter = convertFormDataToFrontmatter(this.mergedPreset, this.formData);
			const preparation = await prepareTemplateWithUserInput(
				this.app,
				this.plugin,
				this.template,
				this.mergedPreset,
				userFrontmatter,
			);

			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView || !activeView.editor) {
				throw new Error('无法获取当前编辑器，请确保在 Markdown 文件中使用此功能');
			}

			const editor = activeView.editor;
			let templateBodyInserted = false;

			try {
				if (preparation.hasTemplateBody) {
					editor.replaceSelection(preparation.templateBody);
					templateBodyInserted = true;
				}

				updateNoteFrontmatter(
					editor,
					preparation.mergedFrontmatter,
					preparation.noteMetadata.position,
				);

				const result: TemplateInsertionResult = {
					usedTemplater: preparation.usedTemplater,
					templaterError: preparation.templaterError,
					mergedFrontmatter: preparation.mergedFrontmatter,
					mergeCount: preparation.mergeCount,
					frontmatterUpdated: true,
					templateBodyInserted,
					fallbackToBodyOnly: false,
				};

				this.handleInsertionResult(result);
				await this.plugin.addRecentTemplate(this.template.id);
				this.close();
			} catch (error) {
				console.error('Note Architect: 插入操作失败', error);

				try {
					editor.replaceSelection(preparation.templateBody);
					templateBodyInserted = preparation.hasTemplateBody;

					const fallbackResult: TemplateInsertionResult = {
						usedTemplater: preparation.usedTemplater,
						templaterError: preparation.templaterError,
						mergedFrontmatter: preparation.mergedFrontmatter,
						mergeCount: preparation.mergeCount,
						frontmatterUpdated: false,
						templateBodyInserted,
						fallbackToBodyOnly: true,
					};

					this.handleInsertionResult(fallbackResult);
					await this.plugin.addRecentTemplate(this.template.id);
					this.close();
				} catch (fallbackError) {
					console.error('Note Architect: 回退插入也失败', fallbackError);
					throw new Error('模板插入完全失败，请手动复制模板内容');
				}
			}
		} catch (error) {
			this.handleInsertionFailure(error);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
