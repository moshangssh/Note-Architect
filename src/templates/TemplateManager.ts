import {
  type App,
  type EventRef,
  TFile,
  TAbstractFile,
  TFolder,
} from "obsidian";
import { handleError } from "@core/error";
import { TemplateLoadStatus } from "@types";
import type { Template, TemplateLoadResult } from "@types";
import type { SettingsManager } from "@settings";
import { notifyError, notifySuccess, notifyWarning } from "@utils/notify";
import { normalizePath } from "@utils/path";
import { safeGetFolder } from "@utils/vault";
import { debounce } from "@utils/timing";

/**
 * 模板管理器负责处理模板文件的加载、缓存与检索，保持插件主类的单一职责。
 */
export class TemplateManager {
  private templates: Template[] = [];
  private loadResult: TemplateLoadResult = {
    status: TemplateLoadStatus.IDLE,
    count: 0,
  };
  private watcherRefs: EventRef[] = [];
  private readonly debouncedReload = debounce(() => {
    void this.reloadTemplates();
  }, 300);
  private watchedFolderPath?: string;
  private isWatching = false;
  // 并发控制：跟踪当前有效的加载操作ID
  private currentLoadingId = 0;

  constructor(
    private readonly app: App,
    private readonly settingsManager: SettingsManager
  ) {}

  /**
   * 验证模板文件夹路径是否存在。
   */
  async validateTemplatePath(path: string): Promise<boolean> {
    if (!path || path.trim() === "") {
      return false;
    }

    return safeGetFolder(this.app, path) !== null;
  }

  /**
   * 加载模板文件到内存。
   */
  async loadTemplates(): Promise<TemplateLoadResult> {
    // 并发控制：递增加载ID，标记这次加载操作
    const loadingId = ++this.currentLoadingId;

    this.loadResult = {
      status: TemplateLoadStatus.LOADING,
      count: 0,
      message: "正在加载模板...",
    };
    // 清空当前监听路径，避免在失败情况下继续处理事件
    this.watchedFolderPath = undefined;

    try {
      const settings = this.settingsManager.getSettings();
      const folderPath = settings.templateFolderPath?.trim();
      if (!folderPath) {
        // 只有当前加载ID有效时才更新结果
        if (loadingId !== this.currentLoadingId) return this.loadResult;

        this.loadResult = {
          status: TemplateLoadStatus.ERROR,
          count: 0,
          message: "模板文件夹路径未设置",
        };
        console.log("Note Architect: 模板文件夹路径未设置");
        return this.loadResult;
      }

      const pathExists = await this.validateTemplatePath(folderPath);
      // 异步操作后检查：如果ID已改变，说明有新的加载开始，放弃当前操作
      if (loadingId !== this.currentLoadingId) {
        console.log(`Note Architect: 加载操作 ${loadingId} 被新的加载取代`);
        return this.loadResult;
      }

      if (!pathExists) {
        this.loadResult = {
          status: TemplateLoadStatus.ERROR,
          count: 0,
          message: `模板文件夹路径 "${folderPath}" 无效或不存在`,
        };
        console.warn(`Note Architect: 路径 "${folderPath}" 无效或不存在`);
        return this.loadResult;
      }

      const folderResult = safeGetFolder(this.app, folderPath);
      if (!folderResult) {
        if (loadingId !== this.currentLoadingId) return this.loadResult;

        this.loadResult = {
          status: TemplateLoadStatus.ERROR,
          count: 0,
          message: `模板文件夹路径 "${folderPath}" 无法访问`,
        };
        console.warn(`Note Architect: 路径 "${folderPath}" 无法访问有效文件夹`);
        return this.loadResult;
      }
      this.watchedFolderPath = folderResult.normalizedPath;

      const templateFiles = this.collectTemplateFiles(folderResult.folder);

      // 使用局部变量收集模板，避免直接操作共享状态
      const loadedTemplates: Template[] = [];
      let errorCount = 0;

      for (const file of templateFiles) {
        // 每次异步操作前检查加载ID
        if (loadingId !== this.currentLoadingId) {
          console.log(`Note Architect: 加载操作 ${loadingId} 被中断`);
          return this.loadResult;
        }

        try {
          const content = await this.app.vault.read(file);

          // 异步读取后再次检查
          if (loadingId !== this.currentLoadingId) {
            console.log(`Note Architect: 加载操作 ${loadingId} 被中断`);
            return this.loadResult;
          }

          const template: Template = {
            id: file.path,
            name: file.basename,
            path: file.path,
            content,
          };
          loadedTemplates.push(template);
        } catch (error) {
          errorCount++;
          console.warn(`Note Architect: 无法读取模板文件 ${file.path}`, error);
        }
      }

      // 最终检查：只有当前加载ID仍然有效时才提交结果
      if (loadingId !== this.currentLoadingId) {
        console.log(
          `Note Architect: 加载操作 ${loadingId} 完成但已过期，结果被丢弃`
        );
        return this.loadResult;
      }

      // 排序后一次性更新共享状态
      loadedTemplates.sort((a, b) =>
        a.name.localeCompare(b.name, "zh-CN", { sensitivity: "base" })
      );
      this.templates = loadedTemplates;

      if (this.templates.length === 0) {
        this.loadResult = {
          status: TemplateLoadStatus.EMPTY,
          count: 0,
          message: `文件夹 "${folderPath}" 中未找到 .md 模板文件`,
        };
      } else {
        this.loadResult = {
          status: TemplateLoadStatus.SUCCESS,
          count: this.templates.length,
          message: `成功加载 ${this.templates.length} 个模板文件`,
        };
      }

      console.log(`Note Architect: ${this.loadResult.message}`);
      if (errorCount > 0) {
        console.warn(`Note Architect: ${errorCount} 个文件读取失败`);
      }

      return this.loadResult;
    } catch (error) {
      const normalizedError = handleError(error, {
        context: "TemplateManager.loadTemplates",
        userMessage: "加载模板失败，请检查模板文件夹设置",
      });
      this.loadResult = {
        status: TemplateLoadStatus.ERROR,
        count: 0,
        message: "加载模板失败，请检查模板文件夹设置",
        error: normalizedError,
      };
      return this.loadResult;
    }
  }

  /**
   * 收集模板文件夹内的所有 Markdown 模板文件，避免遍历整个仓库。
   */
  private collectTemplateFiles(folder: TFolder): TFile[] {
    const stack: TAbstractFile[] = [...folder.children];
    const files: TFile[] = [];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }

      if (current instanceof TFolder) {
        stack.push(...current.children);
        continue;
      }

      if (current instanceof TFile && current.extension === "md") {
        files.push(current);
      }
    }

    return files;
  }

  /**
   * 重新加载模板文件。
   */
  async reloadTemplates(
    showNotice: boolean = false
  ): Promise<TemplateLoadResult> {
    const result = await this.loadTemplates();
    if (showNotice) {
      if (result.status === TemplateLoadStatus.SUCCESS) {
        notifySuccess(result.message ?? "模板加载完成");
      } else if (result.status === TemplateLoadStatus.ERROR) {
        notifyError(result.message ?? "模板加载失败");
      } else {
        notifyWarning(result.message ?? "模板状态更新");
      }
    }
    return result;
  }

  getTemplates(): Template[] {
    return [...this.templates];
  }

  getTemplateById(id: string): Template | undefined {
    return this.templates.find((template) => template.id === id);
  }

  getTemplateLoadStatus(): TemplateLoadResult {
    return { ...this.loadResult };
  }

  startWatching(): void {
    if (this.isWatching) {
      return;
    }

    const vault = this.app.vault;
    this.watcherRefs = [
      vault.on("create", this.handleVaultChange),
      vault.on("modify", this.handleVaultChange),
      vault.on("delete", this.handleVaultChange),
      vault.on("rename", this.handleVaultRename),
    ];

    this.isWatching = true;
  }

  stopWatching(): void {
    this.debouncedReload.cancel();

    for (const ref of this.watcherRefs) {
      this.app.vault.offref(ref);
    }
    this.watcherRefs = [];
    this.isWatching = false;
  }

  dispose(): void {
    this.stopWatching();
  }

  private handleVaultChange = (file: TAbstractFile): void => {
    if (!this.shouldHandlePath(file?.path)) {
      return;
    }
    this.scheduleReload();
  };

  private handleVaultRename = (file: TAbstractFile, oldPath: string): void => {
    // [神谕]: 检查被重命名的路径是否就是我们正在监视的文件夹
    const normalizedOldPath = normalizePath(oldPath);
    if (
      this.watchedFolderPath &&
      normalizedOldPath === this.watchedFolderPath
    ) {
      // [神谕]: 确保新"文件"是一个文件夹
      if (file instanceof TFolder) {
        // [神谕]: 它被移动了! 立即更新我们的"神经索"到新路径
        this.watchedFolderPath = normalizePath(file.path);

        // [神谕]: 重新扫描新家, 看看有什么新食物
        this.scheduleReload();
        return; // 任务完成
      }
    }

    // [神谕]: 如果只是文件夹内的文件被重命名, 按原计划行事
    if (!this.shouldHandlePath(file?.path) && !this.shouldHandlePath(oldPath)) {
      return;
    }
    this.scheduleReload();
  };

  private shouldHandlePath(path?: string): boolean {
    if (!this.watchedFolderPath || !path) {
      return false;
    }

    const normalized = normalizePath(path);
    return (
      normalized === this.watchedFolderPath ||
      normalized.startsWith(`${this.watchedFolderPath}/`)
    );
  }

  private scheduleReload(): void {
    this.debouncedReload();
  }
}

export default TemplateManager;
