import * as core from "@actions/core";
import { parseBoolean } from "./inputs.js";
import { call, createOctokit, parseRepository } from "./octokit.js";
import { execute, isMain } from "./run.js";
import { addSummary } from "./summary.js";

const SNAPSHOT = "-SNAPSHOT";

// The milestones of a repository ("owner/repo"), all pages. A milestone has a title, a
// state and due_on (an ISO timestamp in UTC, or null). The state is open, closed or all.
function listMilestones(octokit, repository, state) {
  const { owner, repo } = parseRepository(repository);
  return call(
    `Reading the milestones of ${repository} (${state})`,
    octokit.paginate(octokit.rest.issues.listMilestones, {
      owner,
      repo,
      state,
      per_page: 100,
    }),
  );
}

/** The milestone exists, but has no due date: it carries what the summary links to. */
class NoDueDateError extends Error {
  constructor(message, milestone) {
    super(message);
    this.milestone = milestone;
  }
}

const SERVER = () =>
  (process.env.GITHUB_SERVER_URL || "https://github.com").replace(/\/+$/, "");

const TRAIN_HELP =
  "a due date that matches a release train: the name of its branch in the release train repository is its date (the train 2026.11.19 is due 2026-11-19)";

/**
 * The summary for a release that cannot join a release train yet, because its milestone
 * does not exist or has no due date: what to create or change, with links to do it. A
 * hotfix (7.0.1.1) is released from the commercial repository, so its milestone is
 * created there, and the summary names the OSS version it is a hotfix of.
 */
export function noTrainSummary({ candidate, repository, milestone }) {
  const hotfix = /^\d+\.\d+\.\d+\.\d+$/.test(candidate)
    ? candidate.slice(0, candidate.lastIndexOf("."))
    : undefined;
  const lines = [`### ${candidate} is not in a release train`, ""];
  if (milestone) {
    lines.push(
      `The milestone ${candidate} of ${repository} has no due date.`,
      "",
      `To add it to a release train, [set its due date](${milestone.html_url}/edit) to ${TRAIN_HELP}, and run the workflow again.`,
    );
  } else {
    lines.push(
      `${repository} has no milestone ${candidate}.`,
      "",
      `To add it to a release train, [create the milestone ${candidate}](${SERVER()}/${repository}/milestones/new) in ${repository} with ${TRAIN_HELP}, and run the workflow again.`,
    );
  }
  if (hotfix) {
    lines.push(
      "",
      `${candidate} is a hotfix of the OSS version ${hotfix}, and is released from the commercial repository: its milestone is in ${repository}, not in the OSS repository.`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The version a snapshot version is going to be released as, before looking at the
 * milestones: 7.0.1-SNAPSHOT gives 7.0.1. A snapshot version never carries a
 * milestone (M) or a release candidate (RC), so only numbers are accepted.
 */
export function candidateOf(snapshotVersion) {
  const version = (snapshotVersion ?? "").trim();
  if (!version.endsWith(SNAPSHOT)) {
    throw new Error(
      `"${version}" is not a snapshot version: it must end with ${SNAPSHOT}`,
    );
  }
  const candidate = version.slice(0, -SNAPSHOT.length);
  if (!/^\d+\.\d+\.\d+(\.\d+)?$/.test(candidate)) {
    throw new Error(
      `Cannot get a release version from "${version}": expected <major>.<minor>.<patch>[.<hotfix>]${SNAPSHOT}`,
    );
  }
  return candidate;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The order of the releases of a version: its milestones, then its release candidates,
// then the version itself.
function releaseOrder(title, candidate) {
  const match = title.slice(candidate.length).match(/^-(M|RC)(\d+)$/);
  if (!match) {
    return [2, 0];
  }
  return [match[1] === "M" ? 0 : 1, Number(match[2])];
}

function byDueDateThenRelease(candidate) {
  return (a, b) => {
    // A milestone without a due date comes last.
    const dueA = a.due_on ? Date.parse(a.due_on) : Infinity;
    const dueB = b.due_on ? Date.parse(b.due_on) : Infinity;
    if (dueA !== dueB) {
      return dueA < dueB ? -1 : 1;
    }
    const [kindA, numberA] = releaseOrder(a.title, candidate);
    const [kindB, numberB] = releaseOrder(b.title, candidate);
    return kindA - kindB || numberA - numberB;
  };
}

/**
 * Works out the version a snapshot version is released as, and when, from the
 * milestones of a repository:
 *
 * - 7.0.1-SNAPSHOT is released as 7.0.1.
 * - 7.1.0-SNAPSHOT is a .0 version: it is released as one of its milestones
 *   (7.1.0-M1, 7.1.0-RC1) or as 7.1.0 itself. The open milestone with the earliest
 *   due date of those is next.
 *
 * The due date is a date in UTC (a milestone is due at noon UTC, so it is the same
 * day in every time zone). It fails if the milestone has no due date, unless
 * requireDueDate is false. If the milestone does not exist, it does not fail: it
 * returns { found: false, message }, and the caller decides what to do. With releaseOnly,
 * a .0 version whose next milestone is a milestone or a release candidate (7.2.0-RC1) is
 * not found either: only the release itself (7.2.0) is, as a hotfix is only made of that.
 */
export async function run(
  {
    snapshotVersion,
    milestoneRepository,
    requireDueDate = true,
    releaseOnly = false,
  },
  { octokit },
) {
  const candidate = candidateOf(snapshotVersion);
  let milestone;
  if (candidate.endsWith(".0")) {
    const pattern = new RegExp(`^${escapeRegExp(candidate)}(-(M|RC)\\d+)?$`);
    const open = await listMilestones(octokit, milestoneRepository, "open");
    const matching = open
      .filter((m) => pattern.test(m.title))
      .sort(byDueDateThenRelease(candidate));
    if (matching.length === 0) {
      return {
        found: false,
        candidate,
        message: `${milestoneRepository} has no open milestone for ${candidate}: expected ${candidate}, ${candidate}-M<n> or ${candidate}-RC<n>, so nothing is built`,
      };
    }
    if (releaseOnly && matching[0].title !== candidate) {
      return {
        found: false,
        candidate,
        notice: "No release",
        message: `The next release of ${candidate} in ${milestoneRepository} is ${matching[0].title}, and not ${candidate}, which is the only one that has a hotfix, so nothing is built`,
      };
    }
    milestone = matching[0];
  } else {
    const all = await listMilestones(octokit, milestoneRepository, "all");
    milestone = all.find((m) => m.title === candidate);
    if (!milestone) {
      return {
        found: false,
        candidate,
        message: `${milestoneRepository} has no milestone ${candidate}, so nothing is built`,
      };
    }
  }

  const dueDate = milestone.due_on
    ? new Date(milestone.due_on).toISOString().slice(0, 10)
    : "";
  if (!dueDate && requireDueDate) {
    throw new NoDueDateError(
      `The milestone ${milestone.title} of ${milestoneRepository} has no due date (set require-due-date to false to allow that)`,
      milestone,
    );
  }
  return {
    found: true,
    releaseVersion: milestone.title,
    dueDate,
    milestoneUrl: milestone.html_url ?? "",
  };
}

export async function main() {
  const inputs = {
    snapshotVersion: core.getInput("snapshot-version", { required: true }),
    milestoneRepository: core.getInput("milestone-repository", {
      required: true,
    }),
    requireDueDate: parseBoolean(
      "require-due-date",
      core.getInput("require-due-date"),
      true,
    ),
    releaseOnly: parseBoolean(
      "release-only",
      core.getInput("release-only"),
      false,
    ),
    failIfMissing: parseBoolean(
      "fail-if-missing",
      core.getInput("fail-if-missing"),
      true,
    ),
  };
  const octokit = createOctokit({ token: core.getInput("milestone-token") });
  let result;
  try {
    result = await run(inputs, { octokit });
  } catch (error) {
    if (error instanceof NoDueDateError) {
      addSummary(
        noTrainSummary({
          candidate: error.milestone.title,
          repository: inputs.milestoneRepository,
          milestone: error.milestone,
        }),
      );
    }
    throw error;
  }
  if (!result.found) {
    // a milestone that is there, but is not the release, is not one to add to a train
    if (!result.notice) {
      addSummary(
        noTrainSummary({
          candidate: result.candidate,
          repository: inputs.milestoneRepository,
        }),
      );
    }
    if (inputs.failIfMissing) {
      throw new Error(result.message);
    }
    core.notice(result.message, { title: result.notice ?? "No milestone" });
    core.setOutput("found", "false");
    core.setOutput("release-version", "");
    core.setOutput("due-date", "");
    core.setOutput("milestone-url", "");
    return;
  }
  const { releaseVersion, dueDate, milestoneUrl } = result;
  core.info(
    `${inputs.snapshotVersion} is released as ${releaseVersion}, due ${dueDate || "on no date"}`,
  );
  core.setOutput("found", "true");
  core.setOutput("release-version", releaseVersion);
  core.setOutput("due-date", dueDate);
  core.setOutput("milestone-url", milestoneUrl);
}

if (isMain(import.meta.url)) {
  execute(main);
}
