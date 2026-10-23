import { describe, expect, it } from "vitest";
import { setIdentity } from "../src/index.js";
import { createRepo, git } from "./support/git-repo.js";
import { runAction } from "./support/run-action.js";

describe("setIdentity", () => {
  it("sets the name and the email of the repository", () => {
    const directory = createRepo({ a: "a" });
    setIdentity({ directory, name: "Bot", email: "bot@example.com" });
    expect(git(directory, "config", "--local", "user.name")).toBe("Bot");
    expect(git(directory, "config", "--local", "user.email")).toBe(
      "bot@example.com",
    );
  });

  it.each([
    [{ name: "", email: "a@b" }, "name"],
    [{ name: "A", email: "" }, "email"],
    [{ name: "A\nB", email: "a@b" }, "name"],
    [{ name: "A", email: "a@b\nc" }, "email"],
  ])("does not take %j", (identity, what) => {
    const directory = createRepo({ a: "a" });
    expect(() => setIdentity({ directory, ...identity })).toThrow(
      `The ${what} of the identity`,
    );
  });
});

describe.each([["src/index.js"], ["dist/index.js"]])(
  "the program %s",
  (entry) => {
    it("is github-actions[bot] by default", async () => {
      const directory = createRepo({ a: "a" });
      const result = await runAction(entry, { path: directory });
      expect(result.code).toBe(0);
      expect(git(directory, "config", "--local", "user.name")).toBe(
        "github-actions[bot]",
      );
      expect(git(directory, "config", "--local", "user.email")).toBe(
        "41898282+github-actions[bot]@users.noreply.github.com",
      );
      expect(result.stdout).toContain(
        "Commits are made as github-actions[bot]",
      );
    });

    it("takes another identity", async () => {
      const directory = createRepo({ a: "a" });
      await runAction(entry, {
        path: directory,
        name: "Bea",
        email: "bea@example.com",
      });
      expect(git(directory, "config", "--local", "user.email")).toBe(
        "bea@example.com",
      );
    });

    it("fails with an error that GitHub shows for something that is not a repository", async () => {
      const result = await runAction(entry, { path: "/nonexistent-directory" });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("::error::");
    });
  },
);
