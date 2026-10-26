# join-train

Joins a release of the project to the release train, by running the workflow `Join` of the release train repository on the branch of the train, with the release repository, the release branch and the deployment destination.

A release that has joined already (its entry in `train.yml` has `commit-hashes.joined`) is not joined again: the action says so in the summary and sets `joined` to `false`.

The token needs **Actions: Read and write** on the release train repository (a fine-grained token), or the scope `repo` (a classic token: no `workflow` scope is needed, that one is for changing workflow files). If GitHub refuses the request, the action fails and says so.

If the train has not been created (`train-found` is `false`), nothing is joined, and the summary says `Not joined: the release train 2026.12.17 has not been created`.

## Inputs

| Input | Required | What it is |
|---|---|---|
| `release-train-repository` | yes | `owner/repo`. |
| `train-branch` | yes | The branch of the train, `2026.11.19` (the output `branch` of `load-train`). |
| `train-found` | no, `true` | Whether the train exists (the output `found` of `load-train`). |
| `train-file` | if the train exists | `train.yml` as JSON (the output `train-file` of `load-train`). |
| `train-url` | no | The URL of the branch, which the summary links to. |
| `project`, `version` | yes | The project id in the train, and the version of the release. |
| `release-repository`, `release-branch` | yes | The repository and the branch that joins (`release/7.0.1`). It must exist. |
| `deployment-destination` | yes | `maven_central` or `spring_enterprise`. |
| `commit-hash` | no | The last commit of the release branch. The train reads it if it is not given. |
| `token` | yes | A token that may run workflows of the release train repository (Actions: Read and write, or `repo`). |

## Outputs

`joined`: `true` if Join was run, `false` if the release had joined already.

## Trying it

`npm ci`, then `npm test`: the tests need no network.
