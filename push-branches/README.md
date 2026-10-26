# push-branches

Pushes the branches that the workflow built, all at once or none, so that a failure never leaves one of them built and not the others. the release workflow pushes the release branch and the snapshot branch with it, as its last step.

## What it does

- It is forced, because the branches are built again from the pushed commit every time.
- It needs the token of the checkout to be the one that triggers workflows (`RELEASE_AUTOMATION_TOKEN`): the pushes of `GITHUB_TOKEN` do not run the workflows of the new branches.
- The summary of the step has a table of the branches, their versions, and how many commits each has on the pushed commit. Each branch links to its page on GitHub, built from `GITHUB_SERVER_URL` (`https://github.com` if it is not set) and `GITHUB_REPOSITORY`; without `GITHUB_REPOSITORY` the branch is plain text.

## Inputs

| Input | Default | Description |
|---|---|---|
| `branches` | required | The branches, as `branch=version`, one per line. The version is for the summary. |
| `base` | `GITHUB_SHA` | The commit that was pushed, to count the commits of the branches. |
| `remote` | `origin` | The remote to push to. |
| `title` | `GITHUB_REF_NAME` | The title of the summary. |
| `milestone-url` | | The URL of the milestone of the release. The version of a branch links to it in the summary, unless it ends in `-SNAPSHOT`. |
| `train` | | The release train that was used, `2026.11.19`. The summary has the line `Release train 2026.11.19` under its title. |
| `train-url` | | The URL of the branch of that train: the line of the summary links to it. |
| `train-status` | | Where the release is in the train, `not-joined`, `joined` or `ready` (the output `status` of `check-not-ready`). The line of the train says so: `Release train 2026.11.19: joined, not ready yet`. |
| `train-state` | | The state of the train itself (`pending`, `promoted`, ...), the output `train-state` of `check-not-ready`. The line says `Release train 2026.11.19 is pending`. |
| `train-state-url` | | The URL of the line of `train.yml` with the state: the state links to it. |
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
