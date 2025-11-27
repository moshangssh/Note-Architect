import { App, Editor } from "obsidian";
import { stringify as stringifyYaml } from "yaml";
import type { NoteMetadata, Pos } from "@types";
import {
  parseFrontmatter as parseFrontmatterImpl,
  composeContent,
  sanitizeFrontmatter,
  areFrontmattersEqual,
  type ParsedFrontmatter,
} from "@utils/frontmatter/text";

export const parseFrontmatter = parseFrontmatterImpl;
export { composeContent, sanitizeFrontmatter, areFrontmattersEqual };
export type { ParsedFrontmatter };

export interface FrontmatterUpdateResult {
  content: string;
  frontmatter: Record<string, unknown>;
  previousFrontmatter: Record<string, unknown>;
  changed: boolean;
}

export function updateFrontmatter(
  content: string,
  updater: (frontmatter: Record<string, unknown>) => Record<string, unknown>,
  parsed?: ParsedFrontmatter
): FrontmatterUpdateResult {
  const base = parsed ?? parseFrontmatter(content);
  const updatedFrontmatter = sanitizeFrontmatter(
    updater({ ...base.frontmatter })
  );
  const changed = !areFrontmattersEqual(updatedFrontmatter, base.frontmatter);
  const newContent = changed
    ? composeContent(updatedFrontmatter, base)
    : content;

  return {
    content: newContent,
    frontmatter: updatedFrontmatter,
    previousFrontmatter: base.frontmatter,
    changed,
  };
}

export function getNoteMetadata(app: App): NoteMetadata {
  const activeFile = app.workspace.getActiveFile();
  if (!activeFile) {
    return { frontmatter: {}, position: null };
  }

  const fileCache = app.metadataCache.getFileCache(activeFile);
  if (!fileCache || !fileCache.frontmatter) {
    return { frontmatter: {}, position: null };
  }

  return {
    frontmatter: fileCache.frontmatter || {},
    position: (fileCache.frontmatterPosition as Pos) ?? null,
  };
}

export function updateNoteFrontmatter(
  editor: Editor,
  newFrontmatter: Record<string, unknown>,
  position: Pos | null
): void {
  try {
    const newYamlString = stringifyYaml(newFrontmatter, {
      indent: 2,
      lineWidth: 0,
      aliasDuplicateObjects: false,
    });

    if (position && position.start && position.end) {
      const startPos = { line: position.start.line, ch: 0 };
      const endPos = { line: position.end.line + 1, ch: 0 };
      editor.replaceRange(`---\n${newYamlString}---\n\n`, startPos, endPos);
    } else {
      const startPos = { line: 0, ch: 0 };
      editor.replaceRange(`---\n${newYamlString}---\n\n`, startPos);
    }
  } catch (error) {
    console.error("Note Architect: 更新 frontmatter 失败", error);
    throw error;
  }
}
