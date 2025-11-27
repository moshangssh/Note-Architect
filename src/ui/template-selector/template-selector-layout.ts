/**
 * 负责搭建模板选择模态窗口的基础布局
 */
export interface TemplateSelectorLayoutRefs {
	searchHostEl: HTMLElement;
	listContainerEl: HTMLElement;
	previewContentEl: HTMLElement;
	footerEl: HTMLElement;
}

export interface TemplateSelectorLayoutOptions {
	title?: string;
	templateFolderPath?: string;
}

export class TemplateSelectorLayout {
	private readonly contentEl: HTMLElement;
	private readonly options: TemplateSelectorLayoutOptions;

	constructor(contentEl: HTMLElement, options?: TemplateSelectorLayoutOptions) {
		this.contentEl = contentEl;
		this.options = options ?? {};
	}

	mount(): TemplateSelectorLayoutRefs {
		this.contentEl.empty();

		const headerEl = this.contentEl.createDiv('note-architect-modal-header');
		headerEl.createEl('h2', {
			text: this.options.title ?? '选择模板',
			cls: 'modal-title'
		});

		const folderPath = this.options.templateFolderPath?.trim() ?? '';
		if (folderPath) {
			headerEl.createEl('div', {
				text: `模板路径：${folderPath}`,
				cls: 'text-muted note-architect-modal-subtitle'
			});
		}

		const mainContainerEl = this.contentEl.createDiv('note-architect-main-container');
		const leftContainerEl = mainContainerEl.createDiv('note-architect-left-container');

		const searchHostEl = leftContainerEl.createDiv();
		const listContainerEl = leftContainerEl.createDiv('note-architect-modal-container');

		mainContainerEl.createDiv('note-architect-divider');

		const previewContainerEl = mainContainerEl.createDiv('note-architect-preview-container');
		previewContainerEl.createEl('h3', {
			text: '预览',
			cls: 'note-architect-preview-title'
		});
		const previewContentEl = previewContainerEl.createDiv('note-architect-preview-content');

		const footerEl = this.contentEl.createDiv('note-architect-modal-footer');

		return {
			searchHostEl,
			listContainerEl,
			previewContentEl,
			footerEl
		};
	}

	destroy() {
		this.contentEl.empty();
	}
}
