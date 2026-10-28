# align-milestone

Sets the due date of the milestone of a hotfix or of a long-term support version to the commercial general availability of its release train (`schedule.publication.commercial-general-availability` of `train.yml`), at noon UTC. A hotfix is built in the train of its OSS equivalent, and a long-term support version joins the train that its milestone names, and both are available to customers on that date, so the due date of the milestone follows the train.

It changes nothing if the due date is right. It fails if the milestone does not exist, or if the train has no commercial general availability.

## Inputs

| Input | Required | What it is |
|---|---|---|
| `train-file` | yes | `train.yml` as JSON (the output `train-file` of `load-train`). |
| `train-branch` | no | The branch of the train, for the messages. |
| `milestone-repository` | yes | `owner/repo` of the milestone, the commercial repository. |
| `milestone` | yes | Its title, `7.0.1.1`. |
| `token` | yes | A token that can write the milestones of the repository. |

## Outputs

`due-date`: the due date after the action (`YYYY-MM-DD`). `changed`: `true` if it was changed, which is also said in a notice, **Milestone due date**.

## Trying it

`npm ci`, then `npm test`: the tests need no network.
