import { Component, MarkdownRenderer } from 'obsidian';
import type { Template } from '@types';
import { handleError } from '@core/error';

/**
 * 模板预览面板，负责渲染模板内容或提示信息
 */
export class TemplatePreviewPanel {
	private readonly contentEl: HTMLElement;
	private readonly markdownComponent: Component;

	constructor(contentEl: HTMLElement) {
		this.contentEl = contentEl;
		this.markdownComponent = new Component();
		this.markdownComponent.load();
	}

	render(template: Template | null) {
		this.contentEl.empty();

		if (!template) {
			const emptyStateEl = this.contentEl.createDiv('note-architect-preview-empty');
			emptyStateEl.createEl('div', {
				text: '未选择模板',
				cls: 'note-architect-preview-empty-title'
			});
			emptyStateEl.createEl('div', {
				text: '提示：悬停或按 ↑↓ 浏览模板，回车应用',
				cls: 'note-architect-preview-empty-hint'
			});
			return;
		}

		try {
			const renderedEl = this.contentEl.createDiv('note-architect-preview-markdown');
			MarkdownRenderer.renderMarkdown(template.content, renderedEl, template.path, this.markdownComponent);
		} catch (error) {
			handleError(error, {
				context: 'TemplatePreviewPanel.render'
			});

			this.contentEl.createEl('p', {
				text: '预览渲染失败，显示原始内容：',
				cls: 'note-architect-preview-error'
			});
			this.contentEl.createEl('pre', {
				text: template.content,
				cls: 'note-architect-preview-raw'
			});
		}
	}

	destroy() {
		this.contentEl.empty();
		this.markdownComponent.unload();
	}
}
