import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuotesService } from '../quotes/quotes.service';

describe('TasksService.findOne (GET /tasks/:id)', () => {
  let service: TasksService;
  const findUnique = jest.fn();

  beforeEach(async () => {
    findUnique.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: { task: { findUnique } } },
        { provide: QuotesService, useValue: {} },
      ],
    }).compile();
    service = module.get<TasksService>(TasksService);
  });

  it('מחזיר בדיוק את שדות ה-CONTRACT (CrmTask), כולל productName', async () => {
    const task = {
      id: 't1',
      title: 'משימת משרד',
      description: 'פרטים',
      dueDate: new Date('2026-08-01T00:00:00.000Z'),
      priority: 'HIGH',
      status: 'OPEN',
      ownerId: 'u1',
      customerId: 'c1',
      productName: 'RADON',
      createdAt: new Date('2026-07-15T00:00:00.000Z'),
    };
    findUnique.mockResolvedValue(task);

    const result = await service.findOne('t1');

    // בוחר בדיוק את 10 שדות ה-CONTRACT — לא יותר, לא פחות.
    const select = findUnique.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(
      ['createdAt', 'customerId', 'description', 'dueDate', 'id', 'ownerId', 'priority', 'productName', 'status', 'title'],
    );
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't1' } }));
    expect(result).toEqual(task);
  });

  it('זורק 404 אם המשימה לא קיימת', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
