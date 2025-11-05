export function mergeFrontmatters(
	baseFrontmatter: Record<string, unknown>,
	overrideFrontmatter: Record<string, unknown>,
): Record<string, unknown> {
	const merged: Record<string, unknown> = { ...baseFrontmatter };

	for (const [key, overrideValue] of Object.entries(overrideFrontmatter)) {
		if (key === 'tags') {
			const baseTags = Array.isArray(merged[key])
				? merged[key] as unknown[]
				: (merged[key] ? [merged[key]] : []);
			const overrideTags = Array.isArray(overrideValue)
				? overrideValue as unknown[]
				: (overrideValue ? [overrideValue] : []);
			const allTags = [...baseTags, ...overrideTags];
			merged[key] = [...new Set(allTags)];
			continue;
		}

		merged[key] = overrideValue;
	}

	return merged;
}
