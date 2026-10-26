# check-not-ready

Fails if the project has released the version in the release train already. A release that is ready is not changed any more, so building its branch again would be a mistake.

## What it does

- It reads `train.yml`, as `load-train` writes it (the `train-file` output), and looks for `releases.<project>."<version>".commit-hashes.ready`.
- If it is there, it fails with the title `<project> <version> is ready`, and says what to do instead: set the version of `gradle.properties` to the next version in the OSS repository, and merge forward, so that the next push is for the next release.
- A release that is in the train and not ready, or not in the train at all, is fine.
- Before it fails, it adds a line to the summary of the step with the release train and `ready`, because the run builds nothing and has no other summary.

## Inputs

| Input | Default | Description |
|---|---|---|
| `train-file` | required | The file with `train.yml` as JSON, the output `train-file` of `load-train`. |
| `project` | required | The project id in the release train, for example `spring-security`. |
| `version` | required | The version of the release, for example `7.0.1`. |
| `train-branch` | no | The branch of the train, for the message. |
| `train-url` | no | The URL of the branch of the train. A release that is ready is said so in the summary of the step, and its text links to it. |
| `train-state-url` | no | The URL of the line of `train.yml` with the state of the train. The state links to it in the summary. |

## Outputs

| Output | Description |
|---|---|
| `train-state` | The state of the train itself, the `state` at the top of `train.yml`. Seen so far: `pending`, `started`, `tested`, `staged`, `promoting`, `promoted`, `paused`. Empty if it has none. |
| `status` | `not-joined` (not in the train), `joined` (in the train, not ready yet) or `ready` (the action fails). |

## Secrets and permissions

None.

## Using it

```yaml
- if: steps.train.outputs.found == 'true'
  uses: spring-io/spring-security-actions/check-not-ready@v1
  with:
    train-file: ${{ steps.train.outputs.train-file }}
    project: spring-security
    version: 7.0.1
    train-branch: ${{ steps.train.outputs.branch }}
```

## Running it locally

An ordinary Node program (Node 24). `npm ci` once in this directory, then run it with its inputs as `INPUT_<NAME>` variables:

```shell
cd check-not-ready
npm ci
echo '{"releases":{"spring-merge":{"7.0.1":{"commit-hashes":{"ready":"abc"}}}}}' > /tmp/train.json
env 'INPUT_TRAIN-FILE=/tmp/train.json' INPUT_PROJECT=spring-merge INPUT_VERSION=7.0.1 INPUT_TRAIN-BRANCH=2026.11.19 \
    node src/index.js
```

`npm test` runs its tests, with no network and no token.
