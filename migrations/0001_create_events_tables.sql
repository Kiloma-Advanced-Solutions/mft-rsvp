-- 0001 -- the five application-owned tables.
--
-- Schema only. This migration creates no rows: the development fixtures are a
-- later slice, and a migration that carried them would make "apply the schema"
-- and "load the sample data" the same irreversible act.
--
-- The sixth application table, dbo.Events_SchemaMigrations, is not here. It is
-- the migration runner's own history, and a migration that created the
-- mechanism recording it would be circular -- so lib/data/migrate.mts creates
-- it before it reads any history.
--
-- Written to the SQL Server 2008 R2 feature floor and statically enforced by
-- `npm run check:tsql`; runtime execution has been verified against Azure SQL
-- only. See docs/sql-server-2008r2-compatibility.md for what that does and does
-- not claim, and for the shared-database rules every object here obeys:
--
--   * every table name begins with `Events_`, so nothing this application
--     creates can be confused with an unrelated organizational object;
--   * no ALTER DATABASE, no schema, no view, procedure, function or trigger;
--   * nothing pre-existing is read, altered or dropped.
--
-- Deliberately plain CREATE TABLE, with no IF OBJECT_ID guard. The runner
-- applies each file exactly once and records it, so a guard would only matter
-- when the file is run by hand -- and there a second run should fail loudly
-- rather than silently skip a table somebody expected it to create.
--
-- Identifiers are uniqueidentifier with no DEFAULT. The application is the sole
-- generator of ids (crypto.randomUUID(), and fixed literals in the fixtures), so
-- an INSERT that forgets to bind one must fail rather than quietly receive a
-- server-generated id the application will never know.
--
-- Every timestamp is datetime2(3): three fractional digits is exactly the
-- millisecond precision of a JavaScript Date, so an ISO string round-trips
-- unchanged. `datetime` would round it and SQL Server's `timestamp` is a binary
-- row-version counter, not a time at all.
--
-- The columns are the current domain model in lib/types.ts and nothing else.
-- There is no cancellation metadata, no share token, no logging column, no
-- waitlist column and no row ordering: those are later milestones, and a column
-- added before its behaviour is decided is a guess that has to be migrated
-- twice.

/* --------------------------------------------------------------------- people
   `User` in lib/types.ts. No CreatedAt/UpdatedAt, because a user row has
   neither -- the product has no user write path at all. No ordering column
   either: PERSONA_ORDER in lib/seed.ts is display order, applied by
   listPersonas(), and where a row sits in a list is not a fact about the row. */

CREATE TABLE dbo.Events_Users (
    Id          uniqueidentifier NOT NULL
                    CONSTRAINT PK_Events_Users PRIMARY KEY,
    Name        nvarchar(200)    NOT NULL,
    Email       nvarchar(320)    NOT NULL,
    -- Job title, shown under the name. Not a role.
    Title       nvarchar(200)    NOT NULL,
    Role        nvarchar(16)     NOT NULL,
    -- Two letters today; the width is headroom, not a product rule.
    Initials    nvarchar(8)      NOT NULL,
    Accent      nvarchar(16)     NOT NULL,
    CONSTRAINT CK_Events_Users_Role
        CHECK (Role IN (N'admin', N'organizer', N'member')),
    CONSTRAINT CK_Events_Users_Accent
        CHECK (Accent IN (N'violet', N'blue', N'emerald', N'amber', N'rose', N'cyan'))
);
GO

/* --------------------------------------------------------------------- events
   `EventRecord` in lib/types.ts.

   `location` is flattened into five columns rather than stored as a document:
   the floor has no JSON functions, and a nested value would have to be parsed
   somewhere. LocationKind decides which of the other four are meaningful, and
   parseLocation() in lib/eventInput.ts drops the ones that are not -- so they
   are nullable here, and NULL means "not applicable to this kind", which is the
   absent property the domain type already describes.

   Which fields each kind requires is application validation and is deliberately
   not a constraint: a CHECK there would refuse a host's edit halfway through
   changing an event from hybrid to online. */

CREATE TABLE dbo.Events_Events (
    Id                  uniqueidentifier NOT NULL
                            CONSTRAINT PK_Events_Events PRIMARY KEY,
    -- Host-authored free text. nvarchar(max) because the application enforces
    -- no maximum, and a bounded column would invent one it does not have.
    Title               nvarchar(max)    NOT NULL,
    Summary             nvarchar(max)    NOT NULL,
    Description         nvarchar(max)    NOT NULL,
    StartsAt            datetime2(3)     NOT NULL,
    EndsAt              datetime2(3)     NOT NULL,
    LocationKind        nvarchar(16)     NOT NULL,
    LocationVenue       nvarchar(max)    NULL,
    LocationAddress     nvarchar(max)    NULL,
    LocationUrl         nvarchar(max)    NULL,
    LocationPlatform    nvarchar(max)    NULL,
    Category            nvarchar(16)     NOT NULL,
    Accent              nvarchar(16)     NOT NULL,
    -- NULL is the domain value for "unlimited", not a missing field.
    Capacity            int              NULL,
    Access              nvarchar(16)     NOT NULL,
    Status              nvarchar(16)     NOT NULL,
    OrganizerId         uniqueidentifier NOT NULL,
    CreatedAt           datetime2(3)     NOT NULL,
    UpdatedAt           datetime2(3)     NOT NULL,
    -- The organizer is always a host, so the row cannot outlive the person.
    -- NO ACTION rather than a cascade: there is no user-deletion path in the
    -- product, and the database refusing is better than inventing one.
    CONSTRAINT FK_Events_Events_Organizer
        FOREIGN KEY (OrganizerId) REFERENCES dbo.Events_Users (Id)
        ON DELETE NO ACTION,
    CONSTRAINT CK_Events_Events_LocationKind
        CHECK (LocationKind IN (N'in_person', N'online', N'hybrid')),
    CONSTRAINT CK_Events_Events_Category
        CHECK (Category IN (N'engineering', N'design', N'product', N'learning',
                            N'social', N'company')),
    CONSTRAINT CK_Events_Events_Accent
        CHECK (Accent IN (N'violet', N'blue', N'emerald', N'amber', N'rose', N'cyan')),
    CONSTRAINT CK_Events_Events_Access
        CHECK (Access IN (N'open', N'approval', N'invite')),
    CONSTRAINT CK_Events_Events_Status
        CHECK (Status IN (N'draft', N'published', N'cancelled')),
    -- Both halves of the domain contract: unlimited, or at least one seat.
    -- parseEventForm() already refuses anything else; this is the floor under it.
    CONSTRAINT CK_Events_Events_Capacity
        CHECK (Capacity IS NULL OR Capacity >= 1),
    -- lib/types.ts states EndsAt is always after StartsAt, and
    -- parseEventForm() enforces it for the error message. This is the same
    -- invariant as data integrity, so no write path can leave it violated.
    CONSTRAINT CK_Events_Events_Ends
        CHECK (EndsAt > StartsAt)
);
GO

/* -------------------------------------------------------------- registrations
   `Registration` in lib/types.ts.

   One row per person per event, enforced here rather than trusted: the write
   path revives an existing row instead of inserting a second one, and the
   uniqueness that makes that correct is now the database's promise.

   Message, DecidedBy and DecidedAt are nullable because reviving a withdrawn
   row clears all three -- a new cycle carries nothing from the last one.

   `waitlisted` is in the CHECK because it is in the domain type. Nothing in the
   product produces it yet, and this migration adds nothing that does. */

CREATE TABLE dbo.Events_Registrations (
    Id          uniqueidentifier NOT NULL
                    CONSTRAINT PK_Events_Registrations PRIMARY KEY,
    EventId     uniqueidentifier NOT NULL,
    UserId      uniqueidentifier NOT NULL,
    Status      nvarchar(16)     NOT NULL,
    -- Whatever the attendee wrote with an approval request.
    Message     nvarchar(max)    NULL,
    CreatedAt   datetime2(3)     NOT NULL,
    UpdatedAt   datetime2(3)     NOT NULL,
    -- Who decided, and when, if a host has. Two independent optionals in the
    -- domain type, so no constraint pairs them.
    DecidedBy   uniqueidentifier NULL,
    DecidedAt   datetime2(3)     NULL,
    -- NO ACTION on all three. Deleting an event takes its registrations with
    -- it, but that ordering is the data layer's, written explicitly inside one
    -- transaction, so a forgotten cleanup fails loudly instead of silently
    -- deleting rows a cascade would have swept up.
    CONSTRAINT FK_Events_Registrations_Event
        FOREIGN KEY (EventId) REFERENCES dbo.Events_Events (Id)
        ON DELETE NO ACTION,
    CONSTRAINT FK_Events_Registrations_User
        FOREIGN KEY (UserId) REFERENCES dbo.Events_Users (Id)
        ON DELETE NO ACTION,
    CONSTRAINT FK_Events_Registrations_DecidedBy
        FOREIGN KEY (DecidedBy) REFERENCES dbo.Events_Users (Id)
        ON DELETE NO ACTION,
    CONSTRAINT CK_Events_Registrations_Status
        CHECK (Status IN (N'going', N'pending', N'rejected', N'cancelled',
                          N'waitlisted')),
    -- The application invariant, now the database's: at most one registration
    -- per person per event. Its index also serves every read the product makes
    -- -- by event, and by (event, user) -- which is why no other index exists.
    CONSTRAINT UQ_Events_Registrations_Event_User
        UNIQUE (EventId, UserId)
);
GO

/* ------------------------------------------------------------------- co-hosts
   `EventRecord.coHostIds`. A junction table, because the floor has no array
   type and splitting a delimited column would need STRING_SPLIT (2016).

   No position column. The hosts list renders the organizer first and then the
   co-hosts, but nothing in the product depends on the order among co-hosts, so
   there is no ordering fact to persist. The composite key also makes "a person
   is a co-host of an event at most once" free. */

CREATE TABLE dbo.Events_EventCoHosts (
    EventId     uniqueidentifier NOT NULL,
    UserId      uniqueidentifier NOT NULL,
    CONSTRAINT PK_Events_EventCoHosts PRIMARY KEY (EventId, UserId),
    CONSTRAINT FK_Events_EventCoHosts_Event
        FOREIGN KEY (EventId) REFERENCES dbo.Events_Events (Id)
        ON DELETE NO ACTION,
    CONSTRAINT FK_Events_EventCoHosts_User
        FOREIGN KEY (UserId) REFERENCES dbo.Events_Users (Id)
        ON DELETE NO ACTION
);
GO

/* -------------------------------------------------------------------- invites
   `EventRecord.invitedUserIds` -- who may see and join an invite-only event.
   Existing invite membership, not a shareable link.

   Deliberately not tied to Access = N'invite'. An invite list survives a host
   switching the event to open, exactly as a registration survives an access
   change, and a constraint would destroy somebody's invitation as a side effect
   of an unrelated edit. */

CREATE TABLE dbo.Events_EventInvites (
    EventId     uniqueidentifier NOT NULL,
    UserId      uniqueidentifier NOT NULL,
    CONSTRAINT PK_Events_EventInvites PRIMARY KEY (EventId, UserId),
    CONSTRAINT FK_Events_EventInvites_Event
        FOREIGN KEY (EventId) REFERENCES dbo.Events_Events (Id)
        ON DELETE NO ACTION,
    CONSTRAINT FK_Events_EventInvites_User
        FOREIGN KEY (UserId) REFERENCES dbo.Events_Users (Id)
        ON DELETE NO ACTION
);
GO
