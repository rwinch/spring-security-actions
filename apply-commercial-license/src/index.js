import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "@actions/core";
import { git, requireIdentity } from "./git.js";
import { execute, isMain } from "./run.js";

const BROADCOM_NOTICE =
  "Copyright 2004 Broadcom Inc. and/or its subsidiaries. All Rights Reserved.";
export const BROADCOM_COPYRIGHT = ` * ${BROADCOM_NOTICE}`;

/**
 * The files whose header is changed, as git pathspecs: the sources of the Spring projects
 * (Java, AspectJ, Groovy, Kotlin, and the JavaScript of Spring Security) and
 * gradle.properties, which has the header as a block of # lines. Anything else that has an
 * Apache header (XML, CSS, .gradle files) is left as it is, as it is in the commercial
 * repositories, and so are gradlew and gradlew.bat, which have the header of Gradle.
 */
export const DEFAULT_HEADER_FILES = [
  "*.java",
  "*.aj",
  "*.groovy",
  "*.kt",
  "*.js",
  "gradle.properties",
];

// The commercial license, which is bundled with the action: it is the file LICENSE.txt
// next to action.yml. The program is in src/apply-commercial-license/ or in
// dist/apply-commercial-license/, the same depth, so it is found from both.
export const BUNDLED_LICENSE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "apply-commercial-license",
  "LICENSE.txt",
);

/**
 * The text of a source file with its Apache license header replaced by the Broadcom one:
 * a Broadcom copyright line first, then the copyright lines that the header had, as they
 * were, and the license text left out.
 *
 *   /*
 *    * Copyright 2004 Broadcom Inc. and/or its subsidiaries. All Rights Reserved.
 *    * Copyright 2002-2026 the original author or authors.
 *    *\/
 *
 * The header is the comment at the very start of the file: a block comment, or for a file
 * that starts with # (gradle.properties) the block of # lines. It is only changed if it
 * says that it is licensed under the Apache License. A file that has another header, or
 * the Broadcom one already, is returned as it is, so it is safe to do more than once. The
 * line endings of the file are kept.
 */
export function replaceHeader(text) {
  if (text.startsWith("#!")) {
    return text;
  }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (text.startsWith("#")) {
    return replaceHashHeader(text, eol);
  }
  // Kotlin files can have file annotations (@file:Suppress(...)) before the header
  const header =
    /^((?:[ \t]*\r?\n|@file:[^\r\n]*\r?\n)*)\/\*([\s\S]*?)\*\//.exec(text);
  if (!header || !isApache(header[2])) {
    return text;
  }
  const copyrights = header[2]
    .split(/\r?\n/)
    .filter((line) => /^\s*\*\s*Copyright /.test(line));
  const replacement = ["/*", BROADCOM_COPYRIGHT, ...copyrights, " */"].join(
    eol,
  );
  return header[1] + replacement + text.slice(header[0].length);
}

function isApache(comment) {
  return comment.includes("Licensed under the Apache License");
}

/**
 * The header of a file that starts with a block of # lines. A bare # line that opens or
 * closes the block is kept, so that the block looks as it did:
 *
 *   #
 *   # Copyright 2004 Broadcom Inc. and/or its subsidiaries. All Rights Reserved.
 *   # Copyright 2004-present the original author or authors.
 *   #
 */
function replaceHashHeader(text, eol) {
  const lines = text.split(/\r?\n/);
  let end = 0;
  while (end < lines.length && lines[end].startsWith("#")) {
    end++;
  }
  const block = lines.slice(0, end);
  if (!isApache(block.join("\n"))) {
    return text;
  }
  const bare = (line) => line.trim() === "#";
  const copyrights = block.filter((line) => /^#\s*Copyright /.test(line));
  const replacement = [
    ...(bare(block[0]) ? ["#"] : []),
    `# ${BROADCOM_NOTICE}`,
    ...copyrights,
    ...(bare(block[block.length - 1]) ? ["#"] : []),
  ];
  return [...replacement, ...lines.slice(end)].join(eol);
}

/**
 * The path of the license in the repository, relative to it. It is the given one, or the
 * file of the root of the repository that git tracks and that is named LICENSE*
 * (LICENSE, LICENSE.txt, LICENSE.md): the license of a module that is deeper is not it.
 * With several, LICENSE and then LICENSE.txt are preferred, and with no other choice it
 * fails and says to give the path. With none, it is LICENSE.txt, which is made.
 */
export function licenseTargetOf(directory, given = "") {
  if (given) {
    const full = path.resolve(directory, given);
    const relative = path.relative(path.resolve(directory), full);
    if (
      relative === "" ||
      relative.startsWith("..") ||
      path.isAbsolute(relative)
    ) {
      throw new Error(`The license target ${given} is not in the repository`);
    }
    return relative.split(path.sep).join("/");
  }
  const found = git(directory, "ls-files", "-z", "--", ":(glob)LICENSE*")
    .split("\0")
    .filter(Boolean);
  if (found.length === 0) {
    return "LICENSE.txt";
  }
  for (const preferred of ["LICENSE", "LICENSE.txt"]) {
    if (found.includes(preferred)) {
      return preferred;
    }
  }
  if (found.length === 1) {
    return found[0];
  }
  throw new Error(
    `The repository has several licenses (${found.join(", ")}): give the one to replace as the input license-target`,
  );
}

/**
 * Where the license is written: the target, or, if it is a symbolic link, the file that it
 * points to, so that a license that is repeated in several modules as links to one file
 * is written once. It is relative to the repository.
 */
function writableLicense(directory, target) {
  const full = path.join(directory, target);
  let stat;
  try {
    stat = fs.lstatSync(full);
  } catch {
    return target;
  }
  if (!stat.isSymbolicLink()) {
    return target;
  }
  let real;
  try {
    real = fs.realpathSync(full);
  } catch {
    throw new Error(`${target} is a link to a file that does not exist`);
  }
  const relative = path.relative(fs.realpathSync(directory), real);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${target} is a link to a file outside the repository`);
  }
  return relative.split(path.sep).join("/");
}

/**
 * Changes the files of a git repository to the commercial ones, which is only done for a
 * hotfix: the license header of the source files (headerFiles), and the license of the
 * project. It returns what it changed. If it is given a message, it commits that, signed
 * off, as the identity that git is set up with.
 */
export function applyCommercialLicense({
  directory,
  licenseFile = BUNDLED_LICENSE,
  licenseTarget = "",
  headerFiles = DEFAULT_HEADER_FILES,
  commitMessage = "",
  log = () => {},
}) {
  if (!fs.existsSync(licenseFile)) {
    throw new Error(`The license does not exist: ${licenseFile}`);
  }
  // before anything is changed, so a failure here changes nothing
  const target = writableLicense(
    directory,
    licenseTargetOf(directory, licenseTarget),
  );

  const changed = [];
  const sources =
    headerFiles.length === 0
      ? []
      : git(directory, "ls-files", "-z", "--", ...headerFiles)
          .split("\0")
          .filter(Boolean);
  for (const file of sources) {
    const full = path.join(directory, file);
    const text = fs.readFileSync(full, "utf8");
    const replaced = replaceHeader(text);
    if (replaced !== text) {
      fs.writeFileSync(full, replaced);
      changed.push(file);
      log(`${file}: the Broadcom header`);
    }
  }
  const headers = changed.length;
  const java = changed.filter((file) => file.endsWith(".java")).length;

  const full = path.join(directory, target);
  const license = fs.readFileSync(licenseFile);
  const had = fs.existsSync(full);
  if (!had || !fs.readFileSync(full).equals(license)) {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, license);
    changed.push(target);
    log(`${target}: the commercial license${had ? "" : " (it had none)"}`);
  }

  let commit = "";
  if (commitMessage && changed.length > 0) {
    requireIdentity(directory);
    git(directory, "add", "--", ...changed);
    git(
      directory,
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--signoff",
      "--message",
      commitMessage,
      "--",
      ...changed,
    );
    commit = git(directory, "rev-parse", "HEAD");
    log(`Committed ${commit.slice(0, 7)}: ${commitMessage}`);
  }
  return {
    changed,
    headers,
    java,
    license: changed.includes(target),
    commit,
  };
}

export async function main() {
  const headerFiles = core
    .getInput("header-files")
    .split(/\s+/)
    .filter(Boolean);
  const result = applyCommercialLicense({
    directory: core.getInput("path") || ".",
    licenseFile: core.getInput("license-file") || BUNDLED_LICENSE,
    licenseTarget: core.getInput("license-target"),
    headerFiles: headerFiles.length > 0 ? headerFiles : DEFAULT_HEADER_FILES,
    commitMessage: core.getInput("commit-message"),
    log: (line) => core.info(line),
  });
  core.info(
    `${result.headers} headers and ${result.license ? "the license" : "no license"} changed`,
  );
  core.setOutput("headers", String(result.headers));
  core.setOutput("java-files", String(result.java));
  core.setOutput("license", String(result.license));
  core.setOutput("changed", JSON.stringify(result.changed));
  core.setOutput("commit", result.commit);
}

if (isMain(import.meta.url)) {
  execute(main);
}
