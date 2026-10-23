import * as core from "@actions/core";
import { git } from "./git.js";
import { execute, isMain } from "./run.js";

export const BOT_NAME = "github-actions[bot]";
export const BOT_EMAIL =
  "41898282+github-actions[bot]@users.noreply.github.com";

/**
 * Sets who commits in a repository (user.name and user.email of its own configuration, not
 * the global one). Its default is github-actions[bot], whose commits GitHub shows with the
 * avatar of GitHub Actions.
 */
export function setIdentity({ directory, name, email }) {
  for (const [what, value] of [
    ["name", name],
    ["email", email],
  ]) {
    if (!value || /[\r\n]/.test(value)) {
      throw new Error(
        `The ${what} of the identity must be one line, not "${value}"`,
      );
    }
  }
  git(directory, "config", "user.name", name);
  git(directory, "config", "user.email", email);
  return { name, email };
}

export async function main() {
  const { name, email } = setIdentity({
    directory: core.getInput("path") || ".",
    name: core.getInput("name") || BOT_NAME,
    email: core.getInput("email") || BOT_EMAIL,
  });
  core.info(`Commits are made as ${name} <${email}>`);
}

if (isMain(import.meta.url)) {
  execute(main);
}
