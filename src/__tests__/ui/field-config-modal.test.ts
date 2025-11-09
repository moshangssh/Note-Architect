import { App } from 'obsidian';
import { FieldConfigModal } from '../../ui/field-config-modal';
import { PresetManager } from '../../presets/PresetManager';
import { SettingsManager } from '../../settings/SettingsManager';
import { type FrontmatterPreset, type FrontmatterField } from '../../types/settings';
import { MasterListView } from '../../ui/field-config/master-list-view';
import { DetailPanelView } from '../../ui/field-config/detail-panel-view';
import { validateAndSave } from '../../ui/ui-utils';

jest.mock('obsidian', () => {
	const createMockElement = () => {
		const element: any = {
			empty: jest.fn(),
			addClass: jest.fn(),
			toggleClass: jest.fn(),
			setAttr: jest.fn(),
			createEl: jest.fn().mockReturnValue({
				setText: jest.fn(),
				addClass: jest.fn(),
				setAttr: jest.fn()
			})
		};
		element.createDiv = jest.fn().mockImplementation(() => createMockElement());
		return element;
	};

	return {
		App: jest.fn(),
		Notice: jest.fn(),
		Modal: jest.fn().mockImplementation(function () {
			this.contentEl = createMockElement();
			this.modalEl = { style: {} };
			this.close = jest.fn();
		})
	};
});

jest.mock('../../ui/field-config/master-list-view', () => ({
	MasterListView: jest.fn().mockImplementation(() => ({
		render: jest.fn(),
		destroy: jest.fn()
	}))
}));

jest.mock('../../ui/field-config/detail-panel-view', () => ({
	DetailPanelView: jest.fn().mockImplementation(() => ({
		render: jest.fn(),
		destroy: jest.fn(),
		focusOnFirstInput: jest.fn(),
		updateActiveFieldSummary: jest.fn(),
		setValidationErrors: jest.fn()
	}))
}));

jest.mock('../../presets/PresetManager');
jest.mock('../../settings/SettingsManager');
jest.mock('../../ui/ui-utils', () => ({
	validateAndSave: jest.fn()
}));

describe('FieldConfigModal - Master/Detail 骨架', () => {
	const MockedMasterListView = MasterListView as jest.MockedClass<typeof MasterListView>;
	const MockedDetailPanelView = DetailPanelView as jest.MockedClass<typeof DetailPanelView>;
	const validateAndSaveMock = validateAndSave as jest.MockedFunction<typeof validateAndSave>;

	let modal: FieldConfigModal;
	let mockPresetManager: jest.Mocked<PresetManager>;
	let mockSettingsManager: jest.Mocked<SettingsManager>;
	let mockPreset: FrontmatterPreset;
	let mockOnPresetsChanged: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();

		mockPresetManager = {
			updatePresetFields: jest.fn()
		} as any;

		mockSettingsManager = {
			getSettings: jest.fn().mockReturnValue({})
		} as any;

		mockPreset = {
			id: 'test-preset',
			name: 'Test Preset',
			fields: [
				{
					key: 'status',
					type: 'text',
					label: 'Status',
					default: '',
					options: []
				}
			]
		};

		mockOnPresetsChanged = jest.fn();

		MockedMasterListView.mockImplementation(() => ({
			render: jest.fn(),
			destroy: jest.fn()
		} as unknown as MasterListView));

		MockedDetailPanelView.mockImplementation(() => ({
			render: jest.fn(),
			destroy: jest.fn(),
			focusOnFirstInput: jest.fn(),
			updateActiveFieldSummary: jest.fn(),
			setValidationErrors: jest.fn()
		} as unknown as DetailPanelView));

		modal = new FieldConfigModal(
			{} as App,
			mockPresetManager,
			mockSettingsManager,
			mockPreset,
			mockOnPresetsChanged
		);
	});

	describe('初始化与 onOpen', () => {
		test('构造函数正确克隆字段数据', () => {
			expect(modal['fields']).toHaveLength(1);
			expect(modal['fields'][0]).not.toBe(mockPreset.fields[0]);
		});

		test('onOpen 创建 Master/Detail 视图并渲染骨架', () => {
			modal.onOpen();

			expect(MockedMasterListView).toHaveBeenCalledTimes(1);
			expect(MockedDetailPanelView).toHaveBeenCalledTimes(1);

			const masterListInstance = MockedMasterListView.mock.results[0]?.value as { render: jest.Mock };
			const detailPanelInstance = MockedDetailPanelView.mock.results[0]?.value as { render: jest.Mock };

			expect(masterListInstance.render).toHaveBeenCalledWith(modal['fields'], 0);
			expect(detailPanelInstance.render).toHaveBeenCalledWith(modal['fields'][0], 0);
		});

		test('onClose 会销毁子视图并清空内容', () => {
			modal.onOpen();
			const masterListInstance = MockedMasterListView.mock.results[0]?.value as { destroy: jest.Mock };
			const detailPanelInstance = MockedDetailPanelView.mock.results[0]?.value as { destroy: jest.Mock };

			modal.onClose();

			expect(masterListInstance.destroy).toHaveBeenCalled();
			expect(detailPanelInstance.destroy).toHaveBeenCalled();
			expect((modal.contentEl.empty as jest.Mock)).toHaveBeenCalled();
		});
	});

	describe('验证逻辑', () => {
		test('validateFields 正确校验必填项', () => {
			modal['fields'] = [
				{ key: '', type: 'text', label: '', default: '', options: [] }
			];

			const result = modal['validateFields']();
			expect(result.isValid).toBe(false);
			expect(result.errors).toContain('字段 1: Frontmatter 键名不能为空');
			expect(result.errors).toContain('字段 1: 显示名称不能为空');
			const inlineErrors = result.fieldErrors.get(0);
			expect(inlineErrors?.key).toContain('Frontmatter 键名不能为空');
			expect(inlineErrors?.label).toContain('显示名称不能为空');
		});

		test('validateFields 正确校验 select/multi-select 选项', () => {
			modal['fields'] = [
				{ key: 'status', type: 'select', label: 'Status', default: '', options: [] },
				{ key: 'tags', type: 'multi-select', label: 'Tags', default: [], options: [' '] }
			];

			const result = modal['validateFields']();
			expect(result.errors).toContain('字段 1: 单选类型必须至少有一个选项');
			expect(result.errors).toContain('字段 2: 多选类型必须至少有一个选项');
			expect(result.fieldErrors.get(0)?.options).toContain('至少添加一个有效选项');
			expect(result.fieldErrors.get(1)?.options).toContain('至少添加一个有效选项');
		});

		test('validateFields 能检测重复键名', () => {
			modal['fields'] = [
				{ key: 'status', type: 'text', label: 'A', default: '', options: [] },
				{ key: 'status', type: 'text', label: 'B', default: '', options: [] }
			];

			const result = modal['validateFields']();
			expect(result.errors).toContain('发现重复的 Frontmatter 键名: status');
			expect(result.fieldErrors.get(0)?.key).toContain('该键名与其他字段重复');
			expect(result.fieldErrors.get(1)?.key).toContain('该键名与其他字段重复');
		});
	});

	describe('保存流程', () => {
		test('saveAndClose 会在验证通过后调用 validateAndSave', async () => {
			validateAndSaveMock.mockResolvedValue(true);
			mockPresetManager.updatePresetFields.mockResolvedValue(mockPreset);

			await modal['saveAndClose']();

			expect(validateAndSaveMock).toHaveBeenCalledWith(
				modal['fields'],
				[],
				expect.any(Function),
				expect.objectContaining({
					successMessage: '字段配置已保存'
				})
			);
		});

		test('验证失败时 saveAndClose 会阻止保存', async () => {
			modal['fields'] = [
				{ key: '', type: 'text', label: '', default: '', options: [] }
			];

			await modal['saveAndClose']();
			expect(validateAndSaveMock).not.toHaveBeenCalled();
		});
	});
});
