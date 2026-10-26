import fs from "node:fs";
import * as core from "@actions/core";
import { call, createOctokit, parseRepository } from "./octokit.js";
import { execute, isMain, TitledError } from "./run.js";

// A milestone is due at noon UTC, which is the same day in every time zone.
const NOON = "T12:00:00Z";

/**
 * The commercial general availability of a train (schedule.publication.
 * commercial-general-availability of train.yml), YYYY-MM-DD. YAML reads a date as a date,
 * so after the conversion to JSON it may be a timestamp: only its date is kept.
 */
export function commercialAvailability(train, trainBranch) {
  const value =
    train?.schedule?.publication?.["commercial-general-availability"];
  const date = value ? new Date(value).toISOString().slice(0, 10) : "";
  if (!date) {
    throw new TitledError(
      "No commercial-general-availability",
      `The train ${trainBranch} has no schedule.publication.commercial-general-availability, so the due date of the milestone is not set`,
    );
  }
  return date;
}

/**
 * Makes the due date of the milestone of a hotfix the commercial general availability of
 * its train: a hotfix is built in the train of its OSS equivalent, and is available to
 * customers on the date that the train says. It returns { changed, dueDate, previous }.
 * A milestone that does not exist is an error.
 */
export async function run(
  { train, trainBranch, milestoneRepository, milestone },
  { octokit },
) {
  const dueDate = commercialAvailability(train, trainBranch);
  const { owner, repo } = parseRepository(milestoneRepository);
  const milestones = await call(
    `Reading the milestones of ${milestoneRepository}`,
    octokit.paginate(octokit.rest.issues.listMilestones, {
      owner,
      repo,
      state: "all",
      per_page: 100,
    }),
  );
  const found = milestones.find((m) => m.title === milestone);
  if (!found) {
    throw new Error(
      `${milestoneRepository} has no milestone ${milestone}, so its due date cannot be set`,
    );
  }
  const previous = found.due_on ? found.due_on.slice(0, 10) : "";
  if (previous === dueDate) {
    return { changed: false, dueDate, previous };
  }
  await call(
    `Setting the due date of the milestone ${milestone} of ${milestoneRepository}`,
    octokit.rest.issues.updateMilestone({
      owner,
      repo,
      milestone_number: found.number,
      due_on: `${dueDate}${NOON}`,
    }),
  );
  return { changed: true, dueDate, previous };
}

export async function main() {
  const file = core.getInput("train-file", { required: true });
  let train;
  try {
    train = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `The train file ${file} cannot be read as JSON: ${error.message}`,
    );
  }
  const trainBranch = core.getInput("train-branch") || "(unknown)";
  const milestoneRepository = core.getInput("milestone-repository", {
    required: true,
  });
  const milestone = core.getInput("milestone", { required: true });
  const octokit = createOctokit({ token: core.getInput("token") });
  const result = await run(
    { train, trainBranch, milestoneRepository, milestone },
    { octokit },
  );
  core.setOutput("due-date", result.dueDate);
  core.setOutput("changed", String(result.changed));
  if (result.changed) {
    core.notice(
      `The milestone ${milestone} of ${milestoneRepository} was due ${result.previous || "on no date"} and is now due ${result.dueDate}: the commercial-general-availability of the train ${trainBranch}`,
      { title: "Milestone due date" },
    );
  } else {
    core.info(
      `The milestone ${milestone} is due ${result.dueDate}, the commercial-general-availability of the train ${trainBranch}`,
    );
  }
}

if (isMain(import.meta.url)) {
  execute(main);
}
