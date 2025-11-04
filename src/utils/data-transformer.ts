/**
 * 将任意输入值规范化为去重且按原顺序排列的字符串数组，可选地依据允许选项进行过滤。
 */
export function normalizeStringArray(
	rawValue: unknown,
	allowedOptions?: Set<string>,
): string[] {
	const result: string[] = [];
	const seen = new Set<string>();
	const shouldFilter = Boolean(allowedOptions && allowedOptions.size > 0);

	const pushValue = (candidate: unknown) => {
		const normalized = String(candidate).trim();
		if (!normalized || seen.has(normalized)) {
			return;
		}
		if (shouldFilter && allowedOptions && !allowedOptions.has(normalized)) {
			return;
		}
		seen.add(normalized);
		result.push(normalized);
	};

	if (Array.isArray(rawValue)) {
		rawValue.forEach(pushValue);
	} else if (typeof rawValue === 'string') {
		pushValue(rawValue);
	}

	return result;
}
