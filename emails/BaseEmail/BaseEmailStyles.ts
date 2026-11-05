/**
 * The email palette and the inline styles every email shares.
 *
 * The values are the M11 design's (Iron Numbers), the same ones
 * `app/styles/tokens.css` holds under the names noted in `colors`, written out
 * as literals. Email HTML is read by Outlook 2016, which ignores CSS variables,
 * stylesheets and class names, so every value here is a literal -- hex colours
 * and pixel sizes -- applied inline. That makes this directory the one
 * exception to the "tokens only, no hex" rule in `CLAUDE.md`; it does not
 * extend to anything under `app/` or `components/`. Only the light palette is
 * used: an email has no theme of its own, and clients that darken mail do it
 * themselves.
 *
 * The shapes are the organization's reference shell restyled to the design
 * approved for M11 PR 5: a compact navy header, then a separate card that
 * opens with the email's title, then a footer line under the card. Line
 * heights are pixels, not ratios, because the MSO reset sets
 * `mso-line-height-rule: exactly`.
 *
 * What Outlook 2016 drops degrades on purpose. `borderRadius` is progressive
 * enhancement -- Outlook draws square corners -- and the tables that carry it
 * set `borderCollapse: "separate"` inline, because the shared reset collapses
 * every table and browsers do not round a collapsed one; with `cellSpacing`
 * zeroed nothing moves. No shadows, no web fonts, no VML.
 *
 * `MOBILE_STYLES` is the one rule in the `<style>` block besides the MSO
 * resets: a media query that, for clients reading it, lets the column fill a
 * phone and stacks the details. It only overrides; every class it names also
 * has its full inline style, so a client that ignores it -- Outlook among
 * them -- shows the 620px desktop layout.
 */

import type { CSSProperties } from "react";

const colors = {
  /** `--color-navy`: the header. */
  navy: "#0D163A",
  /** `--color-bg`: behind the column. */
  pageBg: "#F6F5FA",
  /** `--color-surface`: the card. */
  surface: "#FDFEFD",
  /** `--color-surface-subtle`: the details panel. */
  surfaceSubtle: "#F9F8FD",
  /** `--color-border-strong`: the card's edge and every divider. */
  border: "#E6E4EE",
  /** `--color-text`. */
  text: "#1E1E1E",
  /** `--color-text-muted`. */
  textMuted: "#6B6B6B",
  /** `--color-primary` and `--color-link`: the button and the printed link. */
  primary: "#0059C4",
  /** `--color-on-navy`: text on the header and on the button. */
  onDark: "#FDFEFD",
} as const;

/** The email's font stack, for the places an inline `fontFamily` is needed. */
const FONT_STACK = "Calibri, Arial, sans-serif";

type StyleMap = Record<string, CSSProperties>;

export const styles: StyleMap = {
  body: {
    margin: "0",
    padding: "0",
    direction: "rtl",
    backgroundColor: colors.pageBg,
  },
  outerTable: {
    width: "100%",
    backgroundColor: colors.pageBg,
  },
  outerCell: {
    backgroundColor: colors.pageBg,
    padding: "0",
  },
  column: {
    width: "620px",
    borderCollapse: "collapse",
  },
  columnTop: {
    padding: "32px 0 0 0",
  },
  columnBottom: {
    padding: "0 0 32px 0",
  },

  // ── Header ──
  headerTable: {
    width: "100%",
    backgroundColor: colors.navy,
    borderCollapse: "separate",
    borderRadius: "20px",
  },
  headerTextCell: {
    verticalAlign: "middle",
    textAlign: "right",
    padding: "16px 28px",
  },
  headerSubtitleRow: {
    borderCollapse: "collapse",
  },
  headerSubtitleLogoCell: {
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
    fontSize: "17px",
    lineHeight: "24px",
    fontWeight: "700",
    color: colors.onDark,
    margin: "0",
  },
  headerLogoCell: {
    width: "52px",
    textAlign: "left",
    verticalAlign: "middle",
    padding: "12px 0 12px 28px",
  },
  /**
   * The organization's logo at half its 104x92 size, so it stays sharp on
   * high-density screens. The colour and type style its alt text, which a
   * client shows on the navy header when it does not show the image.
   */
  headerLogo: {
    display: "block",
    border: "0",
    width: "52px",
    height: "46px",
    color: colors.onDark,
    fontFamily: FONT_STACK,
    fontSize: "12px",
    lineHeight: "16px",
  },
  /** Between the header and the card. */
  headerGap: {
    height: "12px",
    fontSize: "1px",
    lineHeight: "1px",
  },

  // ── Card ──
  card: {
    width: "100%",
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderCollapse: "separate",
    borderRadius: "20px",
  },
  cardInner: {
    padding: "32px",
    textAlign: "right",
  },
  /** The email's title, opening the card. */
  title: {
    fontSize: "26px",
    lineHeight: "34px",
    fontWeight: "700",
    color: colors.text,
    margin: "0",
  },
  divider: {
    height: "1px",
    backgroundColor: colors.border,
    fontSize: "1px",
    lineHeight: "1px",
  },

  // ── Typography ──
  greeting: {
    fontSize: "18px",
    lineHeight: "26px",
    fontWeight: "700",
    color: colors.text,
    margin: "0 0 8px 0",
  },
  paragraph: {
    fontSize: "16px",
    lineHeight: "26px",
    color: colors.text,
    margin: "0 0 16px 0",
  },
  /** A quieter paragraph -- an event's one-sentence summary. */
  summaryText: {
    fontSize: "16px",
    lineHeight: "26px",
    color: colors.textMuted,
    margin: "0 0 24px 0",
  },
  /** A paragraph whose spacing comes from the `Spacer`s around it. */
  note: {
    fontSize: "16px",
    lineHeight: "26px",
    color: colors.text,
    margin: "0",
  },

  // ── Details panel ──
  detailsPanel: {
    width: "100%",
    backgroundColor: colors.surfaceSubtle,
    borderCollapse: "separate",
    borderRadius: "16px",
  },
  detailsPanelInner: {
    padding: "6px 20px",
  },
  detailsTable: {
    width: "100%",
    borderCollapse: "collapse",
  },
  detailsLabel: {
    width: "30%",
    fontSize: "14px",
    lineHeight: "22px",
    color: colors.textMuted,
    padding: "12px 0",
    textAlign: "right",
    verticalAlign: "top",
  },
  detailsValue: {
    fontSize: "16px",
    lineHeight: "24px",
    color: colors.text,
    padding: "12px 16px 12px 0",
    textAlign: "right",
    verticalAlign: "top",
  },
  /** Added to both cells of every row after the first. */
  detailsRowDivider: {
    borderTop: `1px solid ${colors.border}`,
  },

  // ── Call to action ──
  // A link inside a coloured table cell: the cell's padding and inline
  // background are what Outlook draws as the button -- the same way the
  // header is coloured -- so no VML, no `bgcolor` attribute and no
  // `display: inline-block` are needed. Only the link text is clickable in
  // Outlook; elsewhere the padding is too, because the link fills the cell.
  ctaTable: {
    borderCollapse: "separate",
  },
  ctaCell: {
    backgroundColor: colors.primary,
    padding: "13px 32px",
    textAlign: "center",
    borderRadius: "16px",
  },
  ctaLink: {
    fontSize: "16px",
    lineHeight: "22px",
    fontWeight: "700",
    color: colors.onDark,
    textDecoration: "none",
    display: "block",
  },

  // ── Visible link, for when the button does not open ──
  linkFallback: {
    fontSize: "13px",
    lineHeight: "20px",
    color: colors.textMuted,
    margin: "0 0 4px 0",
  },
  /** Left-to-right: a URL is Latin, and right-to-left would reorder its slashes. */
  urlText: {
    fontSize: "13px",
    lineHeight: "20px",
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
  footerCell: {
    padding: "20px 32px 0 32px",
    textAlign: "center",
  },
  footerText: {
    fontSize: "13px",
    lineHeight: "20px",
    color: colors.textMuted,
    margin: "0",
  },
};

/**
 * The media query for narrow screens. Each class only overrides a value its
 * element already has inline, so a client that ignores the query loses
 * nothing but the phone layout.
 */
export const MOBILE_STYLES = `
          @media only screen and (max-width: 640px) {
            .em-column { width: 100% !important; }
            .em-outer { padding: 0 12px !important; }
            .em-top { padding-top: 16px !important; }
            .em-head { padding: 14px 18px !important; }
            .em-title { font-size: 22px !important; line-height: 30px !important; }
            .em-pad { padding: 24px 20px !important; }
            .em-inset { padding: 4px 16px !important; }
            .em-label { display: block !important; width: auto !important; padding: 12px 0 0 0 !important; }
            .em-value { display: block !important; padding: 2px 0 12px 0 !important; border-top: 0 !important; }
            .em-cta { width: 100% !important; }
            .em-foot { padding: 16px 20px 0 20px !important; }
          }`;
