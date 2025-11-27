import { App, Modal, Setting, type ButtonComponent } from "obsidian";
import type { FrontmatterPreset, Template } from "@types";
import { runWithBusy } from "@utils/async-ui";

interface TemplatePresetBindingModalOptions {
  template: Template;
  presets: FrontmatterPreset[];
  existingIds?: string[];
  onBind: (preset: FrontmatterPreset, template: Template) => Promise<void>;
  onClear?: () => Promise<void>;
}

export class TemplatePresetBindingModal extends Modal {
  private readonly options: TemplatePresetBindingModalOptions;
  private filteredResults: FrontmatterPreset[];
  private listContainer!: HTMLElement;
  private readonly boundIds: Set<string>;
  private searchQuery = "";
  private isBusy = false;

  constructor(app: App, options: TemplatePresetBindingModalOptions) {
    super(app);
    const initialIds = Array.isArray(options.existingIds)
      ? Array.from(new Set(options.existingIds))
      : [];
    this.options = {
      ...options,
      existingIds: initialIds,
    };
    // 简化：直接使用预设列表，不再进行智能匹配
    this.filteredResults = [...options.presets];
    this.boundIds = new Set(initialIds);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.style.width = "520px";
    this.modalEl.style.maxWidth = "90vw";

    contentEl.empty();

    const headerEl = contentEl.createDiv("note-architect-modal-header");
    headerEl.createEl("h2", {
      text: "将模板绑定到预设",
      cls: "modal-title",
    });

    headerEl.createEl("div", {
      text: `模板路径：${this.options.template.path}`,
      cls: "note-architect-modal-meta note-architect-modal-subtitle modal-content-description",
    });

    const searchContainer = contentEl.createDiv({
      cls: "note-architect-search-wrapper search-input-container",
    });

    const searchInput = searchContainer.createEl("input", {
      type: "search",
      placeholder: "搜索预设...",
      cls: "note-architect-search-input",
    });
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.applyFilters();
    });

    this.listContainer = contentEl.createDiv("note-architect-binding-list");
    this.listContainer.style.maxHeight = "320px";
    this.listContainer.style.overflowY = "auto";
    this.renderPresetList();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private applyFilters(): void {
    if (!this.searchQuery) {
      this.filteredResults = [...this.options.presets];
    } else {
      // 简化：直接过滤预设，不再使用匹配结果
      this.filteredResults = this.options.presets.filter((preset) => {
        const haystack = [preset.name, preset.id, preset.description ?? ""]
          .join(" ")
          .toLowerCase();
        return haystack.includes(this.searchQuery);
      });
    }
    this.renderPresetList();
  }

  private renderPresetList(options: { preserveScroll?: boolean } = {}): void {
    const { preserveScroll = false } = options;
    const previousScrollTop = preserveScroll ? this.listContainer.scrollTop : 0;
    this.listContainer.empty();

    const restoreScroll = () => {
      this.listContainer.scrollTop = preserveScroll ? previousScrollTop : 0;
    };

    if (this.filteredResults.length === 0 && !this.options.onClear) {
      this.listContainer.createEl("p", {
        text: "未找到匹配的预设，请调整搜索条件。",
        cls: "note-architect-empty-state",
      });
      restoreScroll();
      return;
    }

    this.renderNoneOption();

    if (this.filteredResults.length === 0) {
      this.listContainer.createEl("p", {
        text: "未找到匹配的预设，请调整搜索条件。",
        cls: "note-architect-empty-state",
      });
      restoreScroll();
      return;
    }

    // 简化：直接遍历预设列表，移除智能推荐相关逻辑
    for (const preset of this.filteredResults) {
      const setting = new Setting(this.listContainer);
      setting.setName(preset.name);

      const isCurrent = this.isPresetBound(preset.id);
      if (isCurrent) {
        const nameEl = setting.nameEl;
        nameEl.createSpan({
          text: "（当前）",
          cls: "note-architect-badge-current",
        });
      }

      // 简化：仅显示预设描述，移除匹配原因
      setting.setDesc(this.buildPresetDesc(preset));

      if (isCurrent) {
        setting.addButton((button) =>
          button.setButtonText("当前").setDisabled(true)
        );
        continue;
      }

      setting.addButton((button) =>
        button
          .setButtonText("选择")
          .setCta()
          .onClick(() => this.handleBind(preset, button))
      );
    }

    restoreScroll();
  }

  private async handleBind(
    preset: FrontmatterPreset,
    button: ButtonComponent
  ): Promise<void> {
    if (this.isBusy || this.isPresetBound(preset.id)) {
      return;
    }

    this.isBusy = true;

    try {
      const result = await runWithBusy(
        button.buttonEl,
        async () => {
          await this.options.onBind(preset, this.options.template);
        },
        {
          busyText: "处理中…",
          errorContext: "TemplatePresetBindingModal.handleBind",
        }
      );
      if (result !== null) {
        this.boundIds.add(preset.id);
        this.options.existingIds = Array.from(this.boundIds);
        this.updateBindingInfo();
        this.renderPresetList({ preserveScroll: true });
      }
    } finally {
      this.isBusy = false;
    }
  }

  private async handleClear(triggerEl?: HTMLElement): Promise<void> {
    if (this.isBusy || !this.options.onClear) {
      return;
    }

    this.isBusy = true;

    try {
      const onClear = this.options.onClear;
      const targetEl =
        (triggerEl as { buttonEl?: HTMLElement } | undefined)?.buttonEl ??
        triggerEl;
      const result = targetEl
        ? await runWithBusy(
            targetEl,
            async () => {
              await onClear();
            },
            {
              busyText: "处理中…",
              errorContext: "TemplatePresetBindingModal.handleClear",
            }
          )
        : await onClear();
      if (result !== null) {
        this.boundIds.clear();
        this.options.existingIds = [];
        this.updateBindingInfo();
        this.renderPresetList({ preserveScroll: true });
      }
    } finally {
      this.isBusy = false;
    }
  }

  private isPresetBound(presetId: string): boolean {
    return this.boundIds.has(presetId);
  }

  private updateBindingInfo(): void {
    // 当前绑定状态通过列表徽标展示，此处无需额外文本
  }

  // 简化：仅显示预设 ID 和描述，移除匹配原因
  private buildPresetDesc(preset: FrontmatterPreset): DocumentFragment {
    const fragment = document.createDocumentFragment();

    const idEl = document.createElement("span");
    idEl.textContent = preset.id;
    idEl.classList.add("note-architect-id-code");
    fragment.append(idEl);

    if (preset.description) {
      const separatorEl = document.createElement("span");
      separatorEl.textContent = " ｜ ";
      separatorEl.classList.add("note-architect-desc-separator");
      fragment.append(separatorEl);

      const descEl = document.createElement("span");
      descEl.textContent = preset.description;
      descEl.classList.add("note-architect-desc-text");
      fragment.append(descEl);
    }

    return fragment;
  }

  private renderNoneOption(): void {
    if (!this.options.onClear) {
      return;
    }

    const setting = new Setting(this.listContainer);
    setting.setName("不绑定预设");
    setting.setDesc("不使用任何预设配置");

    const isCurrent = this.boundIds.size === 0;
    setting.addButton((button) => {
      button.setButtonText(isCurrent ? "当前" : "解除绑定");
      if (isCurrent) {
        button.setDisabled(true);
        return;
      }
      button.setCta();
      button.onClick(() => this.handleClear(button.buttonEl));
    });
  }
}
