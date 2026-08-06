-- מודול שירות ראדון — טבלאות חדשות בלבד.
-- אין כאן שום ALTER על טבלה קיימת: הקישור ל-CRM נעשה דרך taskId/customerId רופפים
-- (ללא FK), כמו ב-ReviewRequest, כדי שהצינור הקיים לא יושפע.

-- ── enums ──
DO $$ BEGIN
  CREATE TYPE "RadonJobStatus" AS ENUM ('OPEN','IN_FIELD','IN_ANALYSIS','REPORTED','CLOSED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RadonDetectorStatus" AS ENUM (
    'IN_STOCK','RESERVED','WITH_EMPLOYEE','SHIPPED_TO_CLIENT','WITH_CLIENT','DEPLOYED',
    'COLLECTED','RETURNED','SENT_TO_LAB','RESULT_RECEIVED','CLOSED','LOST','DISQUALIFIED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── עבודת ראדון ──
CREATE TABLE IF NOT EXISTS "RadonJob" (
  "id"               TEXT NOT NULL,
  "taskId"           TEXT,
  "customerId"       TEXT,
  "leadId"           TEXT,
  "sku"              TEXT NOT NULL,
  "answers"          JSONB NOT NULL DEFAULT '{}',
  "track"            TEXT,
  "trackWarnings"    JSONB NOT NULL DEFAULT '[]',
  "stageIndex"       INTEGER NOT NULL DEFAULT 0,
  "status"           "RadonJobStatus" NOT NULL DEFAULT 'OPEN',
  "placedAt"         TIMESTAMP(3),
  "expectedEndAt"    TIMESTAMP(3),
  "collectedAt"      TIMESTAMP(3),
  "shippingAddress"  TEXT,
  "outboundTracking" TEXT,
  "returnTracking"   TEXT,
  "clientReportedAt" TIMESTAMP(3),
  "detectorCount"    INTEGER,
  "siteAddress"      TEXT,
  "contactName"      TEXT,
  "contactPhone"     TEXT,
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RadonJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RadonJob_taskId_idx"        ON "RadonJob" ("taskId");
CREATE INDEX IF NOT EXISTS "RadonJob_customerId_idx"    ON "RadonJob" ("customerId");
CREATE INDEX IF NOT EXISTS "RadonJob_status_track_idx"  ON "RadonJob" ("status", "track");

-- ── מלאי הגלאים ──
CREATE TABLE IF NOT EXISTS "RadonDetector" (
  "id"             TEXT NOT NULL,
  "serialNumber"   TEXT NOT NULL,
  "model"          TEXT,
  "status"         "RadonDetectorStatus" NOT NULL DEFAULT 'IN_STOCK',
  "heldByUserId"   TEXT,
  "heldByNote"     TEXT,
  "calibratedAt"   TIMESTAMP(3),
  "calibrationDue" TIMESTAMP(3),
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RadonDetector_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RadonDetector_serialNumber_key" ON "RadonDetector" ("serialNumber");
CREATE INDEX IF NOT EXISTS "RadonDetector_status_idx"         ON "RadonDetector" ("status");
CREATE INDEX IF NOT EXISTS "RadonDetector_calibrationDue_idx" ON "RadonDetector" ("calibrationDue");

-- ── שיוך גלאי לעבודה ──
CREATE TABLE IF NOT EXISTS "RadonDetectorAssignment" (
  "id"            TEXT NOT NULL,
  "detectorId"    TEXT NOT NULL,
  "jobId"         TEXT NOT NULL,
  "assignedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt"    TIMESTAMP(3),
  "placementNote" TEXT,
  "placedAt"      TIMESTAMP(3),
  "photoBase64"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RadonDetectorAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RadonDetectorAssignment_detectorId_fkey" FOREIGN KEY ("detectorId")
    REFERENCES "RadonDetector" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RadonDetectorAssignment_jobId_fkey" FOREIGN KEY ("jobId")
    REFERENCES "RadonJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RadonDetectorAssignment_jobId_idx"      ON "RadonDetectorAssignment" ("jobId");
CREATE INDEX IF NOT EXISTS "RadonDetectorAssignment_detectorId_idx" ON "RadonDetectorAssignment" ("detectorId");

-- האילוץ המרכזי מסעיף 7 באפיון: אותו גלאי לא משויך לשתי עבודות במקביל.
-- אינדקס ייחודי *חלקי* — חל רק על שיוכים פעילים (releasedAt IS NULL), כך שהיסטוריית
-- השיוכים נשמרת במלואה. נאכף ב-DB ולא רק בקוד, כדי שגם כתיבה מקבילה לא תפר אותו.
CREATE UNIQUE INDEX IF NOT EXISTS "RadonDetectorAssignment_active_detector_key"
  ON "RadonDetectorAssignment" ("detectorId") WHERE "releasedAt" IS NULL;

-- ── יומן תנועות הגלאי ──
CREATE TABLE IF NOT EXISTS "RadonDetectorEvent" (
  "id"         TEXT NOT NULL,
  "detectorId" TEXT NOT NULL,
  "jobId"      TEXT,
  "fromStatus" "RadonDetectorStatus",
  "toStatus"   "RadonDetectorStatus" NOT NULL,
  "note"       TEXT,
  "byUserId"   TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RadonDetectorEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RadonDetectorEvent_detectorId_fkey" FOREIGN KEY ("detectorId")
    REFERENCES "RadonDetector" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RadonDetectorEvent_detectorId_createdAt_idx"
  ON "RadonDetectorEvent" ("detectorId", "createdAt");

-- ── התראות ──
CREATE TABLE IF NOT EXISTS "RadonAlert" (
  "id"          TEXT NOT NULL,
  "jobId"       TEXT NOT NULL,
  "kind"        TEXT NOT NULL,
  "message"     TEXT NOT NULL,
  "severity"    TEXT NOT NULL DEFAULT 'warning',
  "resolvedAt"  TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "dismissedBy" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RadonAlert_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RadonAlert_jobId_fkey" FOREIGN KEY ("jobId")
    REFERENCES "RadonJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- התראה אחת פתוחה מכל סוג לכל עבודה — מונע הצפה בכל סבב cron.
CREATE UNIQUE INDEX IF NOT EXISTS "RadonAlert_jobId_kind_key" ON "RadonAlert" ("jobId", "kind");
CREATE INDEX IF NOT EXISTS "RadonAlert_resolvedAt_idx"        ON "RadonAlert" ("resolvedAt");
