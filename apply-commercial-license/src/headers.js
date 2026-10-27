/**
 * The copyright header of a source file, and its rewrite to the one shape of the
 * commercial repositories (what secd licensing broadcom does):
 *
 *   Copyright <YEAR> Broadcom Inc. and/or its subsidiaries. All Rights Reserved.
 *   Copyright <YEAR>-present the original author or authors.
 *
 * <YEAR> is one year for the whole project, so that etc/checkstyle/header.txt can have it
 * as a literal. The line of the authors is the one with a year of its own, so it takes
 * that year. Every other copyright line (the Acegi one, which has years of its own, and
 * the lines of other holders) is kept, as it was, after it. The license text is left out.
 *
 * The header is the comment at the very start of the file, in the syntax of its file: a
 * block comment (Java, AspectJ, Groovy, Kotlin, JavaScript, .gradle), a block of # lines
 * (.properties), or an XML comment after the prolog (.xml, .tld). It is a header only if
 * it says that it is licensed under the Apache License, or has the Broadcom line already,
 * and has a copyright line. Anything else is not touched.
 */

export const C_STYLE_SUFFIXES = [
  ".java",
  ".aj",
  ".groovy",
  ".kt",
  ".gradle",
  ".gradle.kts",
  ".js",
];
export const HASH_SUFFIXES = [".properties"];
export const XML_SUFFIXES = [".xml", ".tld"];

const APACHE = "Licensed under the Apache License";
const BROADCOM = "Broadcom Inc. and/or its subsidiaries";
const BROADCOM_LINE =
  /^Copyright\s+(\d{4})\s+Broadcom Inc\. and\/or its subsidiaries\. All Rights Reserved\.$/;
const AUTHORS_LINE =
  /^Copyright\s+[\d,\s-]*?(?:present)?\s*the original author or authors\.?$/;
const ACEGI_LINE = /Acegi Technology Pty/;

export function broadcomLine(year) {
  return `Copyright ${year} Broadcom Inc. and/or its subsidiaries. All Rights Reserved.`;
}

export function authorsLine(year) {
  return `Copyright ${year}-present the original author or authors.`;
}

/** The kind of header a file has by its name, or undefined if it is not one of them. */
export function kindOf(file) {
  const has = (suffixes) => suffixes.some((suffix) => file.endsWith(suffix));
  if (has(C_STYLE_SUFFIXES)) return "c-style";
  if (has(HASH_SUFFIXES)) return "hash";
  if (has(XML_SUFFIXES)) return "xml";
  return undefined;
}

function years(text) {
  return [...text.matchAll(/\b(\d{4})\b/g)].map((match) => Number(match[1]));
}

// What the header of a kind looks like around its lines.
const SYNTAX = {
  "c-style": {
    flatten: (line) => line.trim().replace(/^\*/, "").trim(),
    render: (lines) => ["/*", ...lines.map((l) => ` * ${l}`), " */"],
  },
  hash: {
    flatten: (line) => line.trim().replace(/^#/, "").trim(),
    render: (lines) => lines.map((l) => `# ${l}`),
  },
  xml: {
    flatten: (line) => line.trim().replace(/^~/, "").trim(),
    render: (lines) => ["<!--", ...lines.map((l) => `  ~ ${l}`), "  -->"],
  },
};

/**
 * Where the header is in a text: { start, end, lines } with the text of its lines flattened
 * to bare text, or undefined if the file does not start with a comment of that kind.
 * The text from start to end is what is replaced.
 */
function locate(text, kind) {
  if (kind === "c-style") {
    // Kotlin files can have file annotations (@file:Suppress(...)) before the header
    const match =
      /^((?:[ \t]*\r?\n|@file:[^\r\n]*\r?\n)*)\/\*[ \t]*\r?\n([\s\S]*?)\*\//.exec(
        text,
      );
    if (!match || match[2].split("\n").length > 60) {
      return undefined;
    }
    const interior = match[2].replace(/\r?\n[ \t]*$/, "");
    return {
      start: match[1].length,
      end: match[0].length,
      lines: interior.split(/\r?\n/),
    };
  }
  if (kind === "hash") {
    if (text.startsWith("#!")) {
      return undefined;
    }
    const match = /^(?:#[^\r\n]*(?:\r?\n|$))+/.exec(text);
    if (!match) {
      return undefined;
    }
    const block = match[0].replace(/\r?\n$/, "");
    return { start: 0, end: block.length, lines: block.split(/\r?\n/) };
  }
  const match =
    /^((?:<\?xml[^\r\n]*\r?\n)?(?:[ \t]*\r?\n)*)<!--[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*-->/.exec(
      text,
    );
  if (!match || match[2].split("\n").length > 60) {
    return undefined;
  }
  return {
    start: match[1].length,
    end: match[0].length,
    lines: match[2].split(/\r?\n/),
  };
}

/**
 * The header of a text: { location, copyrights, years } or undefined if there is none that
 * this changes. copyrights are the copyright lines of the header, as bare text, without the
 * Broadcom one. years are the years of the copyright of the project in it: those of the
 * authors line, of the Acegi line and of the Broadcom line, and not those of other holders.
 */
export function parseHeader(text, kind) {
  const location = locate(text, kind);
  if (!location) {
    return undefined;
  }
  const flat = location.lines.map(SYNTAX[kind].flatten).filter(Boolean);
  const joined = flat.join(" ");
  if (!joined.includes(APACHE) && !joined.includes(BROADCOM)) {
    return undefined;
  }
  const copyrights = [];
  const found = [];
  for (const line of flat) {
    const broadcom = BROADCOM_LINE.exec(line);
    if (broadcom) {
      found.push(Number(broadcom[1]));
    } else if (/^Copyright\b/.test(line)) {
      copyrights.push(line);
      if (AUTHORS_LINE.test(line) || ACEGI_LINE.test(line)) {
        found.push(...years(line));
      }
    }
  }
  if (copyrights.length === 0 && found.length === 0) {
    return undefined;
  }
  return { location, flat, copyrights, years: found };
}

/** The lines of the header with a year: the Broadcom line, then the copyrights. */
function canonicalLines(header, year) {
  const lines = [broadcomLine(year)];
  let authors = false;
  for (const line of header.copyrights) {
    if (AUTHORS_LINE.test(line)) {
      if (!authors) {
        lines.push(authorsLine(year));
        authors = true;
      }
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/**
 * The text with its header in the canonical shape for the year, or the same text if it has
 * none or it is that already. The line endings of the file are kept.
 */
export function rewriteHeader(text, kind, year) {
  const header = parseHeader(text, kind);
  if (!header) {
    return text;
  }
  const lines = canonicalLines(header, year);
  if (
    header.flat.length === lines.length &&
    header.flat.every((line, i) => line === lines[i])
  ) {
    return text;
  }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const replacement = SYNTAX[kind].render(lines).join(eol);
  const { start, end } = header.location;
  return text.slice(0, start) + replacement + text.slice(end);
}

/** The years of the project in the header of a text, none if there is no header. */
export function yearsOf(text, kind) {
  return parseHeader(text, kind)?.years ?? [];
}

/**
 * The checkstyle header (etc/checkstyle/header.txt, a line of regular expressions for
 * every line of the header of a file) of the canonical headers of a year.
 */
export function checkstyleHeader(year) {
  return [
    "^\\Q/*\\E$",
    `^\\Q * Copyright \\E${year}\\Q Broadcom Inc. and/or its subsidiaries. All Rights Reserved.\\E$`,
    `^\\Q * Copyright \\E(${year}-present the original author or authors.|\\d{4}(, \\d{4})* Acegi Technology Pty Limited)$`,
    "^\\Q */\\E$",
    "^$",
    "",
  ].join("\n");
}

/**
 * The predicate of the files that checkstyle is told to skip completely, by a suppression
 * with checks=".*" in a checkstyle-suppressions.xml (third-party code that is checked in:
 * BCrypt.java). Their headers are not ours to change. A suppression's files is a regular
 * expression that is searched for in the path, as checkstyle does.
 */
export function suppressedBy(suppressionFiles) {
  const patterns = [];
  for (const xml of suppressionFiles) {
    for (const tag of xml.matchAll(/<suppress\b[^>]*>/g)) {
      const attribute = (name) =>
        new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(tag[0])?.[1];
      if (attribute("checks") === ".*" && attribute("files")) {
        try {
          patterns.push(new RegExp(attribute("files")));
        } catch {
          // not a regular expression of JavaScript: checkstyle's is Java's, so skip it
        }
      }
    }
  }
  return (file) => patterns.some((pattern) => pattern.test(file));
}
