/**
 * Turns an image into a TypeScript module the email templates can import.
 *
 *   node scripts/base64convertor.mts <image> [exportName]
 *
 * Writes `emails/images/<image name>.ts` containing one line,
 *
 *   export const <exportName> = 'data:image/<type>;base64,...';
 *
 * which is the organization's convention for email images: the mail
 * environment does not fetch remote images, so each one travels inside the
 * message as a `data:` URI. Adapted from the organization's
 * `base64convertor.js`, which had its input and output paths edited into the
 * file; here the input is an argument and the output is always this
 * repository's `emails/images/`, found from the script's own location rather
 * than from whoever's machine it runs on.
 *
 * `exportName` defaults to the image's file name, which therefore has to be a
 * valid identifier -- pass one explicitly otherwise (`tohenWhite.png` was
 * exported as `tohenWhiteLogo`). PNG, JPEG and GIF only: Outlook does not
 * render SVG, and anything else is a guess about what a mail client accepts.
 *
 * It never overwrites. If the module already exists it stops, so regenerating
 * an image is a deliberate delete-then-convert rather than a silent replace.
 *
 * Exit codes: 0 written, 1 refused, 2 usage.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUTPUT_DIR = join(ROOT, "emails", "images");

/** File extension -> the media type written into the data URI. */
const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const SAFE_FILE_NAME = /^[A-Za-z0-9_-]+$/;

/**
 * Names that pass `IDENTIFIER` but cannot be the binding in
 * `export const <name> = ...` -- checked against this repository's TypeScript
 * and compiler options. TypeScript's contextual keywords (`type`, `as`,
 * `async`, `module`, `namespace`, ...) are ordinary names there and stay
 * allowed.
 */
const RESERVED_BINDING_NAMES = new Set([
  // ECMAScript reserved words
  "break", "case", "catch", "class", "const", "continue", "debugger", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for",
  "function", "if", "import", "in", "instanceof", "new", "null", "return",
  "super", "switch", "this", "throw", "true", "try", "typeof", "var", "void",
  "while", "with",
  // reserved in strict mode, which every module is
  "implements", "interface", "let", "package", "private", "protected", "public",
  "static", "yield",
  // reserved at the top level of a module, or not bindable in strict mode
  "await", "eval", "arguments",
]);

function fail(message: string, code: 1 | 2 = 1): never {
  console.error(`base64convertor: ${message}`);
  process.exit(code);
}

const [inputArg, exportArg] = process.argv.slice(2);
if (!inputArg) {
  fail("usage: node scripts/base64convertor.mts <image> [exportName]", 2);
}

const inputPath = resolve(inputArg);
if (!existsSync(inputPath) || !statSync(inputPath).isFile()) {
  fail(`no such file: ${inputArg}`);
}

const extension = extname(inputPath).toLowerCase();
const mediaType = MEDIA_TYPES[extension];
if (!mediaType) {
  fail(`unsupported image type "${extension || "(none)"}" -- use PNG, JPEG or GIF.`);
}

const name = basename(inputPath, extname(inputPath));
if (!SAFE_FILE_NAME.test(name)) {
  fail(`"${name}" is not a safe module file name -- rename the image first.`);
}

const exportName = exportArg ?? name;
if (!IDENTIFIER.test(exportName)) {
  fail(`"${exportName}" is not a valid export name -- pass one as the second argument.`);
}
if (RESERVED_BINDING_NAMES.has(exportName)) {
  fail(
    `"${exportName}" is a reserved word and cannot be an export name -- pass ` +
      `another as the second argument, e.g. ${exportName}Logo.`,
  );
}

const outputPath = join(OUTPUT_DIR, `${name}.ts`);
if (existsSync(outputPath)) {
  fail(`${relative(ROOT, outputPath)} already exists -- delete it first to regenerate it.`);
}

const dataUri = `data:${mediaType};base64,${readFileSync(inputPath).toString("base64")}`;

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(outputPath, `export const ${exportName} = '${dataUri}';\n`, "utf8");

console.log(`base64convertor: wrote ${relative(ROOT, outputPath)} (export ${exportName}).`);
