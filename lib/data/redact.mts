/**
 * Keeps connection-string credentials out of the database tooling's output.
 *
 * Shared by the three commands that hold a connection string:
 * `lib/data/migrate.mts`, `lib/data/seed.mts` and
 * `scripts/check-target-compatibility.mts`. It used to be copied into all
 * three, which is how all three came to have the same bug.
 *
 * Not application code, and nothing under `app/`, `components/` or `lib/*.ts`
 * imports it: the application never holds a connection string of its own --
 * `lib/data/client.ts` reads the environment variable and hands it straight to
 * the driver. This lives beside its two main callers rather than in `scripts/`
 * so that `lib/data/` does not have to import upwards out of itself. It holds
 * no SQL, so being inside a `check:tsql` scan root costs nothing.
 *
 * WHAT IT IS FOR. A driver error can quote the text it was given, and these
 * commands print driver errors because that is where the useful detail is. So
 * every error they print goes through a redactor built from the connection
 * string, which masks the credential wherever it appears -- including inside a
 * message this repository did not write.
 *
 * WHAT IT IS NOT. It is not a connection-string parser for general use, and it
 * must not grow into one. It reads exactly enough structure to find the values
 * worth masking, and it is written to the syntax the installed driver actually
 * accepts -- `mssql` parses with `@tediousjs/connection-string`, whose rules are
 * mirrored in `splitPairs` below. `scripts/check-redaction.mts` is what keeps
 * the two from drifting.
 */

/** A key and its value, as the connection string spells them. */
export type ConnectionPair = { key: string; value: string };

/**
 * The quote styles a **value** may use, and what closes each.
 *
 * All three are real: `"…"`, `'…'` and the ODBC brace form `{…}`. A quote only
 * opens a quoted value when it is the first non-blank character after the `=`;
 * anywhere else it is an ordinary character, so `Password=a"b` is the
 * three-character value `a"b` and not a syntax error.
 */
const VALUE_QUOTES: Record<string, string> = { '"': '"', "'": "'", "{": "}" };

/**
 * Splits a connection string into its pairs, honouring quoted values.
 *
 * **The bug this exists to fix.** All three commands used to do
 * `connectionString.split(";")`, which is wrong because a semicolon inside a
 * quoted value does not end the value: `Password="a;b"` is one pair whose value
 * is `a;b`. Splitting blindly produced the fragment `"a` and discarded the rest,
 * so the real password never reached the redactor and the command would have
 * printed it had a driver error quoted it. It also produced a two-character
 * "secret" that the redactor then masked everywhere, turning the word
 * `"available"` in an unrelated message into `***vailable"`.
 *
 * The rules below are the driver's, verified against
 * `@tediousjs/connection-string` rather than assumed:
 *
 *   - keys are never quoted and end at the first `=`;
 *   - leading blanks are skipped on both sides of the `=`;
 *   - a value that opens with `"`, `'` or `{` ends at its matching close, and a
 *     **doubled** close is a literal one -- `"a""b"` is `a"b`;
 *   - an unquoted value ends at the first `;`, and a **doubled** semicolon is a
 *     literal one -- `a;;b` is `a;b`;
 *   - an unquoted value is trimmed; a quoted one is not, so
 *     `Password="  a  "` keeps its spaces.
 *
 * **It never throws.** The driver rejects a malformed string when the pool is
 * constructed, and that is the right place for the complaint; a redactor that
 * threw would take out the error reporting instead. An unterminated quote is
 * read to the end of the string, which is the safe direction to be wrong in:
 * the value comes out too long rather than too short, so the secret is still
 * covered.
 */
export function splitPairs(connectionString: string): ConnectionPair[] {
  const pairs: ConnectionPair[] = [];
  let index = 0;

  const skipBlanks = () => {
    while (index < connectionString.length && /\s/.test(connectionString[index])) {
      index += 1;
    }
  };

  while (index < connectionString.length) {
    skipBlanks();
    if (index >= connectionString.length) break;

    // The key: everything up to the first `=`.
    let key = "";
    while (index < connectionString.length && connectionString[index] !== "=") {
      key += connectionString[index];
      index += 1;
    }

    // No `=` at all -- a trailing fragment with no value. Nothing to mask.
    if (index >= connectionString.length) break;
    index += 1; // step over the `=`

    skipBlanks();

    let value = "";
    const opener = connectionString[index];
    const closer = opener === undefined ? undefined : VALUE_QUOTES[opener];

    if (closer !== undefined) {
      index += 1; // step over the opening quote
      let closed = false;
      while (index < connectionString.length) {
        if (connectionString[index] === closer) {
          if (connectionString[index + 1] === closer) {
            value += closer; // a doubled close is a literal one
            index += 2;
            continue;
          }
          index += 1; // step over the closing quote
          closed = true;
          break;
        }
        value += connectionString[index];
        index += 1;
      }
      // Unterminated: `value` already holds the rest of the string, which is
      // the over-long-but-covered outcome the comment above describes.
      if (closed) {
        // Whatever follows a closed quoted value is the driver's problem, not
        // ours. Skip to the next pair.
        while (index < connectionString.length && connectionString[index] !== ";") {
          index += 1;
        }
      }
    } else {
      while (index < connectionString.length) {
        if (connectionString[index] === ";") {
          if (connectionString[index + 1] === ";") {
            value += ";"; // a doubled terminator is a literal one
            index += 2;
            continue;
          }
          break;
        }
        value += connectionString[index];
        index += 1;
      }
      value = value.trim();
    }

    index += 1; // step over the `;` that ended this pair, if there was one
    pairs.push({ key: key.trim(), value });
  }

  return pairs;
}

/** Keys whose value is a credential. Matched case-insensitively, as before. */
const CREDENTIAL_KEY = /password|pwd|token|secret|key/i;

/** Keys naming the server. Masked as infrastructure identity, not as a secret. */
const SERVER_KEY = /^(server|data source|addr|address|network address)$/i;

/**
 * Where an extracted value stops being masked blindly and starts being masked
 * only as a delimited token.
 *
 * **It decides *how* a value is masked, never *whether*.** Every value this
 * module identifies is masked; a short one is simply masked more carefully.
 *
 * Both strategies exist because each is wrong for the other's case:
 *
 *   - **Blind** replacement -- `split`/`join` over every occurrence -- is what a
 *     normal-length secret needs, because it also catches one concatenated into
 *     a longer token. `prefixSyntheticPw123suffix` has to be masked, and only a
 *     substring search finds it.
 *   - Blind replacement of a *tiny* value destroys the output instead. A
 *     one-character secret `a` rewrote all six of a sample of real driver
 *     messages: `no pool "available"` came out as `no pool "***v***il***ble"`.
 *   - **Boundary-aware** replacement fixes that: a short value is masked only
 *     where it stands as its own token, so `password 'a' rejected` is masked
 *     while `available`, `audit` and `attributes` are left alone.
 *
 * Four is where the two meet. It is not a claim about what can be a credential
 * -- a short or weak password is still a credential and is still masked -- only
 * about which replacement is safe to use on a string that short.
 *
 * **The complete connection string is always masked blindly**, whatever its
 * length: it is the one entry that is certainly a secret rather than a value
 * parsed out of one, and it must be caught wherever it appears.
 */
const BLIND_MASK_MIN_LENGTH = 4;

/**
 * Escapes a value for literal use inside a regular expression.
 *
 * A credential may contain regex syntax, and a short one reaches `RegExp`.
 * Unescaped, `a(b` and `a[b` throw -- which would take out the error reporting
 * this module exists to protect -- while `a.b` and `a|b` quietly match text
 * that is not the secret. Hand-written rather than pulled from a dependency:
 * one character class is the whole of it.
 */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a masker from the connection string without revealing it.
 *
 * Credentials and the server address are masked wherever they appear, including
 * inside a driver error we did not write. The database name and user are left
 * readable: they are diagnostics these commands exist to report, and neither is
 * a credential.
 *
 * **Nothing identified here is ever skipped for being short.** Values split
 * into two groups by `BLIND_MASK_MIN_LENGTH` -- blind for the normal-length
 * ones, delimited-token-only for the tiny ones -- and both groups are applied.
 *
 * Longest first within each group, so a secret that contains another is masked
 * whole.
 */
export function createRedactor(connectionString: string): (text: string) => string {
  /** Masked wherever they occur, including inside a longer token. */
  const blind = new Set<string>();
  /** Masked only where they stand as their own token. */
  const delimited = new Set<string>();

  // The whole string is always blind, whatever its length -- but not when it is
  // empty. `"".split("")` splits a string into its characters, so an empty
  // secret would put `***` between every letter of every message. The commands
  // all refuse a blank connection string before they get here, which is why
  // this is a guard rather than a code path.
  if (connectionString !== "") blind.add(connectionString);

  const add = (value: string) => {
    if (value === "") return;
    if (value.length >= BLIND_MASK_MIN_LENGTH) blind.add(value);
    else delimited.add(value);
  };

  for (const { key, value } of splitPairs(connectionString)) {
    if (value === "") continue;

    if (CREDENTIAL_KEY.test(key)) add(value);

    if (SERVER_KEY.test(key)) {
      add(value);
      // A connection string writes `host,port`; the driver reports `host:port`.
      // Adding the bare host masks it in both forms.
      const [host] = value.split(",");
      if (host !== undefined && host.trim() !== "") add(host.trim());
    }
  }

  const blindOrdered = [...blind].sort((a, b) => b.length - a.length);

  /**
   * One alternation for every short value, longest first -- a regex alternation
   * tries its branches left to right, which is the same "longest wins" rule the
   * blind pass gets from sorting.
   *
   * The boundary is ASCII alphanumeric on both sides, so a short value is
   * masked when something that is not a letter or digit sits either side of it
   * (a quote, a bracket, a space, punctuation, or the start or end of the
   * text) and left alone when it is buried inside a longer run of them. That is
   * what separates the secret `a` in `password 'a' rejected` from the `a` in
   * `available`.
   */
  const delimitedPattern =
    delimited.size === 0
      ? null
      : new RegExp(
          `(?<![A-Za-z0-9])(?:${[...delimited]
            .sort((a, b) => b.length - a.length)
            .map(escapeForRegExp)
            .join("|")})(?![A-Za-z0-9])`,
          "g",
        );

  return (text) => {
    let safe = text;
    for (const secret of blindOrdered) safe = safe.split(secret).join("***");
    if (delimitedPattern !== null) safe = safe.replace(delimitedPattern, "***");
    return safe;
  };
}
