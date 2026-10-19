/**
 * The organizational email palette and the inline styles every email shares.
 *
 * Adapted from the organization's reference email implementation, and
 * deliberately not from this application's design system. Email HTML is read
 * by Outlook 2016, which ignores CSS variables, stylesheets and class names, so
 * every value here is a literal -- hex colours and pixel sizes -- applied
 * inline. That makes this directory the one exception to the "tokens only, no
 * hex" rule in `CLAUDE.md`; it does not extend to anything under `app/` or
 * `components/`.
 *
 * `colors` is the reference palette exactly as supplied. The style map keeps
 * the reference's shell (header, accent bar, card, footer) and the content
 * blocks an email here actually uses (greeting, body text, details table), and
 * adds the call to action and the visible link the event-share email needs,
 * built from the same palette.
 *
 * Left out of the reference: the section, permission and credentials styles,
 * which belong to the source product's permission summary; `footerText` and
 * `footerBrand`, which nothing in the reference used; and the info box, alert
 * box and divider, which nothing here uses yet -- they are a copy away in the
 * reference when an email needs one.
 */

import type { CSSProperties } from "react";

export const colors = {
  primary: "#161e54",
  accent: "#ace1ec",
  accentLight: "#E6F4F7",
  bg: "#F3F6FA",
  cardBg: "#FFFFFF",
  border: "#D8E2EC",
  textDark: "#102A43",
  textMid: "#334E68",
  textLight: "#627D98",
  danger: "#C0392B",
  dangerLight: "#FDECEA",
  success: "#1A6B3A",
  successLight: "#E6F4EC",
} as const;

type StyleMap = Record<string, CSSProperties>;

export const styles: StyleMap = {
  body: {
    margin: "0",
    padding: "0",
    direction: "rtl",
  },
  outerTable: {
    width: "100%",
  },

  // ── Header ──
  headerTable: {
    width: "100%",
    backgroundColor: colors.primary,
  },
  headerTextCell: {
    verticalAlign: "middle",
    textAlign: "right",
    padding: "26px 32px",
  },
  headerSubtitleRow: {
    borderCollapse: "collapse",
    margin: "0 0 6px 0",
  },
  headerSubtitleLogoCell: {
    margin: "0 auto",
    width: "22px",
    padding: "0 0 0 8px",
    verticalAlign: "middle",
    textAlign: "right",
  },
  headerSubtitleTextCell: {
    verticalAlign: "middle",
    textAlign: "right",
  },
  headerLabel: {
    fontSize: "20px",
    color: colors.accent,
    letterSpacing: "1px",
    margin: "0",
    fontWeight: "700",
  },
  headerTitle: {
    fontSize: "24px",
    fontWeight: "700",
    color: "#FFFFFF",
    margin: "0",
    lineHeight: "1.3",
  },

  // ── Accent bar ──
  accentBar: {
    width: "100%",
    height: "4px",
    backgroundColor: colors.accent,
    fontSize: "1px",
    lineHeight: "1px",
  },

  // ── Card body ──
  card: {
    width: "100%",
    backgroundColor: colors.cardBg,
    borderRight: `1px solid ${colors.border}`,
    borderLeft: `1px solid ${colors.border}`,
    borderCollapse: "collapse",
  },
  cardInner: {
    padding: "32px 32px 0",
    textAlign: "right",
  },

  // ── Typography ──
  greeting: {
    fontSize: "18px",
    fontWeight: "600",
    color: colors.textDark,
    margin: "0 0 16px 0",
  },
  bodyText: {
    fontSize: "18px",
    color: colors.textMid,
  },
  /** `bodyText` as a paragraph with an explicit margin, which clients vary on. */
  paragraph: {
    fontSize: "18px",
    color: colors.textMid,
    lineHeight: "1.5",
    margin: "0 0 16px 0",
  },
  /** A quieter line under a heading -- an event's one-sentence summary. */
  summaryText: {
    fontSize: "16px",
    color: colors.textLight,
    lineHeight: "1.5",
    margin: "0 0 20px 0",
  },

  // ── Details table ──
  detailsTable: {
    width: "100%",
    borderCollapse: "collapse",
    marginBottom: "24px",
  },
  detailsRow: {
    borderBottom: `1px solid ${colors.border}`,
  },
  detailsLabel: {
    fontSize: "12px",
    fontWeight: "700",
    color: colors.textLight,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    padding: "10px 0",
    textAlign: "right",
    width: "40%",
  },
  detailsValue: {
    fontSize: "14px",
    color: colors.textDark,
    fontWeight: "500",
    padding: "10px 0 10px 12px",
    textAlign: "right",
  },

  // ── Call to action ──
  // A link inside a coloured table cell: the cell's padding and inline
  // background are what Outlook draws as the button -- the same way the
  // reference colours its header and accent bar -- so no VML, no `bgcolor`
  // attribute and no `display: inline-block` are needed. Only the link text is clickable in Outlook; elsewhere the
  // padding is too, because the link fills the cell.
  ctaTable: {
    borderCollapse: "collapse",
  },
  ctaCell: {
    backgroundColor: colors.primary,
    padding: "12px 28px",
    textAlign: "center",
  },
  ctaLink: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#FFFFFF",
    textDecoration: "none",
    display: "block",
  },

  // ── Visible link, for when the button does not open ──
  linkFallback: {
    fontSize: "13px",
    color: colors.textLight,
    margin: "0 0 4px 0",
  },
  /** Left-to-right: a URL is Latin, and right-to-left would reorder its slashes. */
  urlText: {
    fontSize: "13px",
    direction: "ltr",
    textAlign: "right",
    margin: "0",
    wordBreak: "break-all",
  },
  urlLink: {
    color: colors.primary,
    textDecoration: "underline",
  },

  // ── Footer ──
  footer: {
    width: "100%",
    backgroundColor: colors.cardBg,
    borderCollapse: "collapse",
    borderRight: `1px solid ${colors.border}`,
    borderLeft: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
  },
  footerInner: {
    padding: "16px 32px",
    textAlign: "center",
  },
};
