import type { FrontmatterPreset } from '@types';
import { convertFormDataToFrontmatter } from '@utils/frontmatter/convert';

describe('convertFormDataToFrontmatter', () => {
	const preset: FrontmatterPreset = {
		id: 'test',
		name: 'Test',
		fields: [
			{ key: 'title', label: '标题', type: 'text', default: '' },
			{
				key: 'tags',
				label: '标签',
				type: 'multi-select',
				default: '',
				options: ['Design', 'Idea'],
			},
		],
	};

	it('空多选字段转换为空数组', () => {
		const result = convertFormDataToFrontmatter(preset, { title: 'Example', tags: [] });

		expect(result.tags).toEqual([]);
	});

	it('多选字段会规范化并过滤非法选项', () => {
		const result = convertFormDataToFrontmatter(preset, {
			title: 'Example',
			tags: ['Design', '  Idea  ', 'Unknown'],
		});

		expect(result.tags).toEqual(['Design', 'Idea']);
	});
});
