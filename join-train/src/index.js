import fs from "node:fs";
import * as core from "@actions/core";
import { createOctokit, parseRepository } from "./octokit.js";
import { execute, isMain } from "./run.js";
import { addSummary } from "./summary.js";

export const JOIN_WORKFLOW = "release-train-join.yml";

/**
 * Joins a release of the project to the release train, by running the workflow
 * release-train-join.yml of the project (Release Train - Join) on the release branch. That
 * workflow has the token of the project for the release train, which this one does not
 * need, gives the destination and the commit of the release branch to the Join workflow of
 * the release train repository, and waits for it. It is told the destination (Maven
 * Central, Spring Enterprise or Spring Enterprise Extended), the branch of the train and
 * the release train repository.
 *
 * It does nothing if the release has joined already (its entry in train.yml,
 * releases.<project>."<version>", has commit-hashes.joined), so a run that is made again
 * does not join twice.
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
  },
  { octokit },
) {
  const entry = train?.releases?.[project]?.[version];
  if (entry?.["commit-hashes"]?.joined) {
    return { joined: false, reason: "already-joined" };
  }
  const { owner, repo } = parseRepository(releaseRepository);
  try {
    await octokit.rest.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: JOIN_WORKFLOW,
      ref: releaseBranch,
      inputs: {
        "deployment-destination": deploymentDestination,
        "release-train": trainBranch,
        "release-train-repository": trainRepository,
      },
    });
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      throw new Error(
        `Could not run ${JOIN_WORKFLOW} on ${releaseBranch} in ${releaseRepository}: the workflow must be on that branch, and the token needs Actions: Read and write on the repository (a fine-grained token) or the scope repo (a classic one) (${error.status} ${error.message})`,
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
  joinUrl,
}) {
  const name = `release train ${trainBranch}`;
  const text = trainUrl ? `[${name}](${trainUrl})` : name;
  switch (outcome) {
    case "joined":
      return `Joined the ${text}: dispatched ${joinUrl ? `[Release Train - Join](${joinUrl})` : "Release Train - Join"} of ${releaseBranch} (${destination})`;
    case "already-joined":
      return `Already in the ${text}: not joined again`;
    default:
      return `Not joined: the ${name} has not been created`;
  }
}

/**
 * The runs of the workflow Release Train - Join of the project on the release branch.
 * Dispatching a workflow does not say which run it made, so this is the list of them, the
 * newest first.
 */
export function joinRunsUrl({ serverUrl, repository, branch }) {
  return `${serverUrl.replace(/\/$/, "")}/${repository}/actions/workflows/${JOIN_WORKFLOW}?query=branch%3A${encodeURIComponent(branch)}`;
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
    `${summaryLine({
      outcome,
      trainBranch,
      trainUrl,
      releaseBranch,
      destination,
      joinUrl: joinRunsUrl({
        serverUrl: process.env.GITHUB_SERVER_URL || "https://github.com",
        repository: core.getInput("release-repository", { required: true }),
        branch: releaseBranch,
      }),
    })}\n`,
  );
}

if (isMain(import.meta.url)) {
  execute(main);
}
