# start-branch

Starts a branch at a commit or at another branch, and switches to it. the release workflow starts the snapshot branch at the pushed commit, and the release branch at the pushed commit (or, for a hotfix, at the snapshot branch).

## What it does

- The branch is reset if it exists (`git switch -C`): the branches of the release workflow are built again from the pushed commit every time, and nobody commits to them.
- The working tree is that of the commit.
- It fails if the branch name is not valid, or if `from` is not a commit or a branch of the repository.

## Inputs

| Input | Default | Description |
|---|---|---|
| `branch` | required | The branch to start, for example `release/7.0.1`. |
| `from` | required | What it starts at: a commit (the SHA of the pushed commit) or a branch (`disclosure/7.0.1.1-SNAPSHOT`). |
| `path` | `.` | The directory of the git repository. |

## Outputs

| Output | Description |
|---|---|
| `commit` | The commit that the branch is at. |

## Secrets and permissions

None, it only reads and writes in the directory of the repository.

## Using it

```yaml
- uses: spring-io/spring-security-actions/start-branch@v1
  with:
    branch: disclosure/7.0.1-INTERNAL-SNAPSHOT
    from: ${{ github.sha }}
```

## Running it locally

An ordinary Node program (Node 24). `npm ci` once in this directory, then run it with its inputs as `INPUT_<NAME>` variables, and the file of its outputs as `GITHUB_OUTPUT`:

```shell
cd start-branch
npm ci
export GITHUB_OUTPUT=$(mktemp)
env 'INPUT_BRANCH=try/branch' 'INPUT_FROM=HEAD' node src/index.js
cat "$GITHUB_OUTPUT"
```

`npm test` runs its tests, with no network and no token.
