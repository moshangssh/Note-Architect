import type { Template } from "@types";
import { renderStatusBlock } from "../ui-utils";
import { setIcon } from "obsidian";

export interface TemplateListStatusAction {
  text: string;
  action: () => void | Promise<unknown>;
  primary?: boolean;
  busyText?: string;
}

export interface TemplateListStatus {
  icon: string;
  title: string;
  message: string;
  actions?: TemplateListStatusAction[];
  containerClass?: string;
}

export interface TemplateListRenderOptions {
  recentTemplates: Template[];
  allTemplates: Template[];
  selectedTemplateId?: string | null;
  activeIndex: number;
  highlightActive?: boolean;
  onHover: (template: Template) => void;
  onClick: (template: Template) => void;
  onActiveChange?: (index: number) => void;
}

/**
 * 模板列表视图，负责渲染列表、状态提示及事件绑定
 */
export class TemplateListView {
  private readonly containerEl: HTMLElement;
  private allListEl: HTMLElement | null = null;
  private allTemplates: Template[] = [];
  private activeIndex = -1;
  private highlightActive = false;
  private selectedTemplateId: string | null = null;
  private onActiveChange: ((index: number) => void) | null = null;

  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }

  renderLoading(title: string, message: string) {
    this.renderStatus({
      icon: "",
      title,
      message,
    });
  }

  renderStatus(status: TemplateListStatus) {
    this.resetState();
    const containerClass = [
      "note-architect-status-container",
      status.containerClass ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    renderStatusBlock(this.containerEl, {
      icon: status.icon,
      title: status.title,
      items: [
        {
          label: "",
          content: status.message,
          type: "text",
        },
      ],
      actions: status.actions?.map((action) => ({
        text: action.text,
        onClick: action.action,
        cls: action.primary ? "mod-cta" : "",
        busyText: action.busyText,
      })),
      containerClass,
    });
  }

  renderTemplates(options: TemplateListRenderOptions) {
    this.resetState();

    this.allTemplates = options.allTemplates;
    this.selectedTemplateId = options.selectedTemplateId ?? null;
    this.activeIndex = this.clampActiveIndex(options.activeIndex);
    this.highlightActive = options.highlightActive ?? false;
    this.onActiveChange = options.onActiveChange ?? null;

    const { recentTemplates } = options;

    if (recentTemplates.length > 0) {
      this.renderSection(
        "最近使用",
        recentTemplates,
        options.onHover,
        options.onClick,
        "recent"
      );
    }

    if (this.allTemplates.length > 0) {
      this.allListEl = this.renderSection(
        "所有模板",
        this.allTemplates,
        options.onHover,
        options.onClick,
        "all"
      );
      this.applyActiveState();
    }
  }

  setActiveIndex(index: number) {
    this.highlightActive = true;
    this.activeIndex = this.clampActiveIndex(index);
    this.applyActiveState();
    this.onActiveChange?.(this.activeIndex);
  }

  getTemplateAt(index: number): Template | null {
    if (index < 0) {
      return null;
    }
    return this.allTemplates[index] ?? null;
  }

  getAllTemplateCount(): number {
    return this.allTemplates.length;
  }

  destroy() {
    this.resetState();
    this.containerEl.empty();
  }

  private renderSection(
    title: string,
    templates: Template[],
    onHover: (template: Template) => void,
    onClick: (template: Template) => void,
    section: "recent" | "all"
  ): HTMLElement {
    this.containerEl.createEl("h4", {
      text: title,
      cls: "note-architect-list-header",
    });
    const listEl = this.containerEl.createDiv({
      cls: "note-architect-template-list",
    });

    templates.forEach((template, index) => {
      const itemEl = listEl.createDiv({
        cls: "setting-item note-architect-template-item",
      });

      if (
        section === "all" &&
        this.highlightActive &&
        index === this.activeIndex
      ) {
        itemEl.addClass("note-architect-template-item-active");
      }
      if (this.selectedTemplateId && template.id === this.selectedTemplateId) {
        itemEl.addClass("note-architect-template-item-selected");
      }

      // --- 修改开始：重构内容结构 ---
      const infoEl = itemEl.createDiv({
        cls: "setting-item-info note-architect-template-info",
      });

      // 添加文件图标
      const iconEl = infoEl.createDiv({
        cls: "note-architect-template-icon",
      });
      setIcon(iconEl, "file-text");

      // 1. 创建主容器，包含名称和路径
      const contentRow = infoEl.createDiv({
        cls: "note-architect-template-content-row",
      });

      // 2. 名称
      const nameEl = contentRow.createDiv({
        cls: "note-architect-template-name setting-item-name",
      });
      nameEl.setText(template.name);

      // 3. 路径 (仅显示父文件夹，去掉文件名和扩展名，简化显示)
      // 如果您完全不想看路径，可以注释掉下面这段
      const simplePath = this.formatSimplePath(template.path);
      if (simplePath) {
        const pathEl = contentRow.createDiv({
          cls: "note-architect-template-path-inline", // 改用 inline 样式类
        });
        pathEl.setText(simplePath);
      }

      // 4. 徽标区域：移除 'recent' 徽标，仅保留 'current' (当前选中)
      if (this.selectedTemplateId && template.id === this.selectedTemplateId) {
        const badgesEl = contentRow.createDiv({
          cls: "note-architect-template-badges",
        });
        this.appendBadge(badgesEl, "当前", "current");
      }
      // --- 修改结束 ---

      itemEl.addEventListener("mouseenter", () => {
        if (section === "all") {
          this.activeIndex = index;
          if (this.highlightActive) {
            this.applyActiveState();
          }
          this.onActiveChange?.(index);
        }
        onHover(template);
      });

      itemEl.addEventListener("click", () => onClick(template));
    });

    return listEl;
  }

  /**
   * 简化路径显示 - 新增辅助方法
   */
  private formatSimplePath(path: string): string {
    const parts = path.split("/");
    // 如果只有文件名（在根目录），返回空字符串
    if (parts.length <= 1) return "";

    // 移除文件名，只保留文件夹路径
    parts.pop();

    // 移除首层的 "Template" 或 "Templates" 文件夹（如果是默认配置）以减少噪音
    if (parts[0] === "Template" || parts[0] === "Templates") {
      parts.shift();
    }

    return parts.length > 0 ? parts.join("/") : "";
  }

  private appendBadge(
    containerEl: HTMLElement,
    text: string,
    variant: "recent" | "current"
  ) {
    const badgeEl = containerEl.createSpan({
      text,
      cls: "flair note-architect-template-badge",
    });
    badgeEl.addClass(
      variant === "current"
        ? "note-architect-template-badge-current"
        : "note-architect-template-badge-recent"
    );
  }

  private applyActiveState() {
    if (!this.allListEl) return;

    const prevActive = this.allListEl.querySelector(
      ".note-architect-template-item-active"
    );
    prevActive?.classList.remove("note-architect-template-item-active");

    if (!this.highlightActive || this.activeIndex < 0) {
      return;
    }

    const child = this.allListEl.children[this.activeIndex];
    if (!child) return;

    const newActive = child as HTMLElement;
    if (newActive) {
      newActive.classList.add("note-architect-template-item-active");
      newActive.scrollIntoView({ block: "nearest" });
    }
  }

  private resetState() {
    this.containerEl.empty();
    this.allListEl = null;
    this.allTemplates = [];
    this.selectedTemplateId = null;
    this.activeIndex = -1;
    this.highlightActive = false;
    this.onActiveChange = null;
  }

  private clampActiveIndex(index: number): number {
    if (this.allTemplates.length === 0) {
      return -1;
    }
    if (index < -1) {
      return -1;
    }
    if (index >= this.allTemplates.length) {
      return this.allTemplates.length - 1;
    }
    return index;
  }
}
