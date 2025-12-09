import { App, Editor, MarkdownView } from "obsidian";
import { stringify as stringifyYaml } from "yaml";
import type NoteArchitect from "@core/plugin";
import type {
  Template,
  FrontmatterPreset,
  TemplateInsertionResult,
} from "@types";
import { prepareTemplateWithUserInput } from "@engine/TemplateEngine";
import { updateNoteFrontmatter } from "@utils/frontmatter-editor";
import { notifySuccess, notifyWarning } from "@utils/notify";
import { copyToClipboard } from "@utils/ui";

/**
 * 执行模板插入操作
 * @param app Obsidian 应用实例
 * @param plugin NoteArchitect 插件实例
 * @param template 要插入的模板
 * @param preset 合并后的预设
 * @param userFrontmatter 用户输入的 frontmatter 数据
 * @returns Promise<TemplateInsertionResult> 插入结果
 */
export async function executeTemplateInsertion(
  app: App,
  plugin: NoteArchitect,
  template: Template,
  preset: FrontmatterPreset,
  userFrontmatter: Record<string, unknown>
): Promise<TemplateInsertionResult> {
  const preparation = await prepareTemplateWithUserInput(
    app,
    plugin,
    template,
    preset,
    userFrontmatter
  );

  const activeView = app.workspace.getActiveViewOfType(MarkdownView);
  if (!activeView || !activeView.editor) {
    throw new Error("无法获取当前编辑器，请确保在 Markdown 文件中使用此功能");
  }

  const editor = activeView.editor;
  let templateBodyInserted = false;

  try {
    // 检查插入前的光标状态：是否在文件开头且未选中文本
    const cursor = editor.getCursor();
    const isNewFrontmatter = !preparation.noteMetadata.position;
    const isCursorAtStart =
      !editor.somethingSelected() && cursor.line === 0 && cursor.ch === 0;

    // 先更新 frontmatter（始终在文件顶部，避免后续插入导致行号错位）
    updateNoteFrontmatter(
      editor,
      preparation.mergedFrontmatter,
      preparation.noteMetadata.position
    );

    // [修复] 如果是全新插入 Frontmatter 且光标原先在开头，
    // updateNoteFrontmatter 后光标可能仍停留在 0,0 (Frontmatter 之前)。
    // 我们需要手动将光标移动到 Frontmatter 之后，确保正文插入在正确位置。
    if (isNewFrontmatter && isCursorAtStart) {
      const lastLine = editor.lineCount();
      let fmEndLine = 0;
      // 扫描找到 Frontmatter 的结束标记 '---'
      // 从第1行开始扫描（第0行肯定是 '---'）
      for (let i = 1; i < Math.min(lastLine, 100); i++) {
        if (editor.getLine(i).trim() === "---") {
          fmEndLine = i;
          break;
        }
      }
      // updateNoteFrontmatter 会在 '---' 后添加 '\n\n'，所以我们跳过 '---' 行和随后的空行
      // 目标行是 fmEndLine + 2
      const targetLine = Math.min(fmEndLine + 2, lastLine);
      editor.setCursor({ line: targetLine, ch: 0 });
    }

    // 再插入模板正文
    if (preparation.hasTemplateBody) {
      editor.replaceSelection(preparation.templateBody);
      templateBodyInserted = true;
    }

    const result: TemplateInsertionResult = {
      usedTemplater: preparation.usedTemplater,
      templaterError: preparation.templaterError,
      mergedFrontmatter: preparation.mergedFrontmatter,
      mergeCount: preparation.mergeCount,
      frontmatterUpdated: true,
      templateBodyInserted,
      fallbackToBodyOnly: false,
    };

    // 处理成功通知
    handleInsertionSuccess(result, template);

    // 添加到最近使用的模板
    await plugin.addRecentTemplate(template.id);

    return result;
  } catch (error) {
    console.error("Note Architect: 插入操作失败", error);

    try {
      // 回退策略：只插入模板正文，不插入 frontmatter
      if (preparation.hasTemplateBody) {
        editor.replaceSelection(preparation.templateBody);
        templateBodyInserted = true;
      }

      // 将失败的 frontmatter 复制到剪贴板，方便用户手动恢复
      const frontmatterYaml = stringifyFrontmatterAsYaml(
        preparation.mergedFrontmatter
      );
      await copyToClipboard(frontmatterYaml);

      const fallbackResult: TemplateInsertionResult = {
        usedTemplater: preparation.usedTemplater,
        templaterError: preparation.templaterError,
        mergedFrontmatter: preparation.mergedFrontmatter,
        mergeCount: preparation.mergeCount,
        frontmatterUpdated: false,
        templateBodyInserted,
        fallbackToBodyOnly: true,
      };

      // 处理回退通知
      handleInsertionFallback(fallbackResult, template);

      // 添加到最近使用的模板
      await plugin.addRecentTemplate(template.id);

      return fallbackResult;
    } catch (fallbackError) {
      console.error("Note Architect: 回退插入也失败", fallbackError);
      throw new Error("模板插入完全失败，请手动复制模板内容");
    }
  }
}

/**
 * 处理模板插入成功的通知
 * @param result 插入结果
 * @param template 模板对象
 */
function handleInsertionSuccess(
  result: TemplateInsertionResult,
  template: Template
): void {
  if (result.templaterError) {
    notifyWarning(`${result.templaterError}，将使用原始模板内容进行插入`);
  }

  if (result.fallbackToBodyOnly) {
    notifyWarning("Frontmatter 更新失败，已插入模板正文内容。");
    return;
  }

  const details: string[] = [];
  if (result.usedTemplater) {
    details.push("并使用 Templater 处理");
  }
  if (result.mergeCount > 0) {
    details.push(`已合并 ${result.mergeCount} 个 frontmatter 字段`);
  }

  const suffix = details.length > 0 ? `（${details.join("，")}）` : "";
  const templateName = template.name ?? "未命名模板";
  notifySuccess(`模板 "${templateName}" 已插入${suffix}。`);
}

/**
 * 处理模板插入回退的通知
 * @param result 插入结果
 * @param template 模板对象
 */
function handleInsertionFallback(
  result: TemplateInsertionResult,
  template: Template
): void {
  if (result.templaterError) {
    notifyWarning(`${result.templaterError}，已使用原始模板内容`);
  }

  if (result.fallbackToBodyOnly) {
    notifyWarning(
      "Frontmatter 更新失败，已插入模板正文。您的 frontmatter 数据已复制到剪贴板，可以手动在文件顶部添加。"
    );
    return;
  }
}

/**
 * 将 frontmatter 对象转换为 YAML 格式字符串
 * @param frontmatter frontmatter 对象
 * @returns YAML 格式的字符串
 */
function stringifyFrontmatterAsYaml(
  frontmatter: Record<string, unknown>
): string {
  const yamlText = stringifyYaml(frontmatter, {
    indent: 2,
    lineWidth: 0,
    aliasDuplicateObjects: false,
  });
  const normalizedYaml = yamlText.endsWith("\n") ? yamlText : `${yamlText}\n`;
  return `---${normalizedYaml}---`;
}