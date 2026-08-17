/**
 * Barrel for the UI kit, so screens import from one place:
 *
 *   import { Button, Card, Field, Input } from "@/components/ui";
 *
 * These are generic primitives. Anything that knows what an "event" is belongs
 * in `components/events/` instead.
 */

export { Avatar, AvatarStack, Person } from "./Avatar";
export { Badge } from "./Badge";
export type { BadgeTone, BadgeVariant } from "./Badge";
export { Button, buttonClass } from "./Button";
export type { ButtonSize, ButtonVariant } from "./Button";
export { Card, CardBody, CardFooter, CardHeader } from "./Card";
export { EmptyState } from "./EmptyState";
export {
  Checkbox,
  Field,
  FieldRow,
  Input,
  Radio,
  Select,
  Textarea,
} from "./Field";
export { ConfirmDialog, Modal } from "./Modal";
export { PageHeader } from "./PageHeader";
export { SegmentedControl } from "./SegmentedControl";
export type { SegmentOption } from "./SegmentedControl";
export { LoadingBlock, Spinner } from "./Spinner";
export { ToastProvider, useToast } from "./Toast";
