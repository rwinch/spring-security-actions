import * as core from "@actions/core";
import { execute, isMain } from "./run.js";

const SNAPSHOT_VERSION = /^(\d+\.\d+\.\d+(?:\.\d+)?)-SNAPSHOT$/;
const HOTFIX = /^\d+\.\d+\.\d+\.\d+$/;

/**
 * Decides what the push of a disclosure branch builds, from the branch that was pushed
 * (disclosure/frozen/<generation> or disclosure/active/<generation>) and the version of
 * gradle.properties on it (<version>-SNAPSHOT). It returns:
 *
 *   release           false if there is nothing to build: a version that ends with .0 on an
 *                     active disclosure is not a patch release, so it has no hotfix.
 *                     Everything else below is only there if it is true
 *   kind              frozen or active
 *   baseVersion       the snapshot version that the release version is worked out from: the
 *                     version of the frozen branch (7.0.1-SNAPSHOT), or the hotfix version
 *                     of an active one (7.0.1.1-SNAPSHOT)
 *   hotfix            true for an active disclosure: a hotfix is built, and hotfix versions
 *                     of the dependencies are preferred
 *   hotfixOf          for a hotfix, the release branch that it fixes and is built on:
 *                     release/7.0.1 for 7.0.1-SNAPSHOT. Empty for a frozen disclosure
 *   snapshotBranch    the branch of the snapshot that the release branch is built on (active)
 *                     or that is thrown away (frozen): disclosure/7.0.1-INTERNAL-SNAPSHOT,
 *                     disclosure/7.0.1.1-SNAPSHOT
 *   snapshotVersion   the version of that branch: 7.0.1-INTERNAL-SNAPSHOT, 7.0.1.1-SNAPSHOT.
 *                     A snapshot never carries a milestone or a release candidate, so it is the
 *                     version of the branch with -SNAPSHOT replaced, and not the release.
 *                     A hotfix never has an internal snapshot
 */
export function plan({ refName, version }) {
  let kind;
  if (refName.startsWith("disclosure/frozen/")) {
    kind = "frozen";
  } else if (refName.startsWith("disclosure/active/")) {
    kind = "active";
  } else {
    throw new Error(
      `${refName} is not a disclosure branch: expected disclosure/frozen/* or disclosure/active/*`,
    );
  }
  const match = SNAPSHOT_VERSION.exec(version);
  if (!match) {
    throw new Error(
      `${refName} has the version ${version}: expected <major>.<minor>.<patch>-SNAPSHOT`,
    );
  }
  const plain = match[1];

  if (kind === "frozen") {
    if (HOTFIX.test(plain)) {
      throw new Error(
        `${refName} has the version ${version}, a hotfix: only an active disclosure has one, and a hotfix has no internal snapshot`,
      );
    }
    return {
      release: true,
      kind,
      baseVersion: version,
      hotfix: false,
      hotfixOf: "",
      snapshotBranch: `disclosure/${plain}-INTERNAL-SNAPSHOT`,
      snapshotVersion: `${plain}-INTERNAL-SNAPSHOT`,
    };
  }

  if (HOTFIX.test(plain)) {
    throw new Error(
      `${refName} has the version ${version}, which is a hotfix already: an active disclosure has the version of the release that it fixes`,
    );
  }
  if (plain.endsWith(".0")) {
    return { release: false, kind };
  }
  const hotfix = `${plain}.1`;
  return {
    release: true,
    kind,
    baseVersion: `${hotfix}-SNAPSHOT`,
    hotfix: true,
    hotfixOf: `release/${plain}`,
    snapshotBranch: `disclosure/${hotfix}-SNAPSHOT`,
    snapshotVersion: `${hotfix}-SNAPSHOT`,
  };
}

const OUTPUTS = {
  release: "release",
  kind: "kind",
  baseVersion: "base-version",
  hotfix: "hotfix",
  hotfixOf: "hotfix-of",
  snapshotBranch: "snapshot-branch",
  snapshotVersion: "snapshot-version",
};

export async function main() {
  const refName = core.getInput("ref-name", { required: true });
  const version = core.getInput("version", { required: true });
  const result = plan({ refName, version });
  if (!result.release) {
    core.info(
      `${refName} has the version ${version}, which is not a patch release: it has no hotfix, so there is nothing to build`,
    );
  } else if (result.kind === "frozen") {
    core.info(
      `${refName} is a frozen disclosure: the release of ${version}, and the internal snapshot of it`,
    );
  } else {
    core.info(
      `${refName} is an active disclosure: the hotfix ${result.baseVersion.replace("-SNAPSHOT", "")} of ${version}`,
    );
  }
  for (const [key, name] of Object.entries(OUTPUTS)) {
    if (key in result) {
      core.setOutput(name, String(result[key]));
    }
  }
}

if (isMain(import.meta.url)) {
  execute(main);
}
