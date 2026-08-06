-- שמירת פרטי פגישה (TaskField) לא תיכשל יותר כשאין התאמת InspectionType ל-SKU.
-- הופכים את inspectionTypeId ל-nullable (וגם family, ליתר ביטחון) כדי שיצירת פגישה
-- ב-Outlook תמיד תשמור את הדאטה, בלי תלות בטבלת InspectionType.
ALTER TABLE "TaskField" ALTER COLUMN "inspectionTypeId" DROP NOT NULL;
ALTER TABLE "TaskField" ALTER COLUMN "family" DROP NOT NULL;
