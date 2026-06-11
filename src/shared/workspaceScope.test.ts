import { describe, expect, it } from "vitest";
import { buildWorkspaceScopeId } from "./workspaceScope";

describe("buildWorkspaceScopeId", () => {
  it("returns projects scope when projects exist", () => {
    const result = buildWorkspaceScopeId({
      projects: [{ id: "1", path: "/project/a", title: "A", addedAt: "" }],
      workspacePath: "/workspace"
    });
    expect(result).toContain("projects:");
    expect(result).toContain("/project/a");
  });
  it("returns workspace scope when no projects", () => {
    const result = buildWorkspaceScopeId({
      projects: [],
      workspacePath: "/my/workspace"
    });
    expect(result).toBe("workspace:/my/workspace");
  });
  it("returns global:empty when nothing", () => {
    const result = buildWorkspaceScopeId({
      projects: [],
      workspacePath: undefined
    });
    expect(result).toBe("global:empty");
  });
  it("deduplicates project paths", () => {
    const result = buildWorkspaceScopeId({
      projects: [
        { id: "1", path: "/project", title: "A", addedAt: "" },
        { id: "2", path: "/project", title: "B", addedAt: "" }
      ],
      workspacePath: "/workspace"
    });
    // Should only have one /project entry
    expect(result.split("|").length).toBe(1);
  });
  it("normalizes backslashes", () => {
    const result = buildWorkspaceScopeId({
      projects: [{ id: "1", path: "\\project\\a", title: "A", addedAt: "" }],
      workspacePath: "/workspace"
    });
    expect(result).toContain("/project/a");
  });
});
