import * as core from "@actions/core";
import { execute, isMain } from "./run.js";

const SUFFIX = "-commercial";

/**
 * The names that follow from the repository that runs the workflow. The disclosure
 * branches only exist in the commercial repository (spring-security-commercial), and the
 * project of the release train, and the OSS repository with the milestones and the issues
 * (spring-security), are named after it: its name without -commercial.
 */
export function nameRepositories(repository) {
  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(repository ?? "");
  if (!match) {
    throw new Error(`${repository} is not a repository, expected owner/name`);
  }
  const [, owner, name] = match;
  const project = name.endsWith(SUFFIX) ? name.slice(0, -SUFFIX.length) : name;
  if (!project) {
    throw new Error(`${repository} has no name without ${SUFFIX}`);
  }
  return { owner, project, ossRepository: `${owner}/${project}` };
}

export async function main() {
  const repository =
    core.getInput("repository") || process.env.GITHUB_REPOSITORY;
  const { owner, project, ossRepository } = nameRepositories(repository);
  core.info(
    `${repository}: the project is ${project}, its OSS repository ${ossRepository}`,
  );
  core.setOutput("owner", owner);
  core.setOutput("project", project);
  core.setOutput("oss-repository", ossRepository);
}

if (isMain(import.meta.url)) {
  execute(main);
}
