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
 * the reference's shell (header, accent bar, card, footer) and its generic
 * content blocks (greeting, body text, info box, alert box, details table,
 * divider). The reference's section, permission and credentials styles are
 * left out: they belong to the source product's permission summary, not to
 * the shell. So are `footerText` and `footerBrand`, which no part of the
 * reference used.
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

  // ── Info box ──
  infoBox: {
    width: "100%",
    backgroundColor: colors.accentLight,
    borderCollapse: "collapse",
  },
  infoBoxInner: {
    padding: "16px 20px",
    textAlign: "right",
  },
  infoLabel: {
    fontSize: "11px",
    fontWeight: "700",
    color: colors.accent,
    textTransform: "uppercase",
    letterSpacing: "1.5px",
    margin: "0 0 4px 0",
  },
  infoValue: {
    fontSize: "17px",
    fontWeight: "700",
    color: colors.primary,
    margin: "0",
  },

  // ── Alert box (urgent) ──
  alertBox: {
    width: "100%",
    backgroundColor: colors.dangerLight,
    borderCollapse: "collapse",
  },
  alertBoxInner: {
    padding: "14px 20px",
    textAlign: "center",
  },
  alertText: {
    fontSize: "14px",
    color: colors.danger,
    fontWeight: "600",
    margin: "0",
    lineHeight: "1.5",
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

  // ── Divider ──
  hr: {
    borderColor: colors.border,
    borderTop: `1px solid ${colors.border}`,
    padding: "5px 0",
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
