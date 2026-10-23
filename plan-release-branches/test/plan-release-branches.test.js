import { describe, expect, it } from "vitest";
import { plan } from "../src/index.js";
import { runAction } from "./support/run-action.js";

describe("plan", () => {
  it("builds the release and an internal snapshot for a frozen disclosure", () => {
    expect(
      plan({ refName: "disclosure/frozen/7.0.x", version: "7.0.1-SNAPSHOT" }),
    ).toEqual({
      release: true,
      kind: "frozen",
      baseVersion: "7.0.1-SNAPSHOT",
      hotfix: false,
      hotfixOf: "",
      snapshotBranch: "disclosure/7.0.1-INTERNAL-SNAPSHOT",
      snapshotVersion: "7.0.1-INTERNAL-SNAPSHOT",
    });
  });

  it("names the internal snapshot of a .0 version without a release candidate", () => {
    const result = plan({
      refName: "disclosure/frozen/main",
      version: "7.1.0-SNAPSHOT",
    });
    expect(result.snapshotBranch).toBe("disclosure/7.1.0-INTERNAL-SNAPSHOT");
    expect(result.snapshotVersion).toBe("7.1.0-INTERNAL-SNAPSHOT");
    expect(result.baseVersion).toBe("7.1.0-SNAPSHOT");
  });

  it("builds a hotfix for an active disclosure, on the release, and no internal snapshot", () => {
    expect(
      plan({ refName: "disclosure/active/7.0.x", version: "7.0.1-SNAPSHOT" }),
    ).toEqual({
      release: true,
      kind: "active",
      baseVersion: "7.0.1.1-SNAPSHOT",
      hotfix: true,
      hotfixOf: "release/7.0.1",
      snapshotBranch: "disclosure/7.0.1.1-SNAPSHOT",
      snapshotVersion: "7.0.1.1-SNAPSHOT",
    });
  });

  it("builds nothing for an active disclosure whose version is not a patch release", () => {
    expect(
      plan({ refName: "disclosure/active/main", version: "7.1.0-SNAPSHOT" }),
    ).toEqual({
      release: false,
      kind: "active",
    });
  });

  it("takes a branch of any name under frozen or active", () => {
    expect(
      plan({
        refName: "disclosure/frozen/try-no-train",
        version: "7.0.3-SNAPSHOT",
      }).kind,
    ).toBe("frozen");
    expect(
      plan({
        refName: "disclosure/active/try-hotfix",
        version: "7.0.3-SNAPSHOT",
      }).hotfixOf,
    ).toBe("release/7.0.3");
  });

  it.each([
    [
      "a branch that is not a disclosure",
      "feature/x",
      "7.0.1-SNAPSHOT",
      "is not a disclosure branch",
    ],
    [
      "a version that is not a snapshot",
      "disclosure/frozen/7.0.x",
      "7.0.1",
      "expected <major>.<minor>.<patch>-SNAPSHOT",
    ],
    [
      "a milestone as a snapshot",
      "disclosure/frozen/7.0.x",
      "7.1.0-M1-SNAPSHOT",
      "expected <major>.<minor>.<patch>-SNAPSHOT",
    ],
    [
      "a hotfix on a frozen disclosure",
      "disclosure/frozen/7.0.x",
      "7.0.1.1-SNAPSHOT",
      "has no internal snapshot",
    ],
    [
      "a hotfix on an active disclosure",
      "disclosure/active/7.0.x",
      "7.0.1.1-SNAPSHOT",
      "a hotfix already",
    ],
    [
      "a disclosure branch with nothing under it",
      "disclosure/frozen",
      "7.0.1-SNAPSHOT",
      "is not a disclosure branch",
    ],
  ])("fails for %s", (_, refName, version, message) => {
    expect(() => plan({ refName, version })).toThrow(message);
  });
});

// The actions run as programs: the sources, and the bundle that GitHub runs (dist/).
describe.each([["src/index.js"], ["dist/index.js"]])(
  "the program %s",
  (entry) => {
    it("writes its outputs for a hotfix", async () => {
      const result = await runAction(entry, {
        "ref-name": "disclosure/active/7.0.x",
        version: "7.0.1-SNAPSHOT",
      });
      expect(result.code).toBe(0);
      expect(result.outputs).toEqual({
        release: "true",
        kind: "active",
        "base-version": "7.0.1.1-SNAPSHOT",
        hotfix: "true",
        "hotfix-of": "release/7.0.1",
        "snapshot-branch": "disclosure/7.0.1.1-SNAPSHOT",
        "snapshot-version": "7.0.1.1-SNAPSHOT",
      });
      expect(result.stdout).toContain(
        "an active disclosure: the hotfix 7.0.1.1 of 7.0.1-SNAPSHOT",
      );
    });

    it("writes the outputs of a frozen disclosure, with an empty hotfix-of", async () => {
      const result = await runAction(entry, {
        "ref-name": "disclosure/frozen/main",
        version: "7.1.0-SNAPSHOT",
      });
      expect(result.outputs).toMatchObject({
        release: "true",
        kind: "frozen",
        hotfix: "false",
        "hotfix-of": "",
        "snapshot-branch": "disclosure/7.1.0-INTERNAL-SNAPSHOT",
      });
    });

    it("writes only release and kind when there is nothing to build", async () => {
      const result = await runAction(entry, {
        "ref-name": "disclosure/active/main",
        version: "7.1.0-SNAPSHOT",
      });
      expect(result.code).toBe(0);
      expect(result.outputs).toEqual({ release: "false", kind: "active" });
      expect(result.stdout).toContain(
        "it has no hotfix, so there is nothing to build",
      );
    });

    it("fails with an error that GitHub shows", async () => {
      const result = await runAction(entry, {
        "ref-name": "feature/x",
        version: "7.0.1-SNAPSHOT",
      });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        "::error::feature/x is not a disclosure branch",
      );
    });
  },
);
