import type { FrontmatterPreset, FrontmatterField } from "@types";
import { normalizeStringArray } from "@utils/data-transformer";

/**
 * 表单视图选项接口
 */
export interface FormViewOptions {
  containerEl: HTMLElement;
  preset: FrontmatterPreset;
  initialData: Record<string, unknown>;
  onFieldChange: (key: string, value: unknown) => void;
  onFieldBlur?: (key: string) => void;
  onMultiSelectChange?: (key: string) => void;
}

/**
 * FrontmatterFormView - 负责渲染和管理 frontmatter 表单字段
 *
 * 该类采用事件驱动模式：
 * - 不直接修改数据，而是通过回调通知外部
 * - 外部负责数据管理和验证
 * - 提供更新字段值和显示错误的方法
 */
export class FrontmatterFormView {
  private readonly options: FormViewOptions;
  private readonly multiSelectFieldRefs: Map<string, HTMLElement> = new Map();
  private readonly fieldContainerRefs: Map<string, HTMLElement> = new Map();
  private readonly fieldErrorRefs: Map<string, HTMLElement> = new Map();
  private readonly fieldInputRefs: Map<string, HTMLElement> = new Map();
  private touchedFieldKeys: Set<string> = new Set();
  private currentFieldErrors: Record<string, string[]> = {};
  private resolvedDefaults: Map<string, string | string[]> = new Map();
  private templaterDefaultsSkipped: Set<string> = new Set();
  private isLoading = false;

  /**
   * 构造函数
   * @param options 表单视图选项
   */
  constructor(options: FormViewOptions) {
    this.options = options;
  }

  /**
   * 设置解析后的默认值（用于 Templater 集成）
   * @param resolvedDefaults 解析后的默认值映射
   * @param templaterDefaultsSkipped 被跳过的 Templater 默认值
   */
  setResolvedDefaults(
    resolvedDefaults: Map<string, string | string[]>,
    templaterDefaultsSkipped: Set<string>
  ): void {
    this.resolvedDefaults = new Map(resolvedDefaults);
    this.templaterDefaultsSkipped = new Set(templaterDefaultsSkipped);
  }

  /**
   * 渲染表单
   */
  render(): void {
    const { containerEl, preset } = this.options;

    // 清空容器
    containerEl.empty();
    this.multiSelectFieldRefs.clear();
    this.fieldContainerRefs.clear();
    this.fieldErrorRefs.clear();
    this.fieldInputRefs.clear();
    this.touchedFieldKeys.clear();

    if (preset.fields.length === 0) {
      containerEl.createEl("p", {
        text: "当前预设没有可填写的字段。",
        cls: "setting-item-description",
      });
      return;
    }

    // 渲染每个字段
    preset.fields.forEach((field) => {
      this.renderField(field);
    });

    // 收集多选框数据
    setTimeout(() => {
      this.collectMultiSelectData();
    }, 0);
  }

  /**
   * 渲染单个字段
   * @param field 字段定义
   */
  private renderField(field: FrontmatterField): void {
    const { containerEl, initialData, onFieldChange } = this.options;
    const fieldContainer = containerEl.createDiv("note-architect-form-field");
    fieldContainer.setAttr("data-field-key", field.key);
    this.fieldContainerRefs.set(field.key, fieldContainer);

    // 字段标签
    fieldContainer.createEl("label", {
      text: `${field.label}:`,
      cls: "note-architect-form-label",
    });

    // 获取解析后的默认值
    const resolvedDefault = this.getResolvedDefault(field);
    const isTemplaterDefaultSkipped = this.templaterDefaultsSkipped.has(
      field.key
    );
    const isTemplaterAutofill =
      field.type === "date" && field.useTemplaterTimestamp === true;
    const allowedOptions = this.buildAllowedOptionsSet(field.options);

    // 初始化数据
    if (!(field.key in initialData)) {
      if (field.type === "multi-select") {
        initialData[field.key] = normalizeStringArray(
          resolvedDefault,
          allowedOptions
        );
      } else {
        initialData[field.key] =
          typeof resolvedDefault === "string" ? resolvedDefault : "";
      }
    }

    let inputEl: HTMLInputElement | HTMLSelectElement | undefined;

    // Templater 自动填充（只读预览）
    if (isTemplaterAutofill) {
      const previewValue = this.coerceToString(initialData[field.key]);
      const previewContainer = fieldContainer.createDiv(
        "note-architect-templater-preview"
      );
      previewContainer.createSpan({
        text: "AUTO",
        cls: "note-architect-badge",
      });
      previewContainer.createEl("code", {
        text: previewValue,
        cls: "note-architect-code-preview",
      });

      const hintText = previewValue.includes("<%")
        ? "Templater 未执行，将写入原始表达式。"
        : "已自动填入当前时间，保存时将写入以上格式。";
      fieldContainer.createEl("small", {
        cls: "setting-item-description",
        text: hintText,
      });

      if (isTemplaterDefaultSkipped) {
        fieldContainer.createEl("small", {
          cls: "setting-item-description",
          text: "检测到 Templater 表达式，此处不会预执行。",
        });
      }
    } else {
      // 根据字段类型创建输入控件
      switch (field.type) {
        case "text": {
          const input = fieldContainer.createEl("input", {
            type: "text",
            cls: "note-architect-input-base note-architect-form-input",
          }) as HTMLInputElement;
          inputEl = input;
          this.fieldInputRefs.set(field.key, input);
          input.value = this.coerceToString(initialData[field.key]);
          break;
        }

        case "date": {
          const input = fieldContainer.createEl("input", {
            type: "date",
            cls: "note-architect-input-base note-architect-form-input",
          }) as HTMLInputElement;
          inputEl = input;
          this.fieldInputRefs.set(field.key, input);
          input.value = this.coerceToString(initialData[field.key]);
          break;
        }

        case "select": {
          const selectEl = fieldContainer.createEl("select", {
            cls: "note-architect-input-base note-architect-form-select",
          }) as HTMLSelectElement;
          inputEl = selectEl;
          this.fieldInputRefs.set(field.key, selectEl);

          selectEl.createEl("option", {
            value: "",
            text: "请选择...",
          });

          if (field.options) {
            field.options.forEach((option) => {
              selectEl.createEl("option", {
                value: option,
                text: option,
              });
            });
          }

          const currentValue = this.coerceToString(initialData[field.key]);
          const matchingOption = Array.from(selectEl.options).find(
            (option) => option.value === currentValue
          );
          if (matchingOption) {
            selectEl.value = currentValue;
          }
          break;
        }

        case "multi-select": {
          const multiSelectContainer = fieldContainer.createDiv(
            "note-architect-multi-select-container"
          );
          this.multiSelectFieldRefs.set(field.key, multiSelectContainer);

          const currentSelection = normalizeStringArray(
            initialData[field.key] ?? resolvedDefault,
            allowedOptions
          );
          initialData[field.key] = currentSelection;

          if (field.options && field.options.length > 0) {
            field.options.forEach((option) => {
              const normalizedOption = option.trim();
              const optionContainer = multiSelectContainer.createDiv(
                "note-architect-checkbox-container"
              );

              const checkbox = optionContainer.createEl("input", {
                type: "checkbox",
                value: normalizedOption,
                cls: "note-architect-form-checkbox",
              }) as HTMLInputElement;

              checkbox.addEventListener("change", () => {
                optionContainer.toggleClass("is-checked", checkbox.checked);
                this.collectMultiSelectData();
                this.touchedFieldKeys.add(field.key);
                this.options.onMultiSelectChange?.(field.key);
              });

              if (currentSelection.includes(normalizedOption)) {
                checkbox.checked = true;
                optionContainer.toggleClass("is-checked", true);
              }

              optionContainer.createEl("label", {
                text: normalizedOption,
                cls: "note-architect-checkbox-label",
              });
            });
          } else {
            multiSelectContainer.createEl("small", {
              text: "暂无可用选项",
              cls: "setting-item-description",
            });
          }
          break;
        }

        default: {
          const input = fieldContainer.createEl("input", {
            type: "text",
            cls: "note-architect-input-base note-architect-form-input",
          }) as HTMLInputElement;
          inputEl = input;
          this.fieldInputRefs.set(field.key, input);
          input.value = this.coerceToString(initialData[field.key]);
          break;
        }
      }

      // 绑定事件监听器
      if (
        inputEl &&
        (field.type === "text" ||
          field.type === "date" ||
          field.type === "select")
      ) {
        if (field.type === "select") {
          inputEl.addEventListener("change", () => {
            const value = (inputEl as HTMLSelectElement).value;
            onFieldChange(field.key, value);
            this.touchedFieldKeys.add(field.key);
            this.options.onFieldBlur?.(field.key);
          });
        } else {
          inputEl.addEventListener("input", () => {
            const value = (inputEl as HTMLInputElement).value;
            onFieldChange(field.key, value);
          });

          inputEl.addEventListener("blur", () => {
            this.touchedFieldKeys.add(field.key);
            this.options.onFieldBlur?.(field.key);
          });
        }
      }
    }

    // Templater 跳过提示
    if (isTemplaterDefaultSkipped && !isTemplaterAutofill) {
      fieldContainer.createEl("small", {
        cls: "setting-item-description",
        text: "检测到 Templater 表达式，此处不会预执行。",
      });
    }

    // 错误提示元素
    const errorEl = fieldContainer.createDiv(
      "note-architect-form-error is-hidden"
    );
    errorEl.setAttr("role", "alert");
    this.fieldErrorRefs.set(field.key, errorEl);

    // 应用当前错误状态
    this.updateFieldErrorUI(field.key);
  }

  /**
   * 获取解析后的默认值
   * @param field 字段
   * @returns 解析后的默认值
   */
  private getResolvedDefault(field: FrontmatterField): string | string[] {
    const allowedOptions = this.buildAllowedOptionsSet(field.options);
    if (this.resolvedDefaults.has(field.key)) {
      const stored = this.resolvedDefaults.get(field.key);
      if (field.type === "multi-select") {
        return normalizeStringArray(stored, allowedOptions);
      }
      return this.coerceToString(stored);
    }

    if (field.type === "multi-select") {
      return normalizeStringArray(field.default, allowedOptions);
    }

    return this.coerceToString(field.default);
  }

  /**
   * 构建允许选项集合
   * @param options 选项列表
   * @returns 选项集合
   */
  private buildAllowedOptionsSet(options?: string[]): Set<string> | undefined {
    if (!Array.isArray(options)) {
      return undefined;
    }
    const normalized = options.map((option) => option.trim()).filter(Boolean);
    if (normalized.length === 0) {
      return undefined;
    }
    return new Set(normalized);
  }

  /**
   * 强制转换为字符串
   * @param value 要转换的值
   * @returns 字符串
   */
  private coerceToString(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }

    if (value === undefined || value === null) {
      return "";
    }

    return String(value);
  }

  /**
   * 收集多选框数据
   */
  private collectMultiSelectData(): void {
    for (const [fieldKey, container] of this.multiSelectFieldRefs.entries()) {
      const checkboxes = container.querySelectorAll(
        'input[type="checkbox"]'
      ) as NodeListOf<HTMLInputElement>;
      const selectedValues: string[] = [];

      checkboxes.forEach((checkbox) => {
        if (checkbox.checked && checkbox.value) {
          const value = checkbox.value.trim();
          if (value) {
            selectedValues.push(value);
          }
        }
      });

      // 通知外部数据已更新
      this.options.onFieldChange(fieldKey, selectedValues);
    }
  }

  /**
   * 显示或隐藏字段错误
   * @param fieldErrors 错误映射
   */
  displayErrors(fieldErrors: Record<string, string[]>): void {
    this.currentFieldErrors = fieldErrors;
    this.applyFieldErrors();
  }

  /**
   * 应用错误状态
   */
  private applyFieldErrors(): void {
    for (const fieldKey of this.fieldContainerRefs.keys()) {
      this.updateFieldErrorUI(fieldKey);
    }
  }

  /**
   * 更新单个字段的错误 UI 状态
   * @param fieldKey 字段键
   * @param options 显示选项
   */
  private updateFieldErrorUI(
    fieldKey: string,
    options?: { showAll?: boolean }
  ): void {
    const container = this.fieldContainerRefs.get(fieldKey);
    const errorEl = this.fieldErrorRefs.get(fieldKey);
    if (!container || !errorEl) {
      return;
    }

    const messages = this.currentFieldErrors[fieldKey] ?? [];
    const shouldShow =
      options?.showAll === true || this.touchedFieldKeys.has(fieldKey);
    const hasErrors = shouldShow && messages.length > 0;

    errorEl.setText(hasErrors ? messages.join(" ") : "");
    errorEl.toggleClass("is-hidden", !hasErrors);
    container.toggleClass("note-architect-form-field--error", hasErrors);

    const inputEl = this.fieldInputRefs.get(fieldKey);
    if (inputEl) {
      inputEl.toggleClass("note-architect-form-input--error", hasErrors);
    } else {
      const multiSelectContainer = this.multiSelectFieldRefs.get(fieldKey);
      multiSelectContainer?.toggleClass(
        "note-architect-multi-select-container--error",
        hasErrors
      );
    }
  }

  /**
   * 标记所有字段为已触摸状态
   */
  markAllFieldsTouched(): void {
    this.touchedFieldKeys = new Set(
      this.options.preset.fields.map((field) => field.key)
    );
  }

  /**
   * 设置加载状态
   * @param loading 是否加载中
   */
  setLoading(loading: boolean): void {
    this.isLoading = loading;
  }

  /**
   * 销毁表单视图
   */
  destroy(): void {
    // 清理引用
    this.multiSelectFieldRefs.clear();
    this.fieldContainerRefs.clear();
    this.fieldErrorRefs.clear();
    this.fieldInputRefs.clear();
    this.touchedFieldKeys.clear();
    this.resolvedDefaults.clear();
    this.templaterDefaultsSkipped.clear();
  }
}
