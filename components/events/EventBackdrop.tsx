import { cx } from "@/lib/cx";
import { BACKDROP_LABELS } from "@/lib/labels";

import styles from "./EventBackdrop.module.css";

/*
  The board's decorative illustration: an invitation still life -- an
  envelope, an invitation with its RSVP row, a date leaf -- low in the corner
  beside the page action, and a line drawing of the plan along the top: a
  tilted calendar cropped by the page's top edge, the guests, and a dotted path
  rising through the time and the place and out of the top of the page.

  Purely decorative, and static. Nothing in it is computed or read from an
  event, a registration or the viewer -- the numeral on the date leaf is not a
  date -- so it can reveal nothing, and it is the same markup for everyone.

  It is placed with `position: absolute` against the shell's main area, which
  is positioned for it, and sits behind the page at `z-index: -1` without
  making anything a stacking context: the page's menus keep drawing over the
  bar across the top at phone width. Inert to the pointer, and hidden from
  assistive technology, from forced colours and from print.

  Geometry is in each drawing's own units, like the paths in `Icon`; colour
  comes only from the module's paint classes, so both themes follow the tokens.
*/

/** The plan's calendar: four weeks of six days, drawn as empty cells. */
const PLAN_CELLS = [0, 1, 2, 3].flatMap((week) =>
  [0, 1, 2, 3, 4, 5].map((day) => ({ x: 46 + day * 25.5, y: 84 + week * 23.5 })),
);

/** A few days marked in category colours, as the board marks its events. */
const PLAN_MARKS = [
  { cx: 79, cy: 91.5, className: styles.fillDesignDot },
  { cx: 155.5, cy: 115, className: styles.fillSocialDot },
  { cx: 104.5, cy: 162, className: styles.fillLearningDot },
  { cx: 53.5, cy: 115, className: styles.fillProductDot },
];

/** The phone mark's calendar: three weeks of four days. */
const MARK_CELLS = [0, 1, 2].flatMap((week) =>
  [0, 1, 2, 3].map((day) => ({ x: 70 + day * 8, y: 20 + week * 7.5 })),
);

export function EventBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.column}>
        <svg
          className={styles.invite}
          viewBox="0 0 640 400"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          <g className={cx(styles.sheet, styles.envelope)} transform="translate(10 150) rotate(-11 140 90)">
            <rect className={cx(styles.fillPaper, styles.strokePaperEdge)} width="280" height="180" rx="14" />
            <path className={styles.strokeInkFaint} d="M12 16 L140 106 L268 16" strokeWidth="1.4" />
            <path className={styles.strokeInkFaint} d="M12 168 L112 94 M268 168 L168 94" strokeWidth="1.4" />
            <circle className={styles.fillPrimarySoft} cx="140" cy="106" r="18" />
            <path className={styles.strokePrimaryText} d="M132 106 l6 6 l10 -11" strokeOpacity=".6" strokeWidth="1.8" />
          </g>

          <g className={styles.sheet} transform="translate(212 34) rotate(6 115 150)">
            <rect className={cx(styles.fillPaper, styles.strokePaperEdge)} width="230" height="304" rx="16" />
            <rect className={styles.strokeInkFaint} x="12" y="12" width="206" height="280" rx="9" />
            <text
              className={cx(styles.text, styles.fillPrimaryText)}
              x="115"
              y="62"
              textAnchor="middle"
              fontSize="15"
              fontWeight="500"
              letterSpacing=".2em"
              fillOpacity=".55"
            >
              {BACKDROP_LABELS.invitation}
            </text>
            <path className={styles.strokeInkFaint} d="M97 78 h36" strokeWidth="1.4" />
            <rect className={styles.fillInkFaint} x="45" y="102" width="140" height="10" rx="5" />
            <rect className={styles.fillInkFaint} x="65" y="122" width="100" height="10" rx="5" />
            <rect className={styles.fillInkFaint} x="58" y="154" width="114" height="6" rx="3" />
            <rect className={styles.fillInkFaint} x="76" y="168" width="78" height="6" rx="3" />
            <path className={styles.fillInkFaint} d="M115 194 l5 5 l-5 5 l-5 -5 z" />
            <text
              className={cx(styles.text, styles.fillInk)}
              x="115"
              y="232"
              textAnchor="middle"
              fontSize="13"
              fontWeight="400"
              letterSpacing=".06em"
            >
              {BACKDROP_LABELS.rsvp}
            </text>
            <rect className={styles.fillApprovedBg} x="122" y="246" width="70" height="28" rx="11" />
            <path className={styles.strokeApprovedFg} d="M150 260 l4 4 l8 -9" strokeOpacity=".7" strokeWidth="1.8" />
            <rect className={styles.strokeInkFaint} x="38" y="246" width="70" height="28" rx="11" />
            <path className={styles.strokeInkFaint} d="M68 255 l10 10 M78 255 l-10 10" strokeWidth="1.4" />
          </g>

          {/* The date leaf: the month and the weekday are neutral bars, not words. */}
          <g className={styles.sheet} transform="translate(420 128) rotate(-6 95 115)">
            <rect className={cx(styles.fillPaper, styles.strokePaperEdge)} width="190" height="232" rx="18" />
            <path className={styles.fillActiveBg} d="M0 18 a18 18 0 0 1 18 -18 h154 a18 18 0 0 1 18 18 v38 h-190 z" />
            <rect className={styles.fillInk} x="52" y="-10" width="8" height="24" rx="4" />
            <rect className={styles.fillInk} x="130" y="-10" width="8" height="24" rx="4" />
            <rect className={styles.fillActiveFg} x="66" y="31" width="58" height="6" rx="3" fillOpacity=".35" />
            <text
              className={cx(styles.text, styles.fillInk)}
              x="95"
              y="160"
              textAnchor="middle"
              fontSize="100"
              fontWeight="300"
              letterSpacing="-.02em"
            >
              {BACKDROP_LABELS.day}
            </text>
            <rect className={styles.fillInkFaint} x="62" y="186" width="66" height="6" rx="3" />
            <path className={styles.strokeInkFaint} d="M14 216 h162" strokeWidth="1.4" strokeDasharray="2 6" />
          </g>
        </svg>

        <svg
          className={styles.plan}
          viewBox="0 -160 1000 360"
          fill="none"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          <g transform="rotate(-6 118 109)">
            <rect className={styles.fillActiveBg} x="30" y="34" width="176" height="36" rx="14" fillOpacity=".6" />
            <rect className={styles.strokeLine} x="30" y="34" width="176" height="150" rx="14" />
            <path className={styles.strokeLine} d="M30 70 h176" />
            <path className={styles.strokeLine} d="M78 24 v20 M158 24 v20" strokeWidth="4" />
            {/* The month, as a neutral bar. */}
            <rect className={styles.fillLine} x="96" y="49" width="44" height="6" rx="3" fillOpacity=".55" />
            {PLAN_CELLS.map(({ x, y }) => (
              <rect key={`${x},${y}`} className={styles.strokeLineSoft} x={x} y={y} width="15" height="15" rx="4.5" />
            ))}
            {PLAN_MARKS.map(({ cx: markX, cy: markY, className }) => (
              <circle key={`${markX},${markY}`} className={className} cx={markX} cy={markY} r="3" fillOpacity=".6" />
            ))}
            <rect className={styles.fillPrimary} x="122.5" y="131" width="15" height="15" rx="4.5" fillOpacity=".28" />
            <circle className={styles.strokeLine} cx="130" cy="138.5" r="15" />
          </g>

          <g transform="translate(18 -4)">
            <circle className={cx(styles.fillAvatar1, styles.strokePage)} cx="236" cy="166" r="13" fillOpacity=".5" strokeWidth="2.5" />
            <circle className={cx(styles.fillAvatar2, styles.strokePage)} cx="256" cy="166" r="13" fillOpacity=".5" strokeWidth="2.5" />
            <circle className={cx(styles.fillAvatar4, styles.strokePage)} cx="276" cy="166" r="13" fillOpacity=".5" strokeWidth="2.5" />
            <path className={styles.strokeLineSoft} d="M306 166 h12 M312 160 v12" />
          </g>

          <path
            className={styles.strokeLine}
            d="M167 139 C 250 150, 330 70, 430 112 S 560 124, 640 84 S 760 -10, 860 -120"
            strokeWidth="1.8"
            strokeDasharray="0.1 8"
          />
          <circle className={styles.fillPage} cx="430" cy="112" r="27" />
          <circle className={styles.strokeLine} cx="430" cy="112" r="21" />
          <path className={styles.strokeLine} d="M430 101.5 V112 l7.6 5" />
          <circle className={styles.fillPage} cx="640" cy="80" r="22.4" />
          <g transform="translate(620.8 64.8) scale(1.6)" strokeWidth="1">
            <path className={styles.strokeLine} d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
            <circle className={styles.strokeLine} cx="12" cy="10" r="2.3" />
          </g>
        </svg>

        <svg
          className={styles.mark}
          viewBox="0 0 160 64"
          fill="none"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          <g className={styles.markInvite}>
            <g transform="translate(6 20) rotate(7 18 22)">
              <rect className={cx(styles.fillPaper, styles.strokePaperEdge)} width="34" height="42" rx="5" strokeWidth="1" />
              <rect className={styles.strokeInkFaint} x="3" y="3" width="28" height="36" rx="3" strokeWidth="1" />
              <rect className={styles.fillInkFaint} x="9" y="13" width="16" height="3" rx="1.5" />
              <rect className={styles.fillInkFaint} x="11" y="20" width="12" height="3" rx="1.5" />
              <rect className={styles.fillApprovedBg} x="12" y="29" width="10" height="5" rx="2" />
            </g>
            <g transform="translate(30 26) rotate(-6 16 18)">
              <rect className={cx(styles.fillPaper, styles.strokePaperEdge)} width="30" height="36" rx="5" strokeWidth="1" />
              <path className={styles.fillActiveBg} d="M0 5 a5 5 0 0 1 5 -5 h20 a5 5 0 0 1 5 5 v5 h-30 z" />
              <text className={cx(styles.text, styles.fillInk)} x="15" y="29" textAnchor="middle" fontSize="14" fontWeight="300">
                {BACKDROP_LABELS.day}
              </text>
            </g>
          </g>

          <g transform="rotate(-6 84 26)">
            <rect className={styles.strokeLine} x="64" y="4" width="40" height="40" rx="6" />
            <path className={styles.strokeLine} d="M64 13 h40" />
            <path className={styles.strokeLine} d="M74 0 v7 M94 0 v7" strokeWidth="2" />
            {MARK_CELLS.map(({ x, y }) => (
              <rect key={`${x},${y}`} className={styles.strokeLineSoft} x={x} y={y} width="5" height="5" rx="1.5" strokeWidth="1" />
            ))}
            <rect className={styles.fillPrimary} x="86" y="35" width="5" height="5" rx="1.5" fillOpacity=".3" />
            <circle className={styles.strokeLine} cx="88.5" cy="37.5" r="6.5" />
          </g>
          <path
            className={styles.strokeLine}
            d="M97 34 C 110 34, 114 22, 124 22 S 140 14, 154 -12"
            strokeWidth="1.3"
            strokeDasharray="0.1 5"
          />
          <circle className={styles.fillPage} cx="124" cy="22" r="8" />
          <circle className={styles.strokeLine} cx="124" cy="22" r="6.5" />
          <path className={styles.strokeLine} d="M124 18.8 V22 l2.3 1.6" />
        </svg>
      </div>
    </div>
  );
}
