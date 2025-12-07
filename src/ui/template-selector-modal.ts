import { App, Editor, MarkdownView, Modal } from "obsidian";
import type NoteArchitect from "@core/plugin";
import { TemplateManager } from "@templates";
import { TemplateLoadStatus } from "@types";
import type { Template, TemplateLoadResult, FrontmatterPreset } from "@types";
import {
  processTemplateContent,
  parseTemplateContent,
} from "@engine/TemplateEngine";
import { FrontmatterManagerModal } from "./frontmatter-manager-modal";
import { UniversalPresetSelectorModal } from "./universal-preset-selector-modal";
import { debounce } from "@utils/timing";
import {
  notifyError,
  notifyInfo,
  notifySuccess,
  notifyWarning,
} from "@utils/notify";
import { handleError } from "@core/error";
import {
  collectMatchingPresets,
  resolvePresetConfigIds,
} from "@utils/note-architect-config";
import { mergeFrontmatters } from "@utils/frontmatter/merge";
import {
  getNoteMetadata,
  updateNoteFrontmatter,
} from "@utils/frontmatter-editor";
import {
  TemplateSelectorLayout,
  type TemplateSelectorLayoutRefs,
} from "./template-selector/template-selector-layout";
import { TemplateSearchView } from "./template-selector/template-search-view";
import {
  TemplateListView,
  type TemplateListStatus,
} from "./template-selector/template-list-view";
import { TemplatePreviewPanel } from "./template-selector/template-preview-panel";

export class TemplateSelectorModal extends Modal {
  private readonly plugin: NoteArchitect;
  private readonly templateManager: TemplateManager;
  private templates: Template[];
  private searchQuery = "";
  private filteredTemplates: Template[] = [];
  private readonly scheduleSearchUpdate = debounce(
    (query: string) => this.applySearchUpdate(query),
    300
  );
  private selectedTemplate: Template | null = null;
  private readonly schedulePreviewUpdate = debounce(
    (template: Template | null) => this.renderPreview(template),
    200
  );
  private templateLoadStatus: TemplateLoadResult;
  private readonly collator = new Intl.Collator("zh-CN", {
    sensitivity: "base",
  });
  private searchContentEnabled = false;
  private activeIndex = -1;
  private highlightActive = false;

  private layout: TemplateSelectorLayout | null = null;
  private layoutRefs: TemplateSelectorLayoutRefs | null = null;
  private searchView: TemplateSearchView | null = null;
  private listView: TemplateListView | null = null;
  private previewPanel: TemplatePreviewPanel | null = null;

  constructor(app: App, plugin: NoteArchitect) {
    super(app);
    this.plugin = plugin;
    this.templateManager = plugin.templateManager;
    this.setTemplates(this.templateManager.getTemplates());
    this.filteredTemplates = [...this.templates];
    this.templateLoadStatus = this.templateManager.getTemplateLoadStatus();
  }

  private setTemplates(templates: Template[]) {
    this.templates = templates;
  }

  private clearActiveHighlight() {
    this.highlightActive = false;
    this.activeIndex = -1;
  }

  private resetActiveIndex() {
    if (this.filteredTemplates.length === 0) {
      this.activeIndex = -1;
      return;
    }
    this.activeIndex = this.highlightActive ? 0 : -1;
  }

  private searchTemplates(query: string): Template[] {
    if (!query || query.trim() === "") {
      return [...this.templates];
    }

    const normalizedQuery = query.toLowerCase().trim();
    return this.templates
      .filter((template) => {
        const normalizedName = template.name.toLowerCase();
        if (normalizedName.includes(normalizedQuery)) {
          return true;
        }
        if (!this.searchContentEnabled) {
          return false;
        }
        return template.content.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => this.collator.compare(a.name, b.name));
  }

  private applySearchUpdate(query: string) {
    this.filteredTemplates = this.searchTemplates(query);
    this.resetActiveIndex();
    this.updateTemplateList();
  }

  private handleSearchInput = (value: string) => {
    this.searchQuery = value;
    const trimmedQuery = value.trim();

    if (trimmedQuery === "") {
      this.scheduleSearchUpdate.cancel();
      this.filteredTemplates = [...this.templates];
      this.resetActiveIndex();
      this.updateTemplateList();
      return;
    }

    this.scheduleSearchUpdate(trimmedQuery);
  };

  private handleSearchClear = () => {
    this.searchQuery = "";
    this.filteredTemplates = [...this.templates];
    this.clearActiveHighlight();
    this.updateTemplateList();
    this.renderPreview(this.selectedTemplate);
  };

  private handleContentSearchToggle = (enabled: boolean) => {
    this.searchContentEnabled = enabled;
    this.scheduleSearchUpdate.cancel();
    this.filteredTemplates = this.searchTemplates(this.searchQuery.trim());
    this.resetActiveIndex();
    this.updateTemplateList();
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    const listView = this.listView;
    if (!listView) return;

    const total = listView.getAllTemplateCount();
    if (total === 0) return;

    switch (event.key) {
      case "ArrowDown": {
        this.highlightActive = true;
        this.activeIndex = (this.activeIndex + 1 + total) % total;
        listView.setActiveIndex(this.activeIndex);
        this.handleTemplateHoverFromList(this.activeIndex);
        event.preventDefault();
        break;
      }
      case "ArrowUp": {
        this.highlightActive = true;
        if (this.activeIndex <= 0) {
          this.activeIndex = total - 1;
        } else {
          this.activeIndex = (this.activeIndex - 1 + total) % total;
        }
        listView.setActiveIndex(this.activeIndex);
        this.handleTemplateHoverFromList(this.activeIndex);
        event.preventDefault();
        break;
      }
      case "Enter": {
        let targetIndex = this.activeIndex;
        if (targetIndex < 0) {
          targetIndex = 0;
        }
        const template = listView.getTemplateAt(targetIndex);
        if (template) {
          if (this.activeIndex !== targetIndex) {
            this.activeIndex = targetIndex;
            this.highlightActive = true;
            listView.setActiveIndex(this.activeIndex);
            this.handleTemplateHoverFromList(this.activeIndex);
          }
          this.handleTemplateClick(template);
        }
        event.preventDefault();
        break;
      }
      case "Escape": {
        // 交给 Obsidian 处理关闭行为
        break;
      }
    }
  };

  private handleTemplateHover(template: Template) {
    if (this.selectedTemplate && this.selectedTemplate.id === template.id) {
      return;
    }
    this.schedulePreviewUpdate(template);
  }

  private handleTemplateHoverFromList(index: number) {
    const template = this.listView?.getTemplateAt(index);
    if (template) {
      this.handleTemplateHover(template);
    }
  }

  private async autoReloadTemplates() {
    if (!this.listView) return;

    this.listView.renderLoading(
      "正在扫描模板",
      "请稍候，正在重新扫描模板文件夹..."
    );

    const result = await this.templateManager.reloadTemplates(false);

    this.setTemplates(this.templateManager.getTemplates());
    this.filteredTemplates = [...this.templates];
    this.templateLoadStatus = result;
    this.resetActiveIndex();

    this.updateTemplateList();
  }

  private async reloadTemplatesWithFeedback(): Promise<TemplateLoadResult> {
    const result = await this.templateManager.reloadTemplates(true);
    this.setTemplates(this.templateManager.getTemplates());
    this.filteredTemplates = [...this.templates];
    this.templateLoadStatus = result;
    this.resetActiveIndex();
    this.updateTemplateList();
    return result;
  }

  private openPluginSettings() {
    this.close();
    this.plugin.openSettings();
  }

  private updateTemplateList() {
    const listView = this.listView;
    if (!listView) return;

    const errorStatus = this.getErrorStatusInfo();
    if (errorStatus && this.filteredTemplates.length === 0) {
      listView.renderStatus(errorStatus);
      return;
    }

    if (this.filteredTemplates.length === 0) {
      const status =
        this.searchQuery.trim() === ""
          ? this.getEmptyStateInfo()
          : this.getNoResultsStateInfo();
      listView.renderStatus(status);
      return;
    }

    const recentTemplateIds = this.plugin.settings.recentlyUsedTemplates;
    const recentTemplates: Template[] = recentTemplateIds
      .map((id) => this.templateManager.getTemplateById(id))
      .filter((template): template is Template => Boolean(template))
      .filter((template) =>
        this.filteredTemplates.some((filtered) => filtered.id === template.id)
      );

    const recentIdSet = new Set(recentTemplateIds);
    const allOtherTemplates = this.filteredTemplates.filter(
      (template) => !recentIdSet.has(template.id)
    );

    if (allOtherTemplates.length === 0 && recentTemplates.length === 0) {
      listView.renderStatus(this.getNoResultsStateInfo());
      return;
    }

    if (allOtherTemplates.length === 0) {
      this.activeIndex = -1;
    } else {
      if (this.activeIndex >= allOtherTemplates.length) {
        this.activeIndex = allOtherTemplates.length - 1;
      }
      if (this.highlightActive && this.activeIndex < 0) {
        this.activeIndex = 0;
      }
    }

    listView.renderTemplates({
      recentTemplates,
      allTemplates: allOtherTemplates,
      selectedTemplateId: this.selectedTemplate?.id ?? null,
      activeIndex: this.activeIndex,
      highlightActive: this.highlightActive,
      onHover: (template) => this.handleTemplateHover(template),
      onClick: (template) => this.handleTemplateClick(template),
      onActiveChange: (index) => {
        this.activeIndex = index;
      },
    });
  }

  private getErrorStatusInfo(): TemplateListStatus | null {
    if (
      !this.templateLoadStatus ||
      this.templateLoadStatus.status === TemplateLoadStatus.SUCCESS
    ) {
      return null;
    }

    const status = this.templateLoadStatus.status;
    const openSettings = () => this.openPluginSettings();
    const retryScan = async () => await this.reloadTemplatesWithFeedback();

    switch (status) {
      case TemplateLoadStatus.ERROR: {
        const message = this.templateLoadStatus.message || "加载失败";
        if (message.includes("未设置")) {
          return {
            icon: "",
            title: "模板路径未设置",
            message: "您需要先设置模板文件夹路径才能使用此功能。",
            actions: [
              { text: "设置路径", action: openSettings, primary: true },
              { text: "稍后再说", action: () => this.close() },
            ],
          };
        } else if (message.includes("无效或不存在")) {
          return {
            icon: "",
            title: "模板文件夹不存在",
            message: "指定的模板文件夹路径无效或不存在，请检查路径设置。",
            actions: [
              { text: "修正路径", action: openSettings, primary: true },
              { text: "重新扫描", action: retryScan, busyText: "扫描中…" },
            ],
          };
        } else {
          return {
            icon: "",
            title: "加载失败",
            message: "加载模板时发生错误，请稍后重试或检查设置。",
            actions: [
              {
                text: "重新扫描",
                action: retryScan,
                primary: true,
                busyText: "扫描中…",
              },
              { text: "检查设置", action: openSettings },
            ],
          };
        }
      }
      case TemplateLoadStatus.EMPTY:
        return this.getEmptyFolderStatusInfo();
      default:
        return null;
    }
  }

  private getEmptyStateInfo(): TemplateListStatus {
    return {
      icon: "📋",
      title: "暂无可用模板",
      message: "未找到可用模板，请检查模板文件夹设置。",
      actions: [
        {
          text: "重新扫描",
          action: async () => await this.reloadTemplatesWithFeedback(),
          busyText: "扫描中…",
        },
        { text: "打开设置", action: () => this.openPluginSettings() },
      ],
    };
  }

  private getEmptyFolderStatusInfo(): TemplateListStatus {
    return {
      icon: "",
      title: "暂无模板",
      message:
        "模板文件夹中还没有找到任何 .md 模板文件。您可以创建一些模板文件，或者选择其他文件夹。",
      actions: [
        {
          text: "创建模板",
          action: () => {
            notifyInfo("请在模板文件夹中创建 .md 文件作为模板。");
            this.openPluginSettings();
          },
          primary: true,
        },
        { text: "更改路径", action: () => this.openPluginSettings() },
      ],
    };
  }

  private getNoResultsStateInfo(): TemplateListStatus {
    return {
      icon: "",
      title: "搜索无结果",
      message: `未找到包含 "${this.searchQuery}" 的模板。`,
      containerClass: "note-architect-no-results",
    };
  }

  private getAvailablePresets(): FrontmatterPreset[] {
    return this.plugin.presetManager.getPresets();
  }

  private handleTemplateClick(template: Template) {
    this.selectedTemplate = template;
    this.renderPreview(template);
    this.updateTemplateList();

    const templateFM = parseTemplateContent(template.content).frontmatter;
    const { ids: configIds } = resolvePresetConfigIds(templateFM);
    const availablePresets = this.getAvailablePresets();
    const hasAvailablePresets = availablePresets.length > 0;

    if (configIds.length > 0) {
      const { matched, missing } = collectMatchingPresets(
        configIds,
        availablePresets
      );

      if (missing.length > 0) {
        notifyWarning(
          `以下预设不存在：${missing.join("、")}，将略过这些预设。`
        );
      }

      if (matched.length > 0) {
        FrontmatterManagerModal.forTemplateInsertion(
          this.app,
          this.plugin,
          template,
          matched
        ).open();
        this.close();
        return;
      }

      notifyWarning("模板引用的预设均不存在，将为您选择其他预设");
      this.showDynamicPresetSelector(template);
      return;
    }

    // 未绑定预设：根据全局设置决定行为
    const behavior = this.plugin.settings.noPresetBehavior;
    switch (behavior) {
      case "do-nothing":
        // 直接插入模板，不使用预设
        this.insertTemplate(template);
        break;

      case "use-default": {
        // 使用默认预设
        const defaultPresetId = this.plugin.settings.defaultPresetId;
        if (!defaultPresetId) {
          // 未配置默认预设，降级为询问
          notifyWarning("未配置默认预设，请选择预设");
          if (hasAvailablePresets) {
            this.showDynamicPresetSelector(template);
          } else {
            this.insertTemplate(template);
          }
          break;
        }

        const defaultPreset = availablePresets.find(
          (p) => p.id === defaultPresetId
        );
        if (defaultPreset) {
          // 找到默认预设，打开表单
          FrontmatterManagerModal.forTemplateInsertion(
            this.app,
            this.plugin,
            template,
            [defaultPreset]
          ).open();
          this.close();
        } else {
          // 默认预设不存在，降级为询问
          notifyWarning(`默认预设 "${defaultPresetId}" 不存在，请选择其他预设`);
          if (hasAvailablePresets) {
            this.showDynamicPresetSelector(template);
          } else {
            this.insertTemplate(template);
          }
        }
        break;
      }

      case "ask":
        // 询问用户选择预设
        if (hasAvailablePresets) {
          this.showDynamicPresetSelector(template);
        } else {
          notifyInfo("当前没有可用预设，将直接插入模板");
          this.insertTemplate(template);
        }
        break;

      default:
        // 兜底：直接插入模板
        notifyWarning(`未知的未绑定预设行为：${behavior}，将直接插入模板`);
        this.insertTemplate(template);
        break;
    }
  }

  private showDynamicPresetSelector(template: Template) {
    new UniversalPresetSelectorModal(this.app, {
      title: "选择预设",
      subtitle: `模板 "${template.name}" 未配置预设，请从现有预设中选择一个：`,
      presets: this.plugin.presetManager.getPresets(),
      onSelect: (selectedPreset) => {
        // 用户选择了预设，打开 FrontmatterManagerModal
        FrontmatterManagerModal.forTemplateInsertion(
          this.app,
          this.plugin,
          template,
          [selectedPreset]
        ).open();
      },
      customButtons: [
        {
          text: "取消",
          variant: "default",
          onClick: () => {
            // 不做任何操作，只关闭窗口
          },
        },
        {
          text: "直接插入模板",
          variant: "cta",
          onClick: () => {
            this.insertTemplate(template);
          },
        },
      ],
    }).open();
    this.close();
  }

  private getActiveEditor(): Editor | null {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView || !activeView.editor) {
      notifyError("无法获取当前编辑器，请确保在 Markdown 文件中使用此功能。");
      return null;
    }
    return activeView.editor;
  }

  private formatInsertionDetails(
    ...segments: Array<string | undefined | null>
  ): string {
    const parts = segments.filter((segment): segment is string =>
      Boolean(segment && segment.trim())
    );
    return parts.length > 0 ? `（${parts.join("，")}）` : "";
  }

  private async insertTemplate(template: Template) {
    try {
      const editor = this.getActiveEditor();
      if (!editor) return;

      await this.insertTemplateWithFrontmatterMerge(template, editor);

      await this.plugin.addRecentTemplate(template.id);
      this.close();
    } catch (error) {
      handleError(error, {
        context: "TemplateSelectorModal.insertTemplate",
        userMessage: "插入模板失败，请稍后重试。",
      });
    }
  }

  private async insertTemplateWithFrontmatterMerge(
    template: Template,
    editor: Editor
  ) {
    const {
      content: processedContent,
      usedTemplater,
      error: templaterNotice,
    } = await processTemplateContent(this.app, this.plugin, template);

    if (templaterNotice) {
      notifyWarning(`${templaterNotice}，继续尝试 frontmatter 合并`);
    }

    const { frontmatter: templateFM, body: templateBody } =
      parseTemplateContent(processedContent);
    const hasFrontmatter = Object.keys(templateFM).length > 0;

    if (!hasFrontmatter) {
      editor.replaceSelection(processedContent);
      const details = this.formatInsertionDetails(
        "模板无 frontmatter，直接插入",
        usedTemplater ? "并使用 Templater 处理" : undefined
      );
      notifySuccess(`模板 "${template.name}" 已插入${details}。`);
      return;
    }

    try {
      const { frontmatter: noteFM, position: notePosition } = getNoteMetadata(
        this.app
      );
      const mergedFM = mergeFrontmatters(noteFM, templateFM);

      updateNoteFrontmatter(editor, mergedFM, notePosition);

      if (templateBody.trim()) {
        editor.replaceSelection(templateBody);
      }

      const details = this.formatInsertionDetails(
        usedTemplater ? "并使用 Templater 处理" : undefined,
        `已合并 ${Object.keys(templateFM).length} 个 frontmatter 字段`
      );
      notifySuccess(`模板 "${template.name}" 已插入${details}。`);
    } catch (error) {
      handleError(error, {
        context: "TemplateSelectorModal.insertTemplateWithFrontmatterMerge",
      });
      const details = this.formatInsertionDetails(
        usedTemplater ? "并使用 Templater 处理" : undefined,
        "已回退为普通插入"
      );
      notifyWarning(
        `Frontmatter 合并失败，模板 "${template.name}" 已直接插入${details}。`
      );
      editor.replaceSelection(processedContent);
    }
  }

  private renderPreview(template: Template | null) {
    this.previewPanel?.render(template);
  }

  onOpen() {
    this.modalEl.style.width = "85vw";
    this.modalEl.style.maxWidth = "1000px";

    const folderPath =
      this.plugin.settings.templateFolderPath?.trim() || "未设置";
    this.layout = new TemplateSelectorLayout(this.contentEl, {
      title: "选择模板",
      templateFolderPath: folderPath,
    });
    this.layoutRefs = this.layout.mount();

    this.searchView = new TemplateSearchView(this.layoutRefs.searchHostEl, {
      onInput: this.handleSearchInput,
      onKeyDown: this.handleKeyDown,
      onClear: this.handleSearchClear,
      onContentSearchChange: this.handleContentSearchToggle,
      initialQuery: this.searchQuery,
      initialContentSearchEnabled: this.searchContentEnabled,
    });
    this.searchView.mount();

    this.listView = new TemplateListView(this.layoutRefs.listContainerEl);
    this.previewPanel = new TemplatePreviewPanel(
      this.layoutRefs.previewContentEl
    );
    this.renderPreview(null);

    const closeBtn = this.layoutRefs.footerEl.createEl("button", {
      text: "关闭",
      cls: "note-architect-ghost-button",
    });
    closeBtn.type = "button";
    closeBtn.onclick = () => this.close();

    void this.autoReloadTemplates();

    setTimeout(() => this.searchView?.focus(), 100);
  }

  onClose() {
    this.scheduleSearchUpdate.cancel();
    this.schedulePreviewUpdate.cancel();

    this.clearActiveHighlight();

    this.searchView?.unmount();
    this.listView?.destroy();
    this.previewPanel?.destroy();
    this.layout?.destroy();

    this.searchView = null;
    this.listView = null;
    this.previewPanel = null;
    this.layout = null;
    this.layoutRefs = null;
  }
}
