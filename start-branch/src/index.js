import * as core from "@actions/core";
import { git, gitTry } from "./git.js";
import { execute, isMain } from "./run.js";

/**
 * Starts a branch at a commit or another branch, and switches to it. The branch is reset
 * if it exists: the branches that the release workflow builds are built again from the
 * pushed commit every time. Nothing of the working tree is kept: it is the working tree
 * of the commit.
 *
 * It returns the commit that the branch is at.
 */
export function startBranch({ directory, branch, from }) {
  if (!branch) {
    throw new Error("The input branch is required");
  }
  if (!from) {
    throw new Error("The input from is required");
  }
  if (gitTry(directory, "check-ref-format", "--branch", branch).code !== 0) {
    throw new Error(`${branch} is not the name of a branch`);
  }
  const start = gitTry(
    directory,
    "rev-parse",
    "--verify",
    "--quiet",
    `${from}^{commit}`,
  );
  if (start.code !== 0) {
    throw new Error(`${from} is not a commit or a branch of this repository`);
  }
  git(directory, "switch", "--quiet", "-C", branch, start.stdout);
  return git(directory, "rev-parse", "HEAD");
}

export async function main() {
  const branch = core.getInput("branch", { required: true });
  const from = core.getInput("from", { required: true });
  const commit = startBranch({
    directory: core.getInput("path") || ".",
    branch,
    from,
  });
  core.info(`${branch} starts at ${from}: ${commit.slice(0, 7)}`);
  core.setOutput("commit", commit);
}

if (isMain(import.meta.url)) {
  execute(main);
}
