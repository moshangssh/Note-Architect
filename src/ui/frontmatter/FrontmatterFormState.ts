import type { FrontmatterPreset, FrontmatterField } from '@types';
import type { PresetManager } from '@presets';

/**
 * 表单验证结果
 */
export interface FormValidationResult {
	isValid: boolean;
	errors: string[];
	fieldErrors: Record<string, string[]>;
}

/**
 * FrontmatterFormState - 表单状态管理器
 *
 * 负责管理 frontmatter 表单的所有状态，包括：
 * - 表单数据 (formData)
 * - 字段触摸状态 (touchedFieldKeys)
 * - 验证错误 (currentFieldErrors)
 * - 解析后的默认值 (resolvedDefaults)
 * - Templater 默认值跳过状态 (templaterDefaultsSkipped)
 *
 * 该类采用单一职责原则，将表单状态管理从 UI 组件中分离出来，
 * 使代码更易于维护、测试和复用。
 */
export class FrontmatterFormState {
	/**
	 * 表单数据存储
	 */
	private formData: Record<string, unknown> = {};

	/**
	 * 已触摸字段的键集合
	 */
	private touchedFieldKeys: Set<string> = new Set();

	/**
	 * 字段验证错误映射
	 */
	private currentFieldErrors: Record<string, string[]> = {};

	/**
	 * 解析后的默认值映射（Templater 处理后）
	 */
	private resolvedDefaults: Map<string, string | string[]> = new Map();

	/**
	 * 被跳过的 Templater 默认值集合
	 */
	private templaterDefaultsSkipped: Set<string> = new Set();

	/**
	 * 当前活跃的预设
	 */
	private currentPreset: FrontmatterPreset;

	/**
	 * 构造函数
	 * @param preset 初始化的 Frontmatter 预设
	 * @param presetManager PresetManager 实例，用于验证
	 */
	constructor(preset: FrontmatterPreset, private readonly presetManager: PresetManager) {
		this.currentPreset = { ...preset, fields: preset.fields.map(field => ({ ...field })) };
	}

	/**
	 * 初始化表单数据
	 * @param initialData 初始表单数据
	 */
	public initialize(initialData: Record<string, unknown>): void {
		this.formData = { ...initialData };
		this.touchedFieldKeys.clear();
		this.currentFieldErrors = {};
	}

	/**
	 * 设置字段值并自动验证
	 * @param key 字段键
	 * @param value 字段值
	 * @param shouldValidate 是否立即验证，默认为 true
	 */
	public setFieldValue(key: string, value: unknown, shouldValidate: boolean = true): void {
		if (!key) {
			return;
		}

		this.formData[key] = value;

		// 立即验证该字段（如果启用）
		if (shouldValidate) {
			this.validateField(key);
		}
	}

	/**
	 * 标记字段为已触摸状态
	 * @param key 字段键
	 */
	public setFieldTouched(key: string): void {
		if (!key) {
			return;
		}
		this.touchedFieldKeys.add(key);
	}

	/**
	 * 标记所有字段为已触摸状态
	 */
	public markAllFieldsTouched(): void {
		this.touchedFieldKeys = new Set(this.currentPreset.fields.map(field => field.key));
	}

	/**
	 * 验证整个表单
	 * @returns 验证结果
	 */
	public validate(): FormValidationResult {
		const result = this.presetManager.validateFormData(this.currentPreset, this.formData);
		this.currentFieldErrors = result.fieldErrors;
		return result;
	}

	/**
	 * 验证单个字段
	 * @param key 字段键
	 * @returns 验证结果（仅包含该字段的错误）
	 */
	public validateField(key: string): FormValidationResult {
		if (!key) {
			return { isValid: true, errors: [], fieldErrors: {} };
		}

		// 临时创建一个只包含当前字段的 formData 进行验证
		const fieldValue = this.formData[key];
		const tempFormData = { [key]: fieldValue };

		const result = this.presetManager.validateFormData(this.currentPreset, tempFormData);

		// 更新当前错误状态
		if (result && result.fieldErrors) {
			if (result.fieldErrors[key]) {
				this.currentFieldErrors[key] = result.fieldErrors[key];
			} else {
				delete this.currentFieldErrors[key];
			}
		}

		return result;
	}

	/**
	 * 获取当前表单数据
	 * @returns 表单数据的副本
	 */
	public getData(): Record<string, unknown> {
		return { ...this.formData };
	}

	/**
	 * 获取当前验证错误
	 * @returns 错误映射的副本
	 */
	public getErrors(): Record<string, string[]> {
		return { ...this.currentFieldErrors };
	}

	/**
	 * 获取已触摸字段的键集合
	 * @returns 字段键集合的副本
	 */
	public getTouchedFieldKeys(): Set<string> {
		return new Set(this.touchedFieldKeys);
	}

	/**
	 * 获取解析后的默认值
	 * @returns 默认值映射
	 */
	public getResolvedDefaults(): Map<string, string | string[]> {
		return new Map(this.resolvedDefaults);
	}

	/**
	 * 获取被跳过的 Templater 默认值集合
	 * @returns 跳过集合
	 */
	public getTemplaterDefaultsSkipped(): Set<string> {
		return new Set(this.templaterDefaultsSkipped);
	}

	/**
	 * 设置解析后的默认值
	 * @param resolvedDefaults 解析后的默认值映射
	 * @param templaterDefaultsSkipped 被跳过的 Templater 默认值集合
	 */
	public setResolvedDefaults(
		resolvedDefaults: Map<string, string | string[]>,
		templaterDefaultsSkipped: Set<string>
	): void {
		this.resolvedDefaults = new Map(resolvedDefaults);
		this.templaterDefaultsSkipped = new Set(templaterDefaultsSkipped);
	}

	/**
	 * 重置表单状态（保留当前预设）
	 */
	public reset(): void {
		this.formData = {};
		this.touchedFieldKeys.clear();
		this.currentFieldErrors = {};
		this.resolvedDefaults.clear();
		this.templaterDefaultsSkipped.clear();
	}

	/**
	 * 切换到新的预设
	 * @param newPreset 新的 Frontmatter 预设
	 */
	public switchPreset(newPreset: FrontmatterPreset): void {
		this.currentPreset = { ...newPreset, fields: newPreset.fields.map(field => ({ ...field })) };
		this.reset();
	}

	/**
	 * 获取当前活跃的预设
	 * @returns 当前预设的副本
	 */
	public getCurrentPreset(): FrontmatterPreset {
		return {
			...this.currentPreset,
			fields: this.currentPreset.fields.map(field => ({ ...field }))
		};
	}

	/**
	 * 检查字段是否已触摸
	 * @param key 字段键
	 * @returns 是否已触摸
	 */
	public isFieldTouched(key: string): boolean {
		return this.touchedFieldKeys.has(key);
	}

	/**
	 * 检查字段是否有错误
	 * @param key 字段键
	 * @returns 是否有错误
	 */
	public hasFieldError(key: string): boolean {
		return Boolean(this.currentFieldErrors[key] && this.currentFieldErrors[key].length > 0);
	}

	/**
	 * 获取字段的特定错误信息
	 * @param key 字段键
	 * @returns 错误信息数组
	 */
	public getFieldErrors(key: string): string[] {
		return this.currentFieldErrors[key] ? [...this.currentFieldErrors[key]] : [];
	}

	/**
	 * 设置单个字段的错误（用于外部验证器）
	 * @param key 字段键
	 * @param errors 错误信息数组
	 */
	public setFieldErrors(key: string, errors: string[]): void {
		if (!key) {
			return;
		}

		if (errors.length > 0) {
			this.currentFieldErrors[key] = [...errors];
		} else {
			delete this.currentFieldErrors[key];
		}
	}

	/**
	 * 清空所有验证错误
	 */
	public clearAllErrors(): void {
		this.currentFieldErrors = {};
	}

	/**
	 * 检查表单是否有效
	 * @returns 表单是否有效
	 */
	public isValid(): boolean {
		return Object.keys(this.currentFieldErrors).length === 0;
	}
}
