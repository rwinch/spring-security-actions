import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCommercialLicense,
  BUNDLED_LICENSE,
  BUNDLED_LICENSE_SCRIPT,
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
 * Copyright 2004 Broadcom Inc. and/or its subsidiaries. All Rights Reserved.
 * Copyright 2004-present the original author or authors.
 */`;
const OSS_LICENSE = "Apache License\nVersion 2.0\n";
const ROOT_BUILD = "plugins {\n\tid 'java'\n}\n";

/** A project: a git repository that has the root build file that the POM license needs. */
const project = (files, options) =>
  createRepo({ "build.gradle": ROOT_BUILD, ...files }, options);
/** What was changed, but the POM license: the files of the license. */
const licensesOf = (changed) =>
  changed.filter(
    (file) =>
      !["build.gradle", "gradle/broadcom-license.gradle"].includes(file),
  );
const read = (directory, file) =>
  fs.readFileSync(path.join(directory, file), "utf8");

describe("the bundled files", () => {
  it("the license is the commercial one, and not the Apache one", () => {
    const text = fs.readFileSync(BUNDLED_LICENSE, "utf8");
    expect(text).toContain("Foundation Agreement");
    expect(text).not.toContain("Apache License");
    expect(text.split("\n").length).toBeGreaterThan(1000);
  });

  it("the script of the POM license sets the Broadcom Foundation License, without a URL", () => {
    const text = fs.readFileSync(BUNDLED_LICENSE_SCRIPT, "utf8");
    expect(text).toContain('plugins.withId("maven-publish")');
    expect(text).toContain("'Broadcom Foundation License'");
    expect(text).not.toContain("appendNode('url'");
  });
});

describe("applyCommercialLicense, the headers", () => {
  const files = {
    "LICENSE.txt": OSS_LICENSE,
    "src/main/java/a/Greeter.java": APACHE + BODY,
    "src/main/java/a/Other.java": "package a;\nclass Other {}\n",
    "src/main/java/a/Done.java": BROADCOM + BODY,
    "docs/Example.java.txt": APACHE + BODY, // not a Java file
  };
  const repo = (options) => project(files, options);

  it("changes the headers of the Java files, the license and the POM license, and nothing else", () => {
    const directory = repo();
    const { changed, java, license, year } = applyCommercialLicense({
      directory,
    });
    expect(changed.sort()).toEqual([
      "LICENSE.txt",
      "build.gradle",
      "gradle/broadcom-license.gradle",
      "src/main/java/a/Greeter.java",
    ]);
    expect(java).toBe(1);
    expect(license).toBe(true);
    expect(year).toBe("2004");
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
  });

  it("is done again with nothing to change", () => {
    const directory = repo();
    applyCommercialLicense({ directory });
    git(directory, "add", "-A");
    git(directory, "commit", "-q", "-m", "done");
    const again = applyCommercialLicense({ directory });
    expect(again.changed).toEqual([]);
    expect(again.license).toBe(false);
    expect(again.pom).toBe(false);
    expect(git(directory, "status", "--porcelain")).toBe("");
  });

  it("takes the oldest year of the copyright of the project, and not that of another holder", () => {
    const directory = project({
      "A.java": APACHE.replace("2004-present", "2010-2020") + BODY,
      "B.java":
        APACHE.replace("2004-present", "2008-2019").replace(
          " *\n * Licensed",
          " * Copyright 1999 Square Inc.\n *\n * Licensed",
        ) + BODY,
      "C.java": APACHE.replace("2004-present", "2015") + BODY,
    });
    expect(applyCommercialLicense({ directory }).year).toBe("2008");
    expect(read(directory, "C.java")).toContain(
      " * Copyright 2008 Broadcom Inc. and/or its subsidiaries. All Rights Reserved.\n * Copyright 2008-present the original author or authors.\n */",
    );
  });

  it("takes the year that it is given", () => {
    const directory = project({ "A.java": APACHE + BODY });
    expect(applyCommercialLicense({ directory, year: "2002" }).year).toBe(
      "2002",
    );
    expect(read(directory, "A.java")).toContain("Copyright 2002 Broadcom");
  });

  it("keeps the other holders of a file, and the Acegi line", () => {
    const directory = project({
      "A.java": `/*
 * Copyright 2002-2020 the original author or authors.
 * Copyright 2012 Square Inc.
 * Copyright 2004, 2005 Acegi Technology Pty Limited
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
class A {}
`,
    });
    applyCommercialLicense({ directory });
    expect(read(directory, "A.java")).toBe(`/*
 * Copyright 2002 Broadcom Inc. and/or its subsidiaries. All Rights Reserved.
 * Copyright 2002-present the original author or authors.
 * Copyright 2012 Square Inc.
 * Copyright 2004, 2005 Acegi Technology Pty Limited
 */
class A {}
`);
  });

  it("changes the XML, the properties and the gradle files, with the syntax of each", () => {
    const directory = project({
      "a/security.tld": `<?xml version="1.0" encoding="UTF-8" ?>
<!--
  ~ Copyright 2004-present the original author or authors.
  ~
  ~ Licensed under the Apache License, Version 2.0 (the "License");
  -->
<taglib/>
`,
      "gradle.properties": `#
# Copyright 2004-present the original author or authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
#
version=7.0.1.1-SNAPSHOT
`,
      "x/build.gradle": APACHE + "\nplugins {}\n",
    });
    applyCommercialLicense({ directory });
    expect(read(directory, "a/security.tld"))
      .toBe(`<?xml version="1.0" encoding="UTF-8" ?>
<!--
  ~ Copyright 2004 Broadcom Inc. and/or its subsidiaries. All Rights Reserved.
  ~ Copyright 2004-present the original author or authors.
  -->
<taglib/>
`);
    expect(read(directory, "gradle.properties"))
      .toBe(`# Copyright 2004 Broadcom Inc. and/or its subsidiaries. All Rights Reserved.
# Copyright 2004-present the original author or authors.
version=7.0.1.1-SNAPSHOT
`);
    expect(read(directory, "x/build.gradle")).toContain(
      "Copyright 2004 Broadcom",
    );
  });

  it("keeps windows line endings, and the file annotations of a Kotlin file", () => {
    const directory = project({
      "A.java": (APACHE + BODY).replaceAll("\n", "\r\n"),
      "B.kt": `@file:Suppress("x")\n\n${APACHE}\n\npackage b\n`,
    });
    applyCommercialLicense({ directory });
    expect(read(directory, "A.java")).toBe(
      (BROADCOM + BODY).replaceAll("\n", "\r\n"),
    );
    expect(read(directory, "B.kt")).toBe(
      `@file:Suppress("x")\n\n${BROADCOM}\n\npackage b\n`,
    );
  });

  it("does not change a file that checkstyle is told to skip completely, nor a header that is not Apache", () => {
    const directory = project({
      "etc/checkstyle/checkstyle-suppressions.xml":
        '<suppressions>\n<suppress files="BCrypt\\.java" checks=".*"/>\n<suppress files="Other" checks="Javadoc"/>\n</suppressions>\n',
      "crypto/BCrypt.java": APACHE + BODY,
      "crypto/Other.java": APACHE + BODY,
      "crypto/Mit.java":
        "/*\n * Copyright 2012 Someone\n * MIT license\n */\n" + BODY,
    });
    const { changed } = applyCommercialLicense({ directory });
    expect(changed).toContain("crypto/Other.java");
    expect(changed).not.toContain("crypto/BCrypt.java");
    expect(changed).not.toContain("crypto/Mit.java");
  });

  it("changes the files that the input header-files names, and only those", () => {
    const directory = project({
      "a/A.java": APACHE + BODY,
      "b/B.java": APACHE + BODY,
    });
    const { changed } = applyCommercialLicense({
      directory,
      headerFiles: ["a/**.java"],
    });
    expect(changed).toContain("a/A.java");
    expect(changed).not.toContain("b/B.java");
  });

  it("fails if there is no header to take the year from, and the project has a checkstyle header", () => {
    const directory = project({ "etc/checkstyle/header.txt": "^x$\n" });
    expect(() => applyCommercialLicense({ directory })).toThrow(
      "give the input year",
    );
    expect(
      applyCommercialLicense({ directory, year: "2002" }).changed,
    ).toContain("etc/checkstyle/header.txt");
  });

  it("fails for a year that is not one", () => {
    expect(() =>
      applyCommercialLicense({ directory: repo(), year: "soon" }),
    ).toThrow("is not a year");
  });
});

describe("applyCommercialLicense, etc/checkstyle/header.txt", () => {
  it("is replaced with the header of the canonical year, if the project has one", () => {
    const directory = project({
      "etc/checkstyle/header.txt": "^\\Q/*\\E$\n^\\Q * Copyright \\E20\\d\\d\n",
      "A.java": APACHE + BODY,
    });
    expect(applyCommercialLicense({ directory }).changed).toContain(
      "etc/checkstyle/header.txt",
    );
    expect(read(directory, "etc/checkstyle/header.txt")).toBe(
      [
        "^\\Q/*\\E$",
        "^\\Q * Copyright \\E2004\\Q Broadcom Inc. and/or its subsidiaries. All Rights Reserved.\\E$",
        "^\\Q * Copyright \\E(2004-present the original author or authors.|\\d{4}(, \\d{4})* Acegi Technology Pty Limited)$",
        "^\\Q */\\E$",
        "^$",
        "",
      ].join("\n"),
    );
  });

  it("is not made if the project has none", () => {
    const directory = project({ "A.java": APACHE + BODY });
    applyCommercialLicense({ directory });
    expect(fs.existsSync(path.join(directory, "etc/checkstyle"))).toBe(false);
  });
});

describe("applyCommercialLicense, the license of the POM", () => {
  it("writes the script, and applies it from the root build file", () => {
    const directory = project({ "A.java": APACHE + BODY });
    const result = applyCommercialLicense({ directory });
    expect(result.pom).toBe(true);
    expect(read(directory, "gradle/broadcom-license.gradle")).toBe(
      fs.readFileSync(BUNDLED_LICENSE_SCRIPT, "utf8"),
    );
    expect(read(directory, "build.gradle")).toBe(
      `${ROOT_BUILD}apply from: "$rootDir/gradle/broadcom-license.gradle"\n`,
    );
  });

  it("applies it with the syntax of Kotlin to build.gradle.kts, and ends a file that has no last line ending", () => {
    const directory = createRepo({ "build.gradle.kts": "plugins { java }" });
    applyCommercialLicense({ directory });
    expect(read(directory, "build.gradle.kts")).toBe(
      'plugins { java }\napply(from = "$rootDir/gradle/broadcom-license.gradle")\n',
    );
  });

  it("applies it once, whatever is there", () => {
    const directory = project({
      "gradle/broadcom-license.gradle": "// mine\n",
    });
    const first = applyCommercialLicense({ directory });
    expect(first.changed).toContain("gradle/broadcom-license.gradle");
    const second = applyCommercialLicense({ directory });
    expect(second.pom).toBe(false);
    expect(
      read(directory, "build.gradle").match(/broadcom-license/g),
    ).toHaveLength(1);
  });

  it("fails, and changes nothing, if the root has no build file", () => {
    const directory = createRepo({ "A.java": APACHE + BODY });
    expect(() => applyCommercialLicense({ directory })).toThrow(
      "no build.gradle or build.gradle.kts",
    );
    expect(git(directory, "status", "--porcelain")).toBe("");
  });
});

describe("applyCommercialLicense, the license and the commit", () => {
  const files = { "LICENSE.txt": OSS_LICENSE, "A.java": APACHE + BODY };

  it("creates LICENSE.txt if the project has none", () => {
    const directory = project({ "a.txt": "a" });
    expect(applyCommercialLicense({ directory }).license).toBe(true);
    expect(fs.existsSync(path.join(directory, "LICENSE.txt"))).toBe(true);
  });

  it("takes another license if it is given one", () => {
    const directory = project(files);
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
        directory: project(files),
        licenseFile: "/nonexistent/L.txt",
      }),
    ).toThrow("The license does not exist");
  });

  it("commits the changes if it is given a message, signed off, and only those files", () => {
    const directory = project(files);
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
    ).toEqual([
      "A.java",
      "LICENSE.txt",
      "build.gradle",
      "gradle/broadcom-license.gradle",
    ]);
    expect(git(directory, "status", "--porcelain")).toBe("A  unrelated.txt");
  });

  it("makes no commit if there is nothing to change", () => {
    const directory = project(files);
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
    const directory = project(files, { identity: false });
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

describe("applyCommercialLicense, where the license is", () => {
  const read = (directory, file) =>
    fs.readFileSync(path.join(directory, file), "utf8");
  const bundled = fs.readFileSync(BUNDLED_LICENSE, "utf8");

  it.each(["LICENSE", "LICENSE.md", "LICENSE.txt"])(
    "replaces the file %s of the root in place, and makes no other",
    (name) => {
      const directory = project({ [name]: OSS_LICENSE, "a.txt": "a" });
      const result = applyCommercialLicense({ directory });
      expect(result.changed).toContain(name);
      expect(read(directory, name)).toBe(bundled);
      expect(
        fs.readdirSync(directory).filter((f) => f.startsWith("LICENSE")),
      ).toEqual([name]);
    },
  );

  it("prefers LICENSE, then LICENSE.txt, of several", () => {
    const directory = project({
      LICENSE: OSS_LICENSE,
      "LICENSE.txt": OSS_LICENSE,
      "LICENSE.md": OSS_LICENSE,
    });
    expect(licensesOf(applyCommercialLicense({ directory }).changed)).toEqual([
      "LICENSE",
    ]);
    const other = project({
      "LICENSE.txt": OSS_LICENSE,
      "LICENSE.md": OSS_LICENSE,
    });
    expect(
      licensesOf(applyCommercialLicense({ directory: other }).changed),
    ).toEqual(["LICENSE.txt"]);
  });

  it("fails, and changes nothing, if there are several and none is the usual one", () => {
    const directory = project({
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
    const directory = project({
      "cli/content/LICENSE.txt": "Copyright 2012-2013\nApache\n",
    });
    const result = applyCommercialLicense({ directory });
    expect(licensesOf(result.changed)).toEqual(["LICENSE.txt"]);
    expect(read(directory, "cli/content/LICENSE.txt")).toBe(
      "Copyright 2012-2013\nApache\n",
    );
  });

  it("writes the license where license-target says, and makes the directories", () => {
    const directory = project({ "LICENSE.txt": OSS_LICENSE });
    const result = applyCommercialLicense({
      directory,
      licenseTarget: "legal/COMMERCIAL.txt",
    });
    expect(licensesOf(result.changed)).toEqual(["legal/COMMERCIAL.txt"]);
    expect(read(directory, "legal/COMMERCIAL.txt")).toBe(bundled);
    expect(read(directory, "LICENSE.txt")).toBe(OSS_LICENSE);
  });

  it("fails for a license-target that is not in the repository", () => {
    const directory = project({ "a.txt": "a" });
    expect(() =>
      applyCommercialLicense({ directory, licenseTarget: "../LICENSE.txt" }),
    ).toThrow("is not in the repository");
  });

  it("writes through a link to the one file, once, so that a license that is repeated in modules is changed in one place", () => {
    const directory = project({
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
    expect(licensesOf(result.changed)).toEqual(["LICENSE.txt"]);
    expect(
      fs.lstatSync(path.join(directory, "module/LICENSE.txt")).isSymbolicLink(),
    ).toBe(true);
    expect(read(directory, "LICENSE.txt")).toBe(bundled);
    expect(read(directory, "module/LICENSE.txt")).toBe(bundled);
  });

  it("fails for a link that points outside the repository, or nowhere", () => {
    const directory = project({ "a.txt": "a" });
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
      project({
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
      expect(result.outputs.year).toBe("2004");
      expect(result.outputs["pom-license"]).toBe("true");
      expect(JSON.parse(result.outputs.changed).sort()).toEqual([
        "A.java",
        "B.java",
        "LICENSE.txt",
        "build.gradle",
        "gradle/broadcom-license.gradle",
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
