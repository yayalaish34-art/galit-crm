import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BackupService } from './backup.service';

/**
 * גיבוי חודשי אוטומטי של טבלת Customer ל-OneDrive — ב-1 לחודש ב-02:00 שעון שרת.
 *
 * כיוון שהעבודה היא ב-background וה-timezone של Railway הוא UTC, השעה בפועל
 * תהיה 04:00 ישראל בחורף / 05:00 בקיץ — טוב ומוקדם מספיק בכדי שהפופ-אפ יחכה
 * למשתמשת בבוקר (היא נכנסת לדשבורד, רואה את ה-popup "להוריד לדיסקאון קי").
 *
 * אידמפוטנטי: קובץ הגיבוי בשם `customers-YYYY-MM.sql` — אם הקרון רץ פעמיים
 * באותו חודש, הוא פשוט דורס את הקיים (ושומר את הכי חדש). acknowledge מתאפס
 * כי המטא מוחלף.
 */
@Injectable()
export class CustomerBackupScheduler {
  private readonly logger = new Logger(CustomerBackupScheduler.name);

  constructor(private readonly backup: BackupService) {}

  // Cron: דקה 0, שעה 2, יום בחודש 1, כל חודש, כל יום-בשבוע.
  @Cron('0 2 1 * *')
  async monthlyBackup() {
    this.logger.log('monthly customer backup cron fired — starting runCustomerBackup()');
    const result = await this.backup.runCustomerBackup({ errorOnFail: false });
    if (result.error) {
      this.logger.error(`monthly backup finished with error: ${result.error}`);
    } else {
      this.logger.log(
        `monthly backup ok · rows=${result.rowCount} · bytes=${result.byteSize} · file=${result.fileName}`,
      );
    }
  }
}
