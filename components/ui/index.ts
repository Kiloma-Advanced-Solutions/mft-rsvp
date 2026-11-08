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
export type { BadgeTone } from "./Badge";
export { Button, buttonClass } from "./Button";
export type { ButtonVariant } from "./Button";
export { Card } from "./Card";
export { Chip } from "./Chip";
export { EmptyState } from "./EmptyState";
export { FocusRestoringNav } from "./FocusRestoringNav";
export { Icon } from "./Icon";
export type { IconName } from "./Icon";
export { Checkbox, Field, FieldRow, Input, Textarea } from "./Field";
export { ActionMenu, Menu } from "./Menu";
export type { ActionMenuItem } from "./Menu";
export { ConfirmDialog, Modal } from "./Modal";
export { PageHeader } from "./PageHeader";
export type { Breadcrumb } from "./PageHeader";
export { QueuedNavigation } from "./QueuedNavigation";
export { SegmentIndicator } from "./SegmentIndicator";
export { SegmentedControl } from "./SegmentedControl";
export type { SegmentLink, SegmentOption } from "./SegmentedControl";
export { ToastProvider, useToast } from "./Toast";
