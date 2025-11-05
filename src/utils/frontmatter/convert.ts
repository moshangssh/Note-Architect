import type { FrontmatterPreset, FrontmatterField } from '@types';
import { normalizeStringArray } from '@utils/data-transformer';

function handleDateField(field: FrontmatterField, rawValue: unknown): string {
	if (field.useTemplaterTimestamp) {
		return typeof rawValue === 'string' ? rawValue : '';
	}

	const date = new Date(rawValue as string | number | Date);
	if (Number.isNaN(date.getTime())) {
		throw new Error(`字段 "${field.label}" 的日期格式无效`);
	}

	return date.toISOString().split('T')[0];
}

function handleMultiSelectField(field: FrontmatterField, rawValue: unknown): string[] {
	const allowedOptions = Array.isArray(field.options)
		? new Set(field.options.map(option => option.trim()).filter(Boolean))
		: undefined;

	const normalizedValues = normalizeStringArray(rawValue, allowedOptions);
	return normalizedValues;
}

function handleTextLikeField(rawValue: unknown): unknown {
	if (typeof rawValue === 'string') {
		const trimmedValue = rawValue.trim();
		return trimmedValue || '';
	}

	return rawValue;
}

export function convertFormDataToFrontmatter(
	preset: FrontmatterPreset,
	formData: Record<string, unknown>,
): Record<string, unknown> {
	const frontmatter: Record<string, unknown> = {};

	preset.fields.forEach((field) => {
		const value = formData[field.key];

		if (value === undefined || value === null || value === '') {
			frontmatter[field.key] = field.type === 'multi-select' ? [] : '';
			return;
		}

		switch (field.type) {
			case 'date': {
				frontmatter[field.key] = handleDateField(field, value);
				break;
			}

			case 'multi-select': {
				const selections = handleMultiSelectField(field, value);
				frontmatter[field.key] = selections;
				break;
			}

			case 'text':
			case 'select':
			default: {
				frontmatter[field.key] = handleTextLikeField(value);
				break;
			}
		}
	});

	return frontmatter;
}
