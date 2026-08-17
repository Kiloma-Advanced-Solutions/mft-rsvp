/**
 * Joins class names, dropping anything falsy.
 *
 *   cx(styles.card, isActive && styles.active, className)
 *
 * Small enough not to warrant a dependency, and it keeps conditional classes
 * readable inside JSX.
 */
export function cx(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}
