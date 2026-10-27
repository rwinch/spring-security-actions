# apply-commercial-license

Changes a git repository to the commercial license: the Broadcom license header in place of the Apache one in the source files (one year for the project), the checkstyle header, the commercial license in place of the license of the project, and the Broadcom license in the POM. Only a **hotfix** is commercial, so this is only done for the branch of a hotfix. A release that comes from a frozen embargoed branch is the OSS release, and keeps the Apache license.


## What it does

**The header of every source file** that git tracks and that `header-files` names (Java, AspectJ, Groovy, Kotlin, JavaScript, `.gradle`, `.gradle.kts`, `.properties`, `.xml` and `.tld` by default): only the comment at the very start of the file, and only if it says that it is licensed under the Apache License (or has the Broadcom line already) and has a copyright line. It is replaced with one shape, with **one year for the whole project**:

```java
/*
 * Copyright 2002 Broadcom Inc. and/or its subsidiaries. All Rights Reserved.
 * Copyright 2002-present the original author or authors.
 */
```

The same shape goes in the syntax of the file: `# ` lines for `.properties`, `<!-- ~ ... -->` for XML. The license text is left out.

- **The year** is the one that `year` gives, or the oldest year of the copyright of the project in the headers (the authors lines, the Acegi lines and the Broadcom lines: the years of other holders do not count). The authors line takes it too (`2002-present`), so that `etc/checkstyle/header.txt` can have it as a literal.
- **Every other copyright line is kept**, as it was, after those two: the Acegi line (`Copyright 2004, 2005 Acegi Technology Pty Limited`) and the lines of other holders.
- A file with no header, another license, only a copyright line, or the Broadcom header already, is left alone, so it is safe to do more than once. The line endings and the encoding of a file are kept, and the file annotations (`@file:Suppress(...)`) and the blank lines that a Kotlin file has before its header. A comment that is not the first thing in the file is not a header. A script that starts with `#!` is left alone.
- **Third-party code is not changed**: a file that a `checkstyle-suppressions.xml` (or `suppressions.xml`) skips entirely, with `<suppress files="..." checks=".*"/>`, as `BCrypt.java` is.
- Files that `header-files` does not name are never changed: `gradlew` and `gradlew.bat` have the header of Gradle, which is not ours to change, and `notice.txt` is the same in the OSS and the commercial repository.

**`etc/checkstyle/header.txt`** is rewritten to the pattern of the headers above with the year, the Acegi line allowed, **only if the project has the file**: not every project checks its headers (Spring Security Kerberos does not).

**The license of the POM**: the published POM says Apache License. The bundled script `broadcom-license.gradle` sets it to the *Broadcom Foundation License*, with no URL, for every project that applies `maven-publish`. It is written to `gradle/broadcom-license.gradle`, and a line is added at the end of the root `build.gradle` (or `build.gradle.kts`) that applies it. It is not left in `gradle/init.d`: Gradle only reads a project's `init.d` if the build copies it to `~/.gradle/init.d` first, as `run-gradle` does, and a plain `./gradlew` does not. The script and the line are left alone if they are there. A repository with no root build file fails.

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
| `year` | the oldest year of the project | The year of the Broadcom copyright of every header, and of `etc/checkstyle/header.txt`. Needed if no header has a year to take it from, and the project has a checkstyle header. |
| `header-files` | `*.java *.aj *.groovy *.kt *.js *.gradle *.gradle.kts *.properties *.xml *.tld` | The files whose header is changed, as git pathspecs (`*.js` is at any depth), separated by spaces or lines. Narrow it to change less, for example `javascript/lib/**.js` instead of `*.js`: a script of someone else that has an Apache header of its own would be changed too. |

## Outputs

| Output | Description |
|---|---|
| `headers` | How many files got the Broadcom header. |
| `java-files` | How many of them are Java files. |
| `license` | `true` if the license was changed. |
| `pom-license` | `true` if the script of the POM license, or the line that applies it, was written. |
| `year` | The year of the Broadcom copyright of the headers. |
| `changed` | The files that were changed, as a JSON array of paths. The license is the file that it was written to. |
| `commit` | The commit that was made. Empty if there is none. |

## Fails when

- the license file does not exist
- the license target is not in the repository, is a link that leads outside of it or nowhere, or there are several licenses and none is the usual one
- the root has no `build.gradle` or `build.gradle.kts` to apply the POM license from
- there is no year to take from the headers, and the project has an `etc/checkstyle/header.txt`: give `year`
- the year is not four digits
- it is to commit, and git does not know who commits (`git config user.name` and `user.email`, which is checked: git would make an identity up from the name of the user and of the machine otherwise)

It fails before it changes anything, for the license ones and the root build file.

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
