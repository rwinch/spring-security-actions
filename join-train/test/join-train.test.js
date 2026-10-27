import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { headOf, joinRunsUrl, run, summaryLine } from "../src/index.js";

const base = {
  trainRepository: "spring-io/release-train",
  trainBranch: "2026.11.19",
  project: "spring-security",
  version: "7.0.1",
  releaseRepository: "spring-projects/spring-security-commercial",
  releaseBranch: "release/7.0.1",
  deploymentDestination: "maven-central",
};
const train = (hashes) => ({
  releases: { "spring-security": { "7.0.1": { "commit-hashes": hashes } } },
});

function fakeOctokit(failure) {
  const dispatches = [];
  return {
    dispatches,
    rest: {
      actions: {
        createWorkflowDispatch: async (request) => {
          if (failure) {
            throw failure;
          }
          dispatches.push(request);
        },
      },
    },
  };
}

describe("join-train", () => {
  it("runs Join on the branch of the train, with the release branch and the destination", async () => {
    const octokit = fakeOctokit();
    const result = await run({ ...base, train: { releases: {} } }, { octokit });
    expect(result).toEqual({ joined: true });
    expect(octokit.dispatches).toEqual([
      {
        owner: "spring-io",
        repo: "release-train",
        workflow_id: "join.yml",
        ref: "2026.11.19",
        inputs: {
          "release-repository": "spring-projects/spring-security-commercial",
          "release-branch": "release/7.0.1",
          "deployment-destination": "maven-central",
        },
      },
    ]);
  });

  it("gives the commit hash if it has one", async () => {
    const octokit = fakeOctokit();
    await run({ ...base, train: {}, commitHash: "abc" }, { octokit });
    expect(octokit.dispatches[0].inputs["commit-hash"]).toBe("abc");
  });

  it("does not join a release that has joined already (ready or not)", async () => {
    for (const hashes of [{ joined: "a" }, { joined: "a", ready: "b" }]) {
      const octokit = fakeOctokit();
      const result = await run({ ...base, train: train(hashes) }, { octokit });
      expect(result).toEqual({ joined: false, reason: "already-joined" });
      expect(octokit.dispatches).toEqual([]);
    }
  });

  it("says that the token needs Actions: write if GitHub refuses the dispatch", async () => {
    const octokit = fakeOctokit(
      Object.assign(new Error("Resource not accessible"), { status: 403 }),
    );
    await expect(run({ ...base, train: {} }, { octokit })).rejects.toThrow(
      "Could not dispatch Join in spring-io/release-train: the token needs Actions: Read and write on it (a fine-grained token) or the scope repo (a classic one) (403 Resource not accessible)",
    );
  });

  it("links to the runs of Join on the branch of the train, as the run is not known", () => {
    expect(
      joinRunsUrl({
        serverUrl: "https://github.com/",
        trainRepository: "spring-io/release-train",
        trainBranch: "2026.11.19",
      }),
    ).toBe(
      "https://github.com/spring-io/release-train/actions/workflows/join.yml?query=branch%3A2026.11.19",
    );
    expect(
      summaryLine({
        outcome: "joined",
        trainBranch: "2026.11.19",
        releaseBranch: "release/7.0.1",
        destination: "maven-central",
        joinUrl: "https://x/join",
      }),
    ).toBe(
      "Joined the release train 2026.11.19: dispatched [Join](https://x/join) of release/7.0.1 (maven-central)",
    );
  });

  it("says in the summary what happened, with a link to the train if it has one", () => {
    const line = {
      trainBranch: "2026.11.19",
      releaseBranch: "release/7.0.1",
      destination: "maven-central",
    };
    expect(
      summaryLine({ ...line, outcome: "joined", trainUrl: "https://x/t" }),
    ).toBe(
      "Joined the [release train 2026.11.19](https://x/t): dispatched Join of release/7.0.1 (maven-central)",
    );
    expect(summaryLine({ ...line, outcome: "already-joined" })).toBe(
      "Already in the release train 2026.11.19: not joined again",
    );
    expect(summaryLine({ ...line, outcome: "no-train" })).toBe(
      "Not joined: the release train 2026.11.19 has not been created",
    );
  });

  it("finds the commit that the release branch is at, and none for a branch that is not there", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "join-train-"));
    const git = (...args) =>
      execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
    git("init", "-q", "-b", "release/7.0.1");
    git(
      "-c",
      "user.name=a",
      "-c",
      "user.email=a@b",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "x",
    );
    expect(headOf(dir, "release/7.0.1")).toBe(git("rev-parse", "HEAD"));
    expect(headOf(dir, "release/7.0.2")).toBe("");
    expect(headOf(path.join(dir, "nowhere"), "release/7.0.1")).toBe("");
  });
});
