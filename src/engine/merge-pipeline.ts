import type { App } from 'obsidian';
import { PRESET_CONFIG_KEY } from '@core/constants';
import { LEGACY_PRESET_CONFIG_KEYS } from '@utils/note-architect-config';
import { mergeFrontmatters } from '@utils/frontmatter/merge';
import { getNoteMetadata } from '@utils/frontmatter-editor';
import { normalizeStringArray } from '@utils/data-transformer';
import type NoteArchitect from '@core/plugin';
import type { FrontmatterPreset, FrontmatterField } from '@types';

export async function mergeFrontmatterWithUserInput(
	app: App,
	_plugin: NoteArchitect,
	preset: FrontmatterPreset,
	templateFrontmatter: Record<string, unknown>,
	userFrontmatter: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const noteMetadata = getNoteMetadata(app);
	const presetDefaults = await extractPresetDefaults(preset);
	const noteOverridesPreset = mergeFrontmatters(presetDefaults, noteMetadata.frontmatter);
	const templateOverridesNote = mergeFrontmatters(noteOverridesPreset, templateFrontmatter);
	const finalResult = mergeFrontmatters(templateOverridesNote, userFrontmatter);

	delete finalResult[PRESET_CONFIG_KEY];
	for (const legacyKey of LEGACY_PRESET_CONFIG_KEYS) {
		delete finalResult[legacyKey];
	}

	const orderedFrontmatter: Record<string, unknown> = {};
	const presetKeys = preset.fields.map(field => field.key);
	const presetKeySet = new Set(presetKeys);

	presetKeys.forEach((key) => {
		if (Object.prototype.hasOwnProperty.call(finalResult, key)) {
			orderedFrontmatter[key] = finalResult[key];
		}
	});

	Object.keys(finalResult).forEach((key) => {
		if (!presetKeySet.has(key)) {
			orderedFrontmatter[key] = finalResult[key];
		}
	});

	return orderedFrontmatter;
}

async function extractPresetDefaults(preset: FrontmatterPreset): Promise<Record<string, unknown>> {
	const defaults: Record<string, unknown> = {};

	for (const field of preset.fields) {
		if (field.type === 'multi-select') {
			const allowedOptions = Array.isArray(field.options)
				? new Set(field.options.map(option => option.trim()).filter(Boolean))
				: undefined;
			const values = normalizeStringArray(
				field.default,
				allowedOptions && allowedOptions.size > 0 ? allowedOptions : undefined,
			);
			if (values.length > 0) {
				defaults[field.key] = values;
			}
			continue;
		}

		const stringDefault = coerceFieldDefaultToString(field.default);
		if (stringDefault === '') {
			continue;
		}

		defaults[field.key] = stringDefault;
	}

	return defaults;
}

function coerceFieldDefaultToString(defaultValue: FrontmatterField['default']): string {
	if (typeof defaultValue === 'string') {
		return defaultValue.trim();
	}

	if (Array.isArray(defaultValue)) {
		const [first] = defaultValue;
		if (typeof first === 'string') {
			return first.trim();
		}
		return '';
	}

	if (defaultValue === undefined || defaultValue === null) {
		return '';
	}

	return String(defaultValue).trim();
}
