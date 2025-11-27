import { App, PluginSettingTab, Setting } from "obsidian";
import type NoteArchitect from "@core/plugin";
import { SettingsManager } from "@settings";
import { PresetManager } from "@presets";
import { ObsidianTemplaterAdapter } from "@engine";
import { DEFAULT_SETTINGS, type NoteArchitectSettings } from "@types";
import { renderStatusBlock } from "./ui-utils";
import { withBusy } from "@utils/async-ui";
import { PresetManagerComponent } from "./preset-manager-component";
import { notifyInfo, notifySuccess, notifyWarning } from "@utils/notify";

export class NoteArchitectSettingTab extends PluginSettingTab {
  plugin: NoteArchitect;
  private readonly settingsManager: SettingsManager;
  private readonly presetManager: PresetManager;
  private presetManagerComponent: PresetManagerComponent | null = null;

  constructor(
    app: App,
    plugin: NoteArchitect,
    settingsManager: SettingsManager,
    presetManager: PresetManager
  ) {
    super(app, plugin);
    this.plugin = plugin;
    this.settingsManager = settingsManager;
    this.presetManager = presetManager;
  }

  private get settings(): NoteArchitectSettings {
    return this.settingsManager.getSettings();
  }

  private async persistSettings(
    settings: NoteArchitectSettings = this.settingsManager.getSettings()
  ): Promise<void> {
    this.plugin.settings = await this.settingsManager.save(settings, {
      onAfterSave: this.plugin.updateStatusBar,
      reloadTemplates: () => this.plugin.templateManager.loadTemplates(),
    });
  }

  private async updateSettings(
    mutator: (draft: NoteArchitectSettings) => void
  ): Promise<void> {
    const draft = this.settingsManager.getSettings();
    mutator(draft);
    await this.persistSettings(draft);
  }

  /**
   * 计算 Templater 状态信息
   */
  private getTemplaterStatusInfo(): {
    icon: string;
    text: string;
    color: string;
    details: string[];
  } {
    const templater = new ObsidianTemplaterAdapter(this.app);
    const isTemplaterInstalled = templater.isAvailable();
    const isIntegrationEnabled = this.settings.enableTemplaterIntegration;

    let statusIcon = "";
    let statusText = "Templater 未安装";
    let statusColor = "var(--text-muted)";
    const details: string[] = [];

    if (isIntegrationEnabled && isTemplaterInstalled) {
      statusIcon = "";
      statusText = "Templater 集成已启用";
      statusColor = "var(--text-success)";
      details.push("模板中的 Templater 语法将自动执行");
    } else if (isIntegrationEnabled && !isTemplaterInstalled) {
      statusIcon = "";
      statusText = "Templater 集成已启用,但未检测到 Templater 插件";
      statusColor = "var(--text-warning)";
      details.push("请先在社区插件中安装 Templater 插件");
    } else if (!isIntegrationEnabled && isTemplaterInstalled) {
      statusIcon = "";
      statusText = "Templater 已安装,但集成未启用";
      statusColor = "var(--text-muted)";
    } else {
      details.push("请先在社区插件中安装 Templater 插件");
    }

    return { icon: statusIcon, text: statusText, color: statusColor, details };
  }

  /**
   * 计算模板状态信息
   */
  private getTemplateStatusInfo(): {
    icon: string;
    text: string;
    color: string;
    folderPath: string;
    showReloadButton: boolean;
  } {
    const status = this.plugin.templateManager.getTemplateLoadStatus();
    const folderPath = this.settings.templateFolderPath || "未设置";

    let statusIcon = "";
    let statusText = "未知状态";
    let statusColor = "var(--text-muted)";
    let showReloadButton = true;

    switch (status.status) {
      case "loading":
        statusIcon = "";
        statusText = "加载中...";
        statusColor = "var(--text-accent)";
        showReloadButton = false;
        break;
      case "success":
        statusIcon = "";
        statusText = `成功加载 ${status.count} 个模板`;
        statusColor = "var(--text-success)";
        break;
      case "empty":
        statusIcon = "";
        statusText = "文件夹为空或未找到模板";
        statusColor = "var(--text-muted)";
        break;
      case "error":
        statusIcon = "";
        statusText = status.message || "加载失败";
        statusColor = "var(--text-error)";
        break;
      case "idle":
        statusIcon = "";
        statusText = "未加载";
        statusColor = "var(--text-muted)";
        break;
    }

    return {
      icon: statusIcon,
      text: statusText,
      color: statusColor,
      folderPath,
      showReloadButton,
    };
  }

  /**
   * 渲染 Templater 状态显示元素
   */
  private renderTemplaterStatus(containerEl: HTMLElement): HTMLElement {
    const statusInfo = this.getTemplaterStatusInfo();

    return renderStatusBlock(containerEl, {
      icon: "",
      title: "Templater 状态",
      items: [
        {
          label: "状态",
          content: `${statusInfo.icon} ${statusInfo.text}`,
          type: "status",
          color: statusInfo.color,
        },
        ...statusInfo.details.map((detail) => ({
          label: "",
          content: detail,
          type: "text" as const,
        })),
      ],
    });
  }

  /**
   * 渲染模板状态显示元素
   */
  private renderTemplateStatus(containerEl: HTMLElement): HTMLElement {
    const statusInfo = this.getTemplateStatusInfo();

    // 使用统一的状态块渲染函数
    const statusEl = renderStatusBlock(containerEl, {
      icon: "",
      title: "模板状态",
      items: [
        {
          label: "当前路径",
          content: statusInfo.folderPath,
          type: "code",
        },
        {
          label: "状态",
          content: `${statusInfo.icon} ${statusInfo.text}`,
          type: "status",
          color: statusInfo.color,
        },
      ],
      actions: statusInfo.showReloadButton
        ? [
            {
              text: "重新扫描模板",
              onClick: async () => {
                await this.plugin.templateManager.reloadTemplates(true);
                // 重新渲染状态显示
                const parentEl = statusEl.parentElement;
                if (parentEl) {
                  const newStatusEl = this.renderTemplateStatus(parentEl);
                  statusEl.replaceWith(newStatusEl);
                }
              },
              busyText: "扫描中…",
              cls: "mod-cta",
            },
          ]
        : undefined,
    });

    return statusEl;
  }

  /**
   * 渲染路径验证提示元素
   */
  private renderPathValidationHints(containerEl: HTMLElement): HTMLElement {
    const hintEl = containerEl.createEl("div", {
      cls: "setting-item-description",
    });
    const contentEl = hintEl.createEl("small");

    contentEl.createEl("strong", { text: "提示：" });
    contentEl.createEl("br");

    const hints = [
      "路径相对于库根目录",
      '支持多级路径,如 "Templates/Projects"',
      "使用验证按钮检查路径是否包含模板文件",
      "只有 .md 文件会被识别为模板",
    ];

    hints.forEach((hint) => {
      contentEl.createEl("span", { text: `• ${hint}` });
      contentEl.createEl("br");
    });

    return hintEl;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    this.renderHeaderSection(containerEl);
    this.renderTemplateFolderSetting(containerEl);
    this.renderTemplaterIntegrationSection(containerEl);
    this.renderDefaultDateFormatSetting(containerEl);
    this.renderNoPresetBehaviorSetting(containerEl);
    this.renderTemplateStatusSection(containerEl);
    this.renderPathValidationHints(containerEl);

    containerEl.createEl("hr", { cls: "setting-item-hr" });

    // 清理旧的预设管理组件实例
    if (this.presetManagerComponent) {
      this.presetManagerComponent.destroy();
      this.presetManagerComponent = null;
    }

    // 创建新的预设管理组件实例
    const presetManagerContainer = containerEl.createDiv();
    this.presetManagerComponent = new PresetManagerComponent(
      presetManagerContainer,
      this.app,
      this.plugin,
      this.settingsManager,
      this.presetManager
    );
    this.presetManagerComponent.display();
  }

  /**
   * 渲染页头信息
   */
  private renderHeaderSection(containerEl: HTMLElement): void {
    containerEl.createEl("h2", { text: "Note Architect 设置" });

    const versionInfo = containerEl.createEl("div", {
      cls: "setting-item-description",
    });
    versionInfo.createEl("small", {
      text: "Note Architect v1.0.0 - 可视化模板插件，帮助您通过可视化界面插入模板片段。",
    });

    containerEl.createEl("hr", { cls: "setting-item-hr" });
  }

  /**
   * 渲染模板文件夹路径设置
   */
  private renderTemplateFolderSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("模板文件夹路径")
      .setDesc("输入存放模板文件的文件夹路径，插件将在此路径下查找模板文件")
      .addText((text) => {
        const setting = text
          .setPlaceholder("例如：Templates")
          .setValue(this.settings.templateFolderPath);

        const parentElement = text.inputEl.parentElement;
        if (!parentElement) {
          return;
        }

        const buttonContainer = parentElement.createDiv("mod-cta");
        const verifyButton = buttonContainer.createEl("button", {
          text: "验证路径",
          cls: "mod-cta",
          type: "button",
        });

        withBusy(
          verifyButton,
          async () => {
            const currentPath = setting.getValue();
            const cleanPath = currentPath
              .trim()
              .replace(/^[\\/]+|[\\/]+$/g, "");
            const previousPath = this.settings.templateFolderPath;

            if (cleanPath !== previousPath) {
              await this.updateSettings((draft) => {
                draft.templateFolderPath = cleanPath;
              });
            }

            const isValid =
              await this.plugin.templateManager.validateTemplatePath(cleanPath);
            if (isValid) {
              notifySuccess(`路径 "${cleanPath}" 有效，已找到模板文件`);
            } else {
              notifyWarning(`路径 "${cleanPath}" 未找到模板文件`);
            }
          },
          {
            busyText: "验证中…",
            linkedTargets: [text.inputEl],
            errorContext: "SettingTab.verifyPath",
          }
        );

        return setting.onChange(async (value) => {
          const cleanPath = value.trim().replace(/^[\\/]+|[\\/]+$/g, "");
          const oldPath = this.settings.templateFolderPath;

          await this.updateSettings((draft) => {
            draft.templateFolderPath = cleanPath;
          });

          if (cleanPath && cleanPath !== oldPath) {
            notifySuccess(`模板路径已更新为: ${cleanPath}`);
          }
        });
      });
  }

  /**
   * 渲染 Templater 集成配置及状态
   */
  private renderTemplaterIntegrationSection(containerEl: HTMLElement): void {
    const statusInfo = this.getTemplaterStatusInfo();

    // 根据状态生成内联指示器
    let statusIndicator = "";
    if (this.settings.enableTemplaterIntegration) {
      const templater = new ObsidianTemplaterAdapter(this.app);
      const isTemplaterInstalled = templater.isAvailable();

      if (isTemplaterInstalled) {
        statusIndicator = " (● 已连接)";
      } else {
        statusIndicator = " (⚠ 未检测到插件)";
      }
    }

    const setting = new Setting(containerEl)
      .setName("启用 Templater 集成")
      .setDesc(
        "启用后，插入模板时会自动调用 Templater 插件处理模板语法（如 <% tp.date.now() %>）。需要先安装 Templater 插件。" +
          statusIndicator
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.enableTemplaterIntegration)
          .onChange(async (value) => {
            await this.updateSettings((draft) => {
              draft.enableTemplaterIntegration = value;
            });

            // 更新状态指示器
            const templater = new ObsidianTemplaterAdapter(this.app);
            const isTemplaterInstalled = templater.isAvailable();
            let newStatusIndicator = "";

            if (value) {
              if (isTemplaterInstalled) {
                newStatusIndicator = " (● 已连接)";
              } else {
                newStatusIndicator = " (⚠ 未检测到插件)";
              }
            }

            setting.setDesc(
              "启用后，插入模板时会自动调用 Templater 插件处理模板语法（如 <% tp.date.now() %>）。需要先安装 Templater 插件。" +
                newStatusIndicator
            );
            notifyInfo(
              value ? "已启用 Templater 集成" : "已禁用 Templater 集成"
            );
          })
      );
  }

  /**
   * 渲染默认日期格式设置
   */
  private renderDefaultDateFormatSetting(containerEl: HTMLElement): void {
    const currentFormat =
      this.settings.defaultDateFormat || DEFAULT_SETTINGS.defaultDateFormat;

    new Setting(containerEl)
      .setName("默认日期格式")
      .setDesc(
        "设置自动填充日期字段时使用的 Templater 日期格式，语法同 <% tp.date.now() %>。常用格式：YYYYMMDDHHmmss、YYYY-MM-DD、YYYY/MM/DD HH:mm"
      )
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.defaultDateFormat)
          .setValue(currentFormat)
          .onChange(async (value) => {
            const trimmed = value.trim();
            const nextFormat = trimmed || DEFAULT_SETTINGS.defaultDateFormat;

            const previousFormat = this.settings.defaultDateFormat;

            if (nextFormat === previousFormat) {
              return;
            }

            await this.updateSettings((draft) => {
              draft.defaultDateFormat = nextFormat;
            });
          });
      });
  }

  /**
   * 渲染未绑定预设时的行为设置
   */
  private renderNoPresetBehaviorSetting(containerEl: HTMLElement): void {
    const setting = new Setting(containerEl)
      .setName("未绑定预设时的行为")
      .setDesc("当模板未明确绑定预设时的处理策略");

    // 行为策略下拉菜单
    setting.addDropdown((dropdown) =>
      dropdown
        .addOption("ask", "询问用户选择")
        .addOption("use-default", "使用默认预设")
        .addOption("do-nothing", "直接插入模板")
        .setValue(this.settings.noPresetBehavior)
        .onChange(async (value) => {
          await this.updateSettings((draft) => {
            draft.noPresetBehavior = value as
              | "ask"
              | "use-default"
              | "do-nothing";
          });
          // 重新渲染以显示/隐藏默认预设选择器
          this.display();
        })
    );

    // 仅当选择 'use-default' 时，显示默认预设选择器
    if (this.settings.noPresetBehavior === "use-default") {
      new Setting(containerEl)
        .setName("默认预设")
        .setDesc("选择要使用的默认预设")
        .addDropdown((dropdown) => {
          // 添加空选项
          dropdown.addOption("", "请选择预设");

          // 添加所有可用的预设
          this.settings.frontmatterPresets.forEach((preset) => {
            dropdown.addOption(preset.id, preset.name);
          });

          dropdown
            .setValue(this.settings.defaultPresetId || "")
            .onChange(async (value) => {
              await this.updateSettings((draft) => {
                draft.defaultPresetId = value;
              });
            });
        });
    }
  }

  /**
   * 渲染模板状态信息
   */
  private renderTemplateStatusSection(containerEl: HTMLElement): void {
    this.renderTemplateStatus(containerEl);
  }
}
