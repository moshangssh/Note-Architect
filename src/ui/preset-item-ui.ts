import { setIcon, TextComponent, ButtonComponent } from "obsidian";

import { notifyWarning } from "@utils/notify";
import type { FrontmatterPreset } from "@types";

export interface RenderPresetItemContext {
  listContainerEl: HTMLElement;
  itemEl: HTMLElement;
  nameInputComponent: TextComponent;
  configButtonComponent: ButtonComponent;
  deleteButtonComponent: ButtonComponent;
  infoEl: HTMLElement;
}

export interface RenderPresetItemCallbacks {
  onRename?: (
    preset: FrontmatterPreset,
    newName: string,
    context: RenderPresetItemContext
  ) => Promise<void> | void;
  onConfigure?: (
    preset: FrontmatterPreset,
    context: RenderPresetItemContext
  ) => Promise<void> | void;
  onDelete?: (
    preset: FrontmatterPreset,
    context: RenderPresetItemContext
  ) => Promise<void> | void;
}

export interface RenderPresetItemOptions {
  containerEl: HTMLElement;
  preset: FrontmatterPreset;
  callbacks?: RenderPresetItemCallbacks;
  disableNameEditing?: boolean;
  disableDelete?: boolean;
}

export interface RenderPresetListOptions {
  containerEl: HTMLElement;
  presets: FrontmatterPreset[];
  callbacks?: RenderPresetItemCallbacks;
  disableNameEditing?: boolean;
  disableDelete?: boolean;
  emptyStateMessage?: string;
}

const DEFAULT_EMPTY_STATE_MESSAGE = '暂无配置预设，点击"添加新预设"开始创建。';

export function renderPresetItemUI(
  options: RenderPresetItemOptions
): RenderPresetItemContext {
  const { containerEl, preset, callbacks } = options;
  const itemEl = containerEl.createDiv("note-architect-preset-item");

  // 左侧：名称与信息
  const contentContainer = itemEl.createDiv("note-architect-preset-content");

  // 使用 TextComponent 创建名称输入框
  const nameInputComponent = new TextComponent(contentContainer).setValue(
    preset.name
  );
  nameInputComponent.inputEl.addClass("note-architect-preset-name-input");

  // 信息区域
  const infoEl = contentContainer.createDiv("note-architect-preset-info");
  const fieldCountText =
    preset.fields.length === 1 ? "1 个字段" : `${preset.fields.length} 个字段`;
  infoEl.createEl("span", {
    text: fieldCountText,
    cls: "note-architect-preset-field-count",
  });
  infoEl.createEl("span", {
    text: "•",
    cls: "note-architect-preset-separator",
  });
  infoEl.createEl("span", {
    text: `ID: ${preset.id}`,
    cls: "note-architect-preset-id",
  });

  // 操作按钮容器
  const actionsContainer = itemEl.createDiv("note-architect-preset-actions");

  // 使用 ButtonComponent 创建配置按钮
  const configButtonComponent = new ButtonComponent(actionsContainer)
    .setClass("clickable-icon")
    .setClass("note-architect-preset-btn-config")
    .setTooltip("配置字段");
  setIcon(configButtonComponent.buttonEl, "settings");

  // 使用 ButtonComponent 创建删除按钮
  const deleteButtonComponent = new ButtonComponent(actionsContainer)
    .setClass("clickable-icon")
    .setClass("note-architect-preset-btn-delete")
    .setTooltip("删除");
  setIcon(deleteButtonComponent.buttonEl, "trash-2");

  const context: RenderPresetItemContext = {
    listContainerEl: containerEl,
    itemEl,
    nameInputComponent,
    configButtonComponent,
    deleteButtonComponent,
    infoEl,
  };

  // 处理输入框禁用状态
  const disableNameInput =
    options.disableNameEditing ?? callbacks?.onRename === undefined;
  if (disableNameInput) {
    nameInputComponent.setDisabled(true);
  }

  // 处理删除按钮禁用状态
  const disableDeleteButton =
    options.disableDelete ?? callbacks?.onDelete === undefined;
  if (disableDeleteButton) {
    deleteButtonComponent.setDisabled(true);
  }

  // 处理重命名逻辑
  if (callbacks?.onRename && !disableNameInput) {
    nameInputComponent.onChange(async (newName) => {
      const trimmedName = newName.trim();
      if (!trimmedName) {
        nameInputComponent.setValue(preset.name);
        notifyWarning("预设名称不能为空");
        return;
      }

      if (trimmedName === preset.name) {
        nameInputComponent.setValue(preset.name);
        return;
      }

      await callbacks.onRename?.(preset, trimmedName, context);
    });
  }

  // 处理配置按钮点击
  if (callbacks?.onConfigure) {
    configButtonComponent.onClick(async () => {
      try {
        await callbacks.onConfigure?.(preset, context);
      } catch (_error) {
        // 由上层回调负责处理错误反馈
      }
    });
  } else {
    configButtonComponent.setDisabled(true);
  }

  // 处理删除按钮点击
  if (callbacks?.onDelete && !disableDeleteButton) {
    deleteButtonComponent.onClick(async () => {
      try {
        await callbacks.onDelete?.(preset, context);
      } catch (_error) {
        // 由上层回调负责处理错误反馈
      }
    });
  }

  return context;
}

export function renderPresetListUI(options: RenderPresetListOptions): void {
  const {
    containerEl,
    presets,
    callbacks,
    disableNameEditing,
    disableDelete,
    emptyStateMessage = DEFAULT_EMPTY_STATE_MESSAGE,
  } = options;

  containerEl.empty();

  if (presets.length === 0) {
    const emptyEl = containerEl.createDiv("note-architect-empty-presets");
    emptyEl.createEl("p", {
      text: emptyStateMessage,
      cls: "setting-item-description",
    });
    return;
  }

  presets.forEach((preset) => {
    renderPresetItemUI({
      containerEl,
      preset,
      callbacks,
      disableNameEditing,
      disableDelete,
    });
  });
}
