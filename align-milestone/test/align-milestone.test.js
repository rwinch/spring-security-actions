import { describe, expect, it } from "vitest";
import { commercialAvailability, run } from "../src/index.js";

const train = {
  schedule: {
    publication: {
      "oss-general-availability": "2026-10-22",
      "commercial-general-availability": "2026-11-19",
    },
  },
};
const base = {
  train,
  trainBranch: "2026.10.22",
  milestoneRepository: "spring-projects/spring-security-commercial",
  milestone: "7.0.1.1",
};

function fakeOctokit(milestones) {
  const updates = [];
  return {
    updates,
    paginate: async () => milestones,
    rest: {
      issues: {
        listMilestones: () => {},
        updateMilestone: async (request) => {
          updates.push(request);
        },
      },
    },
  };
}
const milestone = (due_on) => ({ number: 7, title: "7.0.1.1", due_on });

describe("align-milestone", () => {
  it("sets a due date that is not the commercial availability of the train, at noon UTC", async () => {
    const octokit = fakeOctokit([
      milestone("2026-11-12T00:00:00Z"),
      { number: 8, title: "7.0.2", due_on: null },
    ]);
    expect(await run(base, { octokit })).toEqual({
      changed: true,
      dueDate: "2026-11-19",
      previous: "2026-11-12",
    });
    expect(octokit.updates).toEqual([
      {
        owner: "spring-projects",
        repo: "spring-security-commercial",
        milestone_number: 7,
        due_on: "2026-11-19T12:00:00Z",
      },
    ]);
  });

  it("sets a due date that is missing", async () => {
    const octokit = fakeOctokit([milestone(null)]);
    const result = await run(base, { octokit });
    expect(result).toMatchObject({ changed: true, previous: "" });
    expect(octokit.updates).toHaveLength(1);
  });

  it("changes nothing if the due date is right", async () => {
    const octokit = fakeOctokit([milestone("2026-11-19T00:00:00Z")]);
    expect((await run(base, { octokit })).changed).toBe(false);
    expect(octokit.updates).toEqual([]);
  });

  it("fails for a milestone that does not exist", async () => {
    await expect(run(base, { octokit: fakeOctokit([]) })).rejects.toThrow(
      "spring-projects/spring-security-commercial has no milestone 7.0.1.1, so its due date cannot be set",
    );
  });

  it("fails with a title for a train without commercial-general-availability", () => {
    let error;
    try {
      commercialAvailability({ schedule: { publication: {} } }, "2026.10.22");
    } catch (caught) {
      error = caught;
    }
    expect(error.title).toBe("No commercial-general-availability");
    expect(error.message).toContain("The train 2026.10.22 has no schedule");
  });

  it("reads a date that was converted to a timestamp", () => {
    expect(
      commercialAvailability(
        {
          schedule: {
            publication: {
              "commercial-general-availability": "2026-11-19T00:00:00.000Z",
            },
          },
        },
        "x",
      ),
    ).toBe("2026-11-19");
  });
});
