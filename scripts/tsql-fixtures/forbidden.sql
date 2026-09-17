-- Fixture for `node scripts/check-tsql-compat.mts --selftest`.
--
-- One instance of every construct the guard rejects, in all three classes:
--
--   FORBIDDEN   -- introduced after SQL Server 2008 R2
--   DISCOURAGED -- available at the floor, rejected by this project's design
--   OWNERSHIP   -- DDL aimed at an object this application has no business
--                  touching: somebody else's table, or a kind of object we do
--                  not create at any name
--
-- The self-test asserts that EVERY rule fires at least once here, so a new rule
-- added without a sample fails the self-test. That is what keeps this file
-- honest as the rule set grows.
--
-- ******************************************************************
-- *  NOT A MIGRATION. NEVER EXECUTE THIS FILE AGAINST A DATABASE.  *
-- *  Several statements here are destructive. It lives outside     *
-- *  `migrations/` so no runner can pick it up.                    *
-- ******************************************************************

/* ------------------------------------------------- FORBIDDEN (post-2008 R2) */

-- drop-if-exists (2016)
DROP TABLE IF EXISTS dbo.Events_Example;

-- create-or-alter (2016)
CREATE OR ALTER VIEW dbo.Events_ExampleView AS SELECT 1 AS One;

-- throw (2012)
THROW 50000, N'something went wrong', 1;

-- try-convert-cast-parse (2012)
SELECT TRY_CONVERT(uniqueidentifier, @value) AS AsGuid;
SELECT TRY_CAST(@value AS int) AS AsInt;
SELECT TRY_PARSE(@value AS int) AS Parsed;

-- parse (2012)
SELECT PARSE(@value AS int) AS Parsed;

-- concat (2012)
SELECT CONCAT(FirstName, LastName) FROM dbo.Events_Users;

-- concat-ws (2017)
SELECT CONCAT_WS(N', ', FirstName, LastName) FROM dbo.Events_Users;

-- string-split-agg (2016 / 2017)
SELECT value FROM STRING_SPLIT(@ids, N',');
SELECT STRING_AGG(Name, N', ') FROM dbo.Events_Users;

-- trim (2017)
SELECT TRIM(Name) FROM dbo.Events_Users;

-- at-time-zone (2016)
SELECT CreatedAt AT TIME ZONE N'UTC' FROM dbo.Events_Events;

-- json-functions (2016)
SELECT JSON_VALUE(@payload, N'$.venue') AS Venue;
SELECT ISJSON(@payload) AS Valid;
SELECT OPENJSON(@payload) AS Parsed;

-- for-json (2016)
SELECT Id, Title FROM dbo.Events_Events FOR JSON PATH;

-- fetch-next and offset-rows (2012)
SELECT Id FROM dbo.Events_Events ORDER BY CreatedAt OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY;

-- iif (2012)
SELECT IIF(Capacity IS NULL, N'unlimited', N'limited') FROM dbo.Events_Events;

-- choose (2012)
SELECT CHOOSE(2, N'a', N'b', N'c') AS Picked;

-- format (2012)
SELECT FORMAT(StartsAt, N'yyyy-MM-dd') FROM dbo.Events_Events;

-- eomonth (2012)
SELECT EOMONTH(StartsAt) FROM dbo.Events_Events;

-- fromparts (2012)
SELECT DATETIME2FROMPARTS(2026, 9, 8, 12, 0, 0, 0, 3) AS Built;

-- create-sequence and next-value-for (2012)
CREATE SEQUENCE dbo.Events_Counter AS int START WITH 1;
SELECT NEXT VALUE FOR dbo.Events_Counter AS Nxt;

-- post-2008-window-functions (2012)
SELECT LAG(Id) OVER (ORDER BY CreatedAt) FROM dbo.Events_Events;

-- window-frame (2012)
SELECT SUM(Capacity) OVER (
           ORDER BY CreatedAt
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) FROM dbo.Events_Events;

-- greatest-least (2022)
SELECT GREATEST(Capacity, 1) AS Hi, LEAST(Capacity, 100) AS Lo FROM dbo.Events_Events;

/* ------------------------- DISCOURAGED (available, rejected by our design) */

-- merge: needs HOLDLOCK to be race-free and is harder to read than IF/ELSE
MERGE dbo.Events_Registrations AS target
USING (SELECT @eventId AS EventId) AS source
   ON target.EventId = source.EventId
 WHEN MATCHED THEN UPDATE SET target.Status = @status;

-- datetime-type: rounds to ~3.33ms and would corrupt the stored ISO timestamp
ALTER TABLE dbo.Events_Example ADD LegacyStamp datetime NOT NULL;

-- rowversion: a binary row counter, not a time
ALTER TABLE dbo.Events_Example ADD Ver rowversion;

-- server-clock: the application supplies every timestamp
UPDATE dbo.Events_Example SET UpdatedAt = GETUTCDATE() WHERE Id = @id;

-- current-timestamp: same rule
UPDATE dbo.Events_Example SET UpdatedAt = CURRENT_TIMESTAMP WHERE Id = @id;

-- identity: ids are application-generated UUIDs
CREATE TABLE dbo.Events_Counter2 (Id int IDENTITY(1, 1) NOT NULL);

-- scope-identity: there are no IDENTITY columns to read back
SELECT SCOPE_IDENTITY() AS LastId;

-- newsequentialid: leaks the host MAC address
ALTER TABLE dbo.Events_Example ADD Seq uniqueidentifier DEFAULT NEWSEQUENTIALID();

-- alter-database: a shared organizational database is not ours to reconfigure
ALTER DATABASE CURRENT SET RECOVERY SIMPLE;

-- snapshot-isolation: needs a database-level change we do not own
SET TRANSACTION ISOLATION LEVEL SNAPSHOT;

-- truncate: fails on a table a foreign key references, and has no CASCADE
TRUNCATE TABLE dbo.Events_Example;

-- drop-database-or-schema: only app-owned Events_* objects may ever be dropped
DROP SCHEMA app_events;

/* ----------------- OWNERSHIP (an object this application must not touch) */

-- non-table-object-ddl: shared-database rule 11 -- no stored procedures, views,
-- triggers, functions or jobs. Every persisted object this application owns is
-- a table it named, so these are refused whatever they are called: the
-- Events_-prefixed samples below must be rejected exactly as the foreign ones
-- are. That is why the rule reads no target.
CREATE VIEW dbo.PayrollSummary AS SELECT 1 AS One;
ALTER VIEW dbo.Events_Summary AS SELECT 2 AS Two;
DROP VIEW dbo.SomeoneElsesView;
CREATE PROCEDURE dbo.Payroll_Pay AS SELECT 1;
ALTER PROCEDURE dbo.SomeoneElsesProcedure AS SELECT 1;
DROP PROC dbo.Events_Recount;
CREATE FUNCTION dbo.Events_Rate () RETURNS int AS BEGIN RETURN 1 END;
DROP FUNCTION dbo.Payroll_Rate;
CREATE TRIGGER TR_Events_Audit ON dbo.Events_Events AFTER INSERT AS SELECT 1;
DROP TRIGGER dbo.TR_Payroll;
CREATE SCHEMA finance;
DROP SEQUENCE dbo.PayrollSeq;
CREATE SYNONYM dbo.Payroll2 FOR dbo.Payroll;
CREATE TYPE dbo.MoneyList AS TABLE (Amount int);
CREATE LOGIN app_reader FROM WINDOWS;
CREATE USER app_reader FOR LOGIN app_reader;
CREATE ROLE events_writer;

-- events-table-prefix: the database is shared and the development account holds
-- db_owner, so a table name that does not say it is ours is the one mistake
-- nothing on the server side would stop.
CREATE TABLE dbo.WorkshopAttendees (Id uniqueidentifier NOT NULL);
ALTER TABLE dbo.Departments ADD HeadCount int NULL;
DROP TABLE dbo.Salaries;
CREATE INDEX IX_Payroll_Id ON dbo.Payroll (Id);
CREATE TABLE #Scratch (Id int NULL);

-- events-dml-target-prefix: the same boundary, applied to writes. Reading an
-- unrelated table is somebody else's business; writing to one is ours.
INSERT INTO dbo.Invoices (Id, Total) VALUES (@id, @total);
UPDATE dbo.Salaries SET Amount = @amount WHERE Id = @id;
DELETE FROM dbo.Payroll WHERE Id = @id;

-- events-migration-history-immutable: the history table is app-owned, so the
-- prefix rule above admits it. It still may only ever be appended to -- wiping
-- it would make the schema state unknowable, and it is deliberately not one of
-- the tables a data reset clears.
DELETE FROM dbo.Events_SchemaMigrations;
UPDATE dbo.Events_SchemaMigrations SET AppliedAt = @appliedAt WHERE MigrationId = @id;
