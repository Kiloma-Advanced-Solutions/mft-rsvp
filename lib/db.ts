/**
 * In-memory data store. SERVER ONLY.
 *
 * There is no database in this project on purpose — the exercise is about
 * product logic and UI, not about wiring Postgres. The store stands in for one:
 *
 *   - every method is async, so swapping in a real database later is a change
 *     of implementation and not a change of shape;
 *   - reads return deep copies, so a caller mutating what it got back cannot
 *     corrupt the store — a class of bug that is very confusing in a workshop;
 *   - state lives on `globalThis` so it survives hot reloads in `next dev`.
 *
 * Data resets whenever the dev server restarts. `POST /api/dev/reset` puts the
 * fixtures back without a restart.
 *
 * Never import this from a Client Component. Client code talks to API routes.
 */

import {
  createSeedEvents,
  createSeedRegistrations,
  SEED_USERS,
} from "./seed";
import type { EventRecord, Registration, User } from "./types";

export type EventInput = Omit<EventRecord, "id" | "createdAt" | "updatedAt">;
export type EventPatch = Partial<EventInput>;

export type RegistrationInput = Omit<
  Registration,
  "id" | "createdAt" | "updatedAt"
>;
export type RegistrationPatch = Partial<Omit<Registration, "id" | "createdAt">>;

type Store = {
  users: User[];
  events: EventRecord[];
  registrations: Registration[];
};

function createStore(): Store {
  return {
    users: structuredClone(SEED_USERS),
    events: createSeedEvents(),
    registrations: createSeedRegistrations(),
  };
}

/**
 * `next dev` re-evaluates modules on every edit. Without this, every save would
 * wipe whatever you created while clicking through the app.
 */
const globalForStore = globalThis as typeof globalThis & {
  __eventsBoardStore?: Store;
};

function store(): Store {
  globalForStore.__eventsBoardStore ??= createStore();
  return globalForStore.__eventsBoardStore;
}

/** Short, readable, collision-free enough for a store that lives in memory. */
function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function now(): string {
  return new Date().toISOString();
}

/** Deep copy on the way out so callers can never hold a live reference. */
function copy<T>(value: T): T {
  return structuredClone(value);
}

export const db = {
  users: {
    async list(): Promise<User[]> {
      return copy(store().users);
    },

    async get(id: string): Promise<User | null> {
      return copy(store().users.find((user) => user.id === id) ?? null);
    },
  },

  events: {
    async list(): Promise<EventRecord[]> {
      return copy(store().events);
    },

    async get(id: string): Promise<EventRecord | null> {
      return copy(store().events.find((event) => event.id === id) ?? null);
    },

    async create(input: EventInput): Promise<EventRecord> {
      const timestamp = now();
      const record: EventRecord = {
        ...copy(input),
        id: newId("e"),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store().events.push(record);
      return copy(record);
    },

    async update(id: string, patch: EventPatch): Promise<EventRecord | null> {
      const events = store().events;
      const index = events.findIndex((event) => event.id === id);
      if (index === -1) return null;

      events[index] = {
        ...events[index],
        ...copy(patch),
        id: events[index].id,
        createdAt: events[index].createdAt,
        updatedAt: now(),
      };
      return copy(events[index]);
    },

    /**
     * Deletes the event and every registration attached to it. Orphaned
     * registrations would otherwise show up in "my events" forever.
     */
    async remove(id: string): Promise<boolean> {
      const state = store();
      const index = state.events.findIndex((event) => event.id === id);
      if (index === -1) return false;

      state.events.splice(index, 1);
      state.registrations = state.registrations.filter(
        (registration) => registration.eventId !== id,
      );
      return true;
    },
  },

  registrations: {
    /** All registrations, optionally narrowed by event and/or user. */
    async list(filter?: {
      eventId?: string;
      userId?: string;
    }): Promise<Registration[]> {
      let rows = store().registrations;
      if (filter?.eventId) {
        rows = rows.filter((row) => row.eventId === filter.eventId);
      }
      if (filter?.userId) {
        rows = rows.filter((row) => row.userId === filter.userId);
      }
      return copy(rows);
    },

    /** A person has at most one registration per event. */
    async find(eventId: string, userId: string): Promise<Registration | null> {
      const match = store().registrations.find(
        (row) => row.eventId === eventId && row.userId === userId,
      );
      return copy(match ?? null);
    },

    async create(input: RegistrationInput): Promise<Registration> {
      const timestamp = now();
      const record: Registration = {
        ...copy(input),
        id: newId("r"),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store().registrations.push(record);
      return copy(record);
    },

    async update(
      id: string,
      patch: RegistrationPatch,
    ): Promise<Registration | null> {
      const rows = store().registrations;
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) return null;

      rows[index] = {
        ...rows[index],
        ...copy(patch),
        id: rows[index].id,
        createdAt: rows[index].createdAt,
        updatedAt: now(),
      };
      return copy(rows[index]);
    },

    async remove(id: string): Promise<boolean> {
      const rows = store().registrations;
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) return false;

      rows.splice(index, 1);
      return true;
    },
  },

  /** Throw away all changes and rebuild the fixtures. */
  async reset(): Promise<void> {
    globalForStore.__eventsBoardStore = createStore();
  },
};
