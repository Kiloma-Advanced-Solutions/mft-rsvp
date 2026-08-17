import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cx } from "@/lib/cx";

import styles from "./Field.module.css";

/**
 * Form building blocks.
 *
 * `Field` renders as a `<label>` wrapping its control, so the label is
 * associated implicitly and there are no ids to keep in sync. That also keeps
 * every one of these usable from a Server Component — none of them ships a
 * client boundary or a hook.
 *
 *   <Field label="Title" required error={errors.title}>
 *     <Input name="title" defaultValue={event.title} />
 *   </Field>
 */
type FieldProps = {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Renders an "Optional" marker instead of the required asterisk. */
  optional?: boolean;
  className?: string;
};

export function Field({
  label,
  children,
  hint,
  error,
  required = false,
  optional = false,
  className,
}: FieldProps) {
  return (
    <label className={cx(styles.field, className)}>
      <span className={styles.labelRow}>
        <span className={styles.label}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden>
              *
            </span>
          )}
        </span>
        {optional && !required && <span className={styles.optional}>Optional</span>}
      </span>

      {children}

      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : (
        hint && <span className={styles.hint}>{hint}</span>
      )}
    </label>
  );
}

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(styles.control, styles.input, className)} />;
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...rest} className={cx(styles.control, styles.textarea, className)} />
  );
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(styles.control, styles.select, className)}>
      {children}
    </select>
  );
}

/** Checkbox carrying its own label. Does not go inside a `Field`. */
export function Checkbox({
  label,
  hint,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className={cx(styles.check, className)}>
      <input type="checkbox" {...rest} />
      <span className={styles.checkText}>
        <span className={styles.checkLabel}>{label}</span>
        {hint && <span className={styles.checkHint}>{hint}</span>}
      </span>
    </label>
  );
}

/** Radio carrying its own label. Give every option in a group the same `name`. */
export function Radio({
  label,
  hint,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className={cx(styles.check, className)}>
      <input type="radio" {...rest} />
      <span className={styles.checkText}>
        <span className={styles.checkLabel}>{label}</span>
        {hint && <span className={styles.checkHint}>{hint}</span>}
      </span>
    </label>
  );
}

/** Puts two or three fields side by side, stacking on narrow screens. */
export function FieldRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx(styles.row, className)}>{children}</div>;
}
