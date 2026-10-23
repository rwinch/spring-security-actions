import fs from "node:fs";
import * as core from "@actions/core";
import { execute, isMain, TitledError } from "./run.js";

/**
 * Fails if the project has released the version in the release train already: its entry in
 * train.yml (releases.<project>."<version>") has commit-hashes.ready. A release that is
 * ready is not changed any more, so building its branch again would be a mistake. The
 * message says what to do instead.
 *
 * It returns whether the train has the release, ready or not.
 */
export function checkNotReady({ train, project, version, trainBranch }) {
  const entry = train?.releases?.[project]?.[version];
  if (entry?.["commit-hashes"]?.ready) {
    throw new TitledError(
      `${project} ${version} is ready`,
      `${project} ${version} is ready in the release train ${trainBranch}, and is not changed any more, so release/${version} was not built. To release the next version instead: set the version of gradle.properties to the next version in the OSS repository, and merge forward, so that the next push is for the next release.`,
    );
  }
  return entry !== undefined;
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
  const project = core.getInput("project", { required: true });
  const version = core.getInput("version", { required: true });
  const known = checkNotReady({
    train,
    project,
    version,
    trainBranch: core.getInput("train-branch") || "(unknown)",
  });
  core.info(
    known
      ? `${project} ${version} is in the release train, and is not ready yet`
      : `${project} ${version} is not in the release train yet`,
  );
}

if (isMain(import.meta.url)) {
  execute(main);
}
