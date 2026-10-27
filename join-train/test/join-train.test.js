import { describe, expect, it } from "vitest";
import { joinRunsUrl, run, summaryLine } from "../src/index.js";

const base = {
  trainRepository: "spring-io/release-train",
  trainBranch: "2026.11.19",
  project: "spring-security",
  version: "7.0.1",
  releaseRepository: "spring-projects/spring-security-commercial",
  releaseBranch: "release/7.0.1",
  deploymentDestination: "Maven Central",
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
  it("runs the workflow of the project on the release branch, with the destination and the train", async () => {
    const octokit = fakeOctokit();
    const result = await run({ ...base, train: { releases: {} } }, { octokit });
    expect(result).toEqual({ joined: true });
    expect(octokit.dispatches).toEqual([
      {
        owner: "spring-projects",
        repo: "spring-security-commercial",
        workflow_id: "release-train-join.yml",
        ref: "release/7.0.1",
        inputs: {
          "deployment-destination": "Maven Central",
          "release-train": "2026.11.19",
          "release-train-repository": "spring-io/release-train",
        },
      },
    ]);
  });

  it("does not join a release that has joined already (ready or not)", async () => {
    for (const hashes of [{ joined: "a" }, { joined: "a", ready: "b" }]) {
      const octokit = fakeOctokit();
      const result = await run({ ...base, train: train(hashes) }, { octokit });
      expect(result).toEqual({ joined: false, reason: "already-joined" });
      expect(octokit.dispatches).toEqual([]);
    }
  });

  it("says what the token and the branch need if GitHub refuses the dispatch", async () => {
    const octokit = fakeOctokit(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );
    await expect(run({ ...base, train: {} }, { octokit })).rejects.toThrow(
      "Could not run release-train-join.yml on release/7.0.1 in spring-projects/spring-security-commercial: the workflow must be on that branch, and the token needs Actions: Read and write on the repository (a fine-grained token) or the scope repo (a classic one) (404 Not Found)",
    );
  });

  it("links to the runs of the workflow of the project on the release branch, as the run is not known", () => {
    expect(
      joinRunsUrl({
        serverUrl: "https://github.com/",
        repository: "spring-projects/spring-security-commercial",
        branch: "release/7.0.1",
      }),
    ).toBe(
      "https://github.com/spring-projects/spring-security-commercial/actions/workflows/release-train-join.yml?query=branch%3Arelease%2F7.0.1",
    );
    expect(
      summaryLine({
        outcome: "joined",
        trainBranch: "2026.11.19",
        releaseBranch: "release/7.0.1",
        destination: "Maven Central",
        joinUrl: "https://x/join",
      }),
    ).toBe(
      "Joined the release train 2026.11.19: dispatched [Release Train - Join](https://x/join) of release/7.0.1 (Maven Central)",
    );
  });

  it("says in the summary what happened, with a link to the train if it has one", () => {
    const line = {
      trainBranch: "2026.11.19",
      releaseBranch: "release/7.0.1",
      destination: "Maven Central",
    };
    expect(
      summaryLine({ ...line, outcome: "joined", trainUrl: "https://x/t" }),
    ).toBe(
      "Joined the [release train 2026.11.19](https://x/t): dispatched Release Train - Join of release/7.0.1 (Maven Central)",
    );
    expect(summaryLine({ ...line, outcome: "already-joined" })).toBe(
      "Already in the release train 2026.11.19: not joined again",
    );
    expect(summaryLine({ ...line, outcome: "no-train" })).toBe(
      "Not joined: the release train 2026.11.19 has not been created",
    );
  });
});
