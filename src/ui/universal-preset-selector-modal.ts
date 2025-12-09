import { App, Modal, Setting, ButtonComponent } from "obsidian";
import type { FrontmatterPreset } from "@types";
import { runWithBusy } from "@utils/async-ui";
import { renderPresetDescription } from "./ui-utils";

/**
 * 自定义按钮配置
 */
export interface CustomButton {
  /** 按钮文本 */
  text: string;
  /** 按钮样式类型 */
  variant?: "default" | "cta";
  /** 点击回调 */
  onClick: () => void | Promise<void>;
}

/**
 * 通用预设选择器配置选项
 */
export interface PresetSelectorOptions {
  /** 模态窗口标题 */
  title: string;
  /** 可用预设列表 */
  presets: FrontmatterPreset[];
  /** 用户选中某一项时触发（同步模式，选择后立即关闭） */
  onSelect?: (preset: FrontmatterPreset) => void;
  /** 用户绑定某一项时触发（异步模式，支持多次绑定，需手动管理关闭） */
  onBind?: (preset: FrontmatterPreset) => Promise<void>;

  /** 副标题/描述 */
  subtitle?: string;
  /** 当前已选中的预设 ID（用于高亮显示，支持数组） */
  currentPresetId?: string | string[];

  /** 是否显示"不使用预设/解绑"的顶部选项 */
  allowClear?: boolean;
  /** 用户点击"解绑"时触发（同步模式） */
  onClear?: () => void;
  /** 用户点击"解绑"时触发（异步模式） */
  onClearAsync?: () => Promise<void>;

  /** "选择"按钮文本，默认 "选择" */
  selectButtonText?: string;
  /** "当前"按钮文本，默认 "当前" */
  currentButtonText?: string;
  /** "解绑"选项名称，默认 "不使用预设" */
  clearOptionName?: string;
  /** "解绑"选项描述，默认 "解除当前绑定" */
  clearOptionDesc?: string;
  /** "解绑"按钮文本，默认 "解除绑定" */
  clearButtonText?: string;

  /** 自定义底部按钮（如"直接插入"、"取消"等） */
  customButtons?: CustomButton[];
  /** 是否在选择/绑定后自动关闭窗口，默认 true */
  autoClose?: boolean;
}

/**
 * 通用预设选择器 Modal
 * 支持多场景复用：绑定预设、选择预设以更新等
 */
export class UniversalPresetSelectorModal extends Modal {
  private readonly rawOptions: PresetSelectorOptions;
  private readonly boundIds: Set<string>;
  private filteredPresets: FrontmatterPreset[];
  private listContainer!: HTMLElement;
  private bottomButtonContainer?: HTMLElement;
  private searchQuery = "";
  private isBusy = false;

  constructor(app: App, options: PresetSelectorOptions) {
    super(app);

    // 验证：onSelect 和 onBind 不能同时存在
    if (options.onSelect && options.onBind) {
      throw new Error("PresetSelectorOptions: onSelect 和 onBind 不能同时提供");
    }
    // 验证：onClear 和 onClearAsync 不能同时存在
    if (options.onClear && options.onClearAsync) {
      throw new Error(
        "PresetSelectorOptions: onClear 和 onClearAsync 不能同时提供"
      );
    }

    this.rawOptions = options;
    this.filteredPresets = [...options.presets];

    // 标准化 currentPresetId 为 Set
    const currentIds = Array.isArray(options.currentPresetId)
      ? options.currentPresetId
      : options.currentPresetId
      ? [options.currentPresetId]
      : [];
    this.boundIds = new Set(currentIds);
  }

  onOpen(): void {
    const { contentEl } = this;

    // 设置模态窗口尺寸
    this.modalEl.style.width = "520px";
    this.modalEl.style.maxWidth = "90vw";

    contentEl.empty();

    // 渲染头部
    this.renderHeader();

    // 渲染搜索框
    this.renderSearchInput();

    // 渲染列表容器
    this.listContainer = contentEl.createDiv("note-architect-binding-list");
    this.listContainer.style.maxHeight = "320px";
    this.listContainer.style.overflowY = "auto";

    this.renderList();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  /**
   * 渲染头部（标题 + 副标题）
   */
  private renderHeader(): void {
    const headerEl = this.contentEl.createDiv("note-architect-modal-header");

    headerEl.createEl("h2", {
      text: this.rawOptions.title,
      cls: "modal-title",
    });

    if (this.rawOptions.subtitle) {
      headerEl.createEl("div", {
        text: this.rawOptions.subtitle,
        cls: "note-architect-modal-meta note-architect-modal-subtitle modal-content-description",
      });
    }
  }

  /**
   * 渲染搜索框
   */
  private renderSearchInput(): void {
    const searchContainer = this.contentEl.createDiv({
      cls: "note-architect-search-container search-input-container",
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

    // 自动聚焦
    setTimeout(() => searchInput.focus(), 100);
  }

  /**
   * 应用搜索过滤
   */
  private applyFilters(): void {
    if (!this.searchQuery) {
      this.filteredPresets = [...this.rawOptions.presets];
    } else {
      this.filteredPresets = this.rawOptions.presets.filter((preset) => {
        const haystack = [preset.name, preset.id, preset.description ?? ""]
          .join(" ")
          .toLowerCase();
        return haystack.includes(this.searchQuery);
      });
    }
    this.renderList();
  }

  /**
   * 渲染预设列表
   */
  private renderList(options: { preserveScroll?: boolean } = {}): void {
    const { preserveScroll = false } = options;
    const previousScrollTop = preserveScroll ? this.listContainer.scrollTop : 0;
    this.listContainer.empty();

    const restoreScroll = () => {
      this.listContainer.scrollTop = preserveScroll ? previousScrollTop : 0;
    };

    // 渲染"解绑"选项（如果启用）
    this.renderClearOption();

    // 空状态
    if (
      this.filteredPresets.length === 0 &&
      !this.rawOptions.allowClear &&
      !this.rawOptions.customButtons
    ) {
      this.listContainer.createEl("p", {
        text: "未找到匹配的预设，请调整搜索条件。",
        cls: "note-architect-empty-state",
      });
      restoreScroll();
      return;
    }

    // 遍历预设列表
    for (const preset of this.filteredPresets) {
      const isCurrent = this.isPresetBound(preset.id);

      const setting = new Setting(this.listContainer);
      setting.setName(preset.name);
      setting.setDesc(renderPresetDescription(preset));

      if (isCurrent) {
        // 渲染"（当前）"徽标
        setting.nameEl.createSpan({
          text: "（当前）",
          cls: "note-architect-preset-badge-current",
        });

        // 禁用的"当前"按钮
        setting.addButton((btn) =>
          btn
            .setButtonText(this.rawOptions.currentButtonText ?? "当前")
            .setDisabled(true)
        );
      } else if (this.rawOptions.onBind) {
        // 异步绑定模式：支持多次绑定
        setting.addButton((btn) =>
          btn
            .setButtonText(this.rawOptions.selectButtonText ?? "选择")
            .setCta()
            .onClick(() => this.handleBind(preset, btn))
        );
      } else if (this.rawOptions.onSelect) {
        // 同步选择模式：选择后关闭
        setting.addButton((btn) =>
          btn
            .setButtonText(this.rawOptions.selectButtonText ?? "选择")
            .setCta()
            .onClick(() => {
              this.close();
              this.rawOptions.onSelect?.(preset);
            })
        );
      }
    }

    // 渲染自定义底部按钮
    this.renderCustomButtons();

    restoreScroll();
  }

  /**
   * 渲染"不使用预设/解绑"选项
   */
  private renderClearOption(): void {
    if (
      !this.rawOptions.allowClear ||
      (!this.rawOptions.onClear && !this.rawOptions.onClearAsync)
    ) {
      return;
    }

    const setting = new Setting(this.listContainer);
    setting.setName(this.rawOptions.clearOptionName ?? "不使用预设");
    setting.setDesc(this.rawOptions.clearOptionDesc ?? "解除当前绑定");

    // 当前是否无绑定
    const isCurrentlyCleared = this.boundIds.size === 0;

    setting.addButton((btn) => {
      btn.setButtonText(
        isCurrentlyCleared
          ? this.rawOptions.currentButtonText ?? "当前"
          : this.rawOptions.clearButtonText ?? "解除绑定"
      );

      if (isCurrentlyCleared) {
        btn.setDisabled(true);
      } else {
        btn.setCta();
        if (this.rawOptions.onClearAsync) {
          btn.onClick(() => this.handleClear(btn.buttonEl));
        } else if (this.rawOptions.onClear) {
          btn.onClick(() => {
            const autoClose = this.rawOptions.autoClose ?? true;
            if (autoClose) {
              this.close();
            }
            this.rawOptions.onClear?.();
            if (!autoClose) {
              this.boundIds.clear();
              this.renderList({ preserveScroll: true });
            }
          });
        }
      }
    });
  }

  /**
   * 渲染自定义底部按钮
   */
  private renderCustomButtons(): void {
    if (
      !this.rawOptions.customButtons ||
      this.rawOptions.customButtons.length === 0
    ) {
      return;
    }

    // 如果底部容器不存在，则创建
    if (!this.bottomButtonContainer) {
      this.bottomButtonContainer = this.contentEl.createDiv(
        "note-architect-modal-bottom-buttons"
      );
      this.bottomButtonContainer.style.display = "flex";
      this.bottomButtonContainer.style.justifyContent = "flex-end";
      this.bottomButtonContainer.style.gap = "10px";
      this.bottomButtonContainer.style.marginTop = "15px";
      this.bottomButtonContainer.style.paddingTop = "15px";
      this.bottomButtonContainer.style.borderTop =
        "1px solid var(--background-modifier-border)";
    }

    this.bottomButtonContainer.empty();

    // 使用 ButtonComponent 替代手动创建按钮
    for (const customButton of this.rawOptions.customButtons) {
      const buttonComponent = new ButtonComponent(this.bottomButtonContainer)
        .setButtonText(customButton.text);

      // 应用样式变体
      if (customButton.variant === "cta") {
        buttonComponent.setCta();
      }

      // 设置样式
      buttonComponent.buttonEl.style.padding = "8px 16px";

      // 处理点击事件
      buttonComponent.onClick(async () => {
        if (this.isBusy) {
          return;
        }

        try {
          const result = customButton.onClick();
          if (result instanceof Promise) {
            this.isBusy = true;
            await runWithBusy(buttonComponent.buttonEl, async () => await result, {
              busyText: "处理中…",
              errorContext: "UniversalPresetSelectorModal.customButton",
            });
          }
        } finally {
          this.isBusy = false;
        }
      });
    }
  }

  /**
   * 判断预设是否已绑定
   */
  private isPresetBound(presetId: string): boolean {
    return this.boundIds.has(presetId);
  }

  /**
   * 处理异步绑定操作
   */
  private async handleBind(
    preset: FrontmatterPreset,
    button: ButtonComponent
  ): Promise<void> {
    if (
      this.isBusy ||
      this.isPresetBound(preset.id) ||
      !this.rawOptions.onBind
    ) {
      return;
    }

    this.isBusy = true;

    try {
      const result = await runWithBusy(
        button.buttonEl,
        async () => {
          await this.rawOptions.onBind!(preset);
        },
        {
          busyText: "处理中…",
          errorContext: "UniversalPresetSelectorModal.handleBind",
        }
      );

      if (result !== null) {
        this.boundIds.add(preset.id);
        const autoClose = this.rawOptions.autoClose ?? true;
        if (autoClose) {
          this.close();
        } else {
          this.renderList({ preserveScroll: true });
        }
      }
    } finally {
      this.isBusy = false;
    }
  }

  /**
   * 处理异步解绑操作
   */
  private async handleClear(triggerEl?: HTMLElement): Promise<void> {
    if (this.isBusy || !this.rawOptions.onClearAsync) {
      return;
    }

    this.isBusy = true;

    try {
      const result = triggerEl
        ? await runWithBusy(
            triggerEl,
            async () => {
              await this.rawOptions.onClearAsync!();
            },
            {
              busyText: "处理中…",
              errorContext: "UniversalPresetSelectorModal.handleClear",
            }
          )
        : await this.rawOptions.onClearAsync();

      if (result !== null) {
        this.boundIds.clear();
        const autoClose = this.rawOptions.autoClose ?? true;
        if (autoClose) {
          this.close();
        } else {
          this.renderList({ preserveScroll: true });
        }
      }
    } finally {
      this.isBusy = false;
    }
  }
}
