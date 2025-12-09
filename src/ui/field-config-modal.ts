import { App, ButtonComponent, Modal } from "obsidian";
import { type FrontmatterField, type FrontmatterPreset } from "@types";
import { PresetManager } from "@presets";
import type { SettingsManager } from "@settings";
import { validateAndSave } from "./ui-utils";
import { notifyWarning } from "@utils/notify";
import { cloneFrontmatterField } from "@utils/frontmatter/field";
import { MasterListView } from "./field-config/master-list-view";
import { DetailPanelView } from "./field-config/detail-panel-view";
import { SimpleConfirmModal } from "./simple-confirm-modal";
import type { FieldValidationErrors } from "./field-config/validation";

interface FieldValidationResult {
  isValid: boolean;
  errors: string[];
  fieldErrors: Map<number, FieldValidationErrors>;
}

export class FieldConfigModal extends Modal {
  private readonly presetManager: PresetManager;
  private readonly settingsManager: SettingsManager;
  private preset: FrontmatterPreset;
  private fields: FrontmatterField[];
  private selectedFieldIndex: number | null;
  private readonly onPresetsChanged?: () => void;
  private masterListView?: MasterListView;
  private detailPanelView?: DetailPanelView;
  private layoutContainer?: HTMLElement;
  private narrowViewMediaQuery?: MediaQueryList;
  private mediaQueryListener?: (event: MediaQueryListEvent) => void;
  private wantsDetailView = false;
  private fieldValidationState: Map<number, FieldValidationErrors> = new Map();
  private touchedFieldFlags: boolean[] = [];

  constructor(
    app: App,
    presetManager: PresetManager,
    settingsManager: SettingsManager,
    preset: FrontmatterPreset,
    onPresetsChanged?: () => void
  ) {
    super(app);
    this.presetManager = presetManager;
    this.settingsManager = settingsManager;
    this.preset = preset;
    this.onPresetsChanged = onPresetsChanged;
    // 创建字段副本以避免直接修改原数据
    this.fields = preset.fields.map((field) => cloneFrontmatterField(field));
    this.selectedFieldIndex = this.fields.length > 0 ? 0 : null;
    this.touchedFieldFlags = new Array(this.fields.length).fill(false);
  }

  onOpen() {
    const { contentEl } = this;

    // 设置模态窗口大小
    this.modalEl.style.width = "90vw";
    this.modalEl.style.maxWidth = "960px";
    this.modalEl.style.height = "80vh";

    contentEl.empty();

    // 创建主从布局容器
    const layoutContainer = contentEl.createDiv(
      "note-architect-field-config-layout"
    );
    const splitContainer = layoutContainer.createDiv(
      "note-architect-field-config-layout__split"
    );
    const masterContainer = splitContainer.createDiv(
      "note-architect-field-config-layout__master"
    );
    const detailContainer = splitContainer.createDiv(
      "note-architect-field-config-layout__detail"
    );
    this.initializeResponsiveLayout(layoutContainer);

    // 初始化视图
    this.masterListView = new MasterListView({
      containerEl: masterContainer,
      onSelect: (index) => this.handleSelectField(index),
      onAddField: () => this.handleAddField(),
      onReorder: (fromIndex, targetIndex, isAfter) =>
        this.handleReorderField(fromIndex, targetIndex, isAfter),
    });
    this.detailPanelView = new DetailPanelView({
      containerEl: detailContainer,
      settingsManager: this.settingsManager,
      onFieldChange: (fieldIndex, updatedField) =>
        this.handleFieldChange(fieldIndex, updatedField),
      onDeleteField: (fieldIndex) => {
        void this.handleDeleteField(fieldIndex);
      },
      onNavigateBack: () => this.handleNavigateBack(),
    });

    this.updateUI();

    // 渲染底部操作区
    const actionsContainer = contentEl.createDiv(
      "note-architect-field-config-actions"
    );
    this.renderPrimaryActions(actionsContainer);
  }

  private updateUI(): void {
    this.syncSelectedIndex();
    const field =
      this.selectedFieldIndex === null
        ? null
        : this.fields[this.selectedFieldIndex] ?? null;
    this.masterListView?.render(this.fields, this.selectedFieldIndex);
    this.detailPanelView?.render(field, this.selectedFieldIndex);
    this.syncDetailPanelValidation();
    this.applyDetailViewState();
  }

  private syncSelectedIndex(): void {
    if (this.fields.length === 0) {
      this.selectedFieldIndex = null;
      return;
    }
    if (this.selectedFieldIndex === null) {
      return;
    }
    if (this.selectedFieldIndex > this.fields.length - 1) {
      this.selectedFieldIndex = this.fields.length - 1;
    }
  }

  private handleSelectField(index: number): void {
    if (index === this.selectedFieldIndex) {
      if (this.shouldUseStackedLayout()) {
        this.setDetailViewActive(true);
      }
      return;
    }

    const nextField = this.fields[index];
    if (!nextField) {
      return;
    }

    this.selectedFieldIndex = index;
    this.masterListView?.updateSelection(index);
    this.detailPanelView?.render(nextField, index);
    this.syncDetailPanelValidation();
    this.setDetailViewActive(true);
  }

  private handleAddField(): void {
    const newField = this.createEmptyField();
    this.fields = [...this.fields, newField];
    this.touchedFieldFlags = [...this.touchedFieldFlags, false];
    this.selectedFieldIndex = this.fields.length - 1;
    this.updateUI();
    this.deferUiTask(() => this.detailPanelView?.focusOnFirstInput());
    this.setDetailViewActive(true);
  }

  private handleReorderField(
    fromIndex: number,
    targetIndex: number,
    isAfter: boolean
  ): void {
    if (fromIndex === targetIndex && !isAfter) {
      return;
    }

    this.ensureTouchedStateSize();
    const workingFields = [...this.fields];
    const [movedField] = workingFields.splice(fromIndex, 1);
    if (!movedField) {
      return;
    }

    let insertIndex = targetIndex + (isAfter ? 1 : 0);
    if (insertIndex > workingFields.length) {
      insertIndex = workingFields.length;
    }
    if (fromIndex < insertIndex) {
      insertIndex -= 1;
    }

    if (insertIndex === fromIndex) {
      return;
    }

    workingFields.splice(insertIndex, 0, movedField);
    const touchedFlags = [...this.touchedFieldFlags];
    const [movedTouched] = touchedFlags.splice(fromIndex, 1);
    touchedFlags.splice(insertIndex, 0, movedTouched ?? false);

    const selectedFieldRef =
      this.selectedFieldIndex !== null
        ? this.fields[this.selectedFieldIndex]
        : null;

    this.fields = workingFields;
    this.touchedFieldFlags = touchedFlags;

    if (selectedFieldRef) {
      const nextIndex = this.fields.indexOf(selectedFieldRef);
      this.selectedFieldIndex = nextIndex === -1 ? null : nextIndex;
    }

    this.updateUI();

    const validation = this.validateFields();
    this.applyInlineValidation(validation);
  }

  private handleFieldChange(
    fieldIndex: number,
    updatedField: FrontmatterField
  ): void {
    if (fieldIndex < 0 || fieldIndex > this.fields.length - 1) {
      return;
    }
    const nextFields = [...this.fields];
    const clonedField = cloneFrontmatterField(updatedField);
    nextFields[fieldIndex] = clonedField;
    this.fields = nextFields;
    this.selectedFieldIndex = fieldIndex;
    this.masterListView?.updateItemSummary(fieldIndex, clonedField);
    this.detailPanelView?.updateActiveFieldSummary(clonedField, fieldIndex);
    this.markFieldTouched(fieldIndex);
    const validation = this.validateFields();
    this.applyInlineValidation(validation);
  }

  private async handleDeleteField(fieldIndex: number): Promise<void> {
    if (fieldIndex < 0 || fieldIndex > this.fields.length - 1) {
      return;
    }

    const field = this.fields[fieldIndex];
    const fieldLabel =
      field.label?.trim() || field.key?.trim() || `字段 ${fieldIndex + 1}`;
    const confirmModal = new SimpleConfirmModal(this.app, {
      title: "删除字段",
      message: `确定要删除 "${fieldLabel}" 吗？此操作无法撤销。`,
      confirmText: "删除字段",
      cancelText: "取消",
      confirmClass: "mod-warning",
    });

    const confirmed = await confirmModal.openAndWait();
    if (!confirmed) {
      return;
    }

    this.ensureTouchedStateSize();
    const nextFields = [...this.fields];
    nextFields.splice(fieldIndex, 1);
    this.fields = nextFields;
    this.touchedFieldFlags.splice(fieldIndex, 1);
    if (this.fields.length === 0) {
      this.selectedFieldIndex = null;
    } else {
      this.selectedFieldIndex = fieldIndex > 0 ? fieldIndex - 1 : 0;
    }
    this.updateUI();
    if (this.selectedFieldIndex === null) {
      this.setDetailViewActive(false);
    } else {
      this.applyDetailViewState();
    }
    this.deferUiTask(() =>
      this.masterListView?.focusList(this.selectedFieldIndex)
    );

    const validation = this.validateFields();
    this.applyInlineValidation(validation);
  }

  private handleNavigateBack(): void {
    this.setDetailViewActive(false);
    this.deferUiTask(() =>
      this.masterListView?.focusList(this.selectedFieldIndex)
    );
  }

  private createEmptyField(): FrontmatterField {
    return {
      key: "",
      label: "",
      type: "text",
      default: "",
      description: "",
      options: [],
    };
  }

  private renderPrimaryActions(containerEl: HTMLElement): void {
    containerEl.empty();

    new ButtonComponent(containerEl)
      .setButtonText("保存")
      .setCta()
      .setClass("note-architect-field-config-actions__btn")
      .onClick(() => this.saveAndClose());

    new ButtonComponent(containerEl)
      .setButtonText("取消")
      .setClass("note-architect-field-config-actions__btn")
      .onClick(() => this.close());
  }

  /**
   * 验证字段数据
   */
  private validateFields(): FieldValidationResult {
    const errors: string[] = [];
    const fieldErrors = new Map<number, FieldValidationErrors>();
    const keyUsage = new Map<string, number[]>();

    const ensureFieldEntry = (index: number): FieldValidationErrors => {
      let entry = fieldErrors.get(index);
      if (!entry) {
        entry = {};
        fieldErrors.set(index, entry);
      }
      return entry;
    };

    const appendFieldError = (
      index: number,
      type: keyof FieldValidationErrors,
      inlineMessage: string,
      summaryMessage: string
    ): void => {
      errors.push(summaryMessage);
      const entry = ensureFieldEntry(index);
      const bucket = entry[type] ?? [];
      bucket.push(inlineMessage);
      entry[type] = bucket;
    };

    this.fields.forEach((field, index) => {
      const fieldNum = index + 1;
      const trimmedKey = field.key?.trim() ?? "";
      const trimmedLabel = field.label?.trim() ?? "";

      if (trimmedKey) {
        const usage = keyUsage.get(trimmedKey) ?? [];
        usage.push(index);
        keyUsage.set(trimmedKey, usage);
      }

      if (!trimmedKey) {
        const summary = `字段 ${fieldNum}: Frontmatter 键名不能为空`;
        appendFieldError(index, "key", "Frontmatter 键名不能为空", summary);
      }
      if (!trimmedLabel) {
        const summary = `字段 ${fieldNum}: 显示名称不能为空`;
        appendFieldError(index, "label", "显示名称不能为空", summary);
      }

      const keyRegex = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
      if (trimmedKey && !keyRegex.test(trimmedKey)) {
        const summary = `字段 ${fieldNum}: Frontmatter 键名格式不正确，只能包含字母、数字、下划线和连字符，且必须以字母或下划线开头`;
        appendFieldError(
          index,
          "key",
          "键名格式不正确，只能包含字母、数字、下划线、连字符且需以字母或下划线开头",
          summary
        );
      }

      if (
        (field.type === "select" || field.type === "multi-select") &&
        (!field.options ||
          field.options.length === 0 ||
          field.options.every((opt) => !opt.trim()))
      ) {
        const summary = `字段 ${fieldNum}: ${
          field.type === "select" ? "单选" : "多选"
        }类型必须至少有一个选项`;
        appendFieldError(index, "options", "至少添加一个有效选项", summary);
      }
    });

    const duplicateSummaryKeys: string[] = [];
    keyUsage.forEach((indexes, key) => {
      if (indexes.length > 1) {
        for (let i = 1; i < indexes.length; i++) {
          duplicateSummaryKeys.push(key);
        }
        indexes.forEach((index) => {
          const entry = ensureFieldEntry(index);
          entry.key = [...(entry.key ?? []), "该键名与其他字段重复"];
        });
      }
    });
    if (duplicateSummaryKeys.length > 0) {
      errors.push(
        `发现重复的 Frontmatter 键名: ${duplicateSummaryKeys.join(", ")}`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      fieldErrors,
    };
  }

  private applyInlineValidation(
    result: FieldValidationResult,
    options?: { showAll?: boolean }
  ): void {
    this.fieldValidationState = result.fieldErrors;
    this.syncDetailPanelValidation(options);
  }

  private getErrorsForField(
    index: number | null,
    options?: { showAll?: boolean }
  ): FieldValidationErrors | null {
    if (index === null) {
      return null;
    }
    this.ensureTouchedStateSize();
    const shouldShow =
      options?.showAll === true || this.touchedFieldFlags[index];
    if (!shouldShow) {
      return null;
    }
    return this.fieldValidationState.get(index) ?? null;
  }

  private syncDetailPanelValidation(options?: { showAll?: boolean }): void {
    const errors = this.getErrorsForField(this.selectedFieldIndex, options);
    this.detailPanelView?.setValidationErrors(this.selectedFieldIndex, errors);
  }

  private markFieldTouched(index: number): void {
    if (index < 0 || index > this.fields.length - 1) {
      return;
    }
    this.ensureTouchedStateSize();
    this.touchedFieldFlags[index] = true;
  }

  private markAllFieldsTouched(): void {
    this.touchedFieldFlags = new Array(this.fields.length).fill(true);
  }

  private ensureTouchedStateSize(): void {
    if (this.touchedFieldFlags.length !== this.fields.length) {
      this.touchedFieldFlags = new Array(this.fields.length).fill(false);
    }
  }

  /**
   * 保存并关闭
   */
  private async saveAndClose(): Promise<void> {
    // 验证字段数据
    const validation = this.validateFields();
    if (!validation.isValid) {
      this.markAllFieldsTouched();
      this.applyInlineValidation(validation, { showAll: true });
      notifyWarning("验证失败，请根据字段下方的红色提示修正后再尝试保存。", {
        prefix: false,
      });
      return;
    }

    // 使用 validateAndSave 工具函数简化保存流程
    await validateAndSave(
      this.fields,
      [], // 验证已在 validateFields() 中完成
      async (filteredFields) => {
        const updatedPreset = await this.presetManager.updatePresetFields(
          this.preset.id,
          filteredFields
        );
        this.preset = updatedPreset;
        this.fields = updatedPreset.fields.map((field) =>
          cloneFrontmatterField(field)
        );
        this.touchedFieldFlags = new Array(this.fields.length).fill(false);
        this.fieldValidationState = new Map();
      },
      {
        filterFn: (field) => Boolean(field.key.trim() && field.label.trim()),
        successMessage: "字段配置已保存",
        onSuccess: () => {
          this.detailPanelView?.setValidationErrors(
            this.selectedFieldIndex,
            null
          );
          this.onPresetsChanged?.();
          this.close();
        },
      }
    );
  }

  onClose() {
    const { contentEl } = this;
    this.cleanupResponsiveLayout();
    this.masterListView?.destroy();
    this.detailPanelView?.destroy();
    this.masterListView = undefined;
    this.detailPanelView = undefined;
    this.layoutContainer = undefined;
    contentEl.empty();
  }

  private deferUiTask(task: () => void): void {
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      window.requestAnimationFrame(() => task());
      return;
    }
    task();
  }

  /**
   * 初始化窄视口监听，控制主从视图的切换
   */
  private initializeResponsiveLayout(layoutContainer: HTMLElement): void {
    this.layoutContainer = layoutContainer;
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    this.narrowViewMediaQuery = window.matchMedia("(max-width: 640px)");
    this.mediaQueryListener = () => {
      this.applyDetailViewState();
    };
    if (typeof this.narrowViewMediaQuery.addEventListener === "function") {
      this.narrowViewMediaQuery.addEventListener(
        "change",
        this.mediaQueryListener
      );
    } else if (typeof this.narrowViewMediaQuery.addListener === "function") {
      this.narrowViewMediaQuery.addListener(this.mediaQueryListener);
    }
    this.applyDetailViewState();
  }

  /**
   * 清理窄视口监听，避免模态关闭后泄漏
   */
  private cleanupResponsiveLayout(): void {
    if (this.narrowViewMediaQuery && this.mediaQueryListener) {
      if (typeof this.narrowViewMediaQuery.removeEventListener === "function") {
        this.narrowViewMediaQuery.removeEventListener(
          "change",
          this.mediaQueryListener
        );
      } else if (
        typeof this.narrowViewMediaQuery.removeListener === "function"
      ) {
        this.narrowViewMediaQuery.removeListener(this.mediaQueryListener);
      }
    }
    this.narrowViewMediaQuery = undefined;
    this.mediaQueryListener = undefined;
    this.wantsDetailView = false;
  }

  private shouldUseStackedLayout(): boolean {
    if (this.narrowViewMediaQuery) {
      return this.narrowViewMediaQuery.matches;
    }
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth <= 640;
  }

  private setDetailViewActive(shouldActivate: boolean): void {
    this.wantsDetailView = shouldActivate && this.selectedFieldIndex !== null;
    this.applyDetailViewState();
  }

  private applyDetailViewState(): void {
    if (!this.layoutContainer) {
      return;
    }
    if (this.selectedFieldIndex === null) {
      this.wantsDetailView = false;
    }
    const shouldShowDetail =
      this.wantsDetailView &&
      this.shouldUseStackedLayout() &&
      this.selectedFieldIndex !== null;
    this.layoutContainer.toggleClass("detail-view-active", shouldShowDetail);
  }
}
