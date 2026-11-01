import { RadonDetectorsService } from './radon-detectors.service';
import { installedDetectorsSql } from './radon-installed-query';

// ה-DB ממוקק, וטעינת הקובץ האמיתי דורשת חיבור שלא קיים כאן.
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

/**
 * הטבלאות שייכות למערכת הפקת הדוחות ונוצרות רק כשסורקים שם, ולכן לקוח שנפתח לפני
 * זה חייב לקבל רשימה ריקה ולא שגיאה בכרטיס.
 */
describe('RadonDetectorsService.installedForCustomer', () => {
  function makeService(tables: string[], rows: any[] = []) {
    const $queryRawUnsafe = jest.fn(async (sql: string, arg: string) => {
      if (sql.includes('to_regclass')) {
        return [{ name: tables.includes(arg.replace(/"/g, '')) ? arg : null }];
      }
      return rows;
    });
    return { service: new RadonDetectorsService({ $queryRawUnsafe } as any), $queryRawUnsafe };
  }

  it('returns nothing, without querying, before the table exists', async () => {
    const { service, $queryRawUnsafe } = makeService([]);
    await expect(service.installedForCustomer('c1')).resolves.toEqual([]);
    expect($queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('reads with results when the lab readings exist', async () => {
    const rows = [{ detectorNumber: '18467' }];
    const { service, $queryRawUnsafe } = makeService(['RadonInstalledDetector', 'RadonLabReading'], rows);
    await expect(service.installedForCustomer('c1')).resolves.toEqual(rows);
    expect($queryRawUnsafe).toHaveBeenLastCalledWith(installedDetectorsSql(true), 'c1');
  });

  it('still reads when no lab reading was ever scanned', async () => {
    const { service, $queryRawUnsafe } = makeService(['RadonInstalledDetector'], []);
    await service.installedForCustomer('c1');
    expect($queryRawUnsafe).toHaveBeenLastCalledWith(installedDetectorsSql(false), 'c1');
  });
});
