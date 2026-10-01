-- 0002 -- the `removed` registration status.
--
-- `removed` is a confirmed place a host or admin took back: distinct from
-- `cancelled` (the person withdrew) and from `rejected` (a host declined a
-- request). `RegistrationStatus` in lib/types.ts gained it, and
-- lib/data/rows.ts casts the column without re-validating it, so the CHECK has
-- to admit it before anything writes one.
--
-- One constraint on one application-owned table, replaced in place. No data
-- changes, no other table, no other constraint. 0001 is not edited: applied
-- migrations are immutable, and the constraint's name is kept so every
-- reference to CK_Events_Registrations_Status stays true.
--
-- A CHECK constraint cannot be altered, only dropped and re-created. The runner
-- applies this file in one transaction and DDL is transactional, so the table
-- is never left without the constraint: either both statements commit or
-- neither does. Every existing row already holds one of the five older values,
-- which the new list still contains, so re-creating it WITH CHECK -- the
-- default -- cannot fail on existing data.
--
-- Written to the SQL Server 2008 R2 feature floor and statically enforced by
-- `npm run check:tsql`. See docs/sql-server-2008r2-compatibility.md.

ALTER TABLE dbo.Events_Registrations
    DROP CONSTRAINT CK_Events_Registrations_Status;
GO

ALTER TABLE dbo.Events_Registrations
    ADD CONSTRAINT CK_Events_Registrations_Status
        CHECK (Status IN (N'going', N'pending', N'rejected', N'cancelled',
                          N'waitlisted', N'removed'));
GO
