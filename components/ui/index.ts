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
export { Chip } from "./Chip";
export { EmptyState } from "./EmptyState";
export { FocusRestoringNav } from "./FocusRestoringNav";
export { Icon } from "./Icon";
export type { IconName } from "./Icon";
export {
  Checkbox,
  Field,
  FieldRow,
  Input,
  Radio,
  Select,
  Textarea,
} from "./Field";
export { Menu } from "./Menu";
export { ConfirmDialog, Modal } from "./Modal";
export { PageHeader } from "./PageHeader";
export type { Breadcrumb } from "./PageHeader";
export { QueuedNavigation } from "./QueuedNavigation";
export { SegmentedControl } from "./SegmentedControl";
export type { SegmentLink, SegmentOption } from "./SegmentedControl";
export { LoadingBlock, Spinner } from "./Spinner";
export { ToastProvider, useToast } from "./Toast";
