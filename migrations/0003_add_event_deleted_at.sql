-- 0003 -- soft deletion of events.
--
-- Deleting an event no longer removes its row. `removeEvent` in
-- lib/data/events.ts stamps DeletedAt instead, and every event read there
-- filters on `DeletedAt IS NULL`, so a deleted event is treated as nonexistent
-- by every normal read and operation -- admins included -- while its
-- registrations, co-hosts and invitations stay in the database, unreachable.
-- There is no restore and no purge.
--
-- NULL means "not deleted", so every existing row is a live event exactly as
-- before, and nothing has to be backfilled. datetime2(3), like every other
-- timestamp here, and with no DEFAULT: the application is the sole source of
-- time and binds the value, as 0001 explains.
--
-- One nullable column on one application-owned table. No index, no constraint,
-- no data change, no other table. 0001 and 0002 are not edited: applied
-- migrations are immutable.
--
-- Written to the SQL Server 2008 R2 feature floor and statically enforced by
-- `npm run check:tsql`. See docs/sql-server-2008r2-compatibility.md.

ALTER TABLE dbo.Events_Events
    ADD DeletedAt datetime2(3) NULL;
GO
