import Link from "next/link";

import { Avatar, Badge, Card, buttonClass } from "@/components/ui";
import { db } from "@/lib/db";
import { ACCESS_DESCRIPTIONS, ACCESS_LABELS, ACCESS_TONES } from "@/lib/labels";
import type { EventAccess } from "@/lib/types";

import styles from "./page.module.css";

export const metadata = {
  title: "Start here",
};

const ACCESS_RULES: Record<EventAccess, string> = {
  open: "Registering sets the person to “going” straight away.",
  approval: "Registering creates a request. A host approves or rejects it.",
  invite: "Absent from the board entirely for anyone not on the invite list.",
};

const GIVEN = [
  "Design tokens, light and dark, in `app/styles/tokens.css`",
  "A UI kit: buttons, badges, cards, fields, modals, toasts, avatars",
  "`EventCard` and the event chrome — dates, access badges, capacity meters",
  "An in-memory store with 12 seeded events and 5 people",
  "Persona switching, so you can be an organizer or a member",
  "`/api/session` as the worked example of the API house style",
];

const YOURS = [
  "The board at `/events` — list, filters, and a calendar view",
  "The detail screen at `/events/[id]`, with editing in place for hosts",
  "Registration: register, cancel, request, approve, reject",
  "The visibility rules — who sees what, and who may do what",
  "`/api/events` and the rest of the API, following the session example",
  "Creating an event, in whatever flow you think is right",
];

export default async function StartHerePage() {
  const users = await db.users.list();

  return (
    <div>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Claude Code workshop</p>
        <h1 className={styles.title}>Everything except the app itself</h1>
        <p className={styles.lede}>
          This is an events board with the scaffolding already in place — the
          design system, the data layer and the session are done, so the 80
          minutes go on product decisions rather than on picking colours. Read{" "}
          <code>TASKS.md</code> for the brief, then start building.
        </p>
        <div className={styles.heroActions}>
          <Link href="/events" className={buttonClass({ variant: "primary" })}>
            Open the board
          </Link>
          <Link
            href="/styleguide"
            className={buttonClass({ variant: "secondary" })}
          >
            Browse the style guide
          </Link>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Three ways into an event</h2>
        <p className={styles.sectionLede}>
          This is the product in one paragraph. Every screen you build has to
          respect these three modes, and most of the interesting decisions come
          from getting them right.
        </p>

        <div className={styles.grid3}>
          {(Object.keys(ACCESS_LABELS) as EventAccess[]).map((access) => (
            <Card key={access}>
              <h3 className={styles.modeTitle}>
                <Badge tone={ACCESS_TONES[access]} size="lg">
                  {ACCESS_LABELS[access]}
                </Badge>
              </h3>
              <p className={styles.modeBody}>{ACCESS_DESCRIPTIONS[access]}</p>
              <p className={styles.modeRule}>{ACCESS_RULES[access]}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>What is done, and what is yours</h2>

        <div className={styles.grid2}>
          <Card>
            <h3 className={styles.modeTitle}>Already built</h3>
            <ul className={styles.list}>
              {GIVEN.map((item) => (
                <li key={item} className={styles.listItem}>
                  <span className={styles.tick} aria-hidden>
                    ✓
                  </span>
                  <span>
                    <WithCode text={item} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h3 className={styles.modeTitle}>Yours to build</h3>
            <ul className={styles.list}>
              {YOURS.map((item) => (
                <li key={item} className={styles.listItem}>
                  <span className={styles.todo} aria-hidden />
                  <span>
                    <WithCode text={item} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Five people to test with</h2>
        <p className={styles.sectionLede}>
          There is no login. Switch persona from the top right and every Server
          Component re-renders as that person — the fastest way to check that an
          invite-only event really is invisible to everyone else.
        </p>

        <div className={styles.personas}>
          {users.map((user) => (
            <div key={user.id} className={styles.persona}>
              <Avatar user={user} size="md" />
              <div className={styles.personaText}>
                <p className={styles.personaName}>{user.name}</p>
                <p className={styles.personaRole}>
                  {user.role} · {user.title}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <aside className={styles.callout}>
        <span className={styles.calloutMark} aria-hidden>
          ⚑
        </span>
        <div>
          <p className={styles.calloutTitle}>Data lives in memory</p>
          <p className={styles.calloutBody}>
            Everything resets when the dev server restarts. To put the fixtures
            back without restarting, <code>POST /api/dev/reset</code>. There is no
            database and there does not need to be one — see{" "}
            <code>lib/db.ts</code>.
          </p>
        </div>
      </aside>
    </div>
  );
}

/** Renders `backtick spans` in the checklists above as real <code> elements. */
function WithCode({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, index) =>
        // Odd indices are the spans that were between backticks.
        index % 2 === 1 ? <code key={index}>{part}</code> : part,
      )}
    </>
  );
}
