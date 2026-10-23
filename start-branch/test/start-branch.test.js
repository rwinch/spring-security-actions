import { describe, expect, it } from "vitest";
import { startBranch } from "../src/index.js";
import { createRepo, git } from "./support/git-repo.js";
import { runAction } from "./support/run-action.js";

/** A repository with the commits one and two on main, and a branch other at two. */
function repo() {
  const directory = createRepo({ a: "1" });
  git(directory, "switch", "-q", "-c", "other");
  git(directory, "commit", "-q", "--allow-empty", "-m", "two");
  git(directory, "switch", "-q", "main");
  return directory;
}

describe("startBranch", () => {
  it("starts a branch at a commit, and switches to it", () => {
    const directory = repo();
    const first = git(directory, "rev-parse", "HEAD");
    expect(
      startBranch({ directory, branch: "release/7.0.1", from: first }),
    ).toBe(first);
    expect(git(directory, "rev-parse", "--abbrev-ref", "HEAD")).toBe(
      "release/7.0.1",
    );
  });

  it("starts a branch at another branch", () => {
    const directory = repo();
    const commit = startBranch({ directory, branch: "new", from: "other" });
    expect(commit).toBe(git(directory, "rev-parse", "other"));
    expect(git(directory, "log", "-1", "--format=%s")).toBe("two");
  });

  it("resets a branch that exists, and leaves the working tree that of the commit", () => {
    const directory = repo();
    startBranch({ directory, branch: "new", from: "other" });
    git(directory, "commit", "-q", "--allow-empty", "-m", "three");
    startBranch({ directory, branch: "new", from: "main" });
    expect(git(directory, "rev-parse", "new")).toBe(
      git(directory, "rev-parse", "main"),
    );
    expect(git(directory, "status", "--porcelain")).toBe("");
  });

  it.each([
    [{ branch: "", from: "main" }, "The input branch is required"],
    [{ branch: "x", from: "" }, "The input from is required"],
    [{ branch: "a b", from: "main" }, "is not the name of a branch"],
    [{ branch: "-x", from: "main" }, "is not the name of a branch"],
    [{ branch: "x", from: "nothing" }, "nothing is not a commit or a branch"],
  ])("fails for %j", (more, message) => {
    const directory = repo();
    expect(() => startBranch({ directory, ...more })).toThrow(message);
    expect(git(directory, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
  });
});

describe.each([["src/index.js"], ["dist/index.js"]])(
  "the program %s",
  (entry) => {
    it("starts the branch and writes the commit", async () => {
      const directory = repo();
      const result = await runAction(entry, {
        branch: "release/7.0.1",
        from: "other",
        path: directory,
      });
      expect(result.code).toBe(0);
      expect(result.outputs.commit).toBe(git(directory, "rev-parse", "other"));
      expect(git(directory, "rev-parse", "--abbrev-ref", "HEAD")).toBe(
        "release/7.0.1",
      );
    });

    it("fails with an error that GitHub shows", async () => {
      const result = await runAction(entry, {
        branch: "x",
        from: "nothing",
        path: repo(),
      });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        "::error::nothing is not a commit or a branch",
      );
    });
  },
);
