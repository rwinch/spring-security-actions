# compute-secret-names

A composite action that maps a release channel to the *names* of the repository secrets holding the credentials a build needs. It never reads secret values; composite actions can't access the `secrets` context, so the caller dereferences the names itself.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `release-channel` | Yes | | The release channel: `oss`, `internal`, `lts`, or `hotfix`. Any other value fails the action. |

## Outputs

| Output | `oss` | `internal`, `lts`, `hotfix` |
|--------|-------|-------------------|
| `dependencies-username` / `dependencies-password` | _(empty)_ | `COMMERCIAL_ARTIFACTORY_USERNAME` / `COMMERCIAL_ARTIFACTORY_PASSWORD` |
| `publishing-username` / `publishing-password` | `ARTIFACTORY_USERNAME` / `ARTIFACTORY_PASSWORD` | `COMMERCIAL_ARTIFACTORY_USERNAME` / `COMMERCIAL_ARTIFACTORY_PASSWORD` |
| `dependabot-username` / `dependabot-password` | _(empty)_ | `ARTIFACTORY_RO_USERNAME` / `ARTIFACTORY_RO_PASSWORD` |

An empty name dereferences to an empty value (`secrets['']`), which leaves the corresponding credential unset.

## Example

```yaml
- id: secret-names
  uses: spring-io/spring-security-actions/compute-secret-names@v1
  with:
    release-channel: ${{ steps.release.outputs.channel }}
- uses: spring-io/spring-security-actions/build@v1
  env:
    ORG_GRADLE_PROJECT_artifactoryUsername: ${{ secrets[steps.secret-names.outputs.dependencies-username] }}
    ORG_GRADLE_PROJECT_artifactoryPassword: ${{ secrets[steps.secret-names.outputs.dependencies-password] }}
```

## Related

- [compute-build-environment](https://github.com/spring-io/spring-security-actions/tree/main/compute-build-environment) — computes the version and release channel as well, and calls this action.
