import { App, Modal } from 'obsidian';
import type NoteArchitect from '@core/plugin';
import type { PresetManager, PresetImportStrategy, ImportPresetsResult } from '@presets';
import type { SettingsManager } from '@settings';
import type { FrontmatterPreset } from '@types';
import type { RenderPresetItemContext } from './preset-item-ui';
import {
	renderPresetListUI,
	type RenderPresetListOptions,
} from './preset-item-ui';
import { handleError } from '@core/error';
import {
	notifySuccess,
	notifyWarning,
	notifyInfo,
	notifyError,
} from '@utils/notify';
import { withUiNotice, confirmAndDelete } from './ui-utils';
import { withBusy } from '@utils/async-ui';
import { CreatePresetModal } from './create-preset-modal';
import { RenamePresetModal } from './rename-preset-modal';
import { SimpleConfirmModal } from './simple-confirm-modal';
import { FieldConfigModal } from './field-config-modal';
import { parseFrontmatter, updateFrontmatter } from '@utils/frontmatter-editor';
import { isInsideTemplateFolder as utilIsInsideTemplateFolder } from '@utils/path';
import { resolvePresetConfigIds, stripPresetConfigKeys } from '@utils/note-architect-config';
import { PRESET_CONFIG_KEY } from '@core/constants';

export class PresetManagerComponent {
	private readonly containerEl: HTMLElement;
	private readonly app: App;
	private readonly plugin: NoteArchitect;
	private readonly presetManager: PresetManager;
	private readonly settingsManager: SettingsManager;

	constructor(
		containerEl: HTMLElement,
		app: App,
		plugin: NoteArchitect,
		settingsManager: SettingsManager,
		presetManager: PresetManager,
	) {
		this.containerEl = containerEl;
		this.app = app;
		this.plugin = plugin;
		this.settingsManager = settingsManager;
		this.presetManager = presetManager;
	}

	/**
	 * 主渲染方法
	 */
	public display(): void {
		this.containerEl.empty();

		// 渲染此组件的所有 UI
		this.renderHeaderAndActions();
		this.renderPresetListContainer();
	}

	/**
	 * 清理方法
	 */
	public destroy(): void {
		// 在这里清理事件监听器等，如果需要的话
		this.containerEl.empty();
	}

	/**
	 * 渲染页头和操作按钮区域
	 */
	private renderHeaderAndActions(): void {
		// 标题
		this.containerEl.createEl('h3', { text: 'Frontmatter 配置预设' });

		// 描述
		const descEl = this.containerEl.createDiv({ cls: 'setting-item-description' });
		descEl.createEl('small', {
			text: '创建和管理 Frontmatter 配置预设，为后续的字段配置做准备。每个预设包含一组可重用的 frontmatter 字段。',
		});

		// 操作按钮区域
		const actionsContainer = this.containerEl.createDiv('note-architect-preset-actions');
		const addPresetButton = actionsContainer.createEl('button', {
			text: '添加新预设',
			cls: 'mod-cta',
		});
		const exportButton = actionsContainer.createEl('button', {
			text: '导出全部',
		});
		const importButton = actionsContainer.createEl('button', {
			text: '从文件导入',
		});

		// 添加事件监听器
		addPresetButton.onclick = async () => {
			await this.addNewPreset();
		};

		withBusy(
			exportButton,
			async () => {
				await this.exportAllPresetsToFile();
			},
			{
				busyText: '导出中…',
				errorContext: 'PresetManagerComponent.exportAllPresets',
			},
		);

		withBusy(
			importButton,
			async () => {
				const file = await this.pickPresetFile();
				if (!file) {
					notifyInfo('未选择任何文件，已取消导入');
					return;
				}
				const content = await file.text();
				await this.handleImportContent(content);
			},
			{
				busyText: '读取中…',
				errorContext: 'PresetManagerComponent.importPresetsFromFile',
			},
		);
	}

	/**
	 * 渲染预设列表容器
	 */
	private renderPresetListContainer(): void {
		const presetsListContainer = this.containerEl.createDiv('note-architect-presets-list');
		this.refreshPresetsList(presetsListContainer);
	}

	/**
	 * 刷新预设列表
	 */
	private refreshPresetsList(containerEl: HTMLElement, nextPresets?: FrontmatterPreset[]): void {
		const presets = nextPresets ?? this.presetManager.getPresets();

		const options: RenderPresetListOptions = {
			containerEl,
			presets,
			callbacks: {
				onRename: async (preset, newName, context) => {
					await this.handlePresetRename(preset, newName, context);
				},
				onConfigure: async (preset, _context) => {
					await this.openFieldConfigModal(preset);
				},
				onDelete: async (preset, _context) => {
					await this.deletePreset(preset.id);
				},
			},
		};

		renderPresetListUI(options);
	}

	/**
	 * 导出所有预设到文件
	 */
	private async exportAllPresetsToFile(): Promise<void> {
		try {
			const presets = this.presetManager.getPresets();
			if (presets.length === 0) {
				notifyInfo('暂无预设可导出');
				return;
			}

			const json = this.presetManager.exportAllPresets();
			const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = 'note-architect-presets.json';
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			URL.revokeObjectURL(url);
			notifySuccess(`已导出 ${presets.length} 个预设`);
		} catch (error) {
			handleError(error, {
				context: 'PresetManagerComponent.exportAllPresets',
				userMessage: '导出预设失败，请稍后重试。',
			});
		}
	}

	/**
	 * 选择预设文件进行导入
	 */
	private async pickPresetFile(): Promise<File | null> {
		return new Promise((resolve) => {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = '.json,application/json';
			input.style.display = 'none';
			document.body.appendChild(input);

			let settled = false;

			const finalize = (file: File | null) => {
				if (settled) {
					return;
				}
				settled = true;
				document.body.removeChild(input);
				window.removeEventListener('focus', handleWindowFocus);
				resolve(file);
			};

			const handleWindowFocus = () => {
				// 焦点返回后再次检查是否已选择文件，避免误判为取消
				setTimeout(() => {
					if (settled) {
						return;
					}
					const candidate = input.files?.[0] ?? null;
					finalize(candidate);
				}, 120);
			};

			input.addEventListener(
				'change',
				() => {
					const file = input.files?.[0] ?? null;
					finalize(file);
				},
				{ once: true },
			);

			input.addEventListener(
				'cancel',
				() => {
					finalize(null);
				},
				{ once: true },
			);

			window.addEventListener('focus', handleWindowFocus, { once: true });
			input.click();
		});
	}

	/**
	 * 处理导入内容
	 */
	private async handleImportContent(raw: string): Promise<void> {
		const content = raw.trim();
		if (!content) {
			notifyWarning('导入内容为空，未执行任何操作');
			return;
		}

		try {
			const strategy = await this.chooseImportStrategy();
			if (!strategy) {
				notifyInfo('已取消导入');
				return;
			}

			if (strategy === 'replace') {
				const confirmed = await this.confirmReplaceAll();
				if (!confirmed) {
					notifyInfo('已取消覆盖现有预设');
					return;
				}
			}

			const result = await this.presetManager.importPresets(content, { strategy });
			this.notifyImportResult(result);

			// 刷新列表
			const listContainer = this.containerEl.querySelector('.note-architect-presets-list') as HTMLElement;
			if (listContainer) {
				this.refreshPresetsList(listContainer);
			}
		} catch (error) {
			handleError(error, {
				context: 'PresetManagerComponent.importPresets',
				userMessage: (err) => err.message || '导入预设失败，请检查文件内容。',
			});
		}
	}

	/**
	 * 通知导入结果
	 */
	private notifyImportResult(result: ImportPresetsResult): void {
		const importedCount = result.appliedPresets.length;
		const renameCount = result.renamedPresets.length;
		const renameSuffix = renameCount > 0 ? `，其中 ${renameCount} 个预设已自动重命名` : '';

		if (result.strategy === 'replace') {
			notifySuccess(`已替换全部预设，共导入 ${importedCount} 个预设${renameSuffix}`);
		} else {
			notifySuccess(`已导入 ${importedCount} 个预设${renameSuffix}`);
		}
	}

	/**
	 * 选择导入策略
	 */
	private async chooseImportStrategy(): Promise<PresetImportStrategy | null> {
		if (this.presetManager.getPresets().length === 0) {
			return 'replace';
		}

		const modal = new PresetImportStrategyModal(this.app);
		return modal.openAndWait();
	}

	/**
	 * 确认替换全部预设
	 */
	private async confirmReplaceAll(): Promise<boolean> {
		const confirmModal = new SimpleConfirmModal(this.app, {
			title: '确认替换全部预设',
			message: '此操作将删除当前所有预设，并以导入文件中的配置完全替换，且无法撤销。确定继续吗？',
			confirmText: '确认替换',
			cancelText: '取消',
			confirmClass: 'mod-warning',
		});
		return confirmModal.openAndWait();
	}

	/**
	 * 添加新预设
	 */
	private async addNewPreset(): Promise<void> {
		// 打开创建预设模态窗口
		const refreshList = () => {
			const listContainer = this.containerEl.querySelector('.note-architect-presets-list') as HTMLElement;
			if (listContainer) {
				this.refreshPresetsList(listContainer);
			}
		};
		new CreatePresetModal(this.app, this.presetManager, refreshList).open();
	}

	/**
	 * 处理预设重命名
	 */
	private async handlePresetRename(
		preset: FrontmatterPreset,
		newName: string,
		context: RenderPresetItemContext,
	): Promise<void> {
		const originalName = preset.name;
		const trimmedName = newName.trim();
		if (!trimmedName) {
			context.nameInputEl.value = originalName;
			notifyWarning('预设名称不能为空');
			return;
		}

		const originalId = preset.id;

		if (trimmedName === originalName) {
			context.nameInputEl.value = originalName;
			return;
		}

		const suggestedId =
			trimmedName === originalName
				? originalId
				: this.presetManager.generateUniquePresetId(trimmedName);

		const modal = new RenamePresetModal(this.app, {
			preset,
			newName: trimmedName,
			suggestedId,
			validateId: (candidate: string, currentId: string) =>
				this.presetManager.validatePresetIdForUpdate(candidate, {
					ignorePresetId: currentId,
				}),
		});

		const modalResult = await modal.openAndWait();

		if (!modalResult) {
			context.nameInputEl.value = originalName;
			return;
		}

		const shouldUpdateId = modalResult.mode === 'update';
		const targetId = shouldUpdateId ? (modalResult.newId ?? '').trim() : originalId;
		if (shouldUpdateId && !targetId) {
			notifyWarning('预设ID不能为空');
			context.nameInputEl.value = originalName;
			return;
		}

		const needIdMigration = shouldUpdateId && targetId !== originalId;

		context.nameInputEl.disabled = true;
		try {
			const refreshList = () => {
				const listContainer = this.containerEl.querySelector('.note-architect-presets-list') as HTMLElement;
				if (listContainer) {
					this.refreshPresetsList(listContainer);
				}
			};

			await withUiNotice(
				async () => {
					let migrationResult:
						| Awaited<ReturnType<typeof this.migratePresetBindings>>
						| null = null;

					if (needIdMigration) {
						migrationResult = await this.migratePresetBindings(
							originalId,
							targetId,
						);
					}

					try {
						const renameOutcome = await this.presetManager.renamePresetWithIdChange(
							originalId,
							trimmedName,
							{
								newId: needIdMigration ? targetId : undefined,
							},
						);

						const updatedTemplates = migrationResult?.updated ?? 0;

						return {
							...renameOutcome,
							updatedTemplates,
						};
					} catch (error) {
						if (migrationResult) {
							await migrationResult.rollback();
						}
						throw error;
					}
				},
				{
					success: (outcome) => {
						const base = `预设已重命名为: ${outcome.preset.name}`;
						if (!outcome.idChanged) {
							return base;
						}
						const tail =
							outcome.updatedTemplates > 0
								? `，已更新 ${outcome.updatedTemplates} 个模板引用`
								: '，未检测到需要更新的模板引用';
						return `${base}（新 ID：${outcome.preset.id}${tail}）`;
					},
					fail: '重命名预设失败',
					onSuccess: refreshList,
					onFail: refreshList,
				},
			);
		} finally {
			context.nameInputEl.disabled = false;
		}
	}

	/**
	 * 迁移预设绑定
	 */
	private async migratePresetBindings(
		oldId: string,
		newId: string,
	): Promise<{
		updated: number;
		files: string[];
		rollback: () => Promise<void>;
	}> {
		const folderPath = this.plugin.settings?.templateFolderPath?.trim();
		if (!folderPath) {
			return {
				updated: 0,
				files: [],
				rollback: async () => {},
			};
		}

		const vault = this.app.vault;
		const templateFiles = vault
			.getFiles()
			.filter(
				(file) =>
					file.extension === 'md' &&
					utilIsInsideTemplateFolder(file.path, folderPath),
			);

		const updatedRecords: Array<{ file: any; previousContent: string }> = [];

		try {
			for (const file of templateFiles) {
				const content = await vault.read(file);
				const parsed = parseFrontmatter(content);
				const { ids: existingIds } = resolvePresetConfigIds(parsed.frontmatter);
				if (!existingIds.includes(oldId)) {
					continue;
				}

				const result = updateFrontmatter(
					content,
					(frontmatter) => {
						const updatedIds = existingIds.map((id) => (id === oldId ? newId : id));
						const nextValue = updatedIds.length === 1 ? updatedIds[0] : updatedIds;
						return {
							...stripPresetConfigKeys(frontmatter),
							[PRESET_CONFIG_KEY]: nextValue,
						};
					},
					parsed,
				);

				if (!result.changed) {
					continue;
				}

				await vault.modify(file, result.content);
				updatedRecords.push({ file, previousContent: content });
			}

			return {
				updated: updatedRecords.length,
				files: updatedRecords.map(({ file }) => file.path),
				rollback: async () => {
					for (const record of [...updatedRecords].reverse()) {
						await vault.modify(record.file, record.previousContent);
					}
				},
			};
		} catch (error) {
			for (const record of [...updatedRecords].reverse()) {
				try {
					await vault.modify(record.file, record.previousContent);
				} catch (restoreError) {
					console.error('Note Architect: 还原模板失败', restoreError);
				}
			}
			throw error;
		}
	}

	/**
	 * 删除预设
	 */
	private async deletePreset(presetId: string): Promise<void> {
		const preset = this.presetManager.getPresetById(presetId);
		if (!preset) {
			notifyError(`未找到 ID 为 "${presetId}" 的预设`);
			return;
		}

		const refreshList = () => {
			const listContainer = this.containerEl.querySelector('.note-architect-presets-list') as HTMLElement;
			if (listContainer) {
				this.refreshPresetsList(listContainer);
			}
		};

		await confirmAndDelete(
			presetId,
			preset.name,
			async (id: string) => await this.presetManager.deletePreset(id),
			{
				success: `已删除预设: ${preset.name}`,
				fail: '删除预设失败',
			},
		);

		// 刷新列表
		refreshList();
	}

	/**
	 * 打开字段配置模态窗口
	 */
	private async openFieldConfigModal(preset: FrontmatterPreset): Promise<void> {
		const refreshList = () => {
			const listContainer = this.containerEl.querySelector('.note-architect-presets-list') as HTMLElement;
			if (listContainer) {
				this.refreshPresetsList(listContainer);
			}
		};

		new FieldConfigModal(
			this.app,
			this.presetManager,
			this.settingsManager,
			preset,
			refreshList,
		).open();
	}

	// --- 工具方法 ---

	// isInsideTemplateFolder 已从 @utils/path 导入
	// parseFrontmatter, updateFrontmatter 已从 @utils/frontmatter-editor 导入
	// resolvePresetConfigIds, stripPresetConfigKeys 已从 @utils/note-architect-config 导入
	// PRESET_CONFIG_KEY 已从 @core/constants 导入
}

/**
 * 预设导入策略选择模态框
 */
class PresetImportStrategyModal extends Modal {
	private resolvePromise?: (result: PresetImportStrategy | null) => void;
	private settled = false;

	openAndWait(): Promise<PresetImportStrategy | null> {
		return new Promise<PresetImportStrategy | null>((resolve) => {
			this.resolvePromise = resolve;
			this.open();
		});
	}

	onOpen(): void {
		this.titleEl.setText('选择预设导入方式');
		const content = this.contentEl;
		content.empty();

		content.createEl('p', { text: '请选择导入策略：' });

		const list = content.createEl('ul');
		list.createEl('li', {
			text: '合并导入：保留现有预设，若出现相同 ID 将自动生成新 ID。',
		});
		list.createEl('li', {
			text: '替换全部：删除现有预设，并以导入文件中的配置完全替换。',
		});

		const actions = content.createDiv('modal-button-container');
		const mergeButton = actions.createEl('button', { text: '合并导入', cls: 'mod-cta' });
		mergeButton.addEventListener('click', () => this.closeWith('merge'));

		const replaceButton = actions.createEl('button', { text: '替换全部', cls: 'mod-warning' });
		replaceButton.addEventListener('click', () => this.closeWith('replace'));

		const cancelButton = actions.createEl('button', { text: '取消' });
		cancelButton.addEventListener('click', () => this.closeWith(null));
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.settled) {
			this.resolvePromise?.(null);
		}
	}

	private closeWith(result: PresetImportStrategy | null): void {
		if (this.settled) {
			return;
		}
		this.settled = true;
		this.resolvePromise?.(result);
		this.close();
	}
}
