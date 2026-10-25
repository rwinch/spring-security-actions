# push-branches

Pushes the branches that the workflow built, all at once or none, so that a failure never leaves one of them built and not the others. the release workflow pushes the release branch and the snapshot branch with it, as its last step.

## What it does

- It is forced, because the branches are built again from the pushed commit every time.
- It needs the token of the checkout to be the one that triggers workflows (`RELEASE_AUTOMATION_TOKEN`): the pushes of `GITHUB_TOKEN` do not run the workflows of the new branches.
- The summary of the step has a table of the branches, their versions, and how many commits each has on the pushed commit.

## Inputs

| Input | Default | Description |
|---|---|---|
| `branches` | required | The branches, as `branch=version`, one per line. The version is for the summary. |
| `base` | `GITHUB_SHA` | The commit that was pushed, to count the commits of the branches. |
| `remote` | `origin` | The remote to push to. |
| `title` | `GITHUB_REF_NAME` | The title of the summary. |
| `path` | `.` | The directory of the git repository. |

## Secrets and permissions

It needs no secret of its own. It pushes with the credentials that `actions/checkout` stored, so the checkout must use the token that can push and trigger workflows (`RELEASE_AUTOMATION_TOKEN`, see `.github/RELEASE_AUTOMATION.adoc`), with the permission `contents: write` on the repository.

## Using it

```yaml
- uses: spring-io/spring-security-actions/push-branches@v1
  with:
    branches: |
      release/7.0.1=7.0.1
      embargoed/7.0.1-INTERNAL-SNAPSHOT=7.0.1-INTERNAL-SNAPSHOT
```

## Running it locally

An ordinary Node program (Node 24). `npm ci` once in this directory, then run it with its inputs as `INPUT_<NAME>` variables:

```shell
cd push-branches
npm ci
# in a clone with a remote, on a branch that you can push
env 'INPUT_BRANCHES=try/branch=1.0.0' 'INPUT_BASE=HEAD' node src/index.js
```

`npm test` runs its tests, with no network and no token.
