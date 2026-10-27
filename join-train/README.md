# join-train

Joins a release of the project to the release train, by running the workflow `Release Train - Join` (`release-train-join.yml`) of **the project** on the release branch. That workflow has the token for the release train, so this action needs none for it: it runs `Join` in the release train repository with the destination and the commit of the release branch, and waits for it. The action is told the destination (`Maven Central`, `Spring Enterprise` or `Spring Enterprise Extended`), the branch of the train and the release train repository, which are the inputs of that workflow. The release branch must have the workflow.

A release that has joined already (its entry in `train.yml` has `commit-hashes.joined`) is not joined again: the action says so in the summary and sets `joined` to `false`. When it runs the workflow, the summary links to the runs of `Release Train - Join` on the release branch (dispatching a workflow does not say which run it made), where a failed join shows.

The token needs **Actions: Read and write** on the repository of the release branch (a fine-grained token), or the scope `repo` (a classic token: no `workflow` scope is needed, that one is for changing workflow files). If GitHub refuses the request (the workflow is not on the branch, or the token may not run it), the action fails and says so.

If the train has not been created (`train-found` is `false`), nothing is joined, and the summary says `Not joined: the release train 2026.12.17 has not been created`.

## Inputs

| Input | Required | What it is |
|---|---|---|
| `release-train-repository` | yes | `owner/repo`. The workflow of the project is told it. |
| `train-branch` | yes | The branch of the train, `2026.11.19` (the output `branch` of `load-train`). |
| `train-found` | no, `true` | Whether the train exists (the output `found` of `load-train`). |
| `train-file` | if the train exists | `train.yml` as JSON (the output `train-file` of `load-train`). |
| `train-url` | no | The URL of the branch, which the summary links to. |
| `project`, `version` | yes | The project id in the train, and the version of the release. |
| `release-repository`, `release-branch` | yes | The repository that has the workflow, and the release branch that joins (`release/7.0.1`). It must exist, and have `release-train-join.yml`. |
| `deployment-destination` | yes | `Maven Central` or `Spring Enterprise`. |
| `token` | yes | A token that may run workflows of the repository of the release branch (Actions: Read and write, or `repo`). |

## Outputs

`joined`: `true` if the workflow was run, `false` if the release had joined already.

## Trying it

`npm ci`, then `npm test`: the tests need no network.
