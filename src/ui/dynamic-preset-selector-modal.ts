import { App, Modal } from "obsidian";
import type NoteArchitect from "@core/plugin";
import type { FrontmatterPreset, Template } from "@types";
import { handleError } from "@core/error";
import { notifyInfo } from "@utils/notify";

/**
 * 简化的预设选择模态窗口
 * 用于当模板未绑定预设时，让用户从现有预设列表中选择
 */
export class DynamicPresetSelectorModal extends Modal {
  private plugin: NoteArchitect;
  private template: Template;
  private onPresetSelected: (preset: FrontmatterPreset | null) => void;
  private searchQuery = "";
  private availablePresets: FrontmatterPreset[] = [];
  private filteredPresets: FrontmatterPreset[] = [];
  private selectedPresetIndex = 0;

  constructor(
    app: App,
    plugin: NoteArchitect,
    template: Template,
    onPresetSelected: (preset: FrontmatterPreset | null) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.template = template;
    this.onPresetSelected = onPresetSelected;

    // 获取所有可用预设
    this.availablePresets = this.plugin.presetManager.getPresets();
    this.filteredPresets = [...this.availablePresets];
  }

  onOpen() {
    const { contentEl } = this;

    // 设置模态窗口大小
    this.modalEl.style.width = "90vw";
    this.modalEl.style.maxWidth = "600px";
    this.modalEl.style.height = "auto";
    this.modalEl.style.maxHeight = "80vh";

    // 创建标题
    contentEl.createEl("h2", {
      text: "选择预设",
      cls: "note-architect-form-title",
    });

    // 创建说明区域
    const descriptionContainer = contentEl.createDiv(
      "note-architect-form-description"
    );
    descriptionContainer.createEl("p", {
      text: `模板 "${this.template.name}" 未配置预设，请从现有预设中选择一个：`,
      cls: "note-architect-form-description-text",
    });
    // 搜索和过滤选项
    const searchContainer = contentEl.createDiv({
      cls: "note-architect-search-container search-input-container",
    });

    searchContainer.style.display = "flex";
    searchContainer.style.alignItems = "center";
    searchContainer.style.gap = "10px";
    searchContainer.style.marginBottom = "15px";

    const searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: "搜索预设...",
      cls: "note-architect-input-base note-architect-search-input",
    });
    searchInput.style.width = "100%"; // 让搜索框占满宽度

    // 创建预设列表容器
    const presetListContainer = contentEl.createDiv(
      "note-architect-preset-list-container"
    );
    presetListContainer.style.maxHeight = "300px";
    presetListContainer.style.overflowY = "auto";

    // 过滤方法
    const applyFilters = () => {
      let filtered = [...this.availablePresets];

      // 应用搜索过滤
      if (this.searchQuery) {
        filtered = filtered.filter((preset) => {
          return (
            preset.name
              .toLowerCase()
              .includes(this.searchQuery.toLowerCase()) ||
            preset.id.toLowerCase().includes(this.searchQuery.toLowerCase())
          );
        });
      }

      this.filteredPresets = filtered;
      this.selectedPresetIndex = 0;
      renderPresetList();
    };

    // 创建预设���表
    const renderPresetList = () => {
      presetListContainer.empty();

      if (this.filteredPresets.length === 0) {
        const emptyMessage = presetListContainer.createDiv(
          "note-architect-empty-message"
        );
        emptyMessage.textContent = this.searchQuery
          ? "未找到匹配的预设"
          : "暂无可用预设，请先在设置中创建预设";
        return;
      }

      this.filteredPresets.forEach((preset, index) => {
        const presetItem = presetListContainer.createDiv(
          "note-architect-preset-item"
        );
        presetItem.style.padding = "12px";
        presetItem.style.border = "1px solid var(--background-modifier-border)";
        presetItem.style.borderRadius = "6px";
        presetItem.style.marginBottom = "8px";
        presetItem.style.cursor = "pointer";
        presetItem.style.transition = "all 0.2s ease";

        // 高亮选中项
        if (index === this.selectedPresetIndex) {
          presetItem.style.backgroundColor = "var(--background-modifier-hover)";
          presetItem.style.borderColor = "var(--interactive-accent)";
        }

        // 预设名称
        const nameEl = presetItem.createEl("div", {
          text: preset.name,
          cls: "note-architect-preset-name",
        });
        nameEl.style.fontWeight = "bold";
        nameEl.style.marginBottom = "4px";

        // 预设ID
        const idEl = presetItem.createEl("div", {
          text: `ID: ${preset.id}`,
          cls: "note-architect-preset-id",
        });
        idEl.style.fontSize = "12px";
        idEl.style.color = "var(--text-muted)";

        // 字段数量
        const fieldsCount = preset.fields?.length || 0;
        const metaInfo = presetItem.createEl("div", {
          text: `字段数: ${fieldsCount}`,
          cls: "note-architect-preset-meta",
        });
        metaInfo.style.fontSize = "12px";
        metaInfo.style.color = "var(--text-muted)";
        metaInfo.style.marginTop = "4px";

        // 鼠标悬停效果
        presetItem.addEventListener("mouseenter", () => {
          presetItem.style.backgroundColor = "var(--background-modifier-hover)";
        });

        presetItem.addEventListener("mouseleave", () => {
          if (index !== this.selectedPresetIndex) {
            presetItem.style.backgroundColor = "";
          }
        });

        // 点击选择预设
        presetItem.addEventListener("click", () => {
          this.selectPreset(preset);
        });
      });
    };

    // 搜索功能
    searchInput.addEventListener("input", (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      applyFilters();
    });

    // 键盘导航
    searchInput.addEventListener("keydown", (e) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          this.selectedPresetIndex = Math.min(
            this.selectedPresetIndex + 1,
            this.filteredPresets.length - 1
          );
          renderPresetList();
          break;
        case "ArrowUp":
          e.preventDefault();
          this.selectedPresetIndex = Math.max(this.selectedPresetIndex - 1, 0);
          renderPresetList();
          break;
        case "Enter":
          e.preventDefault();
          if (this.filteredPresets[this.selectedPresetIndex]) {
            this.selectPreset(this.filteredPresets[this.selectedPresetIndex]);
          }
          break;
        case "Escape":
          this.close();
          break;
      }
    });

    // 按钮区域
    const buttonContainer = contentEl.createDiv(
      "note-architect-button-container"
    );
    buttonContainer.style.display = "flex";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.gap = "10px";
    buttonContainer.style.marginTop = "20px";

    // 取消按钮
    const cancelButton = buttonContainer.createEl("button", {
      text: "取消",
      cls: "mod-cta",
    });
    cancelButton.style.padding = "8px 16px";
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    // 直接插入按钮（不使用预设）
    const directInsertButton = buttonContainer.createEl("button", {
      text: "直接插入模板",
      cls: "mod-cta",
    });
    directInsertButton.style.padding = "8px 16px";
    directInsertButton.addEventListener("click", () => {
      this.onDirectInsert();
    });

    // 初始渲染
    renderPresetList();

    // 自动聚焦搜索框
    setTimeout(() => {
      searchInput.focus();
    }, 100);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  private selectPreset(preset: FrontmatterPreset) {
    try {
      notifyInfo(`已选择预设: ${preset.name}`);
      this.onPresetSelected(preset);
      this.close();
    } catch (error) {
      handleError(error, { context: "选择预设时发生错误" });
    }
  }

  private onDirectInsert() {
    try {
      notifyInfo("将直接插入模板，不使用预设");
      this.onPresetSelected(null);
      this.close();
    } catch (error) {
      handleError(error, { context: "直接插入模板时发生错误" });
    }
  }
}
