-- 0004 -- the audit log (M12).
--
-- One row per audited request: an API action, or a page view. Who did what,
-- when, to which event, and how it ended. Written by `insertAudit` in
-- lib/data/audit.ts, under the write policy in lib/audit.ts, which also
-- defines the allowed values. Read with SQL only; the product has no screen
-- for it.
--
-- APPEND-ONLY, KEPT INDEFINITELY. The application inserts and never updates or
-- deletes a row -- `check:tsql` refuses application SQL that would -- and there
-- is no purge. `db:reset` clears the five domain tables by name, and this is
-- not one of them, so audit history survives a data reset. This is an
-- application convention, not a tamper-proof store: anyone with write access
-- to the database can still change it.
--
-- NO FOREIGN KEYS. A row must outlive the user, event or registration it
-- names, survive a reset of the domain tables, and be able to record an id
-- that never existed (a request for a missing event). ActorName is a snapshot
-- of the display name at the time, for the same reason.
--
-- Ids and timestamps come from the application, as everywhere else (0001):
-- Id is generated per row, OccurredAt is when the request started, and nothing
-- reads a server clock. RequestId is the server-generated id from proxy.ts,
-- the same value the application log carries, and it is UNIQUE: at most one
-- row per request, whatever retries or late writes happen. A second write for
-- the same request fails on this key and is treated as "already written".
--
-- Clustered on OccurredAt, so rows are appended at the end of the table and
-- time-range reads are cheap; the primary key is therefore nonclustered.
-- Operation is restricted by the TypeScript union in lib/audit.ts rather than
-- a CHECK, so adding an audited operation is a code change, not a migration.
--
-- One new table and its indexes. 0001-0003 are not edited: applied migrations
-- are immutable.
--
-- Written to the SQL Server 2008 R2 feature floor and statically enforced by
-- `npm run check:tsql`. See docs/sql-server-2008r2-compatibility.md.

CREATE TABLE dbo.Events_AuditLog (
    Id              uniqueidentifier NOT NULL
                        CONSTRAINT PK_Events_AuditLog PRIMARY KEY NONCLUSTERED,
    OccurredAt      datetime2(3)     NOT NULL,
    RequestId       uniqueidentifier NOT NULL,
    -- Events_Users.Id; NULL when no user was resolved. No foreign key.
    ActorUserId     uniqueidentifier NULL,
    -- Events_Users.Name at the time of the request.
    ActorName       nvarchar(200)    NULL,
    Channel         nvarchar(8)      NOT NULL,
    HttpMethod      nvarchar(8)      NOT NULL,
    -- A route pattern (/api/events/:id), never a URL or query string.
    Route           nvarchar(200)    NOT NULL,
    Operation       nvarchar(64)     NOT NULL,
    EventId         uniqueidentifier NULL,
    SubjectType     nvarchar(16)     NULL,
    SubjectId       uniqueidentifier NULL,
    Outcome         nvarchar(16)     NOT NULL,
    HttpStatus      smallint         NOT NULL,
    -- A machine-readable code, never a message.
    ReasonCode      nvarchar(64)     NULL,
    DurationMs      int              NULL,
    -- A small JSON object with allowlisted keys only (lib/audit.ts). Stored as
    -- text and never queried in SQL: the floor has no JSON functions.
    Metadata        nvarchar(1000)   NULL,
    CONSTRAINT UQ_Events_AuditLog_RequestId
        UNIQUE (RequestId),
    CONSTRAINT CK_Events_AuditLog_Channel
        CHECK (Channel IN (N'api', N'page')),
    CONSTRAINT CK_Events_AuditLog_SubjectType
        CHECK (SubjectType IN (N'registration', N'user')),
    CONSTRAINT CK_Events_AuditLog_Outcome
        CHECK (Outcome IN (N'success', N'rejected', N'denied', N'not_found', N'invalid', N'error'))
);
GO

CREATE CLUSTERED INDEX IX_Events_AuditLog_OccurredAt
    ON dbo.Events_AuditLog (OccurredAt);
GO

CREATE NONCLUSTERED INDEX IX_Events_AuditLog_Actor
    ON dbo.Events_AuditLog (ActorUserId, OccurredAt);
GO

CREATE NONCLUSTERED INDEX IX_Events_AuditLog_Event
    ON dbo.Events_AuditLog (EventId, OccurredAt);
GO

CREATE NONCLUSTERED INDEX IX_Events_AuditLog_Operation
    ON dbo.Events_AuditLog (Operation, Outcome, OccurredAt);
GO
