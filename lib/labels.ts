/**
 * The words the product uses, in one place.
 *
 * Copy is part of the design. If every screen invents its own phrasing for
 * "approval needed" the app stops feeling like one product, so put user-facing
 * vocabulary here and import it rather than typing strings into JSX.
 */

import type { BadgeTone } from "@/components/ui";
import type {
  EventAccess,
  EventCategory,
  EventLocation,
  EventStatus,
  RegistrationAvailability,
  RegistrationClosedReason,
  RegistrationStatus,
  RequestDecisionAvailability,
  RequestDecisionClosedReason,
} from "./types";

/* ------------------------------------------------------------------ access */

export const ACCESS_LABELS: Record<EventAccess, string> = {
  open: "פתוח",
  approval: "דרוש אישור",
  invite: "בהזמנה בלבד",
};

/** The longer explanation, for forms and the detail page. */
export const ACCESS_DESCRIPTIONS: Record<EventAccess, string> = {
  open: "כל אחד יכול לראות את האירוע ולהירשם בלחיצה אחת.",
  approval: "כל אחד יכול לראות את האירוע, אבל אתם מחליטים מי נכנס.",
  invite: "רק מי שתזמינו יוכל לראות את האירוע.",
};

export const ACCESS_TONES: Record<EventAccess, BadgeTone> = {
  open: "success",
  approval: "warning",
  invite: "primary",
};

/** Fixed order for access filters and pickers, so the options never shuffle. */
export const ACCESS_ORDER: EventAccess[] = ["open", "approval", "invite"];

/* ------------------------------------------------------------------ status */

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "טיוטה",
  published: "פורסם",
  cancelled: "בוטל",
};

export const EVENT_STATUS_TONES: Record<EventStatus, BadgeTone> = {
  draft: "neutral",
  published: "success",
  cancelled: "danger",
};

/* ----------------------------------------------------------- registrations */

export const REGISTRATION_LABELS: Record<RegistrationStatus, string> = {
  going: "מגיע/ה",
  pending: "ממתין לאישור",
  rejected: "לא אושר",
  cancelled: "לא מגיע/ה",
  waitlisted: "ברשימת המתנה",
};

export const REGISTRATION_TONES: Record<RegistrationStatus, BadgeTone> = {
  going: "success",
  pending: "warning",
  rejected: "danger",
  cancelled: "neutral",
  waitlisted: "info",
};

/* -------------------------------------------------------------- categories */

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  engineering: "הנדסה",
  design: "עיצוב",
  product: "מוצר",
  learning: "למידה",
  social: "חברתי",
  company: "כלל־חברה",
};

export const CATEGORY_ORDER: EventCategory[] = [
  "engineering",
  "design",
  "product",
  "learning",
  "social",
  "company",
];

/* ---------------------------------------------------------------- location */

/** "Studio B", "Zoom", "Training Room + Google Meet". */
export function locationLabel(location: EventLocation): string {
  switch (location.kind) {
    case "in_person":
      return location.venue ?? LOCATION_KIND_LABELS.in_person;
    case "online":
      return location.platform ?? LOCATION_KIND_LABELS.online;
    case "hybrid":
      return [location.venue, location.platform].filter(Boolean).join(" + ");
  }
}

export const LOCATION_KIND_LABELS: Record<EventLocation["kind"], string> = {
  in_person: "מפגש פיזי",
  online: "מקוון",
  hybrid: "היברידי",
};

/* ------------------------------------------------------------------- board */

/** The board's own words: its sections, its filters and its empty states. */
export const BOARD_LABELS = {
  title: "לוח האירועים",
  upcoming: "אירועים קרובים",
  past: "אירועים שעברו",
  categoryFilter: "קטגוריה",
  accessFilter: "אופן הכניסה",
  allCategories: "כל הקטגוריות",
  allAccessModes: "כל אופני הכניסה",
  clearFilters: "ניקוי הסינון",
  emptyTitle: "עדיין אין כאן אירועים בשבילכם",
  emptyDescription:
    "אין כרגע אירועים שאתם יכולים לראות. אירועים יופיעו כאן ברגע שמארח יפרסם אירוע, או יזמין אתכם לאירוע.",
  noMatchesTitle: "אין אירועים שתואמים את הסינון",
  noMatchesDescription: "שום אירוע שאתם יכולים לראות לא תואם את השילוב הזה.",
};

/**
 * The board's headline count. `shown` is what the filters left on the board,
 * `total` is everything the viewer is allowed to see.
 */
export function eventCountLabel(shown: number, total: number): string {
  if (shown === total) return `${eventCount(total)} בלוח`;
  return `מוצגים ${shown} מתוך ${total} אירועים`;
}

/**
 * "אירוע אחד", "שני אירועים", "7 אירועים".
 *
 * Hebrew counts one and two differently from everything above them -- two is a
 * dual form and not a numeral -- so a count cannot be pasted in front of a noun
 * the way `${n} events` can. Every counted phrase in this file goes through a
 * helper like this one.
 */
function eventCount(n: number): string {
  if (n === 1) return "אירוע אחד";
  if (n === 2) return "שני אירועים";
  return `${n} אירועים`;
}

/* ------------------------------------------------------------------ detail */

/** The event detail screen's own words: its sections and its host tools. */
export const DETAIL_LABELS = {
  back: "חזרה ללוח",
  about: "על האירוע",
  hosts: "מארחים",
  attendees: "מי מגיע",
  noAttendees: "אף אחד עוד לא נרשם.",
  hostTools: "כלי מארח",
  hostToolsDescription: "רק אתם והמארחים האחרים רואים את זה.",
  edit: "עריכת האירוע",
  publish: "פרסום הטיוטה",
  delete: "מחיקת האירוע",
  factInvited: "מוזמנים",
};

/**
 * What the registration panel says, for one availability. The rule that
 * produced the availability lives in `lib/permissions.ts`; this only dresses it.
 */
type RegistrationCtaCopy = {
  /** The primary action's label, or `null` when there is nothing to offer. */
  action: string | null;
  /** One line telling the viewer where they stand. */
  note: string;
};

const CLOSED_NOTES: Record<RegistrationClosedReason, string> = {
  draft: "האירוע עדיין טיוטה, ולכן אי אפשר להירשם אליו.",
  cancelled: "האירוע בוטל, וההרשמה סגורה.",
  started: "האירוע כבר עבר.",
  full: "האירוע מלא.",
  rejected:
    "הבקשה שלכם לא אושרה. מארח עדיין יכול לאשר אתכם מתוך התור שלו.",
  not_invited: "האירוע בהזמנה בלבד, ואתם לא ברשימת המוזמנים.",
};

export function registrationCtaCopy(
  availability: RegistrationAvailability,
): RegistrationCtaCopy {
  switch (availability.state) {
    case "open":
      return availability.action === "request"
        ? {
            action: "בקשת מקום",
            note: "מארח מחליט מי נכנס, ולכן זו בקשה ולא הרשמה.",
          }
        : { action: "הרשמה", note: "ההרשמה תאושר מיד." };

    /*
      English called both of these "Withdraw". Hebrew names what is being
      withdrawn, and the two are not the same thing to the person reading it --
      a confirmed place and a request that is still waiting. Both still send the
      same `DELETE`; only the word changes.
    */
    case "registered":
      return availability.status === "going"
        ? { action: "ביטול ההשתתפות", note: "יש לכם מקום מאושר." }
        : {
            action: "ביטול הבקשה",
            note: "הבקשה שלכם ממתינה להחלטה של המארח.",
          };

    case "closed":
      return { action: null, note: CLOSED_NOTES[availability.reason] };
  }
}

/**
 * The same sentence the panel shows for a closed registration, for a route
 * handler that has to refuse the action.
 *
 * The rule that produced the reason lives in `lib/permissions.ts`. Reading the
 * wording from here means the API and the screen cannot describe the same
 * refusal differently.
 */
export function registrationClosedNote(
  reason: RegistrationClosedReason,
): string {
  return CLOSED_NOTES[reason];
}

/**
 * What register, request and withdraw say once they have been attempted.
 *
 * The refusals are thrown by the registrations route; the toasts are shown by
 * `RegistrationActions` after the server has answered. They share this object
 * so a refusal is worded the same wherever it surfaces.
 */
export const REGISTRATION_ACTION_COPY = {
  /* Server refusals for the two states `RegistrationClosedReason` cannot name. */
  alreadyRegistered: "כבר יש לכם מקום באירוע הזה.",
  nothingToWithdraw: "אין לכם הרשמה לבטל.",
  /** The registration changed underneath the request. */
  stale: "ההרשמה שלכם השתנתה. רעננו את הדף ונסו שוב.",

  /* Toast titles. The server's own message goes underneath as the description. */
  registered: "אתם מגיעים",
  requested: "הבקשה נשלחה",
  withdrawn: "ההשתתפות בוטלה",
  registerFailed: "לא הצלחנו לרשום אתכם",
  requestFailed: "לא הצלחנו לשלוח את הבקשה",
  withdrawFailed: "לא הצלחנו לבטל",
};

/* --------------------------------------------------------- approval queue */

/**
 * The host's queue of requests on the event detail page.
 *
 * The group heading is the plural of the wording `REGISTRATION_LABELS.rejected`
 * uses for the status, so the heading and the requester's own badge still agree
 * -- Hebrew inflects a heading over a list of people where English did not. The
 * buttons keep the verbs from `TASKS.md` section 5 — approve and reject.
 */
export const QUEUE_LABELS = {
  title: "בקשות",
  description: "רק אתם והמארחים האחרים רואים את זה.",
  rejectedTitle: "לא אושרו",
  emptyTitle: "אין בקשות ממתינות",
  emptyDescription:
    "בקשות להצטרף לאירוע הזה יופיעו כאן, ותוכלו לאשר או לדחות אותן.",
  approve: "אישור",
  reject: "דחייה",
  /**
   * The accepted consequence of a host switching an event to invite only under
   * somebody who had already asked to come: the row survives, their access does
   * not, and approving them does not hand it back.
   */
  requesterCannotView:
    "הם כבר לא יכולים לראות את האירוע הזה, ולכן גם אם תאשרו את הבקשה, האירוע לא יחזור ללוח שלהם.",
};

/**
 * "הבקשה הוגשה לפני 3 ימים", or with the decision alongside it.
 *
 * The relative wording is produced by `formatRelativeDay()` in `lib/date.ts`,
 * which reads the clock and belongs in a Server Component; this only joins the
 * sentence together so the phrasing stays in one place.
 *
 * The English version lower-cased the relative phrase to graft it mid-sentence.
 * Hebrew has no letter case, so there is nothing to fold and the phrase goes in
 * as it comes.
 */
export function requestTimelineLabel(
  requestedRelative: string,
  decidedRelative: string | null,
): string {
  const requested = `הבקשה הוגשה ${requestedRelative}`;
  if (!decidedRelative) return requested;

  return `${requested} · לא אושרה ${decidedRelative}`;
}

/**
 * Distinguishes one row's buttons from the next row's for a screen reader —
 * a column of identical "אישור" labels says nothing about who is approved.
 */
export function approveRequestLabel(name: string): string {
  return `אישור הבקשה של ${name}`;
}

export function rejectRequestLabel(name: string): string {
  return `דחיית הבקשה של ${name}`;
}

const REQUEST_DECISION_NOTES: Record<RequestDecisionClosedReason, string> = {
  draft: "האירוע עדיין טיוטה, ולכן אין עדיין מה להחליט.",
  cancelled: "האירוע בוטל, ולכן אי אפשר עוד להחליט על בקשות.",
  started: "האירוע כבר עבר, ולכן אי אפשר עוד להחליט על בקשות.",
  full: "האירוע מלא, ואישור יחרוג מהקיבולת.",
  not_decidable: "לא נשאר מה להחליט על הבקשה הזו.",
};

/**
 * Why a decision is unavailable, or `null` when nothing is standing in the way.
 *
 * Shared by the queue and by both decision routes, so a host reads the same
 * sentence next to a disabled button as they get back from a `curl`. `open` and
 * `approve_only` return `null`: the row is actionable, and a note explaining
 * that would be noise.
 */
export function requestDecisionNote(
  availability: RequestDecisionAvailability,
): string | null {
  switch (availability.state) {
    case "open":
    case "approve_only":
      return null;
    case "reject_only":
    case "closed":
      return REQUEST_DECISION_NOTES[availability.reason];
  }
}

/**
 * What approving and rejecting say once they have been attempted.
 *
 * Same split as `REGISTRATION_ACTION_COPY`: the refusals are thrown by the two
 * decision routes, the toast titles are shown by `RequestDecisionActions` once
 * the server has answered.
 */
export const REQUEST_ACTION_COPY = {
  /* Server refusals for the states `RequestDecisionClosedReason` cannot name. */
  alreadyRejected: "הבקשה הזו כבר נדחתה.",
  /** The request changed underneath the decision. */
  stale: "הבקשה הזו השתנתה. רעננו את הדף ונסו שוב.",

  /* Toast titles. The server's own message goes underneath as the description. */
  approved: "הבקשה אושרה",
  rejected: "הבקשה נדחתה",
  approveFailed: "לא הצלחנו לאשר את הבקשה",
  rejectFailed: "לא הצלחנו לדחות את הבקשה",
};

/* ------------------------------------------------------------- management */

/**
 * Creating, editing, publishing and deleting an event.
 *
 * The board, the create page and the detail page's edit mode all read from
 * here, so the same action is never called two different things.
 */
export const MANAGE_LABELS = {
  /** The board's entry point into creation. */
  create: "אירוע חדש",
  createTitle: "אירוע חדש",
  createDescription:
    "האירוע מתחיל כטיוטה, כך שאף אחד אחר לא יראה אותו עד שתפרסמו.",
  createSubmit: "יצירת טיוטה",
  /** Leaves edit mode without leaving the event. */
  backToEvent: "חזרה לאירוע",
  editTitle: "עריכת האירוע",
  editDescription:
    "כולם עדיין רואים את אותו מסך. לכם מוצגות גם אפשרויות העריכה.",
  editSubmit: "שמירת השינויים",
  cancel: "ביטול",
};

/** The fields of the event form, and the guidance that goes with them. */
export const EVENT_FORM_LABELS = {
  title: "כותרת",
  summary: "תקציר",
  /**
   * Guidance, not a limit. Nothing enforces a length -- the card line-clamps a
   * long summary, so a host is trusted to write a sensible one.
   */
  summaryHint: "משפט אחד, שמוצג על הכרטיסים. סביב 110 תווים נקרא הכי טוב.",
  description: "תיאור",
  descriptionHint: "השאירו שורה ריקה בין פסקאות.",
  startsAt: "מתחיל",
  endsAt: "מסתיים",
  category: "קטגוריה",
  access: "אופן הכניסה",
  capacity: "קיבולת",
  capacityHint: "משתתפים מאושרים. השאירו ללא הגבלה כדי לא לקבוע תקרה.",
  capacityUnlimited: "ללא הגבלת משתתפים",
  capacityPlaceholder: "למשל 40",
  locationKind: "איך משתתפים",
  venue: "מקום",
  address: "כתובת",
  addressHint: "מוצגת מתחת למקום בעמוד האירוע.",
  url: "קישור להצטרפות",
  platform: "פלטפורמה",
  platformHint: 'למשל "Zoom", "Google Meet".',
  /** Warns the host what switching to invite-only does to current attendees. */
  accessInviteWarning:
    "מעבר להזמנה בלבד מסתיר את האירוע מכל מי שלא ברשימת המוזמנים, כולל אנשים שכבר יש להם מקום.",
  sectionWhen: "מתי",
  sectionWhere: "איפה",
  sectionWho: "מי יכול להיכנס",
};

/**
 * Why a submission was refused, field by field.
 *
 * Shared by `lib/eventInput.ts` -- which both the form and the route handlers
 * run -- so a refusal is worded identically whether it was caught in the
 * browser or on the server.
 */
export const EVENT_FORM_ERRORS = {
  titleRequired: "תנו לאירוע כותרת.",
  summaryRequired: "כתבו תקציר של משפט אחד.",
  descriptionRequired: "תארו את האירוע.",
  startsAtInvalid: "בחרו מתי האירוע מתחיל.",
  endsAtInvalid: "בחרו מתי האירוע מסתיים.",
  endsAtBeforeStart: "הסיום חייב להיות אחרי ההתחלה.",
  categoryInvalid: "בחרו קטגוריה.",
  accessInvalid: "בחרו איך נכנסים לאירוע.",
  capacityInvalid: "הקיבולת חייבת להיות מספר שלם של מקומות, או ללא הגבלה.",
  locationKindInvalid: "בחרו איך משתתפים.",
  venueRequired: "כתבו איפה זה קורה.",
  urlRequired: "הוסיפו את הקישור להצטרפות.",
  /** Shown when the server refuses a form the browser thought was fine. */
  formRejected: "השרת דחה את השינויים האלה.",
};

/** What create, edit, publish and delete say once they have been attempted. */
export const MANAGE_ACTION_COPY = {
  /* Server refusals. */
  cannotCreate: "אין לכם הרשאה ליצור אירועים.",
  cannotManage: "אין לכם הרשאה לנהל את האירוע הזה.",
  alreadyPublished: "האירוע הזה כבר פורסם.",
  notADraft: "אפשר לפרסם רק טיוטה.",
  /** The event moved or disappeared underneath the request. */
  stale: "האירוע הזה השתנה. רעננו את הדף ונסו שוב.",

  /* Toast titles. The server's own message goes underneath as the description. */
  created: "הטיוטה נוצרה",
  createFailed: "לא הצלחנו ליצור את האירוע",
  saved: "השינויים נשמרו",
  saveFailed: "לא הצלחנו לשמור את השינויים",
  published: "האירוע פורסם",
  publishFailed: "לא הצלחנו לפרסם את האירוע",
  deleted: "האירוע נמחק",
  deleteFailed: "לא הצלחנו למחוק את האירוע",
};

/** The delete confirmation. `ConfirmDialog` renders it. */
export const DELETE_DIALOG = {
  title: "למחוק את האירוע?",
  confirm: "מחיקת האירוע",
  cancel: "ביטול",
  /** No registrations to lose, so there is nothing extra to warn about. */
  message: "אי אפשר לבטל את זה. האירוע יוסר עבור כולם.",
};

/**
 * The same warning, naming what is actually destroyed alongside the event.
 *
 * `db.events.remove()` deletes **every** registration for the event, not only
 * the confirmed ones, so a pending request disappears as surely as a place
 * does. Counting only the confirmed ones understated an irreversible action --
 * a host looking at "Awaiting approval 2" in the same card was told nothing
 * about those two.
 */
export function deleteDialogMessage(
  goingCount: number,
  pendingCount: number,
): string {
  const parts = [
    goingCount > 0 && placeCount(goingCount),
    pendingCount > 0 && requestCount(pendingCount),
  ].filter((part): part is string => part !== false);

  if (parts.length === 0) return DELETE_DIALOG.message;

  /*
    Two differences from the English. The conjunction is the prefix "ו" rather
    than a separate word, so it is joined onto the phrase that follows it; and
    the verb agrees with the subject in both number *and* gender, so a lone
    place ("מקום", masculine) reads "יימחק", a lone request ("בקשה", feminine)
    reads "תימחק", and anything plural reads "יימחקו".
  */
  const verb =
    goingCount + pendingCount > 1
      ? "יימחקו"
      : pendingCount === 1
        ? "תימחק"
        : "יימחק";

  return `אי אפשר לבטל את זה. ${joinWithAnd(parts)} ${verb} יחד עם האירוע.`;
}

/** "א ו-ב", or just "א" when there is only the one. */
function joinWithAnd(parts: string[]): string {
  return parts.length < 2 ? (parts[0] ?? "") : `${parts[0]} ${hebrewAnd(parts[1])}`;
}

/**
 * "and", which in Hebrew is a prefix rather than a word -- and which takes a
 * hyphen before a digit, so "ו-3 בקשות" and not "ו3 בקשות".
 *
 * Exported because `lib/date.ts` joins "שעה" to "30 דקות" by the same rule.
 */
export function hebrewAnd(phrase: string): string {
  return /^\d/.test(phrase) ? `ו-${phrase}` : `ו${phrase}`;
}

/** "מקום מאושר אחד", "שני מקומות מאושרים", "5 מקומות מאושרים". */
function placeCount(n: number): string {
  if (n === 1) return "מקום מאושר אחד";
  if (n === 2) return "שני מקומות מאושרים";
  return `${n} מקומות מאושרים`;
}

/** "בקשה ממתינה אחת", "שתי בקשות ממתינות", "5 בקשות ממתינות". */
function requestCount(n: number): string {
  if (n === 1) return "בקשה ממתינה אחת";
  if (n === 2) return "שתי בקשות ממתינות";
  return `${n} בקשות ממתינות`;
}


/* ----------------------------------------------------------------- the app */

/**
 * The app frame: the brand, the nav and the document title.
 *
 * These had been typed into `AppShell` and `app/layout.tsx`. They are the same
 * kind of thing as everything above -- words the product says -- so they live
 * here for the same reason.
 */
export const APP_LABELS = {
  brand: "לוח האירועים",
  /** Names the top-level nav for a screen reader. */
  nav: "ראשי",
  navBoard: "הלוח",
  navStyleGuide: "מדריך העיצוב",
  /** `metadata.title.default` and `.template` in the root layout. */
  documentTitle: "לוח האירועים",
  documentTitleTemplate: "%s · לוח האירועים",
  documentDescription:
    "יצירה, פרסום והרשמה לאירועי החברה — פתוחים, באישור מארח או בהזמנה בלבד.",
};

/** The persona switcher, which stands in for signing in. */
export const PERSONA_LABELS = {
  menuLabel: "צפייה בלוח בתור:",
  footnote:
    "אין התחברות בפרויקט הזה. החלפת פרסונה מגדירה עוגייה שהשרת קורא בכל בקשה.",
  switchFailed: "לא הצלחנו להחליף פרסונה",
};

/** "צופים עכשיו בתור מיה כהן" — the toast after a successful switch. */
export function nowViewingAsLabel(name: string): string {
  return `צופים עכשיו בתור ${name}`;
}

/**
 * The words the UI kit says on its own behalf.
 *
 * A primitive in `components/ui/` knows nothing about events, but it still has
 * to say "close" and "loading" somewhere. These are its defaults; anything
 * event-specific is still passed in by the caller.
 */
export const UI_LABELS = {
  back: "חזרה",
  close: "סגירה",
  confirm: "אישור",
  cancel: "ביטול",
  optional: "אופציונלי",
  /** The spinner's accessible name. */
  loading: "טוען",
  /** `LoadingBlock`'s visible text, which is the same word plus its ellipsis. */
  loadingEllipsis: "טוען…",
  notifications: "התראות",
  dismissNotification: "סגירת ההתראה",
  /** The avatar stack's accessible name when there is nobody in it. */
  nobodyRegistered: "אף אחד עוד לא נרשם",
};

/** "3 משתתפים: מיה כהן, דניאל לוי" — the avatar stack's accessible name. */
export function attendingLabel(names: string[]): string {
  return `${attendeeCount(names.length)}: ${names.join(", ")}`;
}

/** "משתתף אחד", "שני משתתפים", "7 משתתפים". */
function attendeeCount(n: number): string {
  if (n === 1) return "משתתף אחד";
  if (n === 2) return "שני משתתפים";
  return `${n} משתתפים`;
}

/** The 404 screen, which is also what an event you may not see looks like. */
export const NOT_FOUND_LABELS = {
  title: "הדף הזה לא קיים",
  description: "ייתכן שהקישור כבר לא בתוקף, או שהאירוע נמחק.",
  back: "חזרה ללוח",
};

/* ------------------------------------------------------- generic refusals */

/**
 * The refusals `lib/api.ts` produces when a handler has not named its own.
 *
 * A specific refusal belongs next to the rule that caused it -- those are in
 * `MANAGE_ACTION_COPY` and friends above. These are the fallbacks, and they
 * reach the viewer through the same toasts, so they are copy too.
 *
 * Only the `message` is Hebrew. The `code` on an `ApiError` is part of the API
 * contract and stays as it is.
 */
export const API_ERRORS = {
  forbidden: "אין לכם הרשאה לעשות את זה.",
  notFound: "לא נמצא.",
  internal: "משהו השתבש.",
  invalidJson: "גוף הבקשה חייב להיות JSON תקין.",
  missingUserId: "חסר `userId`.",
};

/** "בקשה נכשלה עם סטטוס 500." — when the server sent no message of its own. */
export function requestFailedLabel(status: number): string {
  return `הבקשה נכשלה עם סטטוס ${status}.`;
}

/** "אין פרסונה עם המזהה "u-maya"." */
export function noSuchPersonaLabel(userId: string): string {
  return `אין פרסונה עם המזהה "${userId}".`;
}

/* ------------------------------------------------------ counts on a card */

/**
 * The attendance line on a card: how many are coming, and how many places are
 * left.
 *
 * `capacity: null` is unlimited, so there is nothing to subtract and the line
 * is just the headcount.
 */
export function attendanceLabel(
  going: number,
  capacity: number | null,
  full: boolean,
): string {
  if (full) return CAPACITY_LABELS.full;
  if (going === 0) return CAPACITY_LABELS.beFirst;
  if (capacity === null) return goingCountLabel(going);
  return `${goingCountLabel(going)} · ${placesLeftLabel(capacity - going)}`;
}

/** The same counts, for the meter on the detail page. */
export const CAPACITY_LABELS = {
  full: "מלא",
  noLimit: "ללא הגבלה",
  beFirst: "היו הראשונים להירשם",
  /** The badge on a published event whose start has gone by. */
  past: "עבר",
  /** The fallback text of an online event's joining link. */
  joinLink: "קישור להצטרפות",
};

/** "משתתף אחד", "שני משתתפים", "7 משתתפים". */
export function goingCountLabel(going: number): string {
  return attendeeCount(going);
}

/** "3 מתוך 40 משתתפים" — the meter's headline when there is a cap. */
export function capacityCountLabel(going: number, capacity: number): string {
  return `${going} מתוך ${capacity} משתתפים`;
}

/** "נותר מקום אחד", "נותרו שני מקומות", "נותרו 7 מקומות". */
export function placesLeftLabel(left: number): string {
  if (left === 1) return "נותר מקום אחד";
  if (left === 2) return "נותרו שני מקומות";
  return `נותרו ${left} מקומות`;
}

/** "מארח: מיה כהן" — bottom-right of a card with no avatar stack. */
export function hostedByLabel(name: string): string {
  return `מארח: ${name}`;
}
