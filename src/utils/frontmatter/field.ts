import type { FrontmatterField, FrontmatterFieldDefault } from '@types';
import { normalizeStringArray } from '@utils/data-transformer';

const VALID_FIELD_TYPES: FrontmatterField['type'][] = ['text', 'select', 'date', 'multi-select'];

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

/**
 * 标准化字段默认值，根据字段类型返回合适的数据类型
 * @param type 字段类型
 * @param rawDefault 原始默认值
 * @returns 标准化后的默认值
 */
export function normalizeFieldDefault(
	type: FrontmatterField['type'],
	rawDefault: unknown,
): FrontmatterFieldDefault {
	if (type === 'multi-select') {
		return normalizeStringArray(rawDefault);
	}

	if (typeof rawDefault === 'string') {
		return rawDefault;
	}

	if (rawDefault === undefined || rawDefault === null) {
		return '';
	}

	return String(rawDefault);
}

/**
 * 验证和清理单个 FrontmatterField 对象
 * @param field 原始字段数据
 * @param options 验证选项
 * @returns 清理后的字段对象
 * @throws 如果字段格式无效且 strict 为 true
 */
export function sanitizeFrontmatterField(
	field: unknown,
	options: { strict?: boolean } = {},
): FrontmatterField | null {
	const candidate = field && typeof field === 'object' ? (field as Partial<FrontmatterField>) : null;

	if (!candidate) {
		if (options.strict) {
			throw new Error('字段格式无效：字段必须是一个对象');
		}
		return null;
	}

	const key = candidate.key?.trim();
	const label = candidate.label?.trim();

	if (!key) {
		if (options.strict) {
			throw new Error('字段格式无效：缺少键名');
		}
		return null;
	}

	if (!label) {
		if (options.strict) {
			throw new Error('字段格式无效：缺少显示名称');
		}
		return null;
	}

	const type = candidate.type ?? 'text';
	if (!VALID_FIELD_TYPES.includes(type)) {
		if (options.strict) {
			throw new Error(`字段格式无效：类型 "${type}" 不受支持`);
		}
	}

	const defaultValue = normalizeFieldDefault(type, candidate.default);
	const sanitizedField: FrontmatterField = {
		key,
		type: VALID_FIELD_TYPES.includes(type) ? type : 'text',
		label,
		default: defaultValue,
	};

	if (Array.isArray(candidate.options) && candidate.options.length > 0) {
		sanitizedField.options = candidate.options.map((option) => String(option).trim()).filter(Boolean);
	}

	if (candidate.useTemplaterTimestamp === true) {
		sanitizedField.useTemplaterTimestamp = true;
	}

	return sanitizedField;
}

/**
 * 验证和清理 FrontmatterField 数组（宽松模式，过滤无效字段）
 * @param fields 字段数组
 * @returns 清理后的字段数组
 */
export function sanitizeFrontmatterFields(fields: FrontmatterField[]): FrontmatterField[] {
	return fields
		.filter((field) => {
			return Boolean(
				field &&
					typeof field === 'object' &&
					field.key &&
					field.type &&
					field.label
			);
		})
		.map((field) => {
			const type = VALID_FIELD_TYPES.includes(field.type) ? field.type : 'text';
			const sanitizedDefault = normalizeFieldDefault(type, field.default);
			const sanitized: FrontmatterField = {
				key: field.key,
				type,
				label: field.label,
				default: sanitizedDefault,
			};

			if (Array.isArray(field.options) && field.options.length > 0) {
				sanitized.options = field.options
					.map((option) => String(option).trim())
					.filter(Boolean);
			}

			if (field.useTemplaterTimestamp === true) {
				sanitized.useTemplaterTimestamp = true;
			}

			return sanitized;
		});
}
