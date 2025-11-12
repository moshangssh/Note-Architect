import { FieldConfigForm, FieldConfigFormConfig } from '../../../ui/field-config/field-config-form';
import { FrontmatterField, FrontmatterFieldType } from '../../../types/settings';

// Mock Obsidian's Element extensions
const mockEmpty = jest.fn();
const mockAddClass = jest.fn();
const mockCreateEl = jest.fn();
const mockCreateDiv = jest.fn();
const mockToggleClass = jest.fn();

// Setup Element prototype mocks before each test
beforeAll(() => {
	// Mock standard DOM methods
	Object.defineProperty(Element.prototype, 'innerHTML', {
		set(value) {
			this._innerHTML = value;
		},
		get() {
			return this._innerHTML;
		},
		configurable: true
	});

	Object.defineProperty(Element.prototype, 'textContent', {
		set(value) {
			this._textContent = value;
		},
		get() {
			return this._textContent;
		},
		configurable: true
	});

	// Mock DOM classList
	Object.defineProperty(Element.prototype, 'classList', {
		value: {
			add: jest.fn(),
			remove: jest.fn(),
			toggle: jest.fn(),
		},
		configurable: true
	});

	// Mock Obsidian API methods (for backwards compatibility)
	Object.defineProperty(Element.prototype, 'empty', {
		value: mockEmpty.mockReturnThis(),
		configurable: true
	});

	Object.defineProperty(Element.prototype, 'addClass', {
		value: mockAddClass.mockReturnThis(),
		configurable: true
	});

	Object.defineProperty(Element.prototype, 'createEl', {
		value: mockCreateEl.mockReturnThis(),
		configurable: true
	});

	Object.defineProperty(Element.prototype, 'createDiv', {
		value: mockCreateDiv.mockReturnThis(),
		configurable: true
	});

	Object.defineProperty(Element.prototype, 'toggleClass', {
		value: mockToggleClass.mockReturnThis(),
		configurable: true
	});
});

// Create a simple mock container
const mockContainer = document.createElement('div');

describe('FieldConfigForm', () => {
	let mockField: FrontmatterField;
	let mockConfig: FieldConfigFormConfig;
	let fieldForm: FieldConfigForm;
	let mockOnFieldChange: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();

		mockField = {
			key: 'status',
			type: 'text',
			label: '状态',
			default: '',
			description: ''
		};

		mockOnFieldChange = jest.fn();
		mockConfig = {
			field: mockField,
			fieldIndex: 0,
			onFieldChange: mockOnFieldChange,
			settingsManager: {
				getSettings: () => ({ defaultDateFormat: 'YYYY-MM-DD' })
			}
		};

		fieldForm = new FieldConfigForm(mockConfig);
	});

	describe('Constructor', () => {
		it('should initialize with correct config', () => {
			expect(fieldForm.getField()).toEqual(mockField);
		});
	});

	describe('updateField', () => {
		it('should update field data', () => {
			const newField = { ...mockField, key: 'priority' };
			fieldForm.updateField(newField);
			expect(fieldForm.getField()).toEqual(newField);
		});
	});

	describe('getField', () => {
		it('should return a copy of the field', () => {
			const returnedField = fieldForm.getField();
			expect(returnedField).toEqual(mockField);
			expect(returnedField).not.toBe(mockField); // Should be a different object
		});
	});

	describe('destroy', () => {
		it('should clean up resources', () => {
			expect(() => {
				fieldForm.destroy();
			}).not.toThrow();
		});
	});

	describe('render', () => {
		it('should render form container with correct class', () => {
			fieldForm.render(mockContainer);
			// Check standard DOM API is used
			expect(mockContainer.innerHTML).toBe('');
			expect(mockContainer.classList.add).toHaveBeenCalledWith('note-architect-field-config');
		});

		it('should render all form sections', () => {
			fieldForm.render(mockContainer);

			// Verify that all expected methods are called
			expect(mockContainer.createEl).toHaveBeenCalled();
			expect(mockContainer.createDiv).toHaveBeenCalled();
		});
	});

	describe('update', () => {
		it('should not re-render for non-structural changes (key, label, default, description)', () => {
			// First render to establish baseline
			jest.clearAllMocks();
			fieldForm.render(mockContainer);
			const initialInnerHTML = mockContainer.innerHTML;

			// Update with non-structural changes
			const updatedField = {
				...mockField,
				key: 'new-key',
				label: '新标签',
				default: 'new-default',
				description: '新描述'
			};
			fieldForm.update(updatedField, 0);

			// Should not have re-rendered (innerHTML should be same)
			expect(mockContainer.innerHTML).toBe(initialInnerHTML);
		});

		it('should re-render for structural changes (type change)', () => {
			// First render to establish baseline
			jest.clearAllMocks();
			fieldForm.render(mockContainer);

			// Update with structural change - type change
			const updatedField = {
				...mockField,
				type: 'select' as FrontmatterFieldType
			};
			fieldForm.update(updatedField, 0);

			// Should have re-rendered (innerHTML set to empty then content added)
			expect(mockContainer.innerHTML).toBe('');
			// Check that classList methods were called during re-render
			expect(mockContainer.classList.add).toHaveBeenCalled();
		});

		it('should re-render for structural changes (options change)', () => {
			// Setup a select field
			mockField.type = 'select';
			mockField.options = ['option1', 'option2'];
			fieldForm = new FieldConfigForm({ ...mockConfig, field: mockField });

			// First render to establish baseline
			jest.clearAllMocks();
			fieldForm.render(mockContainer);

			// Update with structural change - options change
			const updatedField = {
				...mockField,
				options: ['option1', 'option2', 'option3']
			};
			fieldForm.update(updatedField, 0);

			// Should have re-rendered (innerHTML set to empty then content added)
			expect(mockContainer.innerHTML).toBe('');
			// Check that classList methods were called during re-render
			expect(mockContainer.classList.add).toHaveBeenCalled();
		});

		it('should re-render for structural changes (useTemplaterTimestamp change)', () => {
			// Setup a date field
			mockField.type = 'date';
			fieldForm = new FieldConfigForm({ ...mockConfig, field: mockField });

			// First render to establish baseline
			jest.clearAllMocks();
			fieldForm.render(mockContainer);

			// Update with structural change - useTemplaterTimestamp change
			const updatedField = {
				...mockField,
				useTemplaterTimestamp: true
			};
			fieldForm.update(updatedField, 0);

			// Should have re-rendered (innerHTML set to empty then content added)
			expect(mockContainer.innerHTML).toBe('');
			// Check that classList methods were called during re-render
			expect(mockContainer.classList.add).toHaveBeenCalled();
		});
	});

	describe('Field type handling', () => {
		it('should handle text type fields', () => {
			mockField.type = 'text';
			fieldForm = new FieldConfigForm(mockConfig);

			expect(() => {
				fieldForm.render(mockContainer);
			}).not.toThrow();
		});

		it('should handle select type fields', () => {
			mockField.type = 'select';
			mockField.options = ['option1', 'option2'];
			fieldForm = new FieldConfigForm(mockConfig);

			expect(() => {
				fieldForm.render(mockContainer);
			}).not.toThrow();
		});

		it('should handle date type fields', () => {
			mockField.type = 'date';
			fieldForm = new FieldConfigForm(mockConfig);

			expect(() => {
				fieldForm.render(mockContainer);
			}).not.toThrow();
		});

		it('should handle multi-select type fields', () => {
			mockField.type = 'multi-select';
			mockField.options = ['option1', 'option2'];
			fieldForm = new FieldConfigForm(mockConfig);

			expect(() => {
				fieldForm.render(mockContainer);
			}).not.toThrow();
		});
	});

	describe('Error handling', () => {
		it('should handle missing field options gracefully', () => {
			mockField.type = 'select';
			// @ts-ignore - Remove options to test error handling
			delete mockField.options;

			fieldForm = new FieldConfigForm(mockConfig);

			expect(() => {
				fieldForm.render(mockContainer);
			}).not.toThrow();
		});

		it('should handle missing settings manager gracefully', () => {
			const configWithoutSettingsManager = { ...mockConfig };
			delete configWithoutSettingsManager.settingsManager;

			const form = new FieldConfigForm(configWithoutSettingsManager);

			expect(() => {
				form.render(mockContainer);
			}).not.toThrow();
		});

		it('should handle null container gracefully', () => {
			expect(() => {
				// @ts-ignore - Testing error handling
				fieldForm.render(null);
			}).toThrow();
		});
	});

	describe('Field type labels', () => {
		it('should handle all field types', () => {
			const types: FrontmatterFieldType[] = ['text', 'select', 'date', 'multi-select'];

			types.forEach(type => {
				const field = {
					key: 'test',
					type,
					label: 'Test',
					default: '',
					description: ''
				};
				const config = { ...mockConfig, field };
				const form = new FieldConfigForm(config);

				expect(() => {
					form.render(mockContainer);
				}).not.toThrow();
			});
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	afterAll(() => {
		// Clean up prototype modifications
		delete (Element.prototype as any).empty;
		delete (Element.prototype as any).addClass;
		delete (Element.prototype as any).createEl;
		delete (Element.prototype as any).createDiv;
	});
});
