import fs from "node:fs";
import * as core from "@actions/core";
import { createOctokit, parseRepository } from "./octokit.js";
import { execute, isMain } from "./run.js";
import { addSummary } from "./summary.js";

/**
 * Joins a release of the project to the release train, by running the workflow Join.yml
 * of the release train repository on the branch of the train. It does nothing if the
 * release has joined already (its entry in train.yml, releases.<project>."<version>",
 * has commit-hashes.joined), so a run that is made again does not join twice.
 *
 * It returns { joined: false, reason } or { joined: true }, and does not fail for a
 * release that is not to be joined.
 */
export async function run(
  {
    trainRepository,
    trainBranch,
    train,
    project,
    version,
    releaseRepository,
    releaseBranch,
    deploymentDestination,
    commitHash,
  },
  { octokit },
) {
  const entry = train?.releases?.[project]?.[version];
  if (entry?.["commit-hashes"]?.joined) {
    return { joined: false, reason: "already-joined" };
  }
  const { owner, repo } = parseRepository(trainRepository);
  const inputs = {
    "release-repository": releaseRepository,
    "release-branch": releaseBranch,
    "deployment-destination": deploymentDestination,
  };
  if (commitHash) {
    inputs["commit-hash"] = commitHash;
  }
  try {
    await octokit.rest.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: "join.yml",
      ref: trainBranch,
      inputs,
    });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      throw new Error(
        `Could not dispatch Join in ${trainRepository}: the token needs Actions: Read and write on it (a fine-grained token) or the scope repo (a classic one) (${error.status} ${error.message})`,
      );
    }
    throw error;
  }
  return { joined: true };
}

/**
 * The line of the summary for the outcome: joined now, joined before, or not joined
 * because the train has not been created. The name of the train is a link if it has a URL.
 */
export function summaryLine({
  outcome,
  trainBranch,
  trainUrl,
  releaseBranch,
  destination,
}) {
  const name = `release train ${trainBranch}`;
  const text = trainUrl ? `[${name}](${trainUrl})` : name;
  switch (outcome) {
    case "joined":
      return `Joined the ${text}: dispatched Join of ${releaseBranch} (${destination})`;
    case "already-joined":
      return `Already in the ${text}: not joined again`;
    default:
      return `Not joined: the ${name} has not been created`;
  }
}

export async function main() {
  const trainRepository = core.getInput("release-train-repository", {
    required: true,
  });
  const trainBranch = core.getInput("train-branch", { required: true });
  const trainFound = core.getInput("train-found") !== "false";
  const releaseBranch = core.getInput("release-branch", { required: true });
  const destination = core.getInput("deployment-destination", {
    required: true,
  });
  const trainUrl = core.getInput("train-url");
  if (!trainFound) {
    core.notice(
      `The release train ${trainBranch} has not been created, so the release did not join it`,
      {
        title: "Not joined",
      },
    );
    core.setOutput("joined", "false");
    addSummary(`${summaryLine({ outcome: "no-train", trainBranch })}\n`);
    return;
  }
  const file = core.getInput("train-file", { required: true });
  let train;
  try {
    train = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `The train file ${file} cannot be read as JSON: ${error.message}`,
    );
  }
  const project = core.getInput("project", { required: true });
  const version = core.getInput("version", { required: true });
  const octokit = createOctokit({ token: core.getInput("token") });
  const result = await run(
    {
      trainRepository,
      trainBranch,
      train,
      project,
      version,
      releaseRepository: core.getInput("release-repository", {
        required: true,
      }),
      releaseBranch,
      deploymentDestination: destination,
      commitHash: core.getInput("commit-hash"),
    },
    { octokit },
  );
  core.setOutput("joined", String(result.joined));
  const outcome = result.joined ? "joined" : "already-joined";
  core.info(
    result.joined
      ? `Joined ${project} ${version} to the release train ${trainBranch}`
      : `${project} ${version} is in the release train ${trainBranch} already`,
  );
  addSummary(
    `${summaryLine({ outcome, trainBranch, trainUrl, releaseBranch, destination })}\n`,
  );
}

if (isMain(import.meta.url)) {
  execute(main);
}
