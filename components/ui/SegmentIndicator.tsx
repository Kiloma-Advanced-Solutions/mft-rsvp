"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * The navy pill behind a segmented control's chosen option, which slides to
 * the new option when the choice changes. Internal to `SegmentedControl`, and
 * only presentation: the options keep their own semantics -- a checked radio,
 * a link with `aria-current` -- and this is `aria-hidden`.
 *
 * It measures rather than computing a position from the option's index,
 * because the options are not always equal: the board's links are as wide as
 * their labels and sit two by two on a phone, and the form's stack into a
 * column. Being measured, it is right in either reading direction.
 *
 * Only a change of `value` slides. Anything else that moves the option -- a
 * resize, a breakpoint, the web font arriving -- puts the pill straight where
 * the option now is, so it never trails behind a layout change. Before the
 * first measurement the chosen option draws its own background, as it does
 * without JavaScript; once the pill is placed, the track's `data-indicator`
 * hands the background over to it, in the same frame.
 *
 * On the board the value comes from the server-rendered `aria-current`, so the
 * pill moves when a filter's navigation commits, with the results it filters,
 * never ahead of them.
 */
export function SegmentIndicator({
  value,
  className,
}: {
  /** The chosen option's `data-segment`, or `null` when none is chosen. */
  value: string | null;
  className: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // Read by the resize observer, which outlives any one value.
  const valueRef = useRef(value);
  const placed = useRef(false);

  useLayoutEffect(() => {
    valueRef.current = value;
    const animate = placed.current;
    placed.current = place(ref.current, value, animate);
  }, [value]);

  useLayoutEffect(() => {
    const indicator = ref.current;
    const track = indicator?.parentElement;
    if (!indicator || !track) return;

    const observer = new ResizeObserver(() => {
      placed.current = place(indicator, valueRef.current, false);
    });
    observer.observe(track);
    for (const option of track.children) {
      if (option !== indicator) observer.observe(option);
    }
    return () => observer.disconnect();
  }, []);

  return <span ref={ref} className={className} aria-hidden />;
}

/**
 * Puts the pill over the chosen option, sliding there or not. Returns whether
 * it is showing: with no option chosen, or none matching, the track goes back
 * to drawing the choice the plain way.
 */
function place(
  indicator: HTMLSpanElement | null,
  value: string | null,
  animate: boolean,
): boolean {
  const track = indicator?.parentElement;
  if (!indicator || !track) return false;

  const option =
    value === null
      ? null
      : track.querySelector<HTMLElement>(
          `:scope > [data-segment="${CSS.escape(value)}"]`,
        );
  if (!option) {
    delete track.dataset.indicator;
    return false;
  }

  // From the rectangles rather than `offsetLeft`, which rounds to whole
  // pixels; the form's equal segments are fractional. Relative to the
  // track's padding box, as the pill is positioned, and through its scroll.
  const trackBox = track.getBoundingClientRect();
  const box = option.getBoundingClientRect();
  const x = box.left - trackBox.left - track.clientLeft + track.scrollLeft;
  const y = box.top - trackBox.top - track.clientTop + track.scrollTop;

  if (!animate) indicator.dataset.snap = "";
  indicator.style.setProperty("--indicator-x", `${x}px`);
  indicator.style.setProperty("--indicator-y", `${y}px`);
  indicator.style.setProperty("--indicator-width", `${box.width}px`);
  indicator.style.setProperty("--indicator-height", `${box.height}px`);
  if (!animate) {
    // Commit the new place with transitions off before turning them back on,
    // or the browser would see only the end state and slide to it anyway.
    void indicator.offsetWidth;
    delete indicator.dataset.snap;
  }
  track.dataset.indicator = "";
  return true;
}
