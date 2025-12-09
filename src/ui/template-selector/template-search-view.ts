import { SearchComponent } from "obsidian";

interface TemplateSearchViewOptions {
  onInput: (value: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onClear: () => void;
  placeholder?: string;
  initialQuery?: string;
  onContentSearchChange?: (enabled: boolean) => void;
  initialContentSearchEnabled?: boolean;
}

/**
 * 负责渲染模板搜索输入框及其交互逻辑
 * 使用 Obsidian SearchComponent 提供原生搜索体验
 */

export class TemplateSearchView {
  private readonly options: TemplateSearchViewOptions;
  private readonly parentEl: HTMLElement;
  private searchComponent: SearchComponent | null = null;
  private optionsContainerEl: HTMLElement | null = null;

  private contentSearchCheckboxEl: HTMLInputElement | null = null;

  constructor(parentEl: HTMLElement, options: TemplateSearchViewOptions) {
    this.parentEl = parentEl;
    this.options = options;
  }
  mount() {
    // 使用 Obsidian 原生 SearchComponent，直接挂载到父元素
    this.searchComponent = new SearchComponent(this.parentEl);
    // SearchComponent 默认带有 search-input-container 类，这里添加自定义类
    this.searchComponent.containerEl.addClass(
      "note-architect-search-container"
    );

    this.searchComponent
      .setPlaceholder(this.options.placeholder ?? "搜索模板...")
      .onChange((value) => {
        this.options.onInput(value);
      });

    // 添加自定义键盘事件处理（SearchComponent 不提供此功能）
    this.searchComponent.inputEl.addEventListener(
      "keydown",
      this.handleKeyDown
    );

    if (this.options.onContentSearchChange) {
      this.optionsContainerEl = this.parentEl.createDiv(
        "note-architect-search-options"
      );
      const labelEl = this.optionsContainerEl.createEl("label", {
        cls: "note-architect-search-option",
      });
      labelEl.setAttribute(
        "title",
        "启用后将搜索模板正文，可能导致检索速度变慢"
      );
      this.contentSearchCheckboxEl = labelEl.createEl("input", {
        type: "checkbox",
        cls: "note-architect-search-option-input",
      });
      this.contentSearchCheckboxEl.checked = Boolean(
        this.options.initialContentSearchEnabled
      );
      this.contentSearchCheckboxEl.addEventListener(
        "change",
        this.handleContentSearchToggle
      );
      labelEl.createSpan({
        text: "搜索模板内容",
        cls: "note-architect-search-option-label",
      });
    }

    if (this.options.initialQuery) {
      this.setQuery(this.options.initialQuery, false);
    }
  }

  unmount() {
    // 移除键盘事件监听
    this.searchComponent?.inputEl.removeEventListener(
      "keydown",
      this.handleKeyDown
    );
    this.contentSearchCheckboxEl?.removeEventListener(
      "change",
      this.handleContentSearchToggle
    );

    // 清理 SearchComponent 容器
    this.searchComponent?.containerEl.empty();
    this.optionsContainerEl?.remove();
    this.searchComponent = null;
    this.optionsContainerEl = null;
    this.contentSearchCheckboxEl = null;
  }

  focus() {
    this.searchComponent?.inputEl.focus();
  }

  setQuery(value: string, trigger = true) {
    if (!this.searchComponent) return;
    this.searchComponent.setValue(value);
    if (trigger) {
      this.options.onInput(value);
    }
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    this.options.onKeyDown(event);
  };

  private handleClear = () => {
    this.setQuery("", false);
    this.options.onClear();
    this.focus();
  };

  private handleContentSearchToggle = () => {
    if (!this.contentSearchCheckboxEl) return;
    this.options.onContentSearchChange?.(this.contentSearchCheckboxEl.checked);
  };
}
