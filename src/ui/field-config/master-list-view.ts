import type { FrontmatterField } from "@types";
import { FieldItem } from "./field-item";
import { DomEventManager } from "@ui/dom-event-manager";
import { setIcon } from "obsidian";

/**
 * MasterListView 配置项
 */
export interface MasterListViewConfig {
  containerEl: HTMLElement;
  onSelect?: (index: number) => void;
  onAddField?: () => void;
  onReorder?: (
    fromIndex: number,
    targetIndex: number,
    isAfter: boolean
  ) => void;
}

/**
 * MasterListView 负责渲染主列表区域
 */
export class MasterListView {
  private readonly containerEl: HTMLElement;
  private readonly config: MasterListViewConfig;
  private readonly eventManager = new DomEventManager();
  private readonly fieldItems = new Map<number, FieldItem>();
  private currentFields: FrontmatterField[] = [];
  private draggedIndex: number | null = null;
  private addButtonEl?: HTMLButtonElement;
  private pendingFocusIndex: number | null = null;
  private currentSelectedIndex: number | null = null;
  private pendingFocusAttempts = 0;

  private listEl?: HTMLDivElement;
  private lastKnownScrollTop = 0;

  constructor(config: MasterListViewConfig) {
    this.containerEl = config.containerEl;
    this.config = config;
    this.containerEl.addClass("note-architect-master-list");
  }

  /**
   * 渲染字段列表视图
   */
  render(fields: FrontmatterField[], selectedIndex: number | null): void {
    const previousScrollTop =
      this.listEl?.scrollTop ?? this.lastKnownScrollTop ?? 0;

    this.destroyFieldItems();
    this.eventManager.dispose();
    this.containerEl.empty();
    this.addButtonEl = undefined;
    this.listEl = undefined;

    this.currentFields = fields;
    this.currentSelectedIndex = selectedIndex;
    this.lastKnownScrollTop = Math.max(0, previousScrollTop);
    this.pendingFocusAttempts = 0;

    const header = this.containerEl.createDiv(
      "note-architect-master-list__header"
    );
    const headerContent = header.createDiv(
      "note-architect-master-list__header-content"
    );
    headerContent.createEl("h3", { text: "字段列表" });

    const addBtn = header.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": "添加字段" },
    });
    setIcon(addBtn, "plus");
    this.eventManager.add(addBtn, "click", () => {
      this.config.onAddField?.();
    });
    this.addButtonEl = addBtn;

    const listEl = this.containerEl.createDiv(
      "note-architect-master-list__items"
    );
    listEl.setAttr("role", "listbox");
    listEl.setAttr("aria-label", "字段列表");
    listEl.setAttr("aria-orientation", "vertical");
    this.eventManager.add(listEl, "keydown", this.handleListKeydown);
    this.listEl = listEl;

    this.renderListBody(listEl);
    this.restoreScrollPosition();
    this.applyPendingFocus();
  }

  /**
   * 仅更新选中项的高亮，避免整列表重渲染
   */
  updateSelection(selectedIndex: number | null): void {
    if (
      selectedIndex !== null &&
      (selectedIndex < 0 || selectedIndex > this.currentFields.length - 1)
    ) {
      return;
    }

    if (selectedIndex === this.currentSelectedIndex) {
      return;
    }

    const previousIndex = this.currentSelectedIndex;
    this.currentSelectedIndex = selectedIndex;

    if (previousIndex !== null) {
      this.fieldItems.get(previousIndex)?.setSelected(false);
    }

    if (selectedIndex === null) {
      return;
    }

    this.fieldItems.get(selectedIndex)?.setSelected(true);
  }

  /**
   * 靶向更新指定列表项摘要信息，避免整列表刷新
   */
  updateItemSummary(index: number, field: FrontmatterField): void {
    if (index < 0 || index > this.currentFields.length - 1) {
      return;
    }

    this.currentFields[index] = field;
    const fieldItem = this.fieldItems.get(index);
    fieldItem?.updateSummary(field);
  }

  /**
   * 销毁主列表视图
   */
  destroy(): void {
    this.destroyFieldItems();
    this.eventManager.dispose();
    this.containerEl.empty();
    this.addButtonEl = undefined;
    this.listEl = undefined;
    this.currentFields = [];
    this.pendingFocusIndex = null;
    this.pendingFocusAttempts = 0;
    this.lastKnownScrollTop = 0;
  }

  /**
   * 聚焦主列表（优先选中项，其次第一项，最后“添加字段”按钮）
   */
  focusList(selectedIndex: number | null): void {
    if (selectedIndex !== null) {
      this.pendingFocusIndex = selectedIndex;
      this.applyPendingFocus();
      if (this.pendingFocusIndex === null) {
        return;
      }
    }

    const firstItem = this.getFirstRenderedItem();
    if (firstItem?.focus()) {
      return;
    }

    this.addButtonEl?.focus();
  }

  private handleDragStart(index: number): void {
    this.draggedIndex = index;
  }

  private handleDragEnd(): void {
    this.draggedIndex = null;
    this.fieldItems.forEach((item) => item.clearDropClasses());
  }

  private destroyFieldItems(): void {
    if (this.fieldItems.size === 0) {
      return;
    }
    this.fieldItems.forEach((item) => item.destroy());
    this.fieldItems.clear();
  }

  private readonly handleListKeydown = (event: KeyboardEvent): void => {
    const totalCount = this.currentFields.length;
    if (totalCount === 0) {
      return;
    }

    const validKeys = new Set(["ArrowUp", "ArrowDown", "Home", "End"]);
    if (!validKeys.has(event.key)) {
      return;
    }

    const fallbackIndex =
      this.getNavigationStartIndex(event.target) ??
      this.currentSelectedIndex ??
      0;
    let nextIndex = fallbackIndex;

    if (event.key === "ArrowUp") {
      nextIndex = Math.max(0, fallbackIndex - 1);
    } else if (event.key === "ArrowDown") {
      nextIndex = Math.min(totalCount - 1, fallbackIndex + 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = totalCount - 1;
    }

    if (nextIndex === fallbackIndex) {
      return;
    }

    event.preventDefault();
    this.moveSelectionByKeyboard(nextIndex);
  };

  private getNavigationStartIndex(target: EventTarget | null): number | null {
    if (!(target instanceof HTMLElement)) {
      return null;
    }
    for (const item of this.fieldItems.values()) {
      if (item.containsElement(target)) {
        return item.getIndex();
      }
    }
    return null;
  }

  private moveSelectionByKeyboard(targetIndex: number): void {
    const totalCount = this.currentFields.length;
    if (targetIndex < 0 || targetIndex > totalCount - 1) {
      return;
    }

    if (targetIndex === this.currentSelectedIndex) {
      this.pendingFocusIndex = targetIndex;
      this.applyPendingFocus();
      return;
    }

    this.pendingFocusIndex = targetIndex;
    if (this.config.onSelect) {
      this.config.onSelect(targetIndex);
    } else {
      this.applyPendingFocus();
    }
  }

  private applyPendingFocus(): void {
    if (this.pendingFocusIndex === null) {
      this.pendingFocusAttempts = 0;
      return;
    }

    const targetItem = this.fieldItems.get(this.pendingFocusIndex);
    if (targetItem?.focus()) {
      this.pendingFocusIndex = null;
      this.pendingFocusAttempts = 0;
      return;
    }

    this.scheduleFocusRetry();
  }

  private scheduleFocusRetry(): void {
    if (this.pendingFocusAttempts >= 2) {
      this.pendingFocusIndex = null;
      this.pendingFocusAttempts = 0;
      return;
    }
    this.pendingFocusAttempts += 1;
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      window.requestAnimationFrame(() => this.applyPendingFocus());
    } else {
      window.setTimeout(() => this.applyPendingFocus(), 0);
    }
  }

  /**
   * 渲染列表主体内容
   */
  private renderListBody(listEl: HTMLDivElement): void {
    if (this.currentFields.length === 0) {
      this.renderEmptyState(listEl);
      return;
    }

    // 直接渲染所有字段，不再使用虚拟滚动
    this.currentFields.forEach((field, index) => {
      const fieldItem = this.createFieldItem(field, index, listEl);
      this.fieldItems.set(index, fieldItem);
    });
  }

  /**
   * 渲染空状态提示
   */
  private renderEmptyState(listEl: HTMLDivElement): void {
    const emptyEl = listEl.createDiv("note-architect-master-list__empty");
    emptyEl.setText('暂无字段，稍后可通过"添加字段"按钮创建。');
    this.lastKnownScrollTop = 0;
  }

  /**
   * 恢复滚动位置
   */
  private restoreScrollPosition(): void {
    if (!this.listEl) {
      return;
    }
    const maxScroll = Math.max(
      0,
      this.listEl.scrollHeight - this.listEl.clientHeight
    );
    const targetScroll = Math.max(
      0,
      Math.min(this.lastKnownScrollTop, maxScroll)
    );
    if (targetScroll > 0) {
      this.listEl.scrollTop = targetScroll;
    }
    this.lastKnownScrollTop = targetScroll;
  }

  /**
   * 创建字段列表项
   */
  private createFieldItem(
    field: FrontmatterField,
    index: number,
    containerEl: HTMLElement
  ): FieldItem {
    const fieldItem = new FieldItem({
      field,
      index,
      isSelected: this.currentSelectedIndex === index,
      getDraggedIndex: () => this.draggedIndex,
      onSelect: (idx) => this.config.onSelect?.(idx),
      onDragStart: (idx) => this.handleDragStart(idx),
      onDragEnd: () => this.handleDragEnd(),
      onReorder: (from, target, isAfter) =>
        this.config.onReorder?.(from, target, isAfter),
    });
    fieldItem.render(containerEl);
    return fieldItem;
  }

  /**
   * 获取第一个已渲染的列表项
   */
  private getFirstRenderedItem(): FieldItem | null {
    const iterator = this.fieldItems.values().next();
    return iterator.done ? null : iterator.value;
  }
}
