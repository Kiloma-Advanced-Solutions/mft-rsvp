-- Fixture for `node scripts/check-tsql-compat.mts --selftest`.
--
-- Representative T-SQL that IS within the SQL Server 2008 R2 feature floor.
-- The self-test asserts this file produces zero findings, so it doubles as a
-- worked example of the idioms M6 should use.
--
-- NOT A MIGRATION. This file is never executed against any database, and it
-- deliberately lives outside `migrations/` so no runner can pick it up.

-- Existence check without `DROP TABLE IF EXISTS`, which is SQL Server 2016.
IF OBJECT_ID(N'dbo.Events_Example', N'U') IS NOT NULL
    DROP TABLE dbo.Events_Example;

-- `DEFAULT NEWID()` is kept here to prove NEWID() is within the floor and not
-- flagged. It is NOT the project's own idiom: the real schema uses plain
-- `uniqueidentifier NOT NULL` with no default, so an INSERT that forgets to bind
-- an id fails instead of silently receiving a server-generated one. See
-- "Ids have exactly one generator" in docs/sql-server-2008r2-compatibility.md.
CREATE TABLE dbo.Events_Example (
    Id              uniqueidentifier NOT NULL
                        CONSTRAINT PK_Events_Example PRIMARY KEY
                        CONSTRAINT DF_Events_Example_Id DEFAULT NEWID(),
    OwnerId         uniqueidentifier NOT NULL,
    Title           nvarchar(max)    NOT NULL,
    Note            nvarchar(max)    NULL,
    Seats           int              NULL,
    Access          nvarchar(10)     NOT NULL,
    StartsAt        datetime2(3)     NOT NULL,
    EndsAt          datetime2(3)     NOT NULL,
    CreatedAt       datetime2(3)     NOT NULL,
    UpdatedAt       datetime2(3)     NOT NULL,
    CONSTRAINT FK_Events_Example_Owner
        FOREIGN KEY (OwnerId) REFERENCES dbo.Events_Users (Id) ON DELETE NO ACTION,
    CONSTRAINT CK_Events_Example_Access
        CHECK (Access IN (N'open', N'approval', N'invite')),
    CONSTRAINT CK_Events_Example_Seats
        CHECK (Seats IS NULL OR Seats >= 1),
    CONSTRAINT CK_Events_Example_Ends
        CHECK (EndsAt > StartsAt),
    CONSTRAINT UQ_Events_Example_Owner_Title
        UNIQUE (OwnerId, Title)
);
GO

-- Ordering is always explicit: SQL guarantees none without ORDER BY.
SELECT Id, OwnerId, Seats, CreatedAt
FROM   dbo.Events_Example
WHERE  Access = @access
ORDER  BY CreatedAt ASC, Id ASC;
GO

-- Whitespace trimming the 2008 R2 way; `TRIM` is SQL Server 2017.
SELECT LTRIM(RTRIM(Title)) AS Title,
       CASE WHEN Seats IS NULL THEN N'unlimited' ELSE N'limited' END AS SeatKind
FROM   dbo.Events_Example;
GO

-- Row numbering is available (SQL Server 2005); LAG/LEAD are not.
SELECT Id, ROW_NUMBER() OVER (ORDER BY CreatedAt ASC, Id ASC) AS Position
FROM   dbo.Events_Example;
GO

-- The capacity-sensitive pattern: take an update lock on the one row, re-read
-- the facts inside it, let the application decide, then write.
BEGIN TRANSACTION;

    SELECT @seats = Seats
    FROM   dbo.Events_Example WITH (UPDLOCK, ROWLOCK)
    WHERE  Id = @id;

    IF @@ROWCOUNT = 0
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR(N'No such row.', 16, 1);
    END
    ELSE
    BEGIN
        UPDATE dbo.Events_Example
        SET    Seats     = @seats,
               UpdatedAt = @updatedAt
        WHERE  Id = @id;

        COMMIT TRANSACTION;
    END
GO

-- A conditional transition: zero rows affected means the caller's view was
-- stale, which the data layer turns into a null return.
UPDATE dbo.Events_Example
SET    Access    = @access,
       Note      = @note,
       UpdatedAt = @updatedAt
WHERE  Id = @id AND Access = @expectedAccess;

IF @@ROWCOUNT > 0
    SELECT Id, OwnerId, Access, Note, CreatedAt, UpdatedAt
    FROM   dbo.Events_Example
    WHERE  Id = @id;
GO

-- Deletes name their table explicitly and only ever touch Events_* objects.
DELETE FROM dbo.Events_Example
WHERE  Id = @id;
GO

INSERT INTO dbo.Events_Example
    (Id, OwnerId, Title, Note, Seats, Access, StartsAt, EndsAt, CreatedAt, UpdatedAt)
VALUES
    (@id, @ownerId, @title, @note, @seats, @access, @startsAt, @endsAt, @createdAt, @updatedAt);
GO
