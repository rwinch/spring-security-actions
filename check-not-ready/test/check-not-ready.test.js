import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkNotReady } from "../src/index.js";
import { runAction } from "./support/run-action.js";

const train = (hashes) => ({
  releases: { "spring-merge": { "7.0.1": { "commit-hashes": hashes } } },
});
const base = {
  project: "spring-merge",
  version: "7.0.1",
  trainBranch: "2026.11.19",
};

describe("checkNotReady", () => {
  it("fails with the title and what to do if the release is ready", () => {
    let error;
    try {
      checkNotReady({ ...base, train: train({ joined: "a", ready: "b" }) });
    } catch (caught) {
      error = caught;
    }
    expect(error.title).toBe("spring-merge 7.0.1 is ready");
    expect(error.message).toBe(
      "spring-merge 7.0.1 is ready in the release train 2026.11.19, and is not changed any more, so release/7.0.1 was not built. To release the next version instead: set the version of gradle.properties to the next version in the OSS repository, and merge forward, so that the next push is for the next release.",
    );
  });

  it("is fine for a release that has joined and is not ready, and says it is in the train", () => {
    expect(checkNotReady({ ...base, train: train({ joined: "a" }) })).toBe(
      true,
    );
  });

  it.each([
    ["a project that is not in the train", { releases: { other: {} } }],
    [
      "a version that is not in the train",
      { releases: { "spring-merge": { "7.0.2": {} } } },
    ],
    ["a train without releases", {}],
    ["no train", undefined],
  ])("is fine for %s, and says it is not in the train", (_, data) => {
    expect(checkNotReady({ ...base, train: data })).toBe(false);
  });

  it("does not take the ready of another version or project", () => {
    const data = {
      releases: {
        "spring-merge": { "7.0.2": { "commit-hashes": { ready: "x" } } },
        other: { "7.0.1": { "commit-hashes": { ready: "x" } } },
      },
    };
    expect(checkNotReady({ ...base, train: data })).toBe(false);
  });
});

describe.each([["src/index.js"], ["dist/index.js"]])(
  "the program %s",
  (entry) => {
    const file = (data) => {
      const f = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), "train-")),
        "train.json",
      );
      fs.writeFileSync(
        f,
        typeof data === "string" ? data : JSON.stringify(data),
      );
      return f;
    };
    const inputs = (data) => ({
      "train-file": file(data),
      project: "spring-merge",
      version: "7.0.1",
      "train-branch": "2026.11.19",
    });

    it("fails with an error that has the title, for a release that is ready", async () => {
      const result = await runAction(entry, inputs(train({ ready: "b" })));
      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        "::error title=spring-merge 7.0.1 is ready::spring-merge 7.0.1 is ready in the release train 2026.11.19",
      );
    });

    it("succeeds for a release that is not ready", async () => {
      const result = await runAction(entry, inputs(train({ joined: "a" })));
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        "is in the release train, and is not ready yet",
      );
    });

    it("succeeds for a release that is not in the train", async () => {
      const result = await runAction(entry, inputs({}));
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("is not in the release train yet");
    });

    it("fails for a file that is not JSON", async () => {
      const result = await runAction(entry, inputs("{ no"));
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("cannot be read as JSON");
    });
  },
);
