import { parseFrontmatter, updateFrontmatter } from "./frontmatter-editor";

describe("frontmatter-editor", () => {
  it("updateFrontmatter adds config when header is missing", () => {
    const content = "# Title\nBody section";
    const result = updateFrontmatter(content, (fm) => ({
      ...fm,
      "note-architect-config": "preset-id",
    }));

    expect(result.changed).toBe(true);
    expect(result.frontmatter["note-architect-config"]).toBe("preset-id");
    expect(result.previousFrontmatter).toEqual({});
    expect(result.content).toBe(
      [
        "---",
        "note-architect-config: preset-id",
        "---",
        "",
        "# Title",
        "Body section",
      ].join("\n")
    );
  });

  it("updateFrontmatter overwrites existing binding and keeps extra fields", () => {
    const content = [
      "---",
      "note-architect-config: old-id",
      "another: value",
      "---",
      "",
      "Content",
    ].join("\n");

    const parsed = parseFrontmatter(content);
    const result = updateFrontmatter(
      content,
      (fm) => ({
        ...fm,
        "note-architect-config": "new-id",
      }),
      parsed
    );

    expect(result.changed).toBe(true);
    expect(result.frontmatter).toEqual({
      "note-architect-config": "new-id",
      another: "value",
    });
    expect(result.content).toBe(
      [
        "---",
        "note-architect-config: new-id",
        "another: value",
        "---",
        "",
        "Content",
      ].join("\n")
    );
  });

  it("updateFrontmatter skips rewrite when value is unchanged", () => {
    const content = [
      "---",
      "note-architect-config: same-id",
      "---",
      "",
      "Content",
    ].join("\n");

    const parsed = parseFrontmatter(content);
    const result = updateFrontmatter(
      content,
      (fm) => ({
        ...fm,
        "note-architect-config": "same-id",
      }),
      parsed
    );

    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("parseFrontmatter tolerates invalid yaml and keeps body content", () => {
    const content = [
      "---",
      'title: "unterminated',
      "---",
      "",
      "Body content",
    ].join("\n");

    const parsed = parseFrontmatter(content);

    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body.trim()).toBe("Body content");
    expect(parsed.hasFrontmatter).toBe(true);
  });

  it("updateFrontmatter rewrites invalid frontmatter instead of throwing", () => {
    const content = [
      "---",
      'title: "unterminated',
      "---",
      "",
      "Body content",
    ].join("\n");

    const result = updateFrontmatter(content, (fm) => ({
      ...fm,
      "note-architect-config": "preset-id",
    }));

    expect(result.changed).toBe(true);
    expect(result.frontmatter).toEqual({
      "note-architect-config": "preset-id",
    });
    expect(result.content).toBe(
      [
        "---",
        "note-architect-config: preset-id",
        "---",
        "",
        "Body content",
      ].join("\n")
    );
  });
});
