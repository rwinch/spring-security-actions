# apply-commercial-license

Changes a git repository to the commercial license: the Broadcom license header in place of the Apache one in the source files, and the commercial license in place of the license of the project. Only a **hotfix** is commercial, so this is only done for the branch of a hotfix. A release that comes from a frozen disclosure is the OSS release, and keeps the Apache license.


## What it does

**The header of every source file** that git tracks and that `header-files` names (Java, AspectJ, Groovy, Kotlin, JavaScript and `gradle.properties` by default): only the comment at the very start of the file, and only if it says that it is licensed under the Apache License. It is replaced with a Broadcom copyright line, then the copyright lines that the header had, as they were. The license text is left out:

```java
/*
 * Copyright 2004 Broadcom Inc. and/or its subsidiaries. All Rights Reserved.
 * Copyright 2004-present the original author or authors.
 */
```

A file that starts with `#`, like `gradle.properties`, has its block of `#` lines changed the same way, and the properties after it are kept:

```properties
#
# Copyright 2004 Broadcom Inc. and/or its subsidiaries. All Rights Reserved.
# Copyright 2004-present the original author or authors.
#
version=7.0.1.1-SNAPSHOT
```

A file with no header, another license, only a copyright line, or the Broadcom header already, is left alone, so it is safe to do more than once. The line endings of a file are kept. A comment that is not the first thing in the file is not a header. A script that starts with `#!` is left alone.

Files that are not named by `header-files` are never changed, even if they have an Apache header: `gradlew` and `gradlew.bat` have the header of Gradle, which is not ours to change, `notice.txt` is the same in the OSS and the commercial repository, and the XML, CSS and `.gradle` files keep theirs, as they do in the commercial repositories of the Spring projects.

A Kotlin file can have file annotations (`@file:Suppress(...)`) or blank lines before its header: they are kept, and the header after them is changed.

**The license** is the file of the root of the repository that git tracks and that is named `LICENSE*` (`LICENSE`, `LICENSE.txt`, `LICENSE.md`). It is replaced with the commercial license, in place, with the name that it had.

- With several of them, `LICENSE` and then `LICENSE.txt` are preferred. If none of the usual ones is there, it fails, and says to give the one with `license-target`.
- The licenses of the modules, deeper in the repository, are not the license of the project, and are not changed.
- If the project has none, `LICENSE.txt` is made.
- `license-target` is the path to write instead, relative to the repository. It is made, with its directories, if it is not there.
- The commercial license is the file `LICENSE.txt` that is **bundled with the action**, next to its `action.yml`, because the commercial license is only ever needed for a hotfix, so it is not in the project. `license-file` takes another one.

**If the license is repeated in several modules**, make them links (`ln -s ../LICENSE.txt module/LICENSE.txt`) to the one file, so that there is a single file to update. A target that is a link is written through, to the file that it points to, which is changed once, and the links stay links. A link that points outside the repository, or to nothing, is an error.

**The commit** is only made if `commit-message` is given: the changed files, and only those, signed off with the identity that git is set up with, which must be set. A run with nothing to change makes no commit. Without a message, the changes are left in the working tree.

## Inputs

| Input | Default | Description |
|---|---|---|
| `path` | `.` | The directory of the git repository. |
| `commit-message` |  | If given, the changes are committed with it. For example `Commercial changes for 7.0.1.1`. |
| `license-file` | the bundled license | The license to copy. |
| `license-target` | the `LICENSE*` file of the root, or `LICENSE.txt` | The path of the license in the repository. |
| `header-files` | `**.java **.aj **.groovy **.kt *.js gradle.properties` | The files whose header is changed, as git pathspecs (`**.js` is at any depth, `gradle.properties` is the one of the root), separated by spaces or lines. Narrow it to change less, for example `javascript/lib/**.js` instead of `*.js`: a script of someone else that has an Apache header of its own would be changed too. |

## Outputs

| Output | Description |
|---|---|
| `headers` | How many files got the Broadcom header. |
| `java-files` | How many of them are Java files. |
| `license` | `true` if the license was changed. |
| `changed` | The files that were changed, as a JSON array of paths. The license is the file that it was written to. |
| `commit` | The commit that was made. Empty if there is none. |

## Fails when

- the license file does not exist
- the license target is not in the repository, is a link that leads outside of it or nowhere, or there are several licenses and none is the usual one
- it is to commit, and git does not know who commits (`git config user.name` and `user.email`, which is checked: git would make an identity up from the name of the user and of the machine otherwise)

It fails before it changes anything, for the first two.

## Secrets and permissions

None. It only works in the directory of the repository.

## The bundled license

`LICENSE.txt` of this directory is the commercial license of Spring Security, the Foundation Agreement of Broadcom (it is the one of the branches of `spring-security-commercial`, the same on all of them). It is proprietary text. A project that has another license gives it as `license-file`.

## Using it

```yaml
- run: |
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
- uses: spring-io/spring-security-actions/apply-commercial-license@v1
  with:
    commit-message: Commercial changes for 7.0.1.1
```

## Running it locally

It is an ordinary Node program (Node 24). `npm ci` once in this directory. Try it in a copy of your repository, because it changes files:

```shell
cd apply-commercial-license
npm ci
git clone /path/to/your/project /tmp/try-license && git -C /tmp/try-license config user.name Alice && git -C /tmp/try-license config user.email alice@example.com
export GITHUB_OUTPUT=$(mktemp)
env 'INPUT_PATH=/tmp/try-license' 'INPUT_COMMIT-MESSAGE=Commercial changes for 7.0.1.1' \
    node src/index.js
git -C /tmp/try-license show --stat HEAD
git -C /tmp/try-license show HEAD:src/main/java/org/springframework/example/Greeter.java | head -5
```

`npm test` runs its tests, which need no network and no token.
