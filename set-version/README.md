# set-version

Sets the version of `gradle.properties` and commits it, as a commit of its own. It knows nothing about releases: the release workflow uses it for the version of a snapshot branch, and for the version of a release.

## What it does

- It changes only the line `version=...`. The other properties, the comments, and the line endings (Windows ones too) stay.
- The commit has only that file, and is signed off with the identity that git is set up with (`git-identity` sets it). It is not signed with a key.
- It fails, and commits nothing, if the version is that already, if the file has no line `version=`, if the version is not a version (`7.0.1; rm -rf /` is not), or if git has not been told who commits.

## Inputs

| Input | Default | Description |
|---|---|---|
| `version` | required | The version to write: `7.0.1`, `7.1.0-RC1`, `7.0.1.1-SNAPSHOT`. |
| `message` | required | The message of the commit, for example `Release 7.0.1`. |
| `file` | `gradle.properties` | The properties file. |
| `path` | `.` | The directory of the git repository. |

## Outputs

| Output | Description |
|---|---|
| `commit` | The commit that was made. |

## Secrets and permissions

None, it only works in the directory of the repository.

## Using it

```yaml
- uses: spring-io/spring-security-actions/set-version@v1
  with:
    version: 7.0.1
    message: Release 7.0.1
```

## Running it locally

It changes and commits files, so try it in a copy of your repository, with an identity set:

```shell
cd set-version
npm ci
git clone /path/to/your/project /tmp/try-version && git -C /tmp/try-version config user.name Alice && git -C /tmp/try-version config user.email alice@example.com
export GITHUB_OUTPUT=$(mktemp)
env 'INPUT_VERSION=7.0.1' 'INPUT_MESSAGE=Release 7.0.1' 'INPUT_PATH=/tmp/try-version' \
    node src/index.js
git -C /tmp/try-version log -1 --stat
```

`npm test` runs its tests, which make commits in temporary repositories.
