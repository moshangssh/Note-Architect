import { App, Modal, Setting, TextComponent, ButtonComponent } from "obsidian";
import { PresetManager } from "@presets";
import { withUiNotice } from "./ui-utils";
import { notifyError } from "@utils/notify";
export class CreatePresetModal extends Modal {
  private readonly presetManager: PresetManager;
  private nameInputComponent: TextComponent | null = null;
  private validationMessage: HTMLElement | null = null;
  private submitButtonComponent: ButtonComponent | null = null;
  private readonly onPresetsChanged?: () => void;

  constructor(
    app: App,
    presetManager: PresetManager,
    onPresetsChanged?: () => void
  ) {
    super(app);
    this.presetManager = presetManager;
    this.onPresetsChanged = onPresetsChanged;
  }

  onOpen() {
    const { contentEl } = this;

    // 设置模态窗口大小
    this.modalEl.style.width = "60vw";
    this.modalEl.style.maxWidth = "500px";
    this.modalEl.style.height = "auto";

    // 创建标题
    contentEl.createEl("h2", { text: "创建新的预设配置" });

    // 创建说明文字
    const descEl = contentEl.createDiv("setting-item-description");
    descEl.createEl("small", {
      text: "预设配置用于管理模板中引用的 Frontmatter 字段。每个配置包含一组可重用的字段定义。",
    });

    // 使用 Setting 类构建表单
    new Setting(contentEl)
      .setName("预设名称")
      .setDesc("用于在设置界面中显示的友好名称，系统会基于此自动生成引用ID")
      .addText((text) => {
        this.nameInputComponent = text
          .setPlaceholder("例如: 项目模板配置")
          .onChange(this.handleInputChange);
        // 聚焦到输入框
        setTimeout(() => text.inputEl.focus(), 100);
      });

    // 验证消息容器
    this.validationMessage = contentEl.createDiv(
      "note-architect-validation-message"
    );

    // 操作按钮容器
    const actionsContainer = contentEl.createDiv("note-architect-form-actions");

    // 取消按钮
    new ButtonComponent(actionsContainer)
      .setButtonText("❌ 取消")
      .onClick(() => this.close());

    // 按钮分隔
    actionsContainer.createEl("span", { text: " | " });

    // 创建按钮
    this.submitButtonComponent = new ButtonComponent(actionsContainer)
      .setButtonText("✅ 创建预设")
      .setCta()
      .setDisabled(true)
      .onClick(() => this.handleCreate());
  }

  /**
   * 处理输入变化事件
   */
  private handleInputChange = (value: string) => {
    const nameValue = value.trim();

    if (!nameValue) {
      this.updateValidationMessage("", null);
      this.submitButtonComponent?.setDisabled(true);
      return;
    }

    const generatedId = this.presetManager.generateUniquePresetId(nameValue);

    // 更新验证消息
    this.updateValidationMessage(nameValue, generatedId);

    // 启用创建按钮
    this.submitButtonComponent?.setDisabled(false);
  };

  /**
   * 更新验证消息显示
   */
  private updateValidationMessage(
    nameValue: string,
    generatedId: string | null
  ) {
    if (!this.validationMessage) return;

    this.validationMessage.empty();

    // 检查名称
    if (!nameValue) {
      this.validationMessage.createEl("p", {
        text: "⚠️ 预设名称不能为空",
        cls: "note-architect-validation-error",
      });
      return;
    }

    const message = this.validationMessage.createEl("p", {
      cls: "note-architect-validation-success",
    });

    message.appendText("✅ 将自动生成引用ID：");

    if (generatedId) {
      message.createEl("code", { text: generatedId });
    } else {
      message.appendText("生成失败");
    }
  }

  /**
   * 处理创建预设
   */
  private async handleCreate(): Promise<void> {
    const nameValue = this.nameInputComponent?.getValue()?.trim() ?? "";

    if (!nameValue) {
      notifyError("请修正输入错误后再创建预设");
      return;
    }

    // 使用 withUiNotice 工具函数简化创建流程
    await withUiNotice(
      async () => await this.presetManager.createPreset({ name: nameValue }),
      {
        success: (newPreset) =>
          `✅ 已创建预设 \"${nameValue}\" (ID: ${newPreset.id})`,
        fail: "❌ 创建预设失败",
        onSuccess: () => {
          this.close();
          this.onPresetsChanged?.();
        },
      }
    );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
