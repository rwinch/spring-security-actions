import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { candidateOf, noTrainSummary, run } from "../src/index.js";
import { createOctokit } from "../src/octokit.js";
import { defaultMilestones, startFakeGitHub } from "./support/fake-github.js";
import { runAction } from "./support/run-action.js";

const fixture = JSON.parse(fs.readFileSync(defaultMilestones, "utf8"));
const REPO = "tutorial/spring-merge";

describe("candidateOf", () => {
  it("removes -SNAPSHOT", () => {
    expect(candidateOf("7.0.1-SNAPSHOT")).toBe("7.0.1");
    expect(candidateOf("7.1.0-SNAPSHOT")).toBe("7.1.0");
    expect(candidateOf("7.0.1.1-SNAPSHOT")).toBe("7.0.1.1");
  });

  it.each([
    "7.0.1",
    "7.1.0-M1",
    "7.1.0-RC1",
    "7.1.0-M1-SNAPSHOT",
    "7.1-SNAPSHOT",
    "x-SNAPSHOT",
    "",
  ])("rejects %j", (version) => {
    expect(() => candidateOf(version)).toThrow();
  });
});

describe("run", () => {
  let fake;
  const octokit = (options = {}) =>
    createOctokit({ baseUrl: fake.url, ...options });
  const release = (snapshotVersion, options = {}) =>
    run(
      { snapshotVersion, milestoneRepository: REPO, ...options },
      { octokit: octokit() },
    );

  beforeAll(async () => {
    fake = await startFakeGitHub();
  });
  afterAll(() => fake.close());

  describe("a version that does not end with .0", () => {
    it("is released as itself, on the due date of its milestone", async () => {
      expect(await release("7.0.1-SNAPSHOT")).toMatchObject({
        found: true,
        releaseVersion: "7.0.1",
        dueDate: "2026-11-19",
      });
    });

    it("releases a hotfix as itself", async () => {
      expect(await release("7.0.1.1-SNAPSHOT")).toMatchObject({
        found: true,
        releaseVersion: "7.0.1.1",
        dueDate: "2026-11-19",
      });
    });

    it("finds a closed milestone", async () => {
      expect(await release("6.5.5-SNAPSHOT")).toMatchObject({
        found: true,
        releaseVersion: "6.5.5",
        dueDate: "2026-08-01",
      });
    });

    it("reports that there is no milestone", async () => {
      expect(await release("7.0.9-SNAPSHOT")).toEqual({
        found: false,
        candidate: "7.0.9",
        message: `${REPO} has no milestone 7.0.9, so nothing is built`,
      });
    });

    it("does not match a longer version", async () => {
      // 7.0.1 must not be found as 7.0.1.1, nor 7.1.0 as 7.1.01
      expect(await release("7.0.11-SNAPSHOT")).toMatchObject({
        found: false,
        message: expect.stringContaining("has no milestone 7.0.11"),
      });
    });
  });

  describe("a version that ends with .0", () => {
    it("is released as the open milestone with the earliest due date", async () => {
      // 7.1.0-RC1 is due before 7.1.0. 7.1.0-M3 is closed, and 7.1.01 and 7.1.0.1 are other versions
      expect(await release("7.1.0-SNAPSHOT")).toMatchObject({
        found: true,
        releaseVersion: "7.1.0-RC1",
        dueDate: "2026-11-19",
      });
    });

    it("is released as the version itself when its milestones are closed", async () => {
      const milestones = fixture.map((m) =>
        m.title === "7.1.0-RC1" ? { ...m, state: "closed" } : m,
      );
      const other = await startFakeGitHub({ milestones });
      try {
        const result = await run(
          { snapshotVersion: "7.1.0-SNAPSHOT", milestoneRepository: REPO },
          { octokit: createOctokit({ baseUrl: other.url }) },
        );
        expect(result).toMatchObject({
          found: true,
          releaseVersion: "7.1.0",
          dueDate: "2026-12-17",
        });
      } finally {
        await other.close();
      }
    });

    it("goes by the due date and not by the name", async () => {
      // 7.3.0-RC1 is due before 7.3.0-M1
      expect(await release("7.3.0-SNAPSHOT")).toMatchObject({
        found: true,
        releaseVersion: "7.3.0-RC1",
        dueDate: "2027-02-01",
      });
    });

    // Due on the same day, the order is: milestones, release candidates, the version.
    it.each([
      [
        ["8.0.0", "8.0.0-RC2", "8.0.0-RC1", "8.0.0-M10", "8.0.0-M2"],
        "8.0.0-M2",
      ],
      [["8.0.0", "8.0.0-RC2", "8.0.0-RC1", "8.0.0-M10"], "8.0.0-M10"],
      [["8.0.0", "8.0.0-RC2", "8.0.0-RC1"], "8.0.0-RC1"],
      [["8.0.0", "8.0.0-RC2"], "8.0.0-RC2"],
      [["8.0.0"], "8.0.0"],
    ])(
      "orders the milestones of one day: %j is released as %s",
      async (titles, expected) => {
        const day = "2027-01-01T12:00:00Z";
        const other = await startFakeGitHub({
          milestones: titles.map((title, i) => ({
            number: i,
            title,
            state: "open",
            due_on: day,
          })),
        });
        try {
          const result = await run(
            { snapshotVersion: "8.0.0-SNAPSHOT", milestoneRepository: REPO },
            { octokit: createOctokit({ baseUrl: other.url }) },
          );
          expect(result.releaseVersion).toBe(expected);
        } finally {
          await other.close();
        }
      },
    );

    it("reports that no milestone is open", async () => {
      expect(await release("7.7.0-SNAPSHOT")).toMatchObject({
        found: false,
        message: expect.stringContaining(
          `${REPO} has no open milestone for 7.7.0`,
        ),
      });
    });

    it("does not take the milestones of another version", async () => {
      expect(await release("7.0.0-SNAPSHOT")).toMatchObject({
        found: false,
        message: expect.stringContaining("has no open milestone for 7.0.0"),
      });
    });
  });

  describe("the due date", () => {
    it("fails if the milestone has none", async () => {
      await expect(release("7.2.0-SNAPSHOT")).rejects.toThrow(
        "7.2.0-M1 of tutorial/spring-merge has no due date",
      );
    });

    it("is empty if it has none and it is not required", async () => {
      expect(
        await release("7.2.0-SNAPSHOT", { requireDueDate: false }),
      ).toMatchObject({
        found: true,
        releaseVersion: "7.2.0-M1",
        dueDate: "",
      });
    });

    it("is the date in UTC, late in the day too", async () => {
      expect(await release("7.5.0-SNAPSHOT")).toMatchObject({
        found: true,
        releaseVersion: "7.5.0-M1",
        dueDate: "2027-06-01",
      });
    });
  });

  describe("the requests", () => {
    it("send the token", async () => {
      fake.requests.length = 0;
      await run(
        { snapshotVersion: "7.0.1-SNAPSHOT", milestoneRepository: REPO },
        { octokit: octokit({ token: "the-token" }) },
      );
      // Octokit sends a token the way GitHub's own documentation does
      expect(fake.requests[0].headers.authorization).toBe("token the-token");
    });

    it("send no token if there is none", async () => {
      fake.requests.length = 0;
      await release("7.0.1-SNAPSHOT");
      expect(fake.requests[0].headers.authorization).toBeUndefined();
    });

    it("read every page of milestones", async () => {
      const many = Array.from({ length: 250 }, (_, i) => ({
        number: i,
        title: `1.0.${i + 1}`,
        state: "open",
        due_on: "2027-01-01T12:00:00Z",
      }));
      const other = await startFakeGitHub({ milestones: many });
      try {
        const result = await run(
          { snapshotVersion: "1.0.230-SNAPSHOT", milestoneRepository: REPO },
          { octokit: createOctokit({ baseUrl: other.url }) },
        );
        expect(result.releaseVersion).toBe("1.0.230");
        expect(other.requests).toHaveLength(3);
      } finally {
        await other.close();
      }
    });

    it("report a repository that is not found", async () => {
      await expect(
        release("7.0.1-SNAPSHOT", { milestoneRepository: "missing/missing" }),
      ).rejects.toThrow(/failed with 404.*cannot read it/);
    });
  });
});

describe("noTrainSummary", () => {
  const server = "https://github.com";
  it("links to create a milestone that does not exist", () => {
    expect(
      noTrainSummary({ candidate: "7.0.9", repository: "acme/widgets" }),
    ).toBe(
      [
        "### 7.0.9 is not in a release train",
        "",
        "acme/widgets has no milestone 7.0.9.",
        "",
        `To add it to a release train, [create the milestone 7.0.9](${server}/acme/widgets/milestones/new) in acme/widgets with a due date that matches a release train: the name of its branch in the release train repository is its date (the train 2026.11.19 is due 2026-11-19), and run the workflow again.`,
        "",
      ].join("\n"),
    );
  });

  it("links to set the due date of a milestone that has none", () => {
    const summary = noTrainSummary({
      candidate: "7.2.0-M1",
      repository: "acme/widgets",
      milestone: { html_url: `${server}/acme/widgets/milestone/12` },
    });
    expect(summary).toContain("has no due date.");
    expect(summary).toContain(
      `[set its due date](${server}/acme/widgets/milestone/12/edit)`,
    );
  });

  it("names the OSS version of a hotfix, and says where its milestone is", () => {
    const summary = noTrainSummary({
      candidate: "7.0.1.1",
      repository: "acme/widgets-commercial",
    });
    expect(summary).toContain(
      "7.0.1.1 is a hotfix of the OSS version 7.0.1, and is released from the commercial repository: its milestone is in acme/widgets-commercial, not in the OSS repository.",
    );
  });
});

// The actions run as programs: the sources, and the bundle that GitHub runs (dist/).
describe.each([["src/index.js"], ["dist/index.js"]])(
  "the program %s",
  (entry) => {
    let fake;
    beforeAll(async () => {
      fake = await startFakeGitHub();
    });
    afterAll(() => fake.close());

    const inputs = (snapshotVersion, more = {}) => ({
      "snapshot-version": snapshotVersion,
      "milestone-repository": REPO,
      ...more,
    });

    it("writes its outputs", async () => {
      const result = await runAction(entry, inputs("7.1.0-SNAPSHOT"), {
        GITHUB_API_URL: fake.url,
      });
      expect(result.code).toBe(0);
      expect(result.outputs).toEqual({
        found: "true",
        "release-version": "7.1.0-RC1",
        "due-date": "2026-11-19",
        "milestone-url": `https://github.com/${REPO}/milestone/8`,
      });
    });

    it("allows a missing due date when told to", async () => {
      const result = await runAction(
        entry,
        inputs("7.2.0-SNAPSHOT", { "require-due-date": "false" }),
        {
          GITHUB_API_URL: fake.url,
        },
      );
      expect(result.code).toBe(0);
      expect(result.outputs).toEqual({
        found: "true",
        "release-version": "7.2.0-M1",
        "due-date": "",
        "milestone-url": `https://github.com/${REPO}/milestone/12`,
      });
    });

    it("says in the summary how to add the version to a train", async () => {
      const summary = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), "summary-")),
        "summary.md",
      );
      for (const [version, expected] of [
        ["7.0.9-SNAPSHOT", "[create the milestone 7.0.9]"],
        ["7.2.0-SNAPSHOT", "[set its due date]"],
      ]) {
        await runAction(entry, inputs(version), {
          GITHUB_API_URL: fake.url,
          GITHUB_STEP_SUMMARY: summary,
        });
        expect(fs.readFileSync(summary, "utf8")).toContain(expected);
      }
    });

    it("fails with an error that GitHub shows", async () => {
      const result = await runAction(entry, inputs("7.2.0-SNAPSHOT"), {
        GITHUB_API_URL: fake.url,
      });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        "::error::The milestone 7.2.0-M1 of tutorial/spring-merge has no due date",
      );
      expect(result.outputs).toEqual({});
    });

    it("fails if the milestone does not exist", async () => {
      const result = await runAction(entry, inputs("7.0.9-SNAPSHOT"), {
        GITHUB_API_URL: fake.url,
      });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        "::error::tutorial/spring-merge has no milestone 7.0.9",
      );
      expect(result.outputs).toEqual({});
    });

    it("fails if there is no open milestone for a .0 version", async () => {
      const result = await runAction(entry, inputs("7.7.0-SNAPSHOT"), {
        GITHUB_API_URL: fake.url,
      });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        "::error::tutorial/spring-merge has no open milestone for 7.7.0",
      );
    });

    it.each([
      ["7.0.9-SNAPSHOT", "tutorial/spring-merge has no milestone 7.0.9"],
      [
        "7.7.0-SNAPSHOT",
        "tutorial/spring-merge has no open milestone for 7.7.0",
      ],
    ])(
      "ends with a notice for %s if told not to fail",
      async (version, message) => {
        const result = await runAction(
          entry,
          inputs(version, { "fail-if-missing": "false" }),
          { GITHUB_API_URL: fake.url },
        );
        expect(result.code).toBe(0);
        expect(result.stdout).toContain(
          `::notice title=No milestone::${message}`,
        );
        expect(result.stdout).toContain("so nothing is built");
        expect(result.outputs).toEqual({
          found: "false",
          "release-version": "",
          "due-date": "",
          "milestone-url": "",
        });
      },
    );

    it("still fails without a due date if told not to fail if missing", async () => {
      const result = await runAction(
        entry,
        inputs("7.2.0-SNAPSHOT", { "fail-if-missing": "false" }),
        { GITHUB_API_URL: fake.url },
      );
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("::error::The milestone 7.2.0-M1");
    });

    it("fails if an input is wrong", async () => {
      const result = await runAction(
        entry,
        inputs("7.1.0-SNAPSHOT", { "require-due-date": "maybe" }),
        {
          GITHUB_API_URL: fake.url,
        },
      );
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("must be true or false");
    });
  },
);
