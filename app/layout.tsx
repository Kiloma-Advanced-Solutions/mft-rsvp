import type { Metadata } from "next";
import { Geist, Geist_Mono, Rubik } from "next/font/google";

import { AppShell } from "@/components/layout/AppShell";
import { ToastProvider } from "@/components/ui";
import { APP_LABELS } from "@/lib/labels";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/*
  The interface font. `next/font` self-hosts it at build time, so this is a
  build step rather than a dependency or a request to Google at runtime.

  Both subsets are loaded on purpose: the UI is Hebrew, but Latin survives in
  code spans, joining links and platform names, and a Hebrew-only face would
  have dropped those to a fallback mid-sentence.
*/
const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: {
    default: APP_LABELS.documentTitle,
    template: APP_LABELS.documentTitleTemplate,
  },
  description: APP_LABELS.documentDescription,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    /*
      Direction is set once, here. Every layout below is flexbox or grid with
      logical spacing, so `dir` alone mirrors the app -- no component decides
      its own direction, and nothing is flipped by hand.
    */
    <html
      lang="he"
      dir="rtl"
      className={`${rubik.variable} ${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        {/*
          ToastProvider is a Client Component, but `children` is rendered on the
          server and handed to it as a prop — so wrapping the whole app here
          does not turn any page into a client component.
        */}
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
