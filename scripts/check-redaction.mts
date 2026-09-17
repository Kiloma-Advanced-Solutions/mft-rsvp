/**
 * Proves the credential redactor in `lib/data/redact.mts` does its job.
 *
 *   npm run check:redaction
 *
 * The three database commands print driver errors, and a driver error can quote
 * the text it was given. The redactor is the only thing between that and a
 * password in a terminal or a CI log, so it gets a test of its own rather than
 * a reading.
 *
 * **Every value here is synthetic.** No real credential, host or database name
 * appears in this file, and nothing in it reads the environment or opens a
 * connection. `SyntheticPw…`, `a;b` and `h.example.net` are the whole cast.
 *
 * Two halves, and both are load-bearing:
 *
 *   1. the extracted value must equal what the driver would parse, because a
 *      value we get wrong is a value we do not mask;
 *   2. ordinary diagnostic text must come through untouched, because a normal
 *      -length secret is replaced by substring search and a bad "secret"
 *      corrupts the very messages these commands exist to print;
 *   3. a **short** value is masked too -- as its own token rather than as a
 *      substring -- because being short is not a reason to leak it, and
 *      replacing it blindly would eat ordinary words.
 *
 * The expected values in the first half were taken from
 * `@tediousjs/connection-string` -- the parser `mssql` itself uses -- rather
 * than from reading our own code. That package is a transitive dependency and
 * is deliberately **not** imported here: this check stays dependency-free so it
 * cannot break when the driver's own tree moves. Re-confirm by hand against it
 * if these rules ever look wrong.
 *
 * Node built-ins only, so it runs with bare `node`.
 */

import { createRedactor, splitPairs } from "../lib/data/redact.mts";

type Check = { name: string; ok: boolean; detail?: string };

const checks: Check[] = [];

function add(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok, detail });
}

/** The value `splitPairs` finds for a key, or `undefined`. */
function valueOf(connectionString: string, key: string): string | undefined {
  return splitPairs(connectionString).find(
    (pair) => pair.key.toLowerCase() === key.toLowerCase(),
  )?.value;
}

/* ------------------------------------------------- 1. extraction is correct */

/**
 * `[label, connection string, key, the value the driver parses]`.
 *
 * The quoted-semicolon rows are the bug this module was written for: every one
 * of them used to yield a fragment such as `"a`, leaving the real password
 * unmasked.
 */
const EXTRACTION: Array<[string, string, string, string]> = [
  ["plain unquoted", `Password=SyntheticPw1`, "Password", "SyntheticPw1"],
  ["double-quoted semicolon", `Password="a;b"`, "Password", "a;b"],
  ["single-quoted semicolon", `Password='a;b'`, "Password", "a;b"],
  ["brace-quoted semicolon", `Password={a;b}`, "Password", "a;b"],
  ["Pwd with semicolon and equals", `Pwd="a;b=c"`, "Pwd", "a;b=c"],
  ["unquoted equals signs", `Password=a=b=c`, "Password", "a=b=c"],
  ["many semicolons quoted", `Password="a;b;c;d"`, "Password", "a;b;c;d"],
  ["braced many semicolons", `Password={a;b;c;d}`, "Password", "a;b;c;d"],
  ["mixed-case key", `PaSsWoRd="a;b"`, "PaSsWoRd", "a;b"],
  ["whitespace around =", `Password  =  SyntheticPw2 ;Database=d`, "Password", "SyntheticPw2"],
  ["quoted keeps its spaces", `Password="  a;b  "`, "Password", "  a;b  "],
  ["quote inside other quote", `Password='a"b;c'`, "Password", `a"b;c`],
  ["doubled semicolon unquoted", `Password=a;;b`, "Password", "a;b"],
  ["doubled quote is literal", `Password="a""b"`, "Password", `a"b`],
  ["doubled brace is literal", `Password={a}}b}`, "Password", "a}b"],
  ["quote not at start is literal", `Password=a"b`, "Password", `a"b`],
  ["empty quoted value", `Password=""`, "Password", ""],
  // Position must not matter: the same value, first and last in the string.
  [
    "credential first of many",
    `Password="a;b";Server=h.example.net,1433;Database=d`,
    "Password",
    "a;b",
  ],
  [
    "credential last of many",
    `Server=h.example.net,1433;Database=d;Password="a;b"`,
    "Password",
    "a;b",
  ],
];

for (const [label, connectionString, key, expected] of EXTRACTION) {
  const actual = valueOf(connectionString, key);
  add(
    `extracts [${label}]`,
    actual === expected,
    actual === expected ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

/* --------------------------------------------- 2. the redactor masks it all */

/**
 * A value is only extracted so it can be masked, so the same shapes are checked
 * again end-to-end: the password alone in a line of error text must not survive.
 *
 * These carry values at or above `BLIND_MASK_MIN_LENGTH`, so this section
 * exercises the **blind** replacement path specifically -- the semicolons,
 * quotes and braces that the parser has to get right are all still here.
 * Section 7 covers the short values that take the boundary-aware path, and
 * nothing is exempt from masking in either.
 */
const MASKING: Array<[string, string, string]> = [
  ["plain unquoted", `Password=SyntheticPw1`, "SyntheticPw1"],
  ["double-quoted semicolons", `Password="Synthetic;Pw;2"`, "Synthetic;Pw;2"],
  ["single-quoted semicolons", `Password='Synthetic;Pw;3'`, "Synthetic;Pw;3"],
  ["brace-quoted semicolons", `Password={Synthetic;Pw;4}`, "Synthetic;Pw;4"],
  ["Pwd with semicolon and equals", `Pwd="Synthetic;Pw=5"`, "Synthetic;Pw=5"],
  ["unquoted equals signs", `Password=Synthetic=Pw=6`, "Synthetic=Pw=6"],
  ["mixed-case key", `PaSsWoRd="Synthetic;Pw;7"`, "Synthetic;Pw;7"],
  ["whitespace around =", `Password  =  SyntheticPw8 ;Database=d`, "SyntheticPw8"],
  ["quoted keeps its spaces", `Password="  Synthetic;Pw;9  "`, "  Synthetic;Pw;9  "],
  ["quote inside other quote", `Password='Synthetic"Pw;10'`, `Synthetic"Pw;10`],
  ["doubled semicolon unquoted", `Password=Synthetic;;Pw11`, "Synthetic;Pw11"],
  ["doubled quote is literal", `Password="Synthetic""Pw12"`, `Synthetic"Pw12`],
  ["doubled brace is literal", `Password={Synthetic}}Pw13}`, "Synthetic}Pw13"],
  [
    "credential among many pairs",
    `Server=h.example.net,1433;Password="Synthetic;Pw;14";Database=d`,
    "Synthetic;Pw;14",
  ],
];

for (const [label, connectionString, secret] of MASKING) {
  // Guards the table itself: a typo here would silently test nothing.
  add(
    `masking case [${label}] extracts its secret first`,
    splitPairs(connectionString).some((pair) => pair.value === secret),
    JSON.stringify(splitPairs(connectionString)),
  );

  const redact = createRedactor(connectionString);
  const line = `Login failed. The value was ${secret} -- rejected.`;
  add(`masks [${label}] in error text`, !redact(line).includes(secret), redact(line));
}

/*
 * A value below the blind threshold is extracted **and masked** -- the
 * threshold picks the replacement strategy, it does not grant an exemption.
 * This was once asserted the other way round, which encoded the implementation
 * rather than the contract; section 7 is where the strategy is exercised in
 * full.
 */
{
  const shortSecret = `Password=a;;b`; // the value is `a;b` -- three characters
  add(
    "a short value is still extracted",
    valueOf(shortSecret, "Password") === "a;b",
    JSON.stringify(valueOf(shortSecret, "Password")),
  );
  add(
    "a short value is masked, not exempted",
    !createRedactor(shortSecret)(`the value a;b was rejected`).includes("a;b"),
    createRedactor(shortSecret)(`the value a;b was rejected`),
  );
}

/* ------------------------------------- 3. server/infrastructure masking kept */

const WITH_SERVER = `Server=h.example.net,1433;Database=d;User Id=u;Password=SyntheticPw3;Encrypt=true`;
{
  const redact = createRedactor(WITH_SERVER);
  add(
    "masks the server with its port, as written",
    redact(`connect ECONNREFUSED h.example.net,1433`) === "connect ECONNREFUSED ***",
    redact(`connect ECONNREFUSED h.example.net,1433`),
  );
  add(
    "masks the bare host, as the driver reports it",
    !redact(`getaddrinfo ENOTFOUND h.example.net`).includes("h.example.net"),
    redact(`getaddrinfo ENOTFOUND h.example.net`),
  );
  add(
    "masks the host in the driver's host:port form",
    !redact(`failed to connect to h.example.net:1433`).includes("h.example.net"),
    redact(`failed to connect to h.example.net:1433`),
  );
  add(
    "masks the password",
    !redact(`password SyntheticPw3 rejected`).includes("SyntheticPw3"),
    redact(`password SyntheticPw3 rejected`),
  );
  // The two values that are diagnostics rather than secrets stay readable.
  add(
    "leaves the database name readable",
    redact(`Cannot open database "d"`).includes(`"d"`),
    redact(`Cannot open database "d"`),
  );
  add(
    "leaves the user name readable",
    redact(`Login failed for user 'u'`).includes("'u'"),
    redact(`Login failed for user 'u'`),
  );
}

/* --------------------------------- 4. the whole connection string is masked */

for (const [label, connectionString] of EXTRACTION) {
  const redact = createRedactor(connectionString);
  const echoed = `Failed to parse: ${connectionString}`;
  add(
    `masks the verbatim connection string [${label}]`,
    !redact(echoed).includes(connectionString),
    redact(echoed),
  );
}

// And it is masked whatever its length -- the floor never applies to it.
{
  const tiny = `Pwd=ab`;
  const redact = createRedactor(tiny);
  add(
    "masks a connection string shorter than the floor",
    redact(`gave ${tiny} to the driver`) === "gave *** to the driver",
    redact(`gave ${tiny} to the driver`),
  );
}

/* ------------------------------ 5. ordinary diagnostics are not corrupted */

/**
 * The other half of the bargain. These are real driver and pool messages, and
 * the words in them -- `available`, `audit`, `attributes` -- are exactly what
 * the old two-character fragment `"a` used to eat.
 */
{
  const redact = createRedactor(
    `Server=h.example.net,1433;Database=d;User Id=u;Password="Synthetic;Pw;15";Encrypt=true`,
  );
  const INNOCENT = [
    `Failed to connect: no pool "available" for request`,
    `Invalid object name 'dbo."audit"'.`,
    `Login timeout expired while reading "attributes"`,
    `Cannot insert duplicate key in object 'dbo.Events_Registrations'`,
    `Transaction (Process ID 57) was deadlocked on lock resources`,
  ];
  for (const line of INNOCENT) {
    add(`leaves ordinary diagnostics alone: ${line.slice(0, 46)}`, redact(line) === line, redact(line));
  }
  // The real password from that same string is still masked.
  add(
    "still masks the quoted password it was built from",
    !redact(`the value Synthetic;Pw;15 was rejected`).includes("Synthetic;Pw;15"),
    redact(`the value Synthetic;Pw;15 was rejected`),
  );
}

/* ------------------------------------------- 6. malformed input fails safe */

/**
 * The driver rejects a malformed string when the pool is built; the redactor
 * only has to survive one and still cover what it can. Being wrong long is
 * safe, being wrong short is not.
 */
{
  const UNTERMINATED: Array<[string, string]> = [
    ["unterminated double quote", `Server=h.example.net,1433;Password="Synthetic;Pw;16`],
    ["unterminated single quote", `Server=h.example.net,1433;Password='Synthetic;Pw;17`],
    ["unterminated brace", `Server=h.example.net,1433;Password={Synthetic;Pw;18`],
  ];
  for (const [label, connectionString] of UNTERMINATED) {
    const secret = connectionString.slice(connectionString.length - 15);
    let threw = false;
    let masked = "";
    try {
      masked = createRedactor(connectionString)(`the value ${secret} was rejected`);
    } catch {
      threw = true;
    }
    add(`does not throw on [${label}]`, !threw);
    add(
      `still masks the secret in [${label}]`,
      !threw && !masked.includes(secret),
      masked,
    );
  }

  // Shapes with nothing to find must be quiet rather than fatal.
  const DEGENERATE = ["", ";", ";;;", "NoEqualsAtAll", "=novalue", "Password=", "   "];
  for (const connectionString of DEGENERATE) {
    let threw = false;
    try {
      createRedactor(connectionString)("some text");
      splitPairs(connectionString);
    } catch {
      threw = true;
    }
    add(`survives degenerate input ${JSON.stringify(connectionString)}`, !threw);
  }
  // An empty connection string must not mask the whole world.
  add(
    "an empty connection string masks nothing",
    createRedactor("")("untouched text") === "untouched text",
    createRedactor("")("untouched text"),
  );
}

/* ------------------------- 7. short values: masked, but as whole tokens only */

/**
 * The half of the contract that the blind strategy cannot provide.
 *
 * A one-, two- or three-character credential is still a credential, so it is
 * masked -- but only where it stands as its own token, because replacing every
 * occurrence of `a` would rewrite most of an error message. These prove both
 * halves of that: the secret goes, the prose stays.
 */
{
  /*
   * The masked cases name their exact expected output rather than asserting
   * "the secret is absent". For a one-character secret the letter legitimately
   * occurs all over the surrounding prose -- `password` contains an `a` -- so
   * an absence check would be unsatisfiable and would say nothing about whether
   * the right occurrence was replaced. The exact string says both.
   */
  const CASES: Array<[string, string, Array<[string, string]>, string[]]> = [
    // [connection string, secret, [input, expected output], must be untouched]
    [
      `Password=a`,
      "a",
      [
        [`password 'a' rejected`, `password '***' rejected`],
        [`[a]`, `[***]`],
        [`the value was a.`, `the value was ***.`],
        [`a`, `***`],
      ],
      [
        `Failed to connect: no pool "available" for request`,
        `Invalid object name 'dbo."audit"'.`,
        `Login timeout expired while reading "attributes"`,
      ],
    ],
    [
      `Password=ab`,
      "ab",
      [
        [`password 'ab' rejected`, `password '***' rejected`],
        [`[ab]`, `[***]`],
        [`the value was ab.`, `the value was ***.`],
      ],
      // `ab` inside a longer alphanumeric run is not this secret standing alone.
      [`no pool "available" for request`, `abandoned request`, `tab=ab1`],
    ],
    [
      `Password=abc`,
      "abc",
      [
        [`password 'abc' rejected`, `password '***' rejected`],
        [`[abc]`, `[***]`],
        [`the value was abc.`, `the value was ***.`],
      ],
      [`Transaction (Process ID 57) was deadlocked`, `abcdef is a token`],
    ],
  ];

  for (const [connectionString, secret, masked, untouched] of CASES) {
    const redact = createRedactor(connectionString);

    add(
      `short secret ${JSON.stringify(secret)} is extracted`,
      valueOf(connectionString, "Password") === secret,
      JSON.stringify(valueOf(connectionString, "Password")),
    );

    for (const [text, expected] of masked) {
      add(
        `masks short ${JSON.stringify(secret)} as a token: ${JSON.stringify(text)}`,
        redact(text) === expected,
        `expected ${JSON.stringify(expected)}, got ${JSON.stringify(redact(text))}`,
      );
    }
    for (const text of untouched) {
      add(
        `short ${JSON.stringify(secret)} leaves alone: ${JSON.stringify(text)}`,
        redact(text) === text,
        redact(text),
      );
    }
  }
}

/*
 * And the other side: a normal-length secret keeps blind replacement, so it is
 * still caught when a driver concatenates it into a longer token. This is the
 * regression test that proves the short-value strategy was added beside the old
 * one rather than in place of it.
 */
{
  const secret = "SyntheticPw123";
  const redact = createRedactor(`Password=${secret}`);
  for (const text of [
    `token=prefix${secret}suffix`,
    `url: sqlserver://u:${secret}@h.example.net`,
    `the value was ${secret}.`,
  ]) {
    add(
      `normal-length secret masked even concatenated: ${JSON.stringify(text)}`,
      !redact(text).includes(secret),
      redact(text),
    );
  }
}

/* --------------------- 8. short values containing regular-expression syntax */

/**
 * A short value reaches `RegExp`, so it has to be escaped on the way in.
 * Unescaped, `a(b` and `a[b` throw -- taking out the error reporting entirely
 * -- and `a.b` and `a|b` match text that is not the secret. Every value here is
 * three characters, so every one takes the boundary-aware path.
 */
{
  const METACHARS = ["a.b", "a*b", "a+b", "a?b", "a|b", "a(b", "a)b", "a[b", "a]b", "a{b", "a}b", "a^b", "a$b", "a\\b"];
  for (const secret of METACHARS) {
    // Quoted so the parser keeps the value whole whatever it contains.
    const connectionString = `Password="${secret}"`;

    add(
      `metachar secret ${JSON.stringify(secret)} is extracted whole`,
      valueOf(connectionString, "Password") === secret,
      JSON.stringify(valueOf(connectionString, "Password")),
    );

    let redact: (text: string) => string;
    try {
      redact = createRedactor(connectionString);
    } catch (error) {
      add(`metachar secret ${JSON.stringify(secret)} does not throw`, false, String(error));
      continue;
    }
    add(`metachar secret ${JSON.stringify(secret)} does not throw`, true);

    const real = `the value was ${secret} rejected`;
    add(
      `metachar secret ${JSON.stringify(secret)} is masked`,
      !redact(real).includes(secret),
      redact(real),
    );

    // `axb` is what an unescaped `a.b` would wrongly match, and it is not the
    // secret in any of these cases.
    const decoy = `the value was axb rejected`;
    add(
      `metachar secret ${JSON.stringify(secret)} does not match the decoy`,
      redact(decoy) === decoy,
      redact(decoy),
    );
  }
}

/* --------------------------------- 9. short server/infrastructure values */

/**
 * The same policy, applied to the other kind of value this module identifies.
 * A one- or two-character host alias is masked as a token rather than dropped,
 * and the `host,port` pair and the bare port keep the behaviour they had.
 */
{
  const HOSTS = ["h", "db"];
  for (const host of HOSTS) {
    const connectionString = `Server=${host},1433;Database=d;Password=SyntheticPw1`;
    const redact = createRedactor(connectionString);

    add(
      `short host ${JSON.stringify(host)} is masked as a token`,
      redact(`getaddrinfo ENOTFOUND ${host}`) === "getaddrinfo ENOTFOUND ***",
      redact(`getaddrinfo ENOTFOUND ${host}`),
    );
    add(
      `short host ${JSON.stringify(host)} keeps host,port masking`,
      redact(`connect ECONNREFUSED ${host},1433`) === "connect ECONNREFUSED ***",
      redact(`connect ECONNREFUSED ${host},1433`),
    );
    add(
      `short host ${JSON.stringify(host)} does not corrupt ordinary words`,
      redact(`Login timeout expired while reading the schema`) ===
        `Login timeout expired while reading the schema`,
      redact(`Login timeout expired while reading the schema`),
    );
    add(
      `short host ${JSON.stringify(host)} leaves the port alone`,
      redact(`listening on 1433`) === "listening on 1433",
      redact(`listening on 1433`),
    );
  }
}

/* ------------------------------------------------------------------ report */

const failed = checks.filter((check) => !check.ok);
for (const check of failed) {
  console.error(`FAIL  ${check.name}${check.detail ? `  (${check.detail})` : ""}`);
}
console.log(
  `check:redaction -- ${checks.length - failed.length}/${checks.length} checks passed`,
);

process.exit(failed.length === 0 ? 0 : 1);
