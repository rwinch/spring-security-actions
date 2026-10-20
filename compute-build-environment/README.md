# compute-build-environment

A composite action that works out everything a build needs to know about where it is running: the project version, the release channel, and the names of the secrets holding the credentials for that channel.

It runs [compute-version](https://github.com/spring-io/spring-release-actions/tree/main/compute-version), [compute-release-channel](https://github.com/spring-io/spring-release-actions/tree/main/compute-release-channel), and [compute-secret-names](https://github.com/spring-io/spring-security-actions/tree/main/compute-secret-names), in that order. It does not modify the project. On the `internal` channel the [build](https://github.com/spring-io/spring-security-actions/tree/main/build) action rewrites a `-SNAPSHOT` version to `-INTERNAL-SNAPSHOT`, so this action's `version` output already includes that suffix, to match what gets built.

## Caller contract

- The workflow **must** run `actions/checkout` before using this action, since it reads the version from `gradle.properties`.
- The outputs can be passed between jobs, so this action can run once in a setup job. Pass `release-channel` on to `build`, which applies the `internal` suffix.
- Composite actions can't read the `secrets` context, so the outputs are secret *names*. Dereference them with `secrets[...]` in the calling workflow.

## Outputs

| Output | Description |
|--------|-------------|
| `version` | The version the build produces, including the `-INTERNAL` suffix on the `internal` channel. |
| `snapshot` | `true` if `version` ends in `-SNAPSHOT`. |
| `release-channel` | `lts`, `hotfix`, `internal`, or `oss`. |
| `dependencies-username`, `dependencies-password` | Secret names for resolving dependencies; empty if none is needed. |
| `publishing-username`, `publishing-password` | Secret names for publishing artifacts. |
| `dependabot-username`, `dependabot-password` | Secret names Dependabot builds use to resolve dependencies; empty if none is needed. |

## Example

```yaml
- uses: actions/checkout@v4

- id: environment
  uses: spring-io/spring-security-actions/compute-build-environment@v1

- uses: spring-io/spring-security-actions/pr-build@v1
  env:
    ORG_GRADLE_PROJECT_releaseChannel: ${{ steps.environment.outputs.release-channel }}
    ORG_GRADLE_PROJECT_artifactoryUsername: ${{ secrets[steps.environment.outputs.dependencies-username] }}
    ORG_GRADLE_PROJECT_artifactoryPassword: ${{ secrets[steps.environment.outputs.dependencies-password] }}
```
