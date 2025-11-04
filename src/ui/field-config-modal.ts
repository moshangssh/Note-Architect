import { App, Modal } from 'obsidian';
import { type FrontmatterField, type FrontmatterPreset } from '@types';
import { PresetManager } from '@presets';
import type { SettingsManager } from '@settings';
import { validateAndSave } from './ui-utils';
import { notifyWarning } from '@utils/notify';
import { FieldItem, type FieldItemConfig } from './field-config/field-item';
import { FieldConfigForm, type FieldConfigFormConfig } from './field-config/field-config-form';

export class FieldConfigModal extends Modal {
	private readonly presetManager: PresetManager;
	private readonly settingsManager: SettingsManager;
	private preset: FrontmatterPreset;
	private fields: FrontmatterField[];
	private readonly onPresetsChanged?: () => void;
	private draggedIndex: number | null = null;
	private readonly fieldCollapseStates = new WeakMap<FrontmatterField, boolean>();
	private readonly fieldItemInstances = new Map<number, FieldItem>();
	private readonly fieldFormInstances = new Map<number, FieldConfigForm>();

	constructor(
		app: App,
		presetManager: PresetManager,
		settingsManager: SettingsManager,
		preset: FrontmatterPreset,
		onPresetsChanged?: () => void,
	) {
		super(app);
		this.presetManager = presetManager;
		this.settingsManager = settingsManager;
		this.preset = preset;
		this.onPresetsChanged = onPresetsChanged;
		// 创建字段副本以避免直接修改原数据
		this.fields = preset.fields.map(field => this.cloneField(field));
	}

	private cloneField(field: FrontmatterField): FrontmatterField {
		return {
			...field,
			default: Array.isArray(field.default) ? [...field.default] : field.default,
			...(Array.isArray(field.options) ? { options: [...field.options] } : {}),
		};
	}

	onOpen() {
		const { contentEl } = this;

		// 设置模态窗口大小
		this.modalEl.style.width = '90vw';
		this.modalEl.style.maxWidth = '800px';
		this.modalEl.style.height = '80vh';

		// 创建标题
		contentEl.createEl('h2', { text: `配置预设字段: ${this.preset.name}` });

		// 创建主容器
		const mainContainer = contentEl.createDiv('note-architect-field-config-container');

		// 创建字段列表容器
		const fieldsContainer = mainContainer.createDiv('note-architect-fields-list');

		// 渲染字段列表
		this.renderFieldsList(fieldsContainer);

		// 创建操作按钮容器
		const actionsContainer = mainContainer.createDiv('note-architect-field-config-actions');

		// 添加字段按钮
		const addFieldBtn = actionsContainer.createEl('button', {
			text: '添加字段',
			cls: 'mod-cta note-architect-field-config-actions__btn'
		});
		addFieldBtn.onclick = () => this.addNewField(fieldsContainer);

		// 按钮分隔
		actionsContainer.createEl('span', {
			text: ' | ',
			cls: 'note-architect-field-config-actions__divider'
		});

		// 保存按钮
		const saveBtn = actionsContainer.createEl('button', {
			text: '保存',
			cls: 'mod-cta note-architect-field-config-actions__btn'
		});
		saveBtn.onclick = () => this.saveAndClose();

		// 取消按钮
		const cancelBtn = actionsContainer.createEl('button', {
			text: '取消',
			cls: 'note-architect-field-config-actions__btn'
		});
		cancelBtn.onclick = () => this.close();
	}

	/**
	 * 渲染字段列表
	 */
	private renderFieldsList(containerEl: HTMLElement): void {
		containerEl.empty();

		if (this.fields.length === 0) {
			// 显示空状态
			const emptyEl = containerEl.createDiv('note-architect-empty-fields');
			emptyEl.createEl('p', {
				text: '暂无字段，点击"添加字段"开始创建。',
				cls: 'setting-item-description'
			});
			return;
		}

		// 渲染每个字段
		this.fields.forEach((field, index) => {
			this.renderFieldItem(containerEl, field, index);
		});
	}

	/**
	 * 渲染单个字段项
	 */
	private renderFieldItem(containerEl: HTMLElement, field: FrontmatterField, index: number): void {
		// 创建 FieldItem 配置
		const config: FieldItemConfig = {
			field,
			index,
			isCollapsed: this.isFieldCollapsed(field),
			onDelete: (idx) => this.removeField(idx, containerEl),
			onDragStart: (idx) => this.handleDragStart(idx),
			onDragEnd: () => this.handleDragEnd(containerEl),
			onReorder: (fromIndex, targetIndex, isAfter) => {
				this.handleReorder(fromIndex, targetIndex, isAfter, containerEl);
			},
			onToggleCollapse: (f, collapsed) => this.toggleFieldCollapse(f, collapsed),
			draggedIndex: this.draggedIndex
		};

		// 创建 FieldItem 实例
		const fieldItem = new FieldItem(config);
		fieldItem.render(containerEl);

		// 获取配置容器并填充表单
		const configContainer = fieldItem.getConfigContainer();
		const updateSummary = () => fieldItem.updateSummary();
		this.renderFieldConfig(configContainer, field, index, updateSummary, containerEl);

		// 存储实例
		this.fieldItemInstances.set(index, fieldItem);
	}

	/**
	 * 渲染字段配置表单
	 */
	private renderFieldConfig(
		configContainer: HTMLElement,
		field: FrontmatterField,
		index: number,
		updateSummary: () => void,
		containerEl: HTMLElement
	): void {
		// 创建 FieldConfigForm 配置
		const fieldFormConfig: FieldConfigFormConfig = {
			field,
			fieldIndex: index,
			onFieldChange: (updatedField, fieldIndex) => {
				this.updateFieldData(fieldIndex, updatedField);
				updateSummary();
			},
			settingsManager: this.settingsManager
		};

		// 创建 FieldConfigForm 实例
		const fieldForm = new FieldConfigForm(fieldFormConfig);
		fieldForm.render(configContainer);

		// 存储 FieldConfigForm 实例
		this.fieldFormInstances.set(index, fieldForm);
	}

/**
	 * 更新字段数据
	 */
	private updateFieldData(fieldIndex: number, field: FrontmatterField): void {
		if (fieldIndex >= 0 && fieldIndex < this.fields.length) {
			this.fields[fieldIndex] = field;
		}
	}

	/**
	 * 处理拖拽开始
	 */
	private handleDragStart(index: number): void {
		this.draggedIndex = index;
	}

	/**
	 * 处理拖拽结束
	 */
	private handleDragEnd(containerEl: HTMLElement): void {
		this.draggedIndex = null;
		this.clearDragStyles(containerEl);
	}

	/**
	 * 切换字段折叠状态
	 */
	private toggleFieldCollapse(field: FrontmatterField, collapsed: boolean): void {
		this.fieldCollapseStates.set(field, collapsed);
	}

	/**
	 * 清理拖拽样式
	 */
	private clearDragStyles(containerEl: HTMLElement): void {
		containerEl.querySelectorAll('.note-architect-field-item').forEach(el => {
			el.classList.remove(
				'note-architect-field-item--drag-over-before',
				'note-architect-field-item--drag-over-after',
				'note-architect-field-item--dragging'
			);
		});
	}

	/**
	 * 处理字段重新排序
	 */
	private handleReorder(fromIndex: number, targetIndex: number, isAfter: boolean, containerEl: HTMLElement): void {
		if (fromIndex === targetIndex && !isAfter) {
			this.clearDragStyles(containerEl);
			return;
		}

		const [movedField] = this.fields.splice(fromIndex, 1);
		let insertIndex = targetIndex;

		if (fromIndex < targetIndex) {
			insertIndex -= 1;
		}
		if (isAfter) {
			insertIndex += 1;
		}

		if (insertIndex < 0) {
			insertIndex = 0;
		}
		if (insertIndex > this.fields.length) {
			insertIndex = this.fields.length;
		}

		this.fields.splice(insertIndex, 0, movedField);
		this.draggedIndex = null;
		this.clearDragStyles(containerEl);
		this.renderFieldsList(containerEl);
	}

	/**
	 * 判断字段是否折叠
	 */
	private isFieldCollapsed(field: FrontmatterField): boolean {
		return this.fieldCollapseStates.get(field) ?? false;
	}

	/**
	 * 添加新字段
	 */
	private addNewField(containerEl: HTMLElement): void {
		const newField: FrontmatterField = {
			key: '',
			type: 'text',
			label: '',
			default: '',
			options: []
		};
		this.fields.push(newField);
		this.renderFieldsList(containerEl);
	}

	/**
	 * 删除字段
	 */
	private removeField(index: number, containerEl: HTMLElement): void {
		const [removedField] = this.fields.splice(index, 1);
		if (removedField) {
			this.fieldCollapseStates.delete(removedField);
		}
		this.renderFieldsList(containerEl);
	}

	/**
	 * 验证字段数据
	 */
	private validateFields(): { isValid: boolean; errors: string[] } {
		const errors: string[] = [];

		this.fields.forEach((field, index) => {
			const fieldNum = index + 1;

			// 验证必填字段
			if (!field.key.trim()) {
				errors.push(`字段 ${fieldNum}: Frontmatter 键名不能为空`);
			}
			if (!field.label.trim()) {
				errors.push(`字段 ${fieldNum}: 显示名称不能为空`);
			}
			// 默认值现在可以为空，移除验证

			// 验证 key 格式
			const keyRegex = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
			if (field.key && !keyRegex.test(field.key)) {
				errors.push(`字段 ${fieldNum}: Frontmatter 键名格式不正确，只能包含字母、数字、下划线和连字符，且必须以字母或下划线开头`);
			}

			// 验证 select 和 multi-select 类型必须有选项
			if ((field.type === 'select' || field.type === 'multi-select') &&
				(!field.options || field.options.length === 0 || field.options.every(opt => !opt.trim()))) {
				errors.push(`字段 ${fieldNum}: ${field.type === 'select' ? '单选' : '多选'}类型必须至少有一个选项`);
			}
		});

		// 检查重复的 key
		const keys = this.fields.map(f => f.key).filter(k => k.trim());
		const duplicateKeys = keys.filter((key, index) => keys.indexOf(key) !== index);
		if (duplicateKeys.length > 0) {
			errors.push(`发现重复的 Frontmatter 键名: ${duplicateKeys.join(', ')}`);
		}

		return {
			isValid: errors.length === 0,
			errors
		};
	}

	/**
	 * 保存并关闭
	 */
	private async saveAndClose(): Promise<void> {
		// 验证字段数据
		const validation = this.validateFields();
		if (!validation.isValid) {
			notifyWarning(`验证失败:\n${validation.errors.join('\n')}`, { prefix: false });
			return;
		}

		// 使用 validateAndSave 工具函数简化保存流程
		await validateAndSave(
			this.fields,
			[], // 验证已在 validateFields() 中完成
			async (filteredFields) => {
				const updatedPreset = await this.presetManager.updatePresetFields(this.preset.id, filteredFields);
				this.preset = updatedPreset;
				this.fields = updatedPreset.fields.map(field => this.cloneField(field));
			},
			{
				filterFn: (field) => Boolean(field.key.trim() && field.label.trim()),
				successMessage: '字段配置已保存',
				onSuccess: () => {
					this.onPresetsChanged?.();
					this.close();
				}
			}
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
