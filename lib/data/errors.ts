/**
 * The one SQL Server failure this application treats as a domain outcome.
 *
 * Everything else the driver throws is a real failure and must keep travelling
 * up to `withErrorHandling`, which logs it server-side and answers a 500 that
 * says nothing about SQL Server. A duplicate key is different: it is not a
 * fault, it is the database enforcing a product rule -- one registration per
 * person per event -- and the product already has wording for that. So it is
 * classified here, in one place, rather than with driver-specific `catch`
 * blocks scattered through the data layer or, worse, through route handlers.
 *
 * **Deadlock (error 1205) is deliberately not here.** A deadlock victim is an
 * operational failure, not a statement about the domain: nothing changed
 * underneath the caller, and telling them "this has changed, reload" would be
 * a plausible-sounding lie. It would also swallow the one signal that would
 * disprove Slice 8's lock-ordering claim, because a mapped error is never
 * logged. An unexpected 1205 therefore takes the ordinary server-error path,
 * where it is logged and visible.
 *
 * Nothing here is imported from `mssql`. The driver's error classes are read
 * structurally, by number, because that is the part that is stable: `mssql`
 * sets `number` on a `RequestError`, and wraps the tedious error underneath as
 * `originalError`, which is where the number sometimes ends up instead.
 *
 * Both numbers below predate SQL Server 2008 R2.
 */

/**
 * 2627 -- unique CONSTRAINT violation. 2601 -- unique INDEX violation.
 *
 * `UQ_Events_Registrations_Event_User` is a constraint, so 2627 is the one this
 * project actually produces; 2601 is here because the same mistake against a
 * unique index reports differently and a future index should not need a second
 * thought about it.
 */
const DUPLICATE_KEY = new Set([2627, 2601]);

/** The SQL Server error number, wherever on the thrown object it landed. */
function errorNumber(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const direct = (error as { number?: unknown }).number;
  if (typeof direct === "number") return direct;

  const original = (error as { originalError?: unknown }).originalError;
  if (typeof original === "object" && original !== null) {
    const wrapped = (original as { number?: unknown }).number;
    if (typeof wrapped === "number") return wrapped;

    const info = (original as { info?: unknown }).info;
    if (typeof info === "object" && info !== null) {
      const fromInfo = (info as { number?: unknown }).number;
      if (typeof fromInfo === "number") return fromInfo;
    }
  }

  return undefined;
}

/**
 * Somebody else inserted the same key first.
 *
 * Deliberately says only *that* a unique key was violated, not which one. The
 * one caller is the seat claim, and the only unique constraint any statement it
 * runs can violate is `UQ_Events_Registrations_Event_User` -- so at that call
 * site the answer is unambiguous. Anywhere else it would not be, and this
 * should not be used to decide a message without checking what the caller can
 * actually collide with.
 */
export function isDuplicateKey(error: unknown): boolean {
  const number = errorNumber(error);
  return number !== undefined && DUPLICATE_KEY.has(number);
}
