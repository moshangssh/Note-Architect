import type { Template } from "@types";

export interface TemplaterPort {
  isAvailable(): boolean;
  processTemplate(template: Template): Promise<string>;
  /**
   * 处理字符串中的 Templater 表达式
   * @param content 包含 Templater 表达式的字符串（如 `<% tp.date.now() %>`）
   * @returns 解析后的字符串
   */
  processString(content: string): Promise<string>;
}
