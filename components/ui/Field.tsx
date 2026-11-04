import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cx } from "@/lib/cx";
import { UI_LABELS } from "@/lib/labels";

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
 *
 * A group of radios cannot sit in a `<label>`, which names one control. With
 * `group` the field is a `<fieldset>` instead and its label the `<legend>`,
 * which is what names a set of choices. The hint and the error are then
 * outside any label, so give the field a `messageId` and point the choices'
 * `aria-describedby` at it.
 */
type FieldProps = {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Renders an "Optional" marker instead of the required asterisk. */
  optional?: boolean;
  /** A set of choices rather than one control: a fieldset with a legend. */
  group?: boolean;
  /** The id of whichever of the hint and the error is showing. */
  messageId?: string;
  className?: string;
};

export function Field({
  label,
  children,
  hint,
  error,
  required = false,
  optional = false,
  group = false,
  messageId,
  className,
}: FieldProps) {
  const Root = group ? "fieldset" : "label";
  const LabelRow = group ? "legend" : "span";

  return (
    <Root className={cx(styles.field, group && styles.group, className)}>
      <LabelRow className={styles.labelRow}>
        <span className={styles.label}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden>
              *
            </span>
          )}
        </span>
        {optional && !required && <span className={styles.optional}>{UI_LABELS.optional}</span>}
      </LabelRow>

      {children}

      {error ? (
        <span className={styles.error} role="alert" id={messageId}>
          {error}
        </span>
      ) : (
        hint && (
          <span className={styles.hint} id={messageId}>
            {hint}
          </span>
        )
      )}
    </Root>
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
