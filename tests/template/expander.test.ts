import { describe, expect, test } from "bun:test";
import {
  expandHookCommand,
  expandTemplate,
  expandWorktreeTemplate,
  transformBranch,
} from "../../src/template/expander";

describe("transformBranch", () => {
  test("converts / to - when separator is hyphen", () => {
    expect(transformBranch("feature/add-cart", "hyphen")).toBe(
      "feature-add-cart",
    );
  });

  test("converts / to _ when separator is underscore", () => {
    expect(transformBranch("feature/add-cart", "underscore")).toBe(
      "feature_add-cart",
    );
  });

  test("keeps / when separator is slash", () => {
    expect(transformBranch("feature/add-cart", "slash")).toBe(
      "feature/add-cart",
    );
  });

  test("converts multiple slashes", () => {
    expect(transformBranch("a/b/c", "hyphen")).toBe("a-b-c");
  });

  test("returns unchanged when no slash present", () => {
    expect(transformBranch("main", "hyphen")).toBe("main");
  });
});

describe("expandTemplate", () => {
  test("expands single variable", () => {
    expect(expandTemplate("${{ foo }}", { foo: "bar" })).toBe("bar");
  });

  test("expands multiple variables", () => {
    expect(expandTemplate("${{ a }}-${{ b }}", { a: "x", b: "y" })).toBe("x-y");
  });

  test("expands dot notation variables", () => {
    expect(expandTemplate("${{ a.b }}", { "a.b": "val" })).toBe("val");
  });

  test("replaces undefined variables with empty string", () => {
    expect(expandTemplate("${{ unknown }}", {})).toBe("");
  });

  test("tolerates extra spaces around variable name", () => {
    expect(expandTemplate("${{  foo  }}", { foo: "bar" })).toBe("bar");
  });

  test("returns unchanged when no template present", () => {
    expect(expandTemplate("plain text", {})).toBe("plain text");
  });
});

describe("expandWorktreeTemplate", () => {
  test("expands original.path", () => {
    const context = {
      original: { path: "/home/user/repo", basename: "repo" },
      worktree: { branch: "main" },
    };
    expect(
      expandWorktreeTemplate("${{ original.path }}", context, "hyphen"),
    ).toBe("/home/user/repo");
  });

  test("expands original.basename", () => {
    const context = {
      original: { path: "/home/user/repo", basename: "repo" },
      worktree: { branch: "main" },
    };
    expect(
      expandWorktreeTemplate("${{ original.basename }}", context, "hyphen"),
    ).toBe("repo");
  });

  test("expands worktree.branch with separator transformation", () => {
    const context = {
      original: { path: "/home/user/repo", basename: "repo" },
      worktree: { branch: "feature/add-cart" },
    };
    expect(
      expandWorktreeTemplate("${{ worktree.branch }}", context, "hyphen"),
    ).toBe("feature-add-cart");
  });

  test("expands combined template with all variables", () => {
    const context = {
      original: { path: "/home/user/repo", basename: "repo" },
      worktree: { branch: "feature/add-cart" },
    };
    expect(
      expandWorktreeTemplate(
        "../${{ original.basename }}-${{ worktree.branch }}",
        context,
        "hyphen",
      ),
    ).toBe("../repo-feature-add-cart");
  });
});

describe("expandHookCommand", () => {
  const context = {
    original: { path: "/home/user/repo", basename: "repo" },
    worktree: {
      branch: "feature/add-cart",
      path: "/home/user/repo-feature-add-cart",
      basename: "repo-feature-add-cart",
    },
  };

  test("expands original.path", () => {
    expect(expandHookCommand("${{ original.path }}", context)).toBe(
      "/home/user/repo",
    );
  });

  test("expands original.basename", () => {
    expect(expandHookCommand("${{ original.basename }}", context)).toBe("repo");
  });

  test("expands worktree.path", () => {
    expect(expandHookCommand("${{ worktree.path }}", context)).toBe(
      "/home/user/repo-feature-add-cart",
    );
  });

  test("expands worktree.basename", () => {
    expect(expandHookCommand("${{ worktree.basename }}", context)).toBe(
      "repo-feature-add-cart",
    );
  });

  test("expands worktree.branch as raw value (no transformation)", () => {
    expect(expandHookCommand("${{ worktree.branch }}", context)).toBe(
      "feature/add-cart",
    );
  });

  test("expands combined command with all variables", () => {
    expect(
      expandHookCommand(
        "cd ${{ worktree.path }} && echo ${{ worktree.branch }}",
        context,
      ),
    ).toBe("cd /home/user/repo-feature-add-cart && echo feature/add-cart");
  });
});
