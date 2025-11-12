import { FrontmatterFormState, type FormValidationResult } from '../../../ui/frontmatter/FrontmatterFormState';
import { type FrontmatterPreset, type FrontmatterField } from '../../../types/settings';
import { PresetManager } from '../../../presets/PresetManager';

describe('FrontmatterFormState', () => {
	let formState: FrontmatterFormState;
	let mockPresetManager: jest.Mocked<PresetManager>;
	let mockPreset: FrontmatterPreset;

	beforeEach(() => {
		// 创建模拟的 PresetManager
		mockPresetManager = {
			validateFormData: jest.fn()
		} as any;

		// 创建测试用的预设
		mockPreset = {
			id: 'test-preset',
			name: 'Test Preset',
			fields: [
				{
					key: 'title',
					type: 'text' as const,
					label: 'Title',
					default: '',
					description: 'The title of the note'
				},
				{
					key: 'date',
					type: 'date' as const,
					label: 'Date',
					default: '2025-01-01',
					description: 'The date of the note'
				},
				{
					key: 'tags',
					type: 'multi-select' as const,
					label: 'Tags',
					default: [],
					options: ['work', 'personal', 'important'],
					description: 'Tags for the note'
				},
				{
					key: 'category',
					type: 'select' as const,
					label: 'Category',
					default: '',
					options: ['blog', 'note', 'journal'],
					description: 'Category of the note'
				}
			]
		};

		// 初始化 FrontmatterFormState
		formState = new FrontmatterFormState(mockPreset, mockPresetManager);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('初始化', () => {
		it('应该正确初始化表单状态', () => {
			const initialData = { title: 'Test Title', date: '2025-01-15' };
			formState.initialize(initialData);

			const data = formState.getData();
			expect(data).toEqual(initialData);
		});

		it('应该清空触摸状态和错误状态', () => {
			// 设置 mock 验证返回值
			mockPresetManager.validateFormData.mockReturnValue({
				isValid: true,
				errors: [],
				fieldErrors: {}
			});

			// 先设置一些状态
			formState.setFieldValue('title', 'Test');
			formState.setFieldTouched('title');
			formState.getErrors(); // 确保有错误状态

			// 重新初始化
			formState.initialize({});

			// 验证状态已清空
			expect(formState.getTouchedFieldKeys().size).toBe(0);
			expect(Object.keys(formState.getErrors()).length).toBe(0);
		});
	});

	describe('setFieldValue', () => {
		it('应该正确设置字段值', () => {
			// 设置 mock 验证返回值
			mockPresetManager.validateFormData.mockReturnValue({
				isValid: true,
				errors: [],
				fieldErrors: {}
			});

			formState.setFieldValue('title', 'New Title');

			const data = formState.getData();
			expect(data['title']).toBe('New Title');
		});

		it('应该忽略空键值', () => {
			formState.setFieldValue('', 'Some Value');

			const data = formState.getData();
			expect(data['']).toBeUndefined();
		});

		it('应该自动验证字段（默认启用）', () => {
			const mockValidationResult: FormValidationResult = {
				isValid: true,
				errors: [],
				fieldErrors: {}
			};
			mockPresetManager.validateFormData.mockReturnValue(mockValidationResult);

			formState.setFieldValue('title', 'Test Title');

			expect(mockPresetManager.validateFormData).toHaveBeenCalledWith(mockPreset, { title: 'Test Title' });
		});

		it('应该允许禁用自动验证', () => {
			mockPresetManager.validateFormData.mockClear();

			formState.setFieldValue('title', 'Test Title', false);

			expect(mockPresetManager.validateFormData).not.toHaveBeenCalled();
		});
	});

	describe('setFieldTouched', () => {
		it('应该标记字段为已触摸', () => {
			formState.setFieldTouched('title');

			const touched = formState.getTouchedFieldKeys();
			expect(touched.has('title')).toBe(true);
		});

		it('应该忽略空键值', () => {
			formState.setFieldTouched('');

			const touched = formState.getTouchedFieldKeys();
			expect(touched.has('')).toBe(false);
		});

		it('应该支持多个字段被触摸', () => {
			formState.setFieldTouched('title');
			formState.setFieldTouched('date');
			formState.setFieldTouched('category');

			const touched = formState.getTouchedFieldKeys();
			expect(touched.size).toBe(3);
			expect(touched.has('title')).toBe(true);
			expect(touched.has('date')).toBe(true);
			expect(touched.has('category')).toBe(true);
		});
	});

	describe('markAllFieldsTouched', () => {
		it('应该标记所有字段为已触摸', () => {
			formState.markAllFieldsTouched();

			const touched = formState.getTouchedFieldKeys();
			expect(touched.size).toBe(4); // preset 有 4 个字段
			expect(touched.has('title')).toBe(true);
			expect(touched.has('date')).toBe(true);
			expect(touched.has('tags')).toBe(true);
			expect(touched.has('category')).toBe(true);
		});
	});

	describe('validate', () => {
		it('应该调用 PresetManager.validateFormData', () => {
			const mockResult: FormValidationResult = {
				isValid: false,
				errors: ['Invalid data'],
				fieldErrors: { title: ['Title is required'] }
			};
			mockPresetManager.validateFormData.mockReturnValue(mockResult);

			const result = formState.validate();

			expect(mockPresetManager.validateFormData).toHaveBeenCalledWith(mockPreset, {});
			expect(result).toEqual(mockResult);
		});

		it('应该更新内部错误状态', () => {
			const mockResult: FormValidationResult = {
				isValid: false,
				errors: ['Error 1', 'Error 2'],
				fieldErrors: { title: ['Invalid'], date: ['Required'] }
			};
			mockPresetManager.validateFormData.mockReturnValue(mockResult);

			formState.validate();

			const errors = formState.getErrors();
			expect(errors).toEqual(mockResult.fieldErrors);
		});
	});

	describe('validateField', () => {
		it('应该验证单个字段', () => {
			const mockResult: FormValidationResult = {
				isValid: true,
				errors: [],
				fieldErrors: {}
			};
			mockPresetManager.validateFormData.mockReturnValue(mockResult);

			formState.setFieldValue('title', 'Test');
			const result = formState.validateField('title');

			expect(result).toEqual(mockResult);
		});

		it('应该忽略空键值', () => {
			formState.setFieldValue('title', 'Test');

			// 不需要设置 mock，因为空键值会直接返回而不会调用 validateFormData
			const result = formState.validateField('');

			expect(result.isValid).toBe(true);
			expect(result.errors).toEqual([]);
			expect(Object.keys(result.fieldErrors).length).toBe(0);
		});

		it('应该更新该字段的错误状态', () => {
			const mockResult: FormValidationResult = {
				isValid: false,
				errors: ['Invalid'],
				fieldErrors: { title: ['Required'] }
			};
			mockPresetManager.validateFormData.mockReturnValue(mockResult);

			formState.setFieldValue('title', '');
			formState.validateField('title');

			const errors = formState.getErrors();
			expect(errors['title']).toEqual(['Required']);
		});

		it('应该清除该字段的错误（验证通过时）', () => {
			// 先设置一个错误
			mockPresetManager.validateFormData.mockReturnValueOnce({
				isValid: false,
				errors: ['Error'],
				fieldErrors: { title: ['Required'] }
			});
			formState.validateField('title');

			// 然后验证通过
			mockPresetManager.validateFormData.mockReturnValueOnce({
				isValid: true,
				errors: [],
				fieldErrors: {}
			});
			formState.validateField('title');

			const errors = formState.getErrors();
			expect(errors['title']).toBeUndefined();
		});
	});

	describe('getData', () => {
		it('应该返回表单数据的副本', () => {
			formState.initialize({ title: 'Test', date: '2025-01-15' });
			const data1 = formState.getData();
			const data2 = formState.getData();

			// 验证返回的是副本，而不是同一个对象
			expect(data1).not.toBe(data2);
			expect(data1).toEqual(data2);
		});

		it('应该返回当前表单数据的快照', () => {
			formState.initialize({ title: 'Initial' });
			formState.setFieldValue('title', 'Updated', false);

			const data = formState.getData();
			expect(data['title']).toBe('Updated');
		});
	});

	describe('getErrors', () => {
		it('应该返回错误映射的副本', () => {
			const mockResult: FormValidationResult = {
				isValid: false,
				errors: ['Error'],
				fieldErrors: { title: ['Invalid'] }
			};
			mockPresetManager.validateFormData.mockReturnValue(mockResult);
			formState.validate();

			const errors1 = formState.getErrors();
			const errors2 = formState.getErrors();

			// 验证返回的是副本
			expect(errors1).not.toBe(errors2);
			expect(errors1).toEqual(errors2);
		});
	});

	describe('getTouchedFieldKeys', () => {
		it('应该返回触摸字段键集合的副本', () => {
			formState.setFieldTouched('title');
			formState.setFieldTouched('date');

			const touched1 = formState.getTouchedFieldKeys();
			const touched2 = formState.getTouchedFieldKeys();

			// 验证返回的是副本
			expect(touched1).not.toBe(touched2);
			expect(touched1).toEqual(touched2);
		});
	});

	describe('setResolvedDefaults', () => {
		it('应该设置解析后的默认值', () => {
			const defaults = new Map<string, string | string[]>([
				['title', 'Default Title'],
				['tags', ['work', 'important']]
			]);
			const skipped = new Set<string>(['date']);

			formState.setResolvedDefaults(defaults, skipped);

			const resultDefaults = formState.getResolvedDefaults();
			const resultSkipped = formState.getTemplaterDefaultsSkipped();

			expect(resultDefaults).toEqual(defaults);
			expect(resultSkipped).toEqual(skipped);
		});
	});

	describe('reset', () => {
		it('应该清空所有状态', () => {
			// 设置 mock 验证返回值
			mockPresetManager.validateFormData.mockReturnValue({
				isValid: true,
				errors: [],
				fieldErrors: {}
			});

			// 设置一些状态
			formState.setFieldValue('title', 'Test');
			formState.setFieldTouched('title');

			const mockResult: FormValidationResult = {
				isValid: false,
				errors: ['Error'],
				fieldErrors: { title: ['Invalid'] }
			};
			mockPresetManager.validateFormData.mockReturnValue(mockResult);
			formState.validate();

			const defaults = new Map<string, string | string[]>([['title', 'Default']]);
			const skipped = new Set<string>(['date']);
			formState.setResolvedDefaults(defaults, skipped);

			// 重置
			formState.reset();

			// 验证所有状态已清空
			expect(Object.keys(formState.getData()).length).toBe(0);
			expect(formState.getTouchedFieldKeys().size).toBe(0);
			expect(Object.keys(formState.getErrors()).length).toBe(0);
			expect(formState.getResolvedDefaults().size).toBe(0);
			expect(formState.getTemplaterDefaultsSkipped().size).toBe(0);
		});
	});

	describe('switchPreset', () => {
		it('应该切换到新的预设', () => {
			// 设置 mock 验证返回值
			mockPresetManager.validateFormData.mockReturnValue({
				isValid: true,
				errors: [],
				fieldErrors: {}
			});

			const newPreset: FrontmatterPreset = {
				id: 'new-preset',
				name: 'New Preset',
				fields: [
					{
						key: 'name',
						type: 'text' as const,
						label: 'Name',
						default: '',
						options: []
					}
				]
			};

			// 设置旧预设的状态
			formState.setFieldValue('title', 'Test');
			formState.setFieldTouched('title');

			// 切换预设
			formState.switchPreset(newPreset);

			// 验证预设已切换，且状态已重置
			const currentPreset = formState.getCurrentPreset();
			expect(currentPreset.id).toBe('new-preset');
			expect(currentPreset.fields.length).toBe(1);
			expect(currentPreset.fields[0].key).toBe('name');

			// 验证状态已重置
			expect(Object.keys(formState.getData()).length).toBe(0);
			expect(formState.getTouchedFieldKeys().size).toBe(0);
		});
	});

	describe('getCurrentPreset', () => {
		it('应该返回当前预设的副本', () => {
			const preset1 = formState.getCurrentPreset();
			const preset2 = formState.getCurrentPreset();

			// 验证返回的是副本
			expect(preset1).not.toBe(preset2);
			expect(preset1).toEqual(preset2);
		});

		it('应该防止意外修改内部预设', () => {
			const preset = formState.getCurrentPreset();
			preset.name = 'Modified Name';

			const currentPreset = formState.getCurrentPreset();
			expect(currentPreset.name).toBe('Test Preset');
		});
	});

	describe('辅助方法', () => {
		describe('isFieldTouched', () => {
			it('应该正确检查字段是否已触摸', () => {
				formState.setFieldTouched('title');

				expect(formState.isFieldTouched('title')).toBe(true);
				expect(formState.isFieldTouched('date')).toBe(false);
			});
		});

		describe('hasFieldError', () => {
			it('应该正确检查字段是否有错误', () => {
				const mockResult: FormValidationResult = {
					isValid: false,
					errors: ['Error'],
					fieldErrors: { title: ['Invalid'] }
				};
				mockPresetManager.validateFormData.mockReturnValue(mockResult);
				formState.validate();

				expect(formState.hasFieldError('title')).toBe(true);
				expect(formState.hasFieldError('date')).toBe(false);
			});
		});

		describe('getFieldErrors', () => {
			it('应该获取特定字段的错误', () => {
				const mockResult: FormValidationResult = {
					isValid: false,
					errors: ['Error'],
					fieldErrors: { title: ['Required', 'Too short'] }
				};
				mockPresetManager.validateFormData.mockReturnValue(mockResult);
				formState.validate();

				const errors = formState.getFieldErrors('title');
				expect(errors).toEqual(['Required', 'Too short']);
			});

			it('应该返回不存在字段的空数组', () => {
				const errors = formState.getFieldErrors('nonexistent');
				expect(errors).toEqual([]);
			});
		});

		describe('setFieldErrors', () => {
			it('应该设置字段错误', () => {
				formState.setFieldErrors('title', ['Error 1', 'Error 2']);

				const errors = formState.getErrors();
				expect(errors['title']).toEqual(['Error 1', 'Error 2']);
			});

			it('应该清除空错误', () => {
				formState.setFieldErrors('title', ['Error']);
				formState.setFieldErrors('title', []);

				const errors = formState.getErrors();
				expect(errors['title']).toBeUndefined();
			});

			it('应该忽略空键值', () => {
				formState.setFieldErrors('', ['Error']);

				const errors = formState.getErrors();
				expect(errors['']).toBeUndefined();
			});
		});

		describe('clearAllErrors', () => {
			it('应该清空所有错误', () => {
				const mockResult: FormValidationResult = {
					isValid: false,
					errors: ['Error'],
					fieldErrors: { title: ['Invalid'], date: ['Required'] }
				};
				mockPresetManager.validateFormData.mockReturnValue(mockResult);
				formState.validate();

				formState.clearAllErrors();

				const errors = formState.getErrors();
				expect(Object.keys(errors).length).toBe(0);
			});
		});

		describe('isValid', () => {
			it('应该在无错误时返回 true', () => {
				expect(formState.isValid()).toBe(true);
			});

			it('应该在有错误时返回 false', () => {
				const mockResult: FormValidationResult = {
					isValid: false,
					errors: ['Error'],
					fieldErrors: { title: ['Invalid'] }
				};
				mockPresetManager.validateFormData.mockReturnValue(mockResult);
				formState.validate();

				expect(formState.isValid()).toBe(false);
			});
		});
	});
});
