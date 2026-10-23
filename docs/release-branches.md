# The release automation

A push to a disclosure branch of the commercial repository builds the branches of its release, with no one doing it by hand. This is the guide to it: what it builds, what it needs, how to give it the secrets that it needs, and what to do when it fails.

## What a push builds

The reusable workflow [`release-branches.yml`](../.github/workflows/release-branches.yml) of this repository, and the actions that it uses (each is a directory of this repository, with a README). The project calls it for a push to `disclosure/frozen/**` or `disclosure/active/**`. It builds the branches of the release again from the pushed commit, every time, and pushes them once, both or none, forced. Nobody commits to them.

A push to a snapshot branch that it built (`disclosure/*-SNAPSHOT`) is for the project to publish: the pushes are made with `RELEASE_AUTOMATION_TOKEN`, so they run the workflows of the project.

|  | A frozen disclosure, `disclosure/frozen/7.0.x` (`7.0.1-SNAPSHOT`) | An active disclosure, `disclosure/active/7.0.x` (`7.0.1-SNAPSHOT`) |
|---|---|---|
| The release | `release/7.0.1`, from the pushed commit. For a `.0` version (`7.1.0-SNAPSHOT`) the release is the next milestone: `release/7.1.0-RC1` | `release/7.0.1.1`, **from the snapshot branch**: it is the hotfix of `7.0.1` |
| The commits of the release | one for each dependency that the release train asks for, with its issue (`Closes gh-123`), and then `Release 7.0.1` | one for each dependency that has a hotfix version in the train (the others keep the version that the release has), and then `Release 7.0.1.1` |
| The snapshot branch | `disclosure/7.0.1-INTERNAL-SNAPSHOT`: its version, and an internal snapshot of every dependency that has joined the train (no issues). Thrown away when the release is done | `disclosure/7.0.1.1-SNAPSHOT`: `release/7.0.1` merged in first, then the commercial license and the Broadcom headers, its version, and a snapshot of every dependency that has a hotfix version in the train (no issues) |
| Not built | a hotfix (a frozen disclosure has none) | nothing at all for a version that ends with `.0`: it is not a patch release, so it has no hotfix |

### The hotfix is built on the release

A hotfix is the release plus the fixes of the active disclosure, so the snapshot branch of a hotfix starts with `release/7.0.1` **merged in** (a merge commit, `Merge release/7.0.1 into disclosure/7.0.1.1-SNAPSHOT`), and the release of the hotfix is built on that snapshot. Both have the release in their history. The action `merge-release` does it.

- **The release does not exist yet** (the frozen disclosure has not been pushed, so nothing built it): the run warns (**No release to build the hotfix on**), and the hotfix is built from the active disclosure alone. It is built on the release the next time that the active disclosure is pushed after the release exists, for example when the frozen disclosure is merged into it. A hotfix that was built before has an issue for every dependency, and the dependencies that have no hotfix do not need theirs any more: they stay open, and are closed by hand.
- **Both sides changed the same lines**: the side of the active disclosure is kept, and a notice (**Changed on both sides**) says which files both changed. A conflict that cannot be settled like that, a file that one side deleted and the other changed, fails the run, and says to merge `release/7.0.1` into the active disclosure by hand (the merge forward), and push it.
- **The versions of the dependencies come with the release**, so a dependency that has no hotfix version in the release train is left at the version that the release has: no snapshot, no commit and no issue for it in the hotfix. The hotfix ends with the same versions as it would without the merge, and has an issue for each dependency that does have a hotfix.
- A release that is built again later is only picked up by the hotfix the next time that the active disclosure is pushed.

Which versions of the dependencies the release needs comes from the **release train**, a repository with a branch for each release date (`2026.11.19`) that has `release-versions.json` and `train.yml`. The branch is the date that the milestone of the release is due. If that train has not been created, the branches are built without the dependency updates. If the release is **ready** in the train, it is not changed: the run fails and says what to do.

## Calling it

The project has a workflow that the push of the disclosure branches triggers, and that calls this one. The trigger, the concurrency and the permissions are the project's: a called workflow cannot widen the permissions of the caller.

```yaml
name: release-branches

on:
  push:
    branches:
      - "disclosure/frozen/**"
      - "disclosure/active/**"

permissions:
  contents: read

# One run at a time for a branch, and the newest wins: a run only pushes at the very end,
# once, and what it creates on the way (the issues) is found again by the next run.
concurrency:
  group: release-branches-${{ github.ref }}
  cancel-in-progress: true

jobs:
  release-branches:
    uses: spring-io/spring-security-actions/.github/workflows/release-branches.yml@<ref>
    with:
      release-train-repository: ${{ vars.RELEASE_TRAIN_REPOSITORY }}
    secrets:
      RELEASE_AUTOMATION_TOKEN: ${{ secrets.RELEASE_AUTOMATION_TOKEN }}
```

| Input or secret | What it is |
|---|---|
| `release-train-repository` (input) | The release train repository, `owner/repo`. `spring-io/release-train` if it is not given, or empty. |
| `RELEASE_AUTOMATION_TOKEN` (secret) | The token below. A reusable workflow gets only the secrets that its caller gives it. |

`<ref>` is a tag or a commit of this repository. Pin a commit, as for any action that has access to a token. The workflow uses the actions of this repository at a ref that is written in it, so the ref of the caller and the one in the workflow are the same commit when it is pinned.

The workflow runs from the pushed branch, so the workflow of the project must be on every disclosure branch: it comes with the merges forward.

## The secret, the variable, and the tokens

The caller needs one secret and one variable, which are settings of the **commercial repository**:

| Name | Kind | What it is |
|---|---|---|
| `RELEASE_AUTOMATION_TOKEN` | secret | A token that can read the release train repository, create issues in the OSS repository, and push to the commercial repository. See below. |
| `RELEASE_TRAIN_REPOSITORY` | variable | The release train repository, `owner/repo`. The caller gives it as the input `release-train-repository`. If it is not set, the release train is `spring-io/release-train`. |

Everything that can be done with the token of the workflow itself, `GITHUB_TOKEN`, is: the permissions of the workflow are `contents: read`, and it reads the milestones of the OSS repository, which is public. `RELEASE_AUTOMATION_TOKEN` is only used where `GITHUB_TOKEN` cannot:

| Step | Token | Why |
|---|---|---|
| the checkout, and the push of the branches | `RELEASE_AUTOMATION_TOKEN` | it writes to the commercial repository, and a push with it **runs workflows** (the workflows of the project that build the new branches and publish the snapshots). A push with `GITHUB_TOKEN` runs none. |
| `load-train` | `RELEASE_AUTOMATION_TOKEN` | the release train repository is private, and is another repository than this one. |
| `ensure-dependency-issues` | `RELEASE_AUTOMATION_TOKEN` | the issues are in the OSS repository, which is another repository than this one. |
| `compute-release-version` | `GITHUB_TOKEN` | it reads the milestones of the OSS repository, which is public. |

### What the token needs

| Repository | What for | Fine-grained token | Classic token |
|---|---|---|---|
| the release train repository | read its branches and files | **Contents: Read-only** | `repo` |
| the OSS repository | read its milestones, create and read its issues | **Issues: Read and write** | `repo` (`public_repo` for a public repository) |
| the commercial repository | fetch it, and push the branches | **Contents: Read and write** | `repo` |

**A fine-grained token has one owner.** When the three repositories are in one account or one organization (as in the practice repositories), one fine-grained token with those three permissions does. When they are not (the real ones: the release train is in `spring-io`, the others in `spring-projects`), a fine-grained token cannot cover them, and you need a classic token, whose `repo` scope covers every repository that its user can access. Make it the token of a machine user that has the access that it needs, and not that of a person. The scopes are broad, and are the reason to keep the secret in the commercial repository only.

### Create a classic token

1. Go to https://github.com/settings/tokens and choose **Generate new token (classic)**.
1. Give it a name (`release automation`) and an expiration, and select the scope `repo`.
1. Generate it, and copy it. It is shown once.
1. For an organization that uses SAML single sign-on, choose **Configure SSO** next to the token and authorize the organizations of the repositories. Without it the token cannot read them.

### Create a fine-grained token

1. Go to https://github.com/settings/personal-access-tokens and choose **Generate new token**.
1. Choose the **resource owner** that owns the three repositories.
1. Choose **Only select repositories**, and select the release train repository, the OSS repository and the commercial repository.
1. Under **Repository permissions**, set **Contents** to **Read and write** (that is for the commercial repository, and reads the release train too), and **Issues** to **Read and write**. Metadata (read) is added by itself.
1. Generate it, and copy it.

### Store it

In the **commercial repository**, as a secret named `RELEASE_AUTOMATION_TOKEN`: **Settings**, **Secrets and variables**, **Actions**, **New repository secret**. Or with `gh`, which reads the secret from standard input, so that it is not in your history:

```shell
gh secret set RELEASE_AUTOMATION_TOKEN --repo your-organization/spring-security-commercial
gh variable set RELEASE_TRAIN_REPOSITORY --body spring-io/release-train --repo your-organization/spring-security-commercial
```


## When it fails

Every message says what went wrong. These are the usual ones:

| The run fails at | What to do |
|---|---|
| **Stop if the release is ready already** | The release is ready in the release train, and is not changed any more. To release the next version instead: set the version of `gradle.properties` to the next version in the OSS repository, and merge forward. |
| **Work out the release version**: `has no milestone 7.0.1` | Create the milestone of the release in the OSS repository, with a due date. |
| **Work out the release version**: `has no due date` | Set the due date of the milestone. It is the date of the release train, `2026-11-19` for the train `2026.11.19`. |
| **Read the release train**: `404 ... cannot read it` | The token cannot read the release train repository, or `RELEASE_TRAIN_REPOSITORY` is wrong. A train that has not been created is not an error: the branches are built without the dependencies. |
| **Merge the release into the hotfix**: `could not be merged` | The active disclosure and the release changed a file in a way that the side of the active disclosure cannot settle. Merge `release/7.0.1` into the active disclosure by hand (the merge forward), push it, and the hotfix is built again. |
| **Merge the release into the hotfix**: warning `No release to build the hotfix on` | Not a failure: the release has not been built. Push the frozen disclosure, and push the active disclosure again. |
| **Make sure that there are issues**: `403` | The token cannot create issues in the OSS repository: see what it needs. |
| **Work out the versions of the dependencies**: `is newer than the ... of the train` | The version catalog has a newer version of a dependency than the release train. Something is out of order: look at it. The action does not downgrade. |
| **Set the version of the release**: `git does not know who commits` | git has no `user.name` and `user.email`. The workflow sets them, so this is a change to the workflow. |
| **Push the branches**: rejected | The token cannot push to the commercial repository, or a branch is protected against a forced push. Nobody commits to the branches that it builds, so they can be forced. |

A run that was cancelled by a newer push of the same branch is not a failure: the newer run builds the branches.

## What a project needs

- The version catalog, `gradle/libs.versions.toml`, names a version after the project of the release train that releases it (`spring-framework = "7.0.9"`), in its `[versions]` section, one on a line. A library refers to it with `version.ref`.
- The OSS repository has the milestones of the releases, with their due dates (at noon UTC). The commercial repository is named like it, with `-commercial`, and has the disclosure branches.
- `apply-commercial-license` has the commercial license for a hotfix: give another with `license-file`. It changes the Apache headers of the Java, AspectJ, Groovy, Kotlin and JavaScript files and of `gradle.properties` (`header-files`), and replaces the `LICENSE*` file of the root (`license-target`). Where a license is repeated in several modules, make them links to one file.
- The actions are written for Node 24, as the actions of [spring-release-actions](https://github.com/spring-io/spring-release-actions) are. [The README](../README.md) says how to build and test them.
- GitHub is retiring the version `2022-11-28` of its API, which is the one that the actions use. It is a warning for now: see `ensure-dependency-issues`.
