# check-oss-support

Fails if the OSS support of the generation of a version ends before a date. The release workflow uses it for the frozen and active embargoed branches: the fix is made public on the disclosure date (the release date of the OSS release), so the generation must still be OSS then. A generation that is not has become commercial, and its frozen and active branches are replaced by one `embargoed/lts/<generation>` branch. The failure says so.

The generations are read from the Spring projects API, `GET https://api.spring.io/projects/<project>/generations` (the data of the support section of a project page on spring.io): each has `name` (`7.0.x`), `ossSupportEndDate` and `commercialSupportEndDate`. The end date is the last day of support, so a release on that day is fine. A generation with no end date has none.

## Inputs

| Input | Required | What it is |
|---|---|---|
| `project` | yes | The slug in the API, `spring-security`. |
| `version` | yes | `7.0.9` or `7.0.9.1`, of the generation `7.0.x`. |
| `date` | yes | The disclosure date, `2026-11-19`. |
| `branch` | no | The embargoed branch, for the message. |
| `api-url` | no, `https://api.spring.io` | The API. |

## Outputs

`generation` (`7.0.x`) and `oss-support-end` (`2026-12-31`, empty if none).

## Fails if

- OSS support ended before the date (the title of the error is `OSS support of 7.0.x ended`),
- the API does not answer, or has no such generation or project.

## Trying it

`npm ci`, then `npm test` (no network). Against the API: `INPUT_PROJECT=spring-security INPUT_VERSION=7.0.9 INPUT_DATE=2026-11-19 node src/index.js`.
