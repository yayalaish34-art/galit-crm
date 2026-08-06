-- Hard-delete the user גיא פרנסס <guyf@galit.co.il>.
--
-- The CRM "delete user" action only soft-deletes (status=INACTIVE), so this row
-- lingered in "User". This migration removes it for good.
--
-- Blockers (FKs to "User" without SET NULL/CASCADE) are handled explicitly:
--   * Task.ownerId (RESTRICT)              — 1 real task + 1 incoming lead reassigned
--   * IncomingLead.ownerId (RESTRICT)      --   to יורם <yoram@galit.co.il>
--   * TaskField.updatedByUserId (NO ACTION)-- reassigned to יורם
--   * QA_TEST tasks                        — deleted
--   * Whatsapp*/Worker*/Tracking* logs     — deleted (bot/worker telemetry, no value)
-- All SET NULL / CASCADE FKs are left to the DB to resolve automatically on DELETE.
--
-- Written by-email so it is self-contained and idempotent (safe if re-run: after the
-- first run the user is gone and every statement simply matches 0 rows).

DO $$
DECLARE
  guyf_id text;
  yoram_id text;
BEGIN
  SELECT id INTO guyf_id  FROM "User" WHERE email = 'guyf@galit.co.il';
  SELECT id INTO yoram_id FROM "User" WHERE email = 'yoram@galit.co.il';

  IF guyf_id IS NULL THEN
    RAISE NOTICE 'User guyf@galit.co.il not found — nothing to do.';
    RETURN;
  END IF;

  IF yoram_id IS NULL THEN
    RAISE EXCEPTION 'Reassignment target yoram@galit.co.il not found — aborting.';
  END IF;

  -- 1) Delete the throwaway QA_TEST tasks he owns — but first remove child rows
  --    that reference them via NO ACTION FKs (TaskField, WhatsappReminderLog, and
  --    any other bot logs pointing at those task ids), or the delete is blocked.
  CREATE TEMP TABLE _qa_tasks ON COMMIT DROP AS
    SELECT id FROM "Task"
     WHERE "ownerId" = guyf_id
       AND (title LIKE '[QA_TEST]%' OR title LIKE '[QA_TEST_%');

  -- 1a) Collect the TaskField rows of those QA tasks, then delete THEIR children first
  --     (TrackingSession / Whatsapp* reference TaskField via NO ACTION FKs).
  CREATE TEMP TABLE _qa_taskfields ON COMMIT DROP AS
    SELECT id FROM "TaskField" WHERE "taskId" IN (SELECT id FROM _qa_tasks);

  DELETE FROM "TrackingSession"             WHERE "taskFieldId" IN (SELECT id FROM _qa_taskfields);
  DELETE FROM "WhatsappCustomerNotification" WHERE "taskFieldId" IN (SELECT id FROM _qa_taskfields);
  DELETE FROM "WhatsappMessageRef"          WHERE "taskFieldId" IN (SELECT id FROM _qa_taskfields);

  DELETE FROM "TaskField" WHERE id IN (SELECT id FROM _qa_taskfields);

  -- 1b) Delete the remaining rows that reference the QA tasks directly.
  DELETE FROM "WhatsappReminderLog"            WHERE "taskId"       IN (SELECT id FROM _qa_tasks);
  DELETE FROM "WhatsappCompletionNotification" WHERE "taskId"       IN (SELECT id FROM _qa_tasks);
  DELETE FROM "WhatsappPendingAction"          WHERE "targetTaskId" IN (SELECT id FROM _qa_tasks);
  DELETE FROM "WhatsappAuditLog"               WHERE "targetTaskId" IN (SELECT id FROM _qa_tasks);

  DELETE FROM "Task" WHERE id IN (SELECT id FROM _qa_tasks);

  -- 2) Reassign the remaining real task(s) + incoming lead(s) to יורם.
  UPDATE "Task"         SET "ownerId" = yoram_id WHERE "ownerId" = guyf_id;
  UPDATE "IncomingLead" SET "ownerId" = yoram_id WHERE "ownerId" = guyf_id;

  -- 3) Reassign TaskField audit pointer (NO ACTION FK) to יורם so history stays valid.
  UPDATE "TaskField" SET "updatedByUserId" = yoram_id WHERE "updatedByUserId" = guyf_id;

  -- 4) Delete WhatsApp-bot / worker-tracking telemetry tied to his identity
  --    (NO ACTION FKs — these tables have no cascade and hold no business value).
  DELETE FROM "WhatsappMessageRef"    WHERE "recipientUserId" = guyf_id;
  DELETE FROM "WhatsappDigestSendLog" WHERE "userId" = guyf_id;
  DELETE FROM "WhatsappAuditLog"      WHERE "userId" = guyf_id OR "approverUserId" = guyf_id;
  DELETE FROM "WorkerLiveLocation"    WHERE "workerUserId" = guyf_id;
  DELETE FROM "WorkerDeviceIdentity"  WHERE "workerUserId" = guyf_id;
  DELETE FROM "TrackingSession"       WHERE "workerUserId" = guyf_id;

  -- 5) Finally, delete the user. Remaining FKs (SET NULL / CASCADE) resolve automatically.
  DELETE FROM "User" WHERE id = guyf_id;

  RAISE NOTICE 'Deleted user guyf@galit.co.il (%). Real work reassigned to yoram@galit.co.il (%).', guyf_id, yoram_id;
END $$;
