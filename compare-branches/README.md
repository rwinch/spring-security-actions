# compare-branches

Says whether the branch that is checked out has changes that another branch lacks. The release workflow uses it for an active embargoed branch (`embargoed/active/7.0.x`), against the frozen embargoed branch of the same generation (`embargoed/frozen/7.0.x`): **a hotfix is only built if the active branch differs from the frozen one**.

## What it does

It runs `git diff --quiet origin/<base>...<head>`: the changes of the head since its merge base with the base. The branch of the remote is the one that is compared, as it was when the repository was checked out, and not a branch of that name in the clone.

- **Different** (`different` is `true`): the head has changes that the base lacks, for example the fix of a CVE. The hotfix is built.
- **The same** (`different` is `false`): the head has nothing that the base lacks. A notice, `Nothing to build`, says that no hotfix is built. That is also the case for:
  - the active branch right after the frozen branch was merged into it. The merge is a commit that the frozen branch lacks, but it has no changes of its own, which is why the trees are compared and not the commits.
  - a frozen branch that is ahead of an active branch that did not change.
- **No base** (the frozen embargoed branch has not been pushed yet): there is nothing to compare with, so `different` is `true`, and a notice, `No frozen embargoed branch`, says that the hotfix is built from the active branch alone, as `merge-release` does when the release does not exist.
- It fails if `head` is not a commit, or if the two branches have nothing in common, with what git said.

The release workflow runs it before anything that needs a milestone or an issue: when there is nothing to build, the hotfix does not need the milestone of its version either.

## Inputs

| Input | Default | Description |
|---|---|---|
| `base` | required | The branch to compare with, for example `embargoed/frozen/7.0.x`. |
| `head` | `HEAD` | The commit to look at. |
| `path` | `.` | The directory of the git repository. |

## Outputs

| Output | Description |
|---|---|
| `different` | `true` if the head has changes that the base lacks, or if the base does not exist. `false` if it has nothing that the base lacks. |

## Secrets and permissions

None. It reads the clone that is checked out, and changes nothing. The checkout needs the branches of the remote (`fetch-depth: 0`).

## Using it

```yaml
- id: compare
  uses: spring-io/spring-security-actions/compare-branches@v1
  with:
    base: embargoed/frozen/7.0.x
- if: steps.compare.outputs.different == 'true'
  run: echo "The hotfix is built"
```

## Running it locally

In a clone that is on the active branch:

```shell
cd compare-branches
npm ci
export GITHUB_OUTPUT=$(mktemp)
env 'INPUT_BASE=embargoed/frozen/7.0.x' 'INPUT_PATH=/path/to/a/clone' node src/index.js
cat "$GITHUB_OUTPUT"
```

`npm test` runs its tests, with real git in temporary repositories.
