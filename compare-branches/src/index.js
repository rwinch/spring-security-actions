import * as core from "@actions/core";
import { git, gitTry } from "./git.js";
import { execute, isMain } from "./run.js";

/**
 * Whether the branch that is checked out (or another commit, head) has changes that a
 * branch of the remote origin lacks: the difference since their merge base, as
 * `git diff base...head` gives it. That is what the hotfix of an active embargoed branch has that
 * the frozen embargoed branch does not: the merge of the frozen branch into the active one
 * is a commit, but it has no changes of its own, and a frozen branch that is ahead of an
 * active branch that did not change is not a change of the active branch either.
 *
 * - If the branch of the remote does not exist (the frozen embargoed branch has not been
 *   pushed yet), there is nothing to compare with: it is different, and said in a notice.
 * - If head is not a commit, or the two have no merge base, it fails.
 *
 * It returns different: true or false, and exists: false if the branch of the remote does
 * not exist.
 */
export function compareBranches({ directory, base, head = "HEAD" }) {
  if (!base) {
    throw new Error(
      "The input base is required, for example embargoed/frozen/7.0.x",
    );
  }
  const baseRef = `refs/remotes/origin/${base}`;
  const exists = gitTry(
    directory,
    "rev-parse",
    "--verify",
    "--quiet",
    `${baseRef}^{commit}`,
  );
  if (exists.code !== 0) {
    return { different: true, exists: false };
  }
  const headExists = gitTry(
    directory,
    "rev-parse",
    "--verify",
    "--quiet",
    `${head}^{commit}`,
  );
  if (headExists.code !== 0) {
    throw new Error(`${head} is not a commit of the repository`);
  }
  const diff = gitTry(directory, "diff", "--quiet", `${baseRef}...${head}`);
  if (diff.code === 0) {
    return { different: false, exists: true };
  }
  if (diff.code === 1) {
    return { different: true, exists: true };
  }
  throw new Error(
    `git diff ${baseRef}...${head} failed: ${diff.stderr || `exit code ${diff.code}`}`,
  );
}

export async function main() {
  const directory = core.getInput("path") || ".";
  const base = core.getInput("base");
  const head = core.getInput("head") || "HEAD";
  const result = compareBranches({ directory, base, head });
  const current =
    head === "HEAD"
      ? gitTry(directory, "branch", "--show-current").stdout || "HEAD"
      : head;
  if (!result.exists) {
    core.notice(
      `${base} does not exist, so there is nothing to compare ${current} with: the hotfix is built from ${current} alone`,
      { title: "No frozen embargoed branch" },
    );
  } else if (!result.different) {
    core.notice(
      `${current} has nothing that ${base} lacks (git diff ${base}...${current} is empty, as after a merge of ${base} into it): no hotfix is built`,
      { title: "Nothing to build" },
    );
  } else {
    core.info(
      `${current} has changes that ${base} lacks (${git(directory, "rev-list", "--count", `refs/remotes/origin/${base}..${head}`)} commits that it does not have): the hotfix is built`,
    );
  }
  core.setOutput("different", String(result.different));
}

if (isMain(import.meta.url)) {
  execute(main);
}
