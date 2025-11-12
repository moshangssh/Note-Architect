export type FieldValidationErrorKey = 'key' | 'label' | 'options';

/**
 * 字段级别的验证错误结构，用于在 DetailPanel 与表单之间传输内联错误文案。
 */
export interface FieldValidationErrors {
	key?: string[];
	label?: string[];
	options?: string[];
}
