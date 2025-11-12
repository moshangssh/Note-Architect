export interface GeneratePresetIdOptions {
	existingIds?: Iterable<string>;
	isValidId?: (candidate: string) => boolean;
	isIdAvailable?: (candidate: string) => boolean;
	maxSuffix?: number;
}

const DEFAULT_MAX_SUFFIX = 9999;
const MAX_ID_LENGTH = 50;
const MIN_ID_LENGTH = 2;

export function buildBasePresetId(name: string): string {
	const trimmedName = name.trim();
	if (!trimmedName) {
		return 'preset';
	}

	const normalized = trimmedName
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '');

	let slug = normalized
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');

	if (slug && !/^[a-z]/.test(slug)) {
		slug = `preset-${slug}`;
	}

	if (!slug) {
		slug = `preset-${computeNameHash(trimmedName)}`;
	}

	slug = slug.slice(0, MAX_ID_LENGTH).replace(/-+$/g, '');

	if (slug.length < MIN_ID_LENGTH) {
		slug = `preset-${computeNameHash(trimmedName)}`;
	}

	return slug.slice(0, MAX_ID_LENGTH) || 'preset';
}

export function computeNameHash(value: string): string {
	let hash = 0;
	for (const char of value) {
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	}

	const base36 = hash.toString(36);
	return base36.padStart(6, '0').slice(0, 10);
}

export function generateUniquePresetId(name: string, options: GeneratePresetIdOptions = {}): string {
	const baseId = buildBasePresetId(name);
	const existingIds = options.existingIds ? new Set(options.existingIds) : new Set<string>();
	const isValidId = options.isValidId ?? (() => true);
	const isIdAvailable = options.isIdAvailable ?? ((candidate: string) => !existingIds.has(candidate));
	const maxSuffix = options.maxSuffix ?? DEFAULT_MAX_SUFFIX;

	if (isValidId(baseId) && isIdAvailable(baseId)) {
		return baseId;
	}

	let suffix = 2;
	const normalizedBase = baseId;

	while (suffix <= maxSuffix) {
		const suffixText = `-${suffix}`;
		const availableLength = MAX_ID_LENGTH - suffixText.length;
		let truncatedBase = normalizedBase.slice(0, availableLength).replace(/-+$/g, '');

		if (!truncatedBase) {
			truncatedBase = 'preset';
		}

		const candidate = `${truncatedBase}${suffixText}`;

		if (isValidId(candidate) && isIdAvailable(candidate)) {
			return candidate;
		}

		suffix += 1;
	}

	const timestampId = `preset-${Date.now()}`;
	if (isValidId(timestampId) && isIdAvailable(timestampId)) {
		return timestampId.slice(0, MAX_ID_LENGTH);
	}

	return `preset-${Date.now().toString(36)}`.slice(0, MAX_ID_LENGTH);
}

export function generateUniquePresetIdFromOriginalId(
	originalId: string,
	options: GeneratePresetIdOptions = {},
): string {
	const existingIds = options.existingIds ? new Set(options.existingIds) : new Set<string>();
	const isValidId = options.isValidId ?? (() => true);
	const isIdAvailable = options.isIdAvailable ?? ((candidate: string) => !existingIds.has(candidate));
	const maxSuffix = options.maxSuffix ?? DEFAULT_MAX_SUFFIX;

	const normalizedOriginalId = originalId.trim();
	if (isValidId(normalizedOriginalId) && isIdAvailable(normalizedOriginalId)) {
		return normalizedOriginalId;
	}

	let suffix = 2;
	const baseId = normalizedOriginalId;

	while (suffix <= maxSuffix) {
		const suffixText = `-${suffix}`;
		const availableLength = MAX_ID_LENGTH - suffixText.length;
		let truncatedBase = baseId.slice(0, availableLength).replace(/-+$/g, '');

		const candidate = `${truncatedBase}${suffixText}`;

		if (isValidId(candidate) && isIdAvailable(candidate)) {
			return candidate;
		}

		suffix += 1;
	}

	const timestampId = `${baseId}-${Date.now()}`;
	if (isValidId(timestampId) && isIdAvailable(timestampId)) {
		return timestampId.slice(0, MAX_ID_LENGTH);
	}

	return `${baseId}-${Date.now().toString(36)}`.slice(0, MAX_ID_LENGTH);
}
