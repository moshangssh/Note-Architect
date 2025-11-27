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
    return "preset";
  }

  const normalized = trimmedName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  let slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug && !/^[a-z]/.test(slug)) {
    slug = `preset-${slug}`;
  }

  if (!slug) {
    slug = `preset-${computeNameHash(trimmedName)}`;
  }

  slug = slug.slice(0, MAX_ID_LENGTH).replace(/-+$/g, "");

  if (slug.length < MIN_ID_LENGTH) {
    slug = `preset-${computeNameHash(trimmedName)}`;
  }

  return slug.slice(0, MAX_ID_LENGTH) || "preset";
}

export function computeNameHash(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  const base36 = hash.toString(36);
  return base36.padStart(6, "0").slice(0, 10);
}

/**
 * 解决 ID 冲突的核心算法
 * 通过添加递增数字后缀或时间戳来生成唯一 ID
 *
 * @param baseId - 基础 ID
 * @param isValidId - 验证 ID 格式是否有效的函数
 * @param isIdAvailable - 检查 ID 是否可用（未被占用）的函数
 * @param maxSuffix - 最大后缀数字，默认 9999
 * @param fallbackPrefix - 时间戳降级时的前缀，默认为 'preset'
 * @param allowEmptyBase - 是否允许截断后的 base 为空，默认 false（为空时使用 'preset'）
 * @returns 唯一可用的 ID
 */
function resolveIdConflict(
  baseId: string,
  isValidId: (candidate: string) => boolean,
  isIdAvailable: (candidate: string) => boolean,
  maxSuffix: number = DEFAULT_MAX_SUFFIX,
  fallbackPrefix: string = "preset",
  allowEmptyBase: boolean = false
): string {
  // 尝试添加数字后缀 (-2, -3, ...)
  let suffix = 2;
  while (suffix <= maxSuffix) {
    const suffixText = `-${suffix}`;
    const availableLength = MAX_ID_LENGTH - suffixText.length;
    let truncatedBase = baseId.slice(0, availableLength).replace(/-+$/g, "");

    // 如果不允许空 base，则使用 fallback 前缀
    if (!allowEmptyBase && !truncatedBase) {
      truncatedBase = fallbackPrefix;
    }

    const candidate = `${truncatedBase}${suffixText}`;

    if (isValidId(candidate) && isIdAvailable(candidate)) {
      return candidate;
    }

    suffix += 1;
  }

  // 时间戳降级策略：先尝试数字时间戳
  const timestampId = `${fallbackPrefix}-${Date.now()}`;
  if (isValidId(timestampId) && isIdAvailable(timestampId)) {
    return timestampId.slice(0, MAX_ID_LENGTH);
  }

  // 最终降级：使用 base36 编码的时间戳
  return `${fallbackPrefix}-${Date.now().toString(36)}`.slice(0, MAX_ID_LENGTH);
}

export function generateUniquePresetId(
  name: string,
  options: GeneratePresetIdOptions = {}
): string {
  const baseId = buildBasePresetId(name);
  const existingIds = options.existingIds
    ? new Set(options.existingIds)
    : new Set<string>();
  const isValidId = options.isValidId ?? (() => true);
  const isIdAvailable =
    options.isIdAvailable ??
    ((candidate: string) => !existingIds.has(candidate));
  const maxSuffix = options.maxSuffix ?? DEFAULT_MAX_SUFFIX;

  // 如果基础 ID 直接可用，立即返回
  if (isValidId(baseId) && isIdAvailable(baseId)) {
    return baseId;
  }

  // 使用统一的冲突解决算法
  return resolveIdConflict(
    baseId,
    isValidId,
    isIdAvailable,
    maxSuffix,
    "preset",
    false
  );
}

export function generateUniquePresetIdFromOriginalId(
  originalId: string,
  options: GeneratePresetIdOptions = {}
): string {
  const existingIds = options.existingIds
    ? new Set(options.existingIds)
    : new Set<string>();
  const isValidId = options.isValidId ?? (() => true);
  const isIdAvailable =
    options.isIdAvailable ??
    ((candidate: string) => !existingIds.has(candidate));
  const maxSuffix = options.maxSuffix ?? DEFAULT_MAX_SUFFIX;

  const normalizedOriginalId = originalId.trim();

  // 如果原始 ID 直接可用，立即返回
  if (isValidId(normalizedOriginalId) && isIdAvailable(normalizedOriginalId)) {
    return normalizedOriginalId;
  }

  // 使用统一的冲突解决算法，允许空 base 并使用原始 ID 作为降级前缀
  return resolveIdConflict(
    normalizedOriginalId,
    isValidId,
    isIdAvailable,
    maxSuffix,
    normalizedOriginalId,
    true
  );
}
