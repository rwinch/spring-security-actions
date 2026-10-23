import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCommercialLicense,
  BROADCOM_COPYRIGHT,
  BUNDLED_LICENSE,
  replaceHeader,
} from "../src/index.js";
import { createRepo, git } from "./support/git-repo.js";
import { runAction } from "./support/run-action.js";

const APACHE = `/*
 * Copyright 2004-present the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */`;
const BODY = `

package org.springframework.example;

public class Greeter {
}
`;
const BROADCOM = `/*
${BROADCOM_COPYRIGHT}
 * Copyright 2004-present the original author or authors.
 */`;
const OSS_LICENSE = "Apache License\nVersion 2.0\n";

describe("replaceHeader", () => {
  it("replaces the Apache header with the Broadcom copyright, and keeps the original ones", () => {
    expect(replaceHeader(APACHE + BODY)).toBe(BROADCOM + BODY);
  });

  it("keeps every copyright line, as it was", () => {
    const text = `/*
 * Copyright 2002-2020 the original author or authors.
 * Copyright 2021-2026 Someone Else.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
class A {}`;
    expect(replaceHeader(text)).toBe(`/*
${BROADCOM_COPYRIGHT}
 * Copyright 2002-2020 the original author or authors.
 * Copyright 2021-2026 Someone Else.
 */
class A {}`);
  });

  it("has only the Broadcom line if the header had no copyright", () => {
    const text = `/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
class A {}`;
    expect(replaceHeader(text)).toBe(`/*
${BROADCOM_COPYRIGHT}
 */
class A {}`);
  });

  it("can be done again, with the same result", () => {
    const once = replaceHeader(APACHE + BODY);
    expect(replaceHeader(once)).toBe(once);
  });

  it.each([
    ["a file with no header", "package a;\nclass A {}\n"],
    [
      "another license",
      "/*\n * Copyright 2020 X.\n * Licensed under the MIT License.\n */\nclass A {}\n",
    ],
    [
      "an Apache header that is not the first comment",
      `package a;\n${APACHE}\nclass A {}\n`,
    ],
    ["an empty file", ""],
  ])("leaves %s", (_, text) => {
    expect(replaceHeader(text)).toBe(text);
  });

  it("does not take a later comment for the end of the header", () => {
    const text = `${APACHE}\n\n/* a comment */\nclass A {}\n`;
    expect(replaceHeader(text)).toBe(
      `${BROADCOM}\n\n/* a comment */\nclass A {}\n`,
    );
  });

  it("keeps windows line endings", () => {
    const windows = (APACHE + BODY).replaceAll("\n", "\r\n");
    const replaced = replaceHeader(windows);
    expect(replaced).toBe((BROADCOM + BODY).replaceAll("\n", "\r\n"));
    expect(replaced.replaceAll("\r\n", "").includes("\n")).toBe(false);
  });
});

describe("the bundled license", () => {
  it("is the commercial license, and not the Apache one", () => {
    const text = fs.readFileSync(BUNDLED_LICENSE, "utf8");
    expect(text).toContain("Foundation Agreement");
    expect(text).not.toContain("Apache License");
    expect(text.split("\n").length).toBeGreaterThan(1000);
  });
});

describe("applyCommercialLicense", () => {
  const files = {
    "LICENSE.txt": OSS_LICENSE,
    "src/main/java/a/Greeter.java": APACHE + BODY,
    "src/main/java/a/Other.java": "package a;\nclass Other {}\n",
    "src/main/java/a/Done.java": BROADCOM + BODY,
    "docs/Example.java.txt": APACHE + BODY, // not a Java file
  };
  const repo = (options) => createRepo(files, options);
  const read = (directory, file) =>
    fs.readFileSync(path.join(directory, file), "utf8");

  it("changes the headers of the Java files and the license, and nothing else", () => {
    const directory = repo();
    const { changed, java, license } = applyCommercialLicense({ directory });
    expect(changed.sort()).toEqual([
      "LICENSE.txt",
      "src/main/java/a/Greeter.java",
    ]);
    expect(java).toBe(1);
    expect(license).toBe(true);
    expect(read(directory, "src/main/java/a/Greeter.java")).toBe(
      BROADCOM + BODY,
    );
    expect(read(directory, "src/main/java/a/Other.java")).toBe(
      files["src/main/java/a/Other.java"],
    );
    expect(read(directory, "docs/Example.java.txt")).toBe(APACHE + BODY);
    expect(fs.readFileSync(path.join(directory, "LICENSE.txt"))).toEqual(
      fs.readFileSync(BUNDLED_LICENSE),
    );
    // the changes are left in the working tree
    expect(git(directory, "status", "--porcelain").split("\n").sort()).toEqual([
      " M LICENSE.txt",
      " M src/main/java/a/Greeter.java",
    ]);
  });

  it("is done again with nothing to change", () => {
    const directory = repo();
    applyCommercialLicense({ directory });
    git(directory, "add", "-A");
    git(directory, "commit", "-q", "-m", "done");
    const again = applyCommercialLicense({ directory });
    expect(again.changed).toEqual([]);
    expect(again.license).toBe(false);
    expect(git(directory, "status", "--porcelain")).toBe("");
  });

  it("creates LICENSE.txt if the project has none", () => {
    const directory = createRepo({ "a.txt": "a" });
    const result = applyCommercialLicense({ directory });
    expect(result.license).toBe(true);
    expect(fs.existsSync(path.join(directory, "LICENSE.txt"))).toBe(true);
  });

  it("takes another license if it is given one", () => {
    const directory = repo();
    const other = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "lic-")),
      "L.txt",
    );
    fs.writeFileSync(other, "My license\n");
    applyCommercialLicense({ directory, licenseFile: other });
    expect(read(directory, "LICENSE.txt")).toBe("My license\n");
  });

  it("fails for a license that does not exist", () => {
    expect(() =>
      applyCommercialLicense({
        directory: repo(),
        licenseFile: "/nonexistent/L.txt",
      }),
    ).toThrow("The license does not exist");
  });

  it("commits the changes if it is given a message, signed off, and only those files", () => {
    const directory = repo();
    fs.writeFileSync(path.join(directory, "unrelated.txt"), "x");
    git(directory, "add", "unrelated.txt");
    const result = applyCommercialLicense({
      directory,
      commitMessage: "Commercial changes for 7.0.1.1",
    });
    expect(result.commit).toBe(git(directory, "rev-parse", "HEAD"));
    expect(git(directory, "log", "-1", "--format=%B").trim()).toMatch(
      /^Commercial changes for 7\.0\.1\.1\n\nSigned-off-by: Alice <alice@example\.com>$/,
    );
    expect(
      git(directory, "show", "--format=", "--name-only", "HEAD")
        .split("\n")
        .sort(),
    ).toEqual(["LICENSE.txt", "src/main/java/a/Greeter.java"]);
    expect(git(directory, "status", "--porcelain")).toBe("A  unrelated.txt");
  });

  it("makes no commit if there is nothing to change", () => {
    const directory = repo();
    applyCommercialLicense({ directory, commitMessage: "first" });
    const before = git(directory, "rev-parse", "HEAD");
    const result = applyCommercialLicense({
      directory,
      commitMessage: "second",
    });
    expect(result.commit).toBe("");
    expect(git(directory, "rev-parse", "HEAD")).toBe(before);
  });

  it("refuses to commit if git does not know who commits, and changes nothing committed", () => {
    const directory = repo({ identity: false });
    const keep = { ...process.env };
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_SYSTEM = "/dev/null";
    for (const name of [
      "GIT_AUTHOR_NAME",
      "GIT_AUTHOR_EMAIL",
      "GIT_COMMITTER_NAME",
      "GIT_COMMITTER_EMAIL",
      "EMAIL",
    ]) {
      delete process.env[name];
    }
    try {
      expect(() =>
        applyCommercialLicense({ directory, commitMessage: "x" }),
      ).toThrow("git does not know who commits");
    } finally {
      process.env = keep;
    }
    expect(git(directory, "rev-list", "--count", "HEAD")).toBe("1");
  });
});

const HASH_APACHE = `#
# Copyright 2004-present the original author or authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
`;
const HASH_BROADCOM = `#
# Copyright 2004 Broadcom Inc. and/or its subsidiaries. All Rights Reserved.
# Copyright 2004-present the original author or authors.
#
`;
const PROPERTIES = "springBootVersion=4.2.0-SNAPSHOT\nversion=7.2.0-SNAPSHOT\n";

describe("replaceHeader of the other files", () => {
  it("changes the block of # lines of gradle.properties, and keeps the properties", () => {
    expect(replaceHeader(HASH_APACHE + PROPERTIES)).toBe(
      HASH_BROADCOM + PROPERTIES,
    );
  });

  it("keeps every copyright line of a # block, as it was", () => {
    const text = `# Copyright 2002-2020 A.
# Copyright 2021 B.
# Licensed under the Apache License, Version 2.0 (the "License");
a=b
`;
    expect(replaceHeader(text))
      .toBe(`# Copyright 2004 Broadcom Inc. and/or its subsidiaries. All Rights Reserved.
# Copyright 2002-2020 A.
# Copyright 2021 B.
a=b
`);
  });

  it("can be done again on a # block, and keeps windows line endings", () => {
    const once = replaceHeader(HASH_APACHE + PROPERTIES);
    expect(replaceHeader(once)).toBe(once);
    const windows = replaceHeader(
      (HASH_APACHE + PROPERTIES).replaceAll("\n", "\r\n"),
    );
    expect(windows).toBe((HASH_BROADCOM + PROPERTIES).replaceAll("\n", "\r\n"));
  });

  it.each([
    ["properties with no header", PROPERTIES],
    [
      "a # block of another license",
      "# Copyright 2020 X\n# Licensed under the MIT License\na=b\n",
    ],
    [
      "a script, which has its header after the shebang",
      `#!/bin/sh\n${HASH_APACHE}echo hi\n`,
    ],
  ])("leaves %s", (_, text) => {
    expect(replaceHeader(text)).toBe(text);
  });

  it("changes the header of a Kotlin, a Groovy and a JavaScript file as it does a Java one", () => {
    for (const body of [
      "\n\npackage a\n\nclass A\n",
      "\n\npackage a\n\nclass A {}\n",
      "\n\nexport function a() {}\n",
    ]) {
      expect(replaceHeader(APACHE + body)).toBe(BROADCOM + body);
    }
  });

  it("keeps the file annotations and the blank lines that a Kotlin file has before the header", () => {
    const annotation = '@file:Suppress("DEPRECATION", "UNCHECKED_CAST")\n\n';
    expect(replaceHeader(annotation + APACHE + "\n\npackage a\n")).toBe(
      annotation + BROADCOM + "\n\npackage a\n",
    );
    expect(replaceHeader("\n" + APACHE + "\n\npackage a\n")).toBe(
      "\n" + BROADCOM + "\n\npackage a\n",
    );
    const once = replaceHeader(annotation + APACHE + "\n");
    expect(replaceHeader(once)).toBe(once);
  });

  it("does not look past the code for a header", () => {
    const text = `package a\n\n${APACHE}\n`;
    expect(replaceHeader(text)).toBe(text);
    const annotated = `@file:JvmName("A")\nimport a.B\n${APACHE}\n`;
    expect(replaceHeader(annotated)).toBe(annotated);
  });

  it("keeps a list of copyrights of one line, as in Spring Security", () => {
    const text = `/*
 * Copyright 2004, 2005, 2006 Acegi Technology Pty Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
package a;
`;
    expect(replaceHeader(text)).toBe(`/*
${BROADCOM_COPYRIGHT}
 * Copyright 2004, 2005, 2006 Acegi Technology Pty Limited
 */
package a;
`);
  });

  it("leaves a file that has only a copyright line", () => {
    const text =
      "/*\n * Copyright 2012-present the original author or authors.\n */\n\npackage a;\n";
    expect(replaceHeader(text)).toBe(text);
  });
});

describe("applyCommercialLicense, the files that it changes", () => {
  const files = {
    "LICENSE.txt": OSS_LICENSE,
    "notice.txt": `   == NOTICE file corresponding to section 4(d) of the Apache License ==\n`,
    "gradle.properties": HASH_APACHE + PROPERTIES,
    gradlew: "#!/bin/sh\n# Licensed under the Apache License, Version 2.0\n",
    "gradlew.bat": "@rem Licensed under the Apache License, Version 2.0\r\n",
    "a/A.java": APACHE + BODY,
    "a/B.kt": APACHE + "\n\npackage a\n",
    "a/C.groovy": APACHE + "\n\nclass C {}\n",
    "aspects/D.aj": APACHE + "\npackage a;\n",
    "web/default-ui.css": APACHE + "\nbody {}\n",
    "config/Dsl.xml":
      '<?xml version="1.0"?>\n<!--\n  ~ Licensed under the Apache License, Version 2.0\n-->\n<a/>\n',
    "javascript/lib/http.js": APACHE + "\n\nexport const a = 1;\n",
    "docs/vendor.css": APACHE + "\nbody {}\n",
  };
  const read = (directory, file) =>
    fs.readFileSync(path.join(directory, file), "utf8");

  it("changes Java, AspectJ, Groovy, Kotlin, JavaScript and gradle.properties, and not gradlew, notice.txt, XML, CSS or other files", () => {
    const directory = createRepo(files);
    const result = applyCommercialLicense({ directory });
    expect(result.changed.sort()).toEqual([
      "LICENSE.txt",
      "a/A.java",
      "a/B.kt",
      "a/C.groovy",
      "aspects/D.aj",
      "gradle.properties",
      "javascript/lib/http.js",
    ]);
    expect(result.headers).toBe(6);
    expect(result.java).toBe(1);
    expect(read(directory, "gradle.properties")).toBe(
      HASH_BROADCOM + PROPERTIES,
    );
    for (const file of [
      "a/B.kt",
      "a/C.groovy",
      "aspects/D.aj",
      "javascript/lib/http.js",
    ]) {
      expect(read(directory, file)).toContain(BROADCOM_COPYRIGHT);
      expect(read(directory, file)).not.toContain("Licensed under");
    }
    for (const file of [
      "notice.txt",
      "gradlew",
      "gradlew.bat",
      "docs/vendor.css",
      "web/default-ui.css",
      "config/Dsl.xml",
    ]) {
      expect(read(directory, file)).toBe(files[file]);
    }
  });

  it("is done again with nothing to change", () => {
    const directory = createRepo(files);
    applyCommercialLicense({ directory });
    git(directory, "add", "-A");
    git(directory, "commit", "-q", "-m", "done");
    expect(applyCommercialLicense({ directory }).changed).toEqual([]);
    expect(git(directory, "status", "--porcelain")).toBe("");
  });

  it("changes the files that the input header-files names, and only those", () => {
    const directory = createRepo(files);
    const result = applyCommercialLicense({
      directory,
      headerFiles: ["javascript/lib/*.js", "*.css"],
    });
    expect(result.changed.sort()).toEqual([
      "LICENSE.txt",
      "docs/vendor.css",
      "javascript/lib/http.js",
      "web/default-ui.css",
    ]);
    expect(read(directory, "a/A.java")).toBe(APACHE + BODY);
  });

  it("changes no header if header-files is empty", () => {
    const directory = createRepo(files);
    expect(
      applyCommercialLicense({ directory, headerFiles: [] }).changed,
    ).toEqual(["LICENSE.txt"]);
  });

  it("leaves a version that set-version changed before it, and after it", () => {
    const directory = createRepo(files);
    fs.writeFileSync(
      path.join(directory, "gradle.properties"),
      HASH_APACHE +
        "springBootVersion=4.2.0-SNAPSHOT\nversion=7.0.1.1-SNAPSHOT\n",
    );
    applyCommercialLicense({ directory });
    expect(read(directory, "gradle.properties")).toBe(
      HASH_BROADCOM +
        "springBootVersion=4.2.0-SNAPSHOT\nversion=7.0.1.1-SNAPSHOT\n",
    );
  });
});

describe("applyCommercialLicense, where the license is", () => {
  const read = (directory, file) =>
    fs.readFileSync(path.join(directory, file), "utf8");
  const bundled = fs.readFileSync(BUNDLED_LICENSE, "utf8");

  it.each(["LICENSE", "LICENSE.md", "LICENSE.txt"])(
    "replaces the file %s of the root in place, and makes no other",
    (name) => {
      const directory = createRepo({ [name]: OSS_LICENSE, "a.txt": "a" });
      const result = applyCommercialLicense({ directory });
      expect(result.changed).toEqual([name]);
      expect(read(directory, name)).toBe(bundled);
      expect(
        fs.readdirSync(directory).filter((f) => f.startsWith("LICENSE")),
      ).toEqual([name]);
    },
  );

  it("prefers LICENSE, then LICENSE.txt, of several", () => {
    const directory = createRepo({
      LICENSE: OSS_LICENSE,
      "LICENSE.txt": OSS_LICENSE,
      "LICENSE.md": OSS_LICENSE,
    });
    expect(applyCommercialLicense({ directory }).changed).toEqual(["LICENSE"]);
    const other = createRepo({
      "LICENSE.txt": OSS_LICENSE,
      "LICENSE.md": OSS_LICENSE,
    });
    expect(applyCommercialLicense({ directory: other }).changed).toEqual([
      "LICENSE.txt",
    ]);
  });

  it("fails, and changes nothing, if there are several and none is the usual one", () => {
    const directory = createRepo({
      "LICENSE.md": OSS_LICENSE,
      "LICENSE-APACHE": OSS_LICENSE,
      "A.java": APACHE + BODY,
    });
    expect(() => applyCommercialLicense({ directory })).toThrow(
      "give the one to replace as the input license-target",
    );
    expect(git(directory, "status", "--porcelain")).toBe("");
  });

  it("does not take the license of a module for the license of the project", () => {
    const directory = createRepo({
      "cli/content/LICENSE.txt": "Copyright 2012-2013\nApache\n",
    });
    const result = applyCommercialLicense({ directory });
    expect(result.changed).toEqual(["LICENSE.txt"]);
    expect(read(directory, "cli/content/LICENSE.txt")).toBe(
      "Copyright 2012-2013\nApache\n",
    );
  });

  it("writes the license where license-target says, and makes the directories", () => {
    const directory = createRepo({ "LICENSE.txt": OSS_LICENSE });
    const result = applyCommercialLicense({
      directory,
      licenseTarget: "legal/COMMERCIAL.txt",
    });
    expect(result.changed).toEqual(["legal/COMMERCIAL.txt"]);
    expect(read(directory, "legal/COMMERCIAL.txt")).toBe(bundled);
    expect(read(directory, "LICENSE.txt")).toBe(OSS_LICENSE);
  });

  it("fails for a license-target that is not in the repository", () => {
    const directory = createRepo({ "a.txt": "a" });
    expect(() =>
      applyCommercialLicense({ directory, licenseTarget: "../LICENSE.txt" }),
    ).toThrow("is not in the repository");
  });

  it("writes through a link to the one file, once, so that a license that is repeated in modules is changed in one place", () => {
    const directory = createRepo({
      "LICENSE.txt": OSS_LICENSE,
      "module/README.md": "m",
    });
    fs.symlinkSync(
      "../LICENSE.txt",
      path.join(directory, "module/LICENSE.txt"),
    );
    git(directory, "add", "-A");
    git(directory, "commit", "-q", "-m", "link");
    const result = applyCommercialLicense({
      directory,
      licenseTarget: "module/LICENSE.txt",
    });
    expect(result.changed).toEqual(["LICENSE.txt"]);
    expect(
      fs.lstatSync(path.join(directory, "module/LICENSE.txt")).isSymbolicLink(),
    ).toBe(true);
    expect(read(directory, "LICENSE.txt")).toBe(bundled);
    expect(read(directory, "module/LICENSE.txt")).toBe(bundled);
  });

  it("fails for a link that points outside the repository, or nowhere", () => {
    const directory = createRepo({ "a.txt": "a" });
    fs.symlinkSync("/etc/hosts", path.join(directory, "LICENSE.txt"));
    expect(() =>
      applyCommercialLicense({ directory, licenseTarget: "LICENSE.txt" }),
    ).toThrow("outside the repository");
    fs.rmSync(path.join(directory, "LICENSE.txt"));
    fs.symlinkSync("gone", path.join(directory, "LICENSE.txt"));
    expect(() =>
      applyCommercialLicense({ directory, licenseTarget: "LICENSE.txt" }),
    ).toThrow("does not exist");
  });
});

// The actions run as programs: the sources, and the bundle that GitHub runs (dist/).
describe.each([["src/index.js"], ["dist/index.js"]])(
  "the program %s",
  (entry) => {
    const repo = () =>
      createRepo({
        "LICENSE.txt": OSS_LICENSE,
        "A.java": APACHE + BODY,
        "B.java": APACHE + BODY,
      });

    it("changes the files, and writes its outputs, with the license that it bundles", async () => {
      const directory = repo();
      const result = await runAction(entry, { path: directory });
      expect(result.code).toBe(0);
      expect(result.outputs["java-files"]).toBe("2");
      expect(result.outputs.license).toBe("true");
      expect(JSON.parse(result.outputs.changed).sort()).toEqual([
        "A.java",
        "B.java",
        "LICENSE.txt",
      ]);
      expect(result.outputs.commit).toBe("");
      expect(
        fs.readFileSync(path.join(directory, "LICENSE.txt"), "utf8"),
      ).toContain("Foundation Agreement");
      expect(fs.readFileSync(path.join(directory, "A.java"), "utf8")).toBe(
        BROADCOM + BODY,
      );
    });

    it("commits if it is given a message", async () => {
      const directory = repo();
      const result = await runAction(entry, {
        path: directory,
        "commit-message": "Commercial changes for 7.0.1.1",
      });
      expect(result.code).toBe(0);
      expect(result.outputs.commit).toBe(git(directory, "rev-parse", "HEAD"));
      expect(git(directory, "status", "--porcelain")).toBe("");
    });

    it("fails with an error that GitHub shows", async () => {
      const result = await runAction(entry, {
        path: repo(),
        "license-file": "/nonexistent/L.txt",
      });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("::error::The license does not exist");
    });
  },
);
