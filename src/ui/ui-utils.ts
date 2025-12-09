import { handleError } from "@core/error";
import { runWithBusy } from "@utils/async-ui";
import { notifySuccess, notifyWarning } from "@utils/notify";

/**
 * UI 工具函数集合
 * 用于减少 Modal 类中的重复代码
 */

/**
 * 包装异步函数并提供统一的 UI 通知处理
 *
 * @example
 * ```ts
 * const result = await withUiNotice(
 *   async () => await presetManager.createPreset({ name: 'test' }),
 *   {
 *     success: (preset) => `已创建预设 "${preset.name}"`,
 *     fail: '创建预设失败'
 *   }
 * );
 * ```
 */
export async function withUiNotice<T>(
  asyncFn: () => Promise<T>,
  options: {
    success: string | ((result: T) => string);
    fail: string | ((error: Error) => string);
    onSuccess?: (result: T) => void;
    onFail?: (error: Error) => void;
  }
): Promise<T | null> {
  try {
    const result = await asyncFn();

    // 显示成功通知
    const successMessage =
      typeof options.success === "function"
        ? options.success(result)
        : options.success;
    notifySuccess(successMessage);

    // 执行成功回调
    options.onSuccess?.(result);

    return result;
  } catch (error) {
    const normalizedError = handleError(error, {
      context: "UI.withUiNotice",
      userMessage: (err) =>
        typeof options.fail === "function" ? options.fail(err) : options.fail,
    });

    options.onFail?.(normalizedError);

    return null;
  }
}

/**
 * 验证字段并保存，提供标准的错误处理流程
 *
 * @example
 * ```ts
 * const success = await validateAndSave(
 *   this.fields,
 *   [
 *     (field) => !field.key.trim() ? '键名不能为空' : null,
 *     (field) => !field.label.trim() ? '显示名称不能为空' : null
 *   ],
 *   async (validFields) => {
 *     await this.presetManager.updatePresetFields(this.preset.id, validFields);
 *   },
 *   {
 *     filterFn: (field) => field.key.trim() && field.label.trim(),
 *     successMessage: '字段配置已保存',
 *     onSuccess: () => this.close()
 *   }
 * );
 * ```
 */
export async function validateAndSave<T>(
  fields: T[],
  validators: Array<(field: T, index: number) => string | null>,
  saveFn: (validFields: T[]) => Promise<void>,
  options?: {
    filterFn?: (field: T) => boolean;
    successMessage?: string;
    onSuccess?: () => void;
    onFail?: (error: Error) => void;
  }
): Promise<boolean> {
  // 执行验证
  const errors: string[] = [];
  fields.forEach((field, index) => {
    validators.forEach((validator) => {
      const error = validator(field, index);
      if (error) {
        errors.push(error);
      }
    });
  });

  // 如果有验证错误，显示并返回
  if (errors.length > 0) {
    notifyWarning(`验证失败:\n${errors.join("\n")}`, { prefix: false });
    return false;
  }

  try {
    // 过滤字段（如果提供了过滤函数）
    const fieldsToSave = options?.filterFn
      ? fields.filter(options.filterFn)
      : fields;

    // 执行保存操作
    await saveFn(fieldsToSave);

    // 显示成功消息
    if (options?.successMessage) {
      notifySuccess(options.successMessage);
    }

    // 执行成功回调
    options?.onSuccess?.();

    return true;
  } catch (error) {
    const normalizedError = handleError(error, {
      context: "UI.validateAndSave",
      userMessage: "保存失败",
    });

    options?.onFail?.(normalizedError);

    return false;
  }
}

/**
 * 确认并执行删除操作
 *
 * @example
 * ```ts
 * const deleted = await confirmAndDelete(
 *   preset.id,
 *   preset.name,
 *   async (id) => await presetManager.deletePreset(id),
 *   {
 *     success: '预设已删除',
 *     fail: '删除预设失败',
 *     onSuccess: () => this.refreshPresetList()
 *   }
 * );
 * ```
 */
export async function confirmAndDelete(
  id: string,
  itemName: string,
  deleteFn: (id: string) => Promise<void>,
  options?: {
    success?: string;
    fail?: string;
    onSuccess?: () => void;
    onFail?: (error: Error) => void;
  }
): Promise<boolean> {
  try {
    await deleteFn(id);

    const successMessage = options?.success || `已删除 "${itemName}"`;
    notifySuccess(successMessage);

    options?.onSuccess?.();

    return true;
  } catch (error) {
    const normalizedError = handleError(error, {
      context: "UI.confirmAndDelete",
      userMessage: () => options?.fail || `删除 "${itemName}" 失败`,
    });

    options?.onFail?.(normalizedError);

    return false;
  }
}

/**
 * 统一的状态块渲染工具
 * 用于在设置页面和模态窗口中显示状态信息和操作按钮
 * 自动检测异步操作并应用 busy 状态管理
 *
 * @example
 * ```ts
 * // 基础用法：显示状态信息
 * renderStatusBlock(containerEl, {
 *   icon: '✅',
 *   title: '模板状态',
 *   items: [
 *     { label: '当前路径', content: '/Templates', type: 'code' },
 *     { label: '状态', content: '成功加载 10 个模板', type: 'status', color: 'var(--text-success)' }
 *   ]
 * });
 *
 * // 高级用法：带操作按钮
 * renderStatusBlock(containerEl, {
 *   icon: '⚠️',
 *   title: '加载失败',
 *   items: [
 *     { label: '', content: '模板文件夹不存在，请检查路径设置。', type: 'text' }
 *   ],
 *   actions: [
 *     {
 *       text: '重新扫描',
 *       onClick: async () => await templateManager.reloadTemplates(true),
 *       busyText: '扫描中…',
 *       cls: 'mod-cta'
 *     },
 *     {
 *       text: '打开设置',
 *       onClick: () => openSettings()
 *     }
 *   ]
 * });
 * ```
 */
export function renderStatusBlock(
  containerEl: HTMLElement,
  config: {
    icon: string;
    title: string;
    items: Array<{
      label: string;
      content: string;
      type?: "text" | "code" | "status";
      color?: string;
    }>;
    actions?: Array<{
      text: string;
      onClick: () => void | Promise<unknown>;
      cls?: string;
      /** 异步操作时显示的加载文本（可选） */
      busyText?: string;
    }>;
    /** 自定义容器 CSS 类名 */
    containerClass?: string;
  }
): HTMLElement {
  const statusEl = containerEl.createDiv(
    config.containerClass ||
      "note-architect-status-block setting-item-description"
  );

  // 标题区域
  const headerEl = statusEl.createDiv("note-architect-status-block__header");
  headerEl.createSpan({
    cls: "note-architect-status-block__icon",
    text: config.icon,
  });
  headerEl.createSpan({
    cls: "note-architect-status-block__title",
    text: config.title,
  });

  // 状态内容区域
  const itemsEl = statusEl.createDiv("note-architect-status-block__items");
  config.items.forEach((item) => {
    const itemEl = itemsEl.createDiv(
      [
        "note-architect-status-block__item",
        item.label ? "" : "note-architect-status-block__item--note",
      ]
        .join(" ")
        .trim()
    );

    if (item.label) {
      itemEl.createSpan({
        cls: "note-architect-status-block__item-label",
        text: item.label,
      });
    }

    const contentWrapper = itemEl.createDiv(
      "note-architect-status-block__item-content"
    );
    let contentElement: HTMLElement;
    switch (item.type) {
      case "code":
        contentElement = contentWrapper.createEl("code", {
          text: item.content,
        });
        break;
      case "status":
        contentElement = contentWrapper.createSpan({
          text: item.content,
          cls: "note-architect-status-block__status",
        });
        if (item.color) {
          contentElement.style.color = item.color;
        }
        break;
      default:
        contentElement = contentWrapper.createSpan({ text: item.content });
    }
    contentElement.classList.add("note-architect-status-block__value");
  });

  // 操作按钮区域
  if (config.actions && config.actions.length > 0) {
    const actionsEl = statusEl.createDiv("note-architect-actions");
    config.actions.forEach((action) => {
      const button = actionsEl.createEl("button", {
        text: action.text,
        cls: action.cls || "mod-cta",
        type: "button",
      });

      // 检测是否是异步操作（通过检查函数是否返回 Promise）
      const originalAction = action.onClick;
      button.addEventListener("click", async (event) => {
        const outcome = originalAction();
        if (outcome instanceof Promise) {
          event.preventDefault();
          await runWithBusy(button, () => outcome, {
            busyText: action.busyText ?? "处理中…",
            errorContext: "UI.renderStatusBlock",
          });
        }
      });
    });
  }

  return statusEl;
}

/**
 * 创建多选框复选框组件
 *
 * @param container 容器元素
 * @param option 选项值
 * @param isChecked 是否选中
 * @param onChange 变化回调
 * @param options 可选配置
 * @returns 返回创建的 checkbox 元素
 *
 * @example
 * ```ts
 * createMultiSelectCheckbox(
 *   containerEl,
 *   'option1',
 *   true,
 *   (checked) => console.log('Changed:', checked),
 *   { labelClass: 'note-architect-checkbox-label', enableIsCheckedStyle: true }
 * );
 * ```
 */
export function createMultiSelectCheckbox(
  container: HTMLElement,
  option: string,
  isChecked: boolean,
  onChange: (checked: boolean) => void,
  options?: {
    /** label 元素的 CSS 类名，默认为 'note-architect-form-label' */
    labelClass?: string;
    /** 是否启用 is-checked 样式类切换，默认为 false */
    enableIsCheckedStyle?: boolean;
    /** 是否将 label 与 checkbox 关联（设置 htmlFor），默认为 false */
    linkLabelToCheckbox?: boolean;
  }
): HTMLInputElement {
  const normalizedOption = option.trim();
  const optionContainer = container.createDiv(
    "note-architect-checkbox-container"
  );

  const checkbox = optionContainer.createEl("input", {
    type: "checkbox",
    value: normalizedOption,
    cls: "note-architect-form-checkbox",
  }) as HTMLInputElement;

  checkbox.checked = isChecked;

  // 初始化 is-checked 样式（如果启用）
  if (options?.enableIsCheckedStyle && isChecked) {
    optionContainer.toggleClass("is-checked", true);
  }

  // 绑定变化事件
  checkbox.addEventListener("change", () => {
    // 切换 is-checked 样式（如果启用）
    if (options?.enableIsCheckedStyle) {
      optionContainer.toggleClass("is-checked", checkbox.checked);
    }
    onChange(checkbox.checked);
  });

  // 创建标签
  const label = optionContainer.createEl("label", {
    text: normalizedOption,
    cls: options?.labelClass || "note-architect-form-label",
  });

  // 关联 label 和 checkbox（如果启用）
  if (options?.linkLabelToCheckbox) {
    label.htmlFor = `${checkbox.id}-${normalizedOption}`;
  }

  return checkbox;
}

/**
 * 渲染预设描述信息（ID 徽标 + 可选描述文本）
 * 生成一个 DocumentFragment，包含样式化的 ID 和描述文本
 *
 * @param preset 预设对象
 * @param options 可选配置
 * @returns DocumentFragment，包含 ID 徽标和可选的描述文本
 *
 * @example
 * ```ts
 * // 基础用法：仅渲染 ID
 * const fragment = renderPresetDescription(preset);
 * settingEl.setDesc(fragment);
 *
 * // 完整用法：渲染 ID + 描述文本
 * const fragment = renderPresetDescription(preset, {
 *   includeDescription: true,
 *   separator: ' ｜ '
 * });
 * ```
 */
export function renderPresetDescription(
  preset: { id: string; description?: string },
  options?: {
    /** 是否包含描述文本，默认 true */
    includeDescription?: boolean;
    /** ID 和描述之间的分隔符，默认 ' ｜ ' */
    separator?: string;
    /** ID 元素的 CSS 类名，默认 'note-architect-id-code' */
    idClass?: string;
    /** 分隔符元素的 CSS 类名，默认 'note-architect-desc-separator' */
    separatorClass?: string;
    /** 描述文本元素的 CSS 类名，默认 'note-architect-desc-text' */
    descClass?: string;
  }
): DocumentFragment {
  const {
    includeDescription = true,
    separator = " ｜ ",
    idClass = "note-architect-preset-id",
    separatorClass = "note-architect-desc-separator",
    descClass = "note-architect-desc-text",
  } = options ?? {};

  const fragment = document.createDocumentFragment();

  // 渲染 ID 徽标
  const idEl = document.createElement("span");
  idEl.textContent = preset.id;
  idEl.classList.add(idClass);
  fragment.append(idEl);

  // 渲染描述文本（如果存在且启用）
  if (includeDescription && preset.description) {
    const separatorEl = document.createElement("span");
    separatorEl.textContent = separator;
    separatorEl.classList.add(separatorClass);
    fragment.append(separatorEl);

    const descEl = document.createElement("span");
    descEl.textContent = preset.description;
    descEl.classList.add(descClass);
    fragment.append(descEl);
  }

  return fragment;
}

/**
 * 判断拖拽位置是否在目标元素下半部
 * 用于拖拽排序功能
 */
export function isDropAfter(event: DragEvent, targetEl: HTMLElement): boolean {
  const rect = targetEl.getBoundingClientRect();
  const offsetY = event.clientY - rect.top;
  return offsetY > rect.height / 2;
}
