import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { setVersion } from "../src/index.js";
import { createRepo, git } from "./support/git-repo.js";
import { runAction } from "./support/run-action.js";

const repo = (properties = "version=7.0.1-SNAPSHOT\n", options) =>
  createRepo({ "gradle.properties": properties }, options);
const properties = (directory) =>
  fs.readFileSync(path.join(directory, "gradle.properties"), "utf8");

describe("setVersion", () => {
  it("sets the version in a commit of its own, signed off", () => {
    const directory = repo();
    const commit = setVersion({
      directory,
      version: "7.0.1",
      message: "Release 7.0.1",
    });
    expect(properties(directory)).toBe("version=7.0.1\n");
    expect(commit).toBe(git(directory, "rev-parse", "HEAD"));
    expect(git(directory, "log", "-1", "--format=%B").trim()).toBe(
      "Release 7.0.1\n\nSigned-off-by: Alice <alice@example.com>",
    );
    expect(git(directory, "status", "--porcelain")).toBe("");
    expect(git(directory, "show", "--format=", "--name-only", "HEAD")).toBe(
      "gradle.properties",
    );
  });

  it("changes only the line of the version", () => {
    const directory = repo(
      "org.gradle.jvmargs=-Xmx2g\nversion=7.0.1-SNAPSHOT\n# a comment: version=1\nother=a\n",
    );
    setVersion({ directory, version: "7.0.1", message: "Release 7.0.1" });
    expect(properties(directory)).toBe(
      "org.gradle.jvmargs=-Xmx2g\nversion=7.0.1\n# a comment: version=1\nother=a\n",
    );
  });

  it("keeps windows line endings", () => {
    const directory = repo("version=7.0.1-SNAPSHOT\r\nother=a\r\n");
    setVersion({ directory, version: "7.0.1", message: "Release 7.0.1" });
    expect(properties(directory)).toBe("version=7.0.1\r\nother=a\r\n");
  });

  it.each([
    ["7.1.0-RC1"],
    ["7.1.0-INTERNAL-SNAPSHOT"],
    ["7.0.1.1-SNAPSHOT"],
    ["1.0.0+build.5"],
  ])("takes the version %s", (version) => {
    const directory = repo();
    setVersion({ directory, version, message: "Set" });
    expect(properties(directory)).toBe(`version=${version}\n`);
  });

  it("does not take a $ for the start of a replacement", () => {
    const directory = repo();
    expect(() =>
      setVersion({ directory, version: "1.0.0$&", message: "x" }),
    ).toThrow("is not a version");
    setVersion({ directory, version: "1.0.0+a.b", message: "x" });
    expect(properties(directory)).toBe("version=1.0.0+a.b\n");
  });

  it("fails if the version is that already, and commits nothing", () => {
    const directory = repo("version=7.0.1\n");
    expect(() =>
      setVersion({ directory, version: "7.0.1", message: "Release 7.0.1" }),
    ).toThrow("has the version 7.0.1 already, there is nothing to commit");
    expect(git(directory, "rev-list", "--count", "HEAD")).toBe("1");
  });

  it("fails if there is no line version", () => {
    const directory = repo("other=a\n");
    expect(() =>
      setVersion({ directory, version: "7.0.1", message: "x" }),
    ).toThrow("has no line version=");
  });

  it("fails if the file does not exist", () => {
    expect(() =>
      setVersion({
        directory: repo(),
        version: "7.0.1",
        message: "x",
        file: "nothing.properties",
      }),
    ).toThrow("nothing.properties does not exist");
  });

  it.each(["", "7.0.1; rm -rf /", "$(id)", "a b", "-x", undefined])(
    "does not write %j",
    (version) => {
      const directory = repo();
      expect(() => setVersion({ directory, version, message: "x" })).toThrow(
        "is not a version to write",
      );
      expect(properties(directory)).toBe("version=7.0.1-SNAPSHOT\n");
    },
  );

  it("needs a message", () => {
    expect(() =>
      setVersion({ directory: repo(), version: "7.0.1", message: "" }),
    ).toThrow("message is required");
  });

  it("fails if git does not know who commits, and changes nothing", () => {
    const directory = repo("version=7.0.1-SNAPSHOT\n", { identity: false });
    const keep = { ...process.env };
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_SYSTEM = "/dev/null";
    for (const name of [
      "GIT_AUTHOR_NAME",
      "GIT_AUTHOR_EMAIL",
      "GIT_COMMITTER_NAME",
      "GIT_COMMITTER_EMAIL",
      "EMAIL",
    ]) {
      delete process.env[name];
    }
    try {
      expect(() =>
        setVersion({ directory, version: "7.0.1", message: "x" }),
      ).toThrow("git does not know who commits");
    } finally {
      process.env = keep;
    }
    expect(properties(directory)).toBe("version=7.0.1-SNAPSHOT\n");
    expect(git(directory, "rev-list", "--count", "HEAD")).toBe("1");
  });
});

// The actions run as programs: the sources, and the bundle that GitHub runs (dist/).
describe.each([["src/index.js"], ["dist/index.js"]])(
  "the program %s",
  (entry) => {
    it("sets the version, and writes the commit", async () => {
      const directory = repo();
      const result = await runAction(entry, {
        version: "7.0.1",
        message: "Release 7.0.1",
        path: directory,
      });
      expect(result.code).toBe(0);
      expect(result.outputs.commit).toBe(git(directory, "rev-parse", "HEAD"));
      expect(properties(directory)).toBe("version=7.0.1\n");
    });

    it("takes another file", async () => {
      const directory = createRepo({ "app.properties": "version=1.0.0\n" });
      const result = await runAction(entry, {
        version: "2.0.0",
        message: "Bump",
        path: directory,
        file: "app.properties",
      });
      expect(result.code).toBe(0);
      expect(
        fs.readFileSync(path.join(directory, "app.properties"), "utf8"),
      ).toBe("version=2.0.0\n");
    });

    it("fails with an error that GitHub shows, and commits nothing", async () => {
      const directory = repo("version=7.0.1\n");
      const result = await runAction(entry, {
        version: "7.0.1",
        message: "x",
        path: directory,
      });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        "::error::gradle.properties has the version 7.0.1 already",
      );
      expect(git(directory, "rev-list", "--count", "HEAD")).toBe("1");
    });
  },
);
