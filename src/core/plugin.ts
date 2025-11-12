import { Plugin } from 'obsidian';
import { PresetManager } from '@presets';
import { SettingsManager } from '@settings';
import { TemplateManager } from '@templates';
import type { AppWithSettings, NoteArchitectSettings } from '@types';
import { SettingsFacade } from './SettingsFacade';
import { UiRegistrar } from './UiRegistrar';

export default class NoteArchitect extends Plugin {
	settingsManager: SettingsManager;
	settings: NoteArchitectSettings;
	templateManager: TemplateManager;
	presetManager: PresetManager;
	updateStatusBar?: () => void;
	private settingsFacade!: SettingsFacade;

	async onload() {
		await this.initializeManagers();
		this.setupStatusBar();
		this.templateManager.startWatching();
		this.settingsFacade = new SettingsFacade(this.updateStatusBar, () => this.templateManager.loadTemplates());
		this.presetManager.setSaveOptionsFactory(() => this.settingsFacade.getDefaultSaveOptions());
		new UiRegistrar(this, this.settingsManager, this.presetManager).registerAll();
	}

	onunload() {
		this.templateManager?.dispose();
	}

	async loadSettings() {
		this.settings = await this.settingsManager.load();
	}

	async saveSettings() {
		this.settings = await this.settingsManager.save(this.settings, this.settingsFacade.getDefaultSaveOptions());
	}

	openSettings() {
		const appInstance = this.app as AppWithSettings;
		appInstance.setting.open();
		appInstance.setting.openTabById(this.manifest.id);
	}

	private async initializeManagers(): Promise<void> {
		this.settingsManager = new SettingsManager(this);
		this.settings = await this.settingsManager.load();
		this.templateManager = new TemplateManager(this.app, this.settingsManager);
		await this.templateManager.loadTemplates();
		this.presetManager = new PresetManager(this.settingsManager);
	}

	private setupStatusBar(): void {
		const statusBarItemEl = this.addStatusBarItem();
		this.updateStatusBar = () => {
			statusBarItemEl.setText(`📁 ${this.settings.templateFolderPath || '未设置'}`);
		};
		this.updateStatusBar();
	}

	/**
	 * 将一个模板ID添加到最近使用列表的顶部。
	 * 此方法会处理去重、排序和长度限制。
	 * @param templateId 要记录的模板ID (即文件路径)
	 */
	async addRecentTemplate(templateId: string): Promise<void> {
		const saveOptions = this.settingsFacade?.getDefaultSaveOptions();
		await this.settingsManager.addRecentTemplate(templateId, saveOptions);
		this.settings = this.settingsManager.getSettings();
	}

	async updateTemplateFolderPath(path: string): Promise<void> {
		const saveOptions = this.settingsFacade?.getDefaultSaveOptions();
		await this.settingsManager.updateTemplateFolderPath(path, saveOptions);
		this.settings = this.settingsManager.getSettings();
	}

	async setLastUsedPresetForUpdate(presetId: string): Promise<void> {
		const saveOptions = this.settingsFacade?.getDefaultSaveOptions();
		await this.settingsManager.setLastUsedPresetForUpdate(presetId, saveOptions);
		this.settings = this.settingsManager.getSettings();
	}
}
