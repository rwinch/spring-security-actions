import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareBranches } from "../src/index.js";
import { git } from "./support/git-repo.js";
import { runAction } from "./support/run-action.js";

const FROZEN = "embargoed/frozen/7.0.x";
const ACTIVE = "embargoed/active/7.0.x";

// compare-branches, with real git: a remote that has the frozen embargoed branch and the active one,
// and a clone of it on the active branch, as the workflow has it checked out.
describe("compare-branches", () => {
  const bot = (directory) => {
    git(directory, "config", "user.name", "github-actions[bot]");
    git(directory, "config", "user.email", "bot@example.com");
    git(directory, "config", "commit.gpgsign", "false");
  };
  const write = (directory, file, text) =>
    fs.writeFileSync(path.join(directory, file), text);
  const commit = (directory, message) =>
    git(directory, "commit", "-q", "-am", message);

  /**
   * The clone on the active branch.
   *
   *   active: the changes (file and text) that the active branch has of its own
   *   frozenAfter: the changes that the frozen branch gets after the active one was cut from it
   *   mergeFrozen: the active branch has the frozen one merged in, as the merge forward does
   *   frozen: false if the frozen branch has never been pushed
   */
  function world({
    active = [],
    frozenAfter = [],
    mergeFrozen = false,
    frozen = true,
  } = {}) {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "compare-branches-"));
    const origin = path.join(base, "origin.git");
    git(base, "init", "-q", "--bare", "-b", "main", origin);
    const seed = path.join(base, "seed");
    fs.mkdirSync(seed);
    git(seed, "init", "-q", "-b", FROZEN);
    bot(seed);
    write(seed, "A.java", "class A {\n  int x = 1;\n}\n");
    write(seed, "B.java", "class B {}\n");
    git(seed, "add", "-A");
    commit(seed, "frozen tip");
    if (frozen) {
      git(seed, "push", "-q", origin, `HEAD:refs/heads/${FROZEN}`);
    }

    git(seed, "switch", "-q", "-c", ACTIVE);
    for (const [file, text] of active) {
      write(seed, file, text);
      commit(seed, "A change of the active branch");
    }
    git(seed, "push", "-q", origin, `HEAD:refs/heads/${ACTIVE}`);

    git(seed, "switch", "-q", FROZEN);
    for (const [file, text] of frozenAfter) {
      write(seed, file, text);
      commit(seed, "A change of the frozen branch");
    }
    if (frozen && frozenAfter.length > 0) {
      git(seed, "push", "-q", origin, `HEAD:refs/heads/${FROZEN}`);
    }

    const work = path.join(base, "work");
    git(base, "clone", "-q", origin, work);
    bot(work);
    git(work, "switch", "-q", "-c", ACTIVE, `origin/${ACTIVE}`);
    if (mergeFrozen) {
      git(
        work,
        "merge",
        "-q",
        "--no-ff",
        "-m",
        "Merge the frozen branch",
        `origin/${FROZEN}`,
      );
    }
    return work;
  }

  it("is the same when the active branch is the frozen branch", () => {
    expect(compareBranches({ directory: world(), base: FROZEN })).toEqual({
      different: false,
      exists: true,
    });
  });

  it("is different when the active branch has a change of its own", () => {
    const directory = world({
      active: [["A.java", "class A {\n  int x = 1; // the CVE fix\n}\n"]],
    });
    expect(compareBranches({ directory, base: FROZEN })).toEqual({
      different: true,
      exists: true,
    });
  });

  it("is the same when the active branch only has the merge of the frozen branch", () => {
    // The frozen branch got a change after the active one was cut, and the merge forward
    // brought it in: the active branch has a merge commit that the frozen one lacks, with
    // no changes of its own.
    const directory = world({
      frozenAfter: [["B.java", "class B {\n  int y = 2;\n}\n"]],
      mergeFrozen: true,
    });
    expect(
      git(directory, "rev-list", "--count", `origin/${FROZEN}..HEAD`),
    ).toBe("1");
    expect(compareBranches({ directory, base: FROZEN }).different).toBe(false);
  });

  it("is the same when the frozen branch is ahead and the active branch did not change", () => {
    const directory = world({
      frozenAfter: [["B.java", "class B {\n  int y = 2;\n}\n"]],
    });
    expect(compareBranches({ directory, base: FROZEN }).different).toBe(false);
  });

  it("is different when the active branch has a change of its own and the frozen branch is merged in", () => {
    const directory = world({
      active: [["A.java", "class A {\n  int x = 1; // the CVE fix\n}\n"]],
      frozenAfter: [["B.java", "class B {\n  int y = 2;\n}\n"]],
      mergeFrozen: true,
    });
    expect(compareBranches({ directory, base: FROZEN }).different).toBe(true);
  });

  it("is different when the frozen branch does not exist, and says so", () => {
    const directory = world({ frozen: false });
    expect(compareBranches({ directory, base: FROZEN })).toEqual({
      different: true,
      exists: false,
    });
  });

  it("compares another commit than the one that is checked out", () => {
    const directory = world({
      active: [["A.java", "class A {\n  int x = 1; // the CVE fix\n}\n"]],
    });
    expect(
      compareBranches({ directory, base: FROZEN, head: `origin/${FROZEN}` })
        .different,
    ).toBe(false);
  });

  it("fails if there is no base", () => {
    expect(() => compareBranches({ directory: world(), base: "" })).toThrow(
      "The input base is required",
    );
  });

  it("fails if the head is not a commit", () => {
    expect(() =>
      compareBranches({ directory: world(), base: FROZEN, head: "nope" }),
    ).toThrow("nope is not a commit of the repository");
  });

  it("fails if the two branches have nothing in common", () => {
    const directory = world();
    git(directory, "switch", "-q", "--orphan", "unrelated");
    write(directory, "C.java", "class C {}\n");
    git(directory, "add", "-A");
    commit(directory, "A branch of its own");
    expect(() => compareBranches({ directory, base: FROZEN })).toThrow(
      /git diff .*failed/,
    );
  });
});

// The actions run as programs: the sources, and the bundle that GitHub runs (dist/).
describe.each([["src/index.js"], ["dist/index.js"]])(
  "the program %s",
  (entry) => {
    const run = (directory, extra = {}) =>
      runAction(entry, { base: FROZEN, path: directory, ...extra });
    const bot = (directory) => {
      git(directory, "config", "user.name", "github-actions[bot]");
      git(directory, "config", "user.email", "bot@example.com");
      git(directory, "config", "commit.gpgsign", "false");
    };
    // a clone on the active branch, with (or without) a change of its own
    function clone({ change, frozen = true }) {
      const base = fs.mkdtempSync(path.join(os.tmpdir(), "compare-program-"));
      const origin = path.join(base, "origin.git");
      git(base, "init", "-q", "--bare", "-b", "main", origin);
      const seed = path.join(base, "seed");
      fs.mkdirSync(seed);
      git(seed, "init", "-q", "-b", FROZEN);
      bot(seed);
      fs.writeFileSync(path.join(seed, "A.java"), "class A {}\n");
      git(seed, "add", "-A");
      git(seed, "commit", "-q", "-m", "frozen tip");
      if (frozen) {
        git(seed, "push", "-q", origin, `HEAD:refs/heads/${FROZEN}`);
      }
      git(seed, "switch", "-q", "-c", ACTIVE);
      if (change) {
        fs.writeFileSync(path.join(seed, "A.java"), "class A { int x; }\n");
        git(seed, "commit", "-q", "-am", "The CVE fix");
      }
      git(seed, "push", "-q", origin, `HEAD:refs/heads/${ACTIVE}`);
      const work = path.join(base, "work");
      git(base, "clone", "-q", origin, work);
      git(work, "switch", "-q", "-c", ACTIVE, `origin/${ACTIVE}`);
      return work;
    }

    it("writes different=false, and a notice that nothing is built, for the same branch", async () => {
      const result = await run(clone({ change: false }));
      expect(result.code).toBe(0);
      expect(result.outputs).toEqual({ different: "false" });
      expect(result.stdout).toContain("::notice title=Nothing to build::");
      expect(result.stdout).toContain(
        `${ACTIVE} has nothing that ${FROZEN} lacks`,
      );
      expect(result.stdout).toContain("no hotfix is built");
    });

    it("writes different=true for an active branch with a change of its own", async () => {
      const result = await run(clone({ change: true }));
      expect(result.code).toBe(0);
      expect(result.outputs).toEqual({ different: "true" });
      expect(result.stdout).toContain("the hotfix is built");
      expect(result.stdout).not.toContain("::notice");
    });

    it("writes different=true, and a notice, if there is no frozen branch", async () => {
      const result = await run(clone({ change: false, frozen: false }));
      expect(result.code).toBe(0);
      expect(result.outputs).toEqual({ different: "true" });
      expect(result.stdout).toContain(
        "::notice title=No frozen embargoed branch::",
      );
      expect(result.stdout).toContain(`${FROZEN} does not exist`);
    });

    it("fails with an error that GitHub shows if there is no base", async () => {
      const result = await run(clone({ change: true }), { base: "" });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("::error::The input base is required");
    });
  },
);
