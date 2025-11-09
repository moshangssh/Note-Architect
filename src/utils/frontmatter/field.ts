import type { FrontmatterField } from '@types';

/**
 * 深拷贝 FrontmatterField，避免在 UI 或管理逻辑中意外修改原始字段数据。
 */
export function cloneFrontmatterField(field: FrontmatterField): FrontmatterField {
	return {
		...field,
		default: Array.isArray(field.default) ? [...field.default] : field.default,
		...(Array.isArray(field.options) ? { options: [...field.options] } : {}),
	};
}
