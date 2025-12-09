import { App, Modal, MarkdownView } from "obsidian";
import type NoteArchitect from "@core/plugin";
import type { FrontmatterPreset, Template, FrontmatterField } from "@types";
import { DEFAULT_SETTINGS } from "@types";
import { handleError } from "@core/error";
import { notifyInfo, notifyWarning } from "@utils/notify";
import { normalizeStringArray } from "@utils/data-transformer";
import { convertFormDataToFrontmatter } from "@utils/frontmatter/convert";
import { getNoteMetadata } from "@utils/frontmatter-editor";
import { executeTemplateInsertion } from "@actions/insert-template";
import { executeUpdateFrontmatter } from "@actions/update-frontmatter";
import { createMergedPreset } from "./frontmatter/preset-field-merger";
import { FrontmatterFormView } from "./frontmatter/FrontmatterFormView";
import { FrontmatterFormState } from "./frontmatter/FrontmatterFormState";

interface FrontmatterManagerModalOptions {
  template?: Template;
  presets: FrontmatterPreset[];
  isUpdateMode?: boolean;
}

type FrontmatterUpdateMode = "merge" | "overwrite";

export class FrontmatterManagerModal extends Modal {
  static forTemplateInsertion(
    app: App,
    plugin: NoteArchitect,
    template: Template,
    presets: FrontmatterPreset[]
  ): FrontmatterManagerModal {
    return new FrontmatterManagerModal(app, plugin, { template, presets });
  }

  static forFrontmatterUpdate(
    app: App,
    plugin: NoteArchitect,
    options: { presets: FrontmatterPreset[] }
  ): FrontmatterManagerModal {
    return new FrontmatterManagerModal(app, plugin, {
      presets: options.presets,
      isUpdateMode: true,
    });
  }

  private buildTemplaterDateExpression(): string {
    const formatRaw =
      this.plugin.settings?.defaultDateFormat ??
      DEFAULT_SETTINGS.defaultDateFormat;
    const trimmed =
      typeof formatRaw === "string"
        ? formatRaw.trim()
        : DEFAULT_SETTINGS.defaultDateFormat;
    const format = (trimmed || DEFAULT_SETTINGS.defaultDateFormat)
      .replace(/\\\\\\\\/g, "\\\\\\\\")
      .replace(/\"/g, '\\\\"');

    return `<% tp.date.now(\"${format}\") %>`;
  }

  private readonly plugin: NoteArchitect;
  private readonly template?: Template;
  private readonly sourcePresets: FrontmatterPreset[];
  private mergedPreset: FrontmatterPreset;
  private readonly sourcePresetNames: string[];
  private readonly isUpdateMode: boolean;
  private frontmatterUpdateMode: FrontmatterUpdateMode;
  private formContainerEl?: HTMLElement;
  private confirmBtn?: HTMLButtonElement;
  private presetSwitcherEl?: HTMLSelectElement;
  private updateModeSelectEl?: HTMLSelectElement;
  private formView?: FrontmatterFormView;
  private formState?: FrontmatterFormState;
  private isResolving = true;

  constructor(
    app: App,
    plugin: NoteArchitect,
    options: FrontmatterManagerModalOptions
  ) {
    super(app);
    this.plugin = plugin;
    this.template = options.template;
    this.isUpdateMode = Boolean(options.isUpdateMode);
    this.sourcePresets = options.presets.length > 0 ? options.presets : [];
    if (this.sourcePresets.length === 0) {
      throw new Error("FrontmatterManagerModal 需要至少一个 frontmatter 预设");
    }
    if (!this.isUpdateMode && !this.template) {
      throw new Error("模板插入模式必须提供 template");
    }
    if (this.isUpdateMode) {
      // 在更新模式下，尝试加载上次使用的预设
      const lastUsedId = this.plugin.settings.lastUsedPresetForUpdate;
      const lastUsedPreset = lastUsedId
        ? this.sourcePresets.find((p) => p.id === lastUsedId)
        : undefined;

      if (lastUsedPreset) {
        this.mergedPreset = lastUsedPreset;
      } else {
        // 如果上次使用的预设不存在，默认选择第一个
        [this.mergedPreset] = this.sourcePresets;
      }
    } else {
      const { mergedPreset } = createMergedPreset(this.sourcePresets);
      this.mergedPreset = mergedPreset;
    }
    this.sourcePresetNames = this.sourcePresets.map((preset) => preset.name);
    this.frontmatterUpdateMode = this.determineInitialUpdateMode();
  }

  onOpen() {
    const { contentEl } = this;

    this.modalEl.style.width = "90vw";
    this.modalEl.style.maxWidth = "650px";
    this.modalEl.style.height = "auto";
    this.modalEl.style.maxHeight = "85vh";

    contentEl.createEl("h2", {
      text: this.getModalTitle(),
      cls: "note-architect-form-title",
    });

    const mainContainer = contentEl.createDiv(
      "note-architect-frontmatter-manager-container"
    );
    const descriptionContainer = mainContainer.createDiv(
      "note-architect-form-description"
    );
    descriptionContainer.createEl("p", {
      text: this.getDescriptionText(),
      cls: "note-architect-form-description-text",
    });
    this.renderUpdateContextControls(descriptionContainer);

    this.formContainerEl = mainContainer.createDiv(
      "note-architect-form-container"
    );

    const actionsContainer = mainContainer.createDiv(
      "note-architect-form-actions"
    );
    const cancelBtn = actionsContainer.createEl("button", {
      text: "取消",
      cls: "",
    });
    cancelBtn.onclick = () => this.handleCancel();

    this.confirmBtn = actionsContainer.createEl("button", {
      text: this.getConfirmButtonLabel(),
      cls: "mod-cta",
    });
    this.confirmBtn.disabled = true;
    this.confirmBtn.onclick = () => this.handleConfirm();

    // 初始化 FrontmatterFormState 和 FrontmatterFormView
    this.initializeFormComponents();

    this.showFormLoadingState("正在解析预设默认值…");
    this.resolveDefaultsAndRender();
  }

  /**
   * 初始化表单组件（状态管理和视图）
   */
  private initializeFormComponents(): void {
    // 初始化 FrontmatterFormState
    this.formState = new FrontmatterFormState(
      this.mergedPreset,
      this.plugin.presetManager
    );
    this.formState.initialize({});

    // 初始化 FrontmatterFormView
    // 预设变化时需要重新创建 FormView 实例
    if (!this.formView) {
      this.formView = new FrontmatterFormView({
        containerEl: this.formContainerEl!,
        preset: this.mergedPreset,
        initialData: {},
        onFieldChange: (key: string, value: unknown) => {
          // 通知状态管理器更新数据
          this.formState?.setFieldValue(key, value, true);
          // 同步更新视图中的错误显示
          const formView = this.formView;
          const formState = this.formState;
          if (formView && formState) {
            formView.displayErrors(formState.getErrors());
          }
        },
        onFieldBlur: (key: string) => {
          // 标记字段为已触摸
          this.formState?.setFieldTouched(key);
          // 同步更新视图中的错误显示
          const formView = this.formView;
          const formState = this.formState;
          if (formView && formState) {
            formView.displayErrors(formState.getErrors());
          }
        },
        onMultiSelectChange: (key: string) => {
          // 标记字段为已触摸
          this.formState?.setFieldTouched(key);
          // 同步更新视图中的错误显示
          const formView = this.formView;
          const formState = this.formState;
          if (formView && formState) {
            formView.displayErrors(formState.getErrors());
          }
        },
      });
    }
  }

  private getModalTitle(): string {
    if (this.isUpdateMode) {
      return "更新当前笔记的 Frontmatter";
    }
    return `配置模板: ${this.template?.name ?? "未命名模板"}`;
  }

  private getDescriptionText(): string {
    if (this.isUpdateMode) {
      if (this.sourcePresets.length === 1) {
        // 单预设模式：简化描述，预设名称将在控件区域显示
        return "填写以下字段以更新 Frontmatter：";
      }
      return "请选择要应用的预设，并填写以下字段：";
    }
    if (this.sourcePresetNames.length > 1) {
      return `此模板引用了多个预设（${this.sourcePresetNames.join(
        "、"
      )}），请填写以下字段：`;
    }
    return `此模板引用了预设 "${this.mergedPreset.name}"，请填写以下字段：`;
  }

  private getConfirmButtonLabel(): string {
    return this.isUpdateMode ? "确认更新" : "确认插入";
  }

  private renderUpdateContextControls(container: HTMLElement): void {
    if (!this.isUpdateMode) {
      return;
    }

    if (this.sourcePresets.length > 1) {
      const presetRow = container.createDiv();
      presetRow.createEl("label", {
        text: "选择预设",
        cls: "note-architect-form-label",
      });
      const selectEl = presetRow.createEl("select", {
        cls: "note-architect-input-base note-architect-form-select",
      }) as HTMLSelectElement;
      this.sourcePresets.forEach((preset) => {
        selectEl.createEl("option", {
          value: preset.id,
          text: preset.name,
        });
      });
      selectEl.value = this.mergedPreset.id;
      selectEl.onchange = () =>
        this.handlePresetSelectionChange(selectEl.value);
      this.presetSwitcherEl = selectEl;
    } else {
      // 单预设模式：显示紧凑的预设名称徽章
      const presetInfoRow = container.createDiv({
        cls: "note-architect-preset-info-row",
      });
      presetInfoRow.createEl("span", {
        text: "当前预设：",
        cls: "note-architect-form-label-inline",
      });
      presetInfoRow.createEl("span", {
        text: this.mergedPreset.name,
        cls: "note-architect-preset-badge",
      });
    }

    const modeRow = container.createDiv();
    modeRow.createEl("label", {
      text: "应用模式",
      cls: "note-architect-form-label",
    });
    const modeSelect = modeRow.createEl("select", {
      cls: "note-architect-input-base note-architect-form-select",
    }) as HTMLSelectElement;
    modeSelect.createEl("option", {
      value: "merge",
      text: "合并（保留未覆盖字段）",
    });
    modeSelect.createEl("option", {
      value: "overwrite",
      text: "覆盖（仅保留以下字段）",
    });
    modeSelect.value = this.frontmatterUpdateMode;
    modeSelect.onchange = () => {
      this.frontmatterUpdateMode = modeSelect.value as FrontmatterUpdateMode;
    };
    modeRow.createEl("small", {
      cls: "setting-item-description",
      text: "合并将保留笔记中未被表单覆盖的字段；覆盖将仅保留当前表单字段。",
    });
    this.updateModeSelectEl = modeSelect;
  }

  private showFormLoadingState(message: string): void {
    const container = this.formContainerEl;
    if (!container) {
      return;
    }
    container.empty();
    container.createEl("p", {
      text: message,
      cls: "setting-item-description",
    });
  }

  private resolveDefaultsAndRender(): void {
    this.parseTemplaterDefaults()
      .then(
        ([resolvedDefaults, templaterDefaultsSkipped]: [
          Map<string, string | string[]>,
          Set<string>
        ]) => {
          // 将解析结果设置到状态管理器
          if (this.formState) {
            this.formState.setResolvedDefaults(
              resolvedDefaults,
              templaterDefaultsSkipped
            );
          }

          // 同时设置到视图（用于预览）
          if (this.formView) {
            this.formView.setResolvedDefaults(
              resolvedDefaults,
              templaterDefaultsSkipped
            );
          }

          this.isResolving = false;
          this.renderFormFields(this.formContainerEl);
          if (this.confirmBtn) {
            this.confirmBtn.disabled = false;
          }
        }
      )
      .catch((error: unknown) => {
        handleError(error as Error, {
          context: "FrontmatterManagerModal.parseTemplaterDefaults",
        });
        notifyWarning("部分默认值解析失败，已使用原始字段默认值。");
        this.isResolving = false;
        this.renderFormFields(this.formContainerEl);
        if (this.confirmBtn) {
          this.confirmBtn.disabled = false;
        }
      });
  }

  private handlePresetSelectionChange(nextPresetId: string): void {
    if (!this.isUpdateMode) {
      return;
    }
    const nextPreset = this.sourcePresets.find(
      (preset) => preset.id === nextPresetId
    );
    if (!nextPreset || nextPreset.id === this.mergedPreset.id) {
      return;
    }
    this.mergedPreset = nextPreset;
    this.resetFormStateForPreset();
    // 强制重新创建表单视图以加载新预设的配置
    this.formView = new FrontmatterFormView({
      containerEl: this.formContainerEl!,
      preset: this.mergedPreset,
      initialData: {},
      onFieldChange: (key, value) => {
        this.formState?.setFieldValue(key, value, true);
        if (this.formView && this.formState) {
          this.formView.displayErrors(this.formState.getErrors());
        }
      },
      onFieldBlur: (key) => {
        this.formState?.setFieldTouched(key);
        if (this.formView && this.formState) {
          this.formView.displayErrors(this.formState.getErrors());
        }
      },
      onMultiSelectChange: (key) => {
        this.formState?.setFieldTouched(key);
        if (this.formView && this.formState) {
          this.formView.displayErrors(this.formState.getErrors());
        }
      },
    });
    if (this.confirmBtn) {
      this.confirmBtn.disabled = true;
    }
    this.showFormLoadingState("正在切换预设…");
    this.resolveDefaultsAndRender();
  }

  /**
   * 重置表单状态
   */
  private resetFormStateForPreset(): void {
    if (this.formState) {
      this.formState.switchPreset(this.mergedPreset);
    }
    this.isResolving = true;
  }

  private determineInitialUpdateMode(): FrontmatterUpdateMode {
    if (!this.isUpdateMode) {
      return "merge";
    }
    const metadata = getNoteMetadata(this.app);
    const hasFrontmatter = Object.keys(metadata.frontmatter ?? {}).length > 0;
    return hasFrontmatter ? "merge" : "overwrite";
  }

  /**
   * 渲染表单字段
   */
  private renderFormFields(containerEl?: HTMLElement): void {
    const target = containerEl ?? this.formContainerEl;
    if (!target) {
      return;
    }

    // 更新 FormView 的预设（如果需要）
    if (this.formView) {
      // 渲染表单视图
      this.formView.render();

      // 同步当前错误状态到视图
      if (this.formState) {
        this.formView.displayErrors(this.formState.getErrors());
      }
    }
  }

  private markAllFieldsTouched(): void {
    if (this.formState) {
      this.formState.markAllFieldsTouched();
    }
    this.formView?.markAllFieldsTouched();
  }

  /**
   * 收集默认值，执行 Templater 表达式解析
   */
  private async parseTemplaterDefaults(): Promise<
    [Map<string, string | string[]>, Set<string>]
  > {
    const templaterDefaultsSkipped = new Set<string>();
    const resolvedDefaults = new Map<string, string | string[]>();
    const activePreset = this.mergedPreset;

    const shouldParseTemplater =
      this.plugin.settings.enableTemplaterIntegration;
    let templaterInitFailed = false;
    let templater: {
      isAvailable(): boolean;
      processTemplate: (template: Template) => Promise<string>;
      processString: (content: string) => Promise<string>;
    } | null = null;

    const ensureTemplater = async () => {
      if (templater || templaterInitFailed) {
        return templater;
      }

      try {
        const { ObsidianTemplaterAdapter } = await import(
          "@engine/ObsidianTemplaterAdapter"
        );
        templater = new ObsidianTemplaterAdapter(this.app);
        return templater;
      } catch (error: unknown) {
        console.warn("Note Architect: 初始化 Templater 适配器失败", error);
        templaterInitFailed = true;
        return null;
      }
    };

    for (const field of activePreset.fields) {
      const allowedOptions = this.buildAllowedOptionsSet(field.options);
      if (field.type === "multi-select") {
        const normalized = normalizeStringArray(field.default, allowedOptions);
        resolvedDefaults.set(field.key, normalized);
        continue;
      }

      const defaultValue = field.useTemplaterTimestamp
        ? this.buildTemplaterDateExpression()
        : this.coerceToString(field.default);

      // 默认值不包含 Templater 表达式，直接存储
      if (!defaultValue.includes("<%")) {
        resolvedDefaults.set(field.key, defaultValue);
        continue;
      }

      // 包含 Templater 表达式，但未启用解析或缺少上下文时，记为跳过
      if (!shouldParseTemplater) {
        templaterDefaultsSkipped.add(field.key);
        resolvedDefaults.set(field.key, defaultValue);
        continue;
      }

      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        console.warn(
          `Note Architect: 无活动文件，跳过字段 ${field.key} 的 Templater 默认值解析`
        );
        templaterDefaultsSkipped.add(field.key);
        resolvedDefaults.set(field.key, defaultValue);
        continue;
      }

      try {
        const adapter = await ensureTemplater();
        if (adapter?.isAvailable()) {
          const resolvedValue = await adapter.processString(defaultValue);
          resolvedDefaults.set(field.key, resolvedValue);
        } else {
          templaterDefaultsSkipped.add(field.key);
          resolvedDefaults.set(field.key, defaultValue);
        }
      } catch (error: unknown) {
        console.warn(
          `Note Architect: 解析字段 ${field.key} 的 Templater 表达式失败`,
          error
        );
        templaterDefaultsSkipped.add(field.key);
        resolvedDefaults.set(field.key, defaultValue);
      }
    }

    return [resolvedDefaults, templaterDefaultsSkipped];
  }

  /**
   * 构建允许选项集合（用于默认值解析）
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
   * 强制转换为字符串（用于默认值解析）
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
   * 处理取消按钮点击事件
   */
  private handleCancel(): void {
    this.close();
  }

  private notifyValidationFailure(errors: string[]): void {
    const header = "表单验证失败，请根据字段下方的提示修正。";
    if (errors.length === 0) {
      notifyWarning(header, { prefix: false });
      return;
    }
    notifyWarning(`${header}\n${errors.join("\n")}`, { prefix: false });
  }

  private async handleConfirm(): Promise<void> {
    if (!this.formState) {
      throw new Error("表单状态管理器未初始化");
    }

    // 使用状态管理器进行验证
    const validation = this.formState.validate();

    if (!validation.isValid) {
      this.markAllFieldsTouched();
      this.formView?.displayErrors(validation.fieldErrors);
      this.notifyValidationFailure(validation.errors);
      return;
    }

    // 获取表单数据并转换
    const formData = this.formState.getData();
    const resolvedDefaults = this.formState.getResolvedDefaults();
    const userFrontmatter = convertFormDataToFrontmatter(
      this.mergedPreset,
      formData,
      resolvedDefaults
    );

    try {
      if (this.isUpdateMode) {
        await this.handleUpdateFrontmatter(userFrontmatter);
      } else {
        await this.handleInsertTemplate(userFrontmatter);
      }
    } catch (error) {
      // 错误处理已在 handleInsertTemplate 和 handleUpdateFrontmatter 中完成
      throw error;
    }
  }

  private async handleInsertTemplate(
    userFrontmatter: Record<string, unknown>
  ): Promise<void> {
    const template = this.template;
    if (!template) {
      throw new Error("未找到可用模板，无法执行插入操作");
    }

    try {
      await executeTemplateInsertion(
        this.app,
        this.plugin,
        template,
        this.mergedPreset,
        userFrontmatter
      );
      this.close();
    } catch (error) {
      const normalizedError = handleError(error, {
        context: "FrontmatterManagerModal.handleConfirm",
        userMessage: "插入模板失败，请稍后重试。",
      });

      const message = normalizedError.message || "";
      if (message.includes("编辑器")) {
        notifyInfo("提示：请确保在 Markdown 文件中使用此功能");
      } else if (message.includes("Templater")) {
        notifyInfo("提示：可以尝试禁用 Templater 集成后重试");
      }
      throw error;
    }
  }

  private async handleUpdateFrontmatter(
    userFrontmatter: Record<string, unknown>
  ): Promise<void> {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView || !activeView.editor) {
      throw new Error("无法获取当前编辑器，请确保在 Markdown 文件中使用此功能");
    }

    try {
      await executeUpdateFrontmatter(
        this.app,
        activeView.editor,
        this.mergedPreset,
        userFrontmatter,
        this.frontmatterUpdateMode
      );
      // 成功更新后，保存最后使用的预设ID
      await this.plugin.setLastUsedPresetForUpdate(this.mergedPreset.id);
      this.close();
    } catch (error) {
      const normalizedError = handleError(error, {
        context: "FrontmatterManagerModal.handleUpdateFrontmatter",
        userMessage: "更新 Frontmatter 失败，请稍后重试。",
      });

      const message = normalizedError.message || "";
      if (message.includes("编辑器")) {
        notifyInfo("提示：请确保打开一个 Markdown 笔记后再执行此命令");
      }
      throw error;
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();

    // 清理 FormView
    if (this.formView) {
      this.formView.destroy();
      this.formView = undefined;
    }

    // 清理 FormState
    this.formState = undefined;
  }
}
