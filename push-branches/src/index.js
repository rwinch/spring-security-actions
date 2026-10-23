import * as core from "@actions/core";
import { git } from "./git.js";
import { execute, isMain } from "./run.js";
import { addSummary, table } from "./summary.js";

/**
 * The branches to push from the lines of the input: branch=version, one per line, where the
 * version is what the summary says the branch has.
 */
export function parseBranches(text) {
  const branches = (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.lastIndexOf("=");
      if (at <= 0 || at === line.length - 1) {
        throw new Error(`"${line}" is not branch=version`);
      }
      return { branch: line.slice(0, at), version: line.slice(at + 1) };
    });
  if (branches.length === 0) {
    throw new Error(
      "The input branches is required: branch=version, one per line",
    );
  }
  return branches;
}

/**
 * Pushes the branches at once, or none (git push --atomic), so that a failure never leaves
 * one of them built and the others not. It is forced, because the branches are built
 * again from the pushed commit every time. It returns, for every branch, how many commits
 * it has on the pushed commit.
 */
export function pushBranches({ directory, remote = "origin", branches, base }) {
  const counts = branches.map(({ branch }) =>
    Number(git(directory, "rev-list", "--count", `${base}..${branch}`)),
  );
  git(
    directory,
    "push",
    "--atomic",
    "--force",
    remote,
    ...branches.map((b) => b.branch),
  );
  return branches.map((b, i) => ({ ...b, commits: counts[i] }));
}

export async function main() {
  const base = core.getInput("base") || process.env.GITHUB_SHA;
  if (!base) {
    throw new Error("The input base is required: the commit that was pushed");
  }
  const pushed = pushBranches({
    directory: core.getInput("path") || ".",
    remote: core.getInput("remote") || "origin",
    branches: parseBranches(core.getInput("branches")),
    base,
  });
  for (const { branch, version, commits } of pushed) {
    core.info(
      `Pushed ${branch} (${version}): ${commits} commits on ${base.slice(0, 7)}`,
    );
  }
  addSummary(
    [
      `### ${core.getInput("title") || process.env.GITHUB_REF_NAME || "Branches"}`,
      "",
      table(
        ["Branch", "Version", "Commits on the pushed commit"],
        pushed.map(({ branch, version, commits }) => [
          `\`${branch}\``,
          version,
          commits,
        ]),
      ),
    ].join("\n"),
  );
}

if (isMain(import.meta.url)) {
  execute(main);
}
