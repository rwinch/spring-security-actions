# git-identity

Sets who commits in the repository, so that the commits of the workflow are made as `github-actions[bot]`, which GitHub shows with the avatar of GitHub Actions, and so that they are signed off with it. the release workflow uses it once, after the checkout.

## What it does

- It sets `user.name` and `user.email` in the configuration of the repository, not the global one.
- The other actions that commit (`set-version`, `merge-release`, `update-versions`, `apply-commercial-license`) refuse to run if git does not know who commits, because git would make an identity up from the name of the user and of the machine (`runner@fv-az123`). This is what tells it.
- It fails for a name or an email that is empty or has more than one line.

## Inputs

| Input | Default | Description |
|---|---|---|
| `name` | `github-actions[bot]` | The name of who commits. |
| `email` | `41898282+github-actions[bot]@users.noreply.github.com` | The email of who commits. This one is the one that GitHub gives the bot. |
| `path` | `.` | The directory of the git repository. |

## Secrets and permissions

None, it only reads and writes in the directory of the repository.

## Using it

```yaml
- uses: spring-io/spring-security-actions/git-identity@v1
```

## Running it locally

An ordinary Node program (Node 24). `npm ci` once in this directory, then run it with its inputs as `INPUT_<NAME>` variables:

```shell
cd git-identity
npm ci
git init /tmp/try-identity
env 'INPUT_PATH=/tmp/try-identity' node src/index.js
git -C /tmp/try-identity config user.email
```

`npm test` runs its tests, with no network and no token.
