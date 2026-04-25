import { PromoterApplicationsController } from './promoter-applications.controller';

describe('PromoterApplicationsController submit', () => {
  let controller: PromoterApplicationsController;

  beforeEach(() => {
    controller = new PromoterApplicationsController();
  });

  it('submits a promoter application for the authenticated tenant user', async () => {
    (controller as any).svc = {
      submitApplication: jest.fn().mockResolvedValue({
        id: 'app-1',
        tenantId: 'tenant-1',
        tenantUserId: 'tu-1',
        status: 'submitted',
        notes: 'review me',
        submittedAt: new Date('2026-04-25T00:00:00.000Z'),
      }),
    };

    const result = await (controller as any).create(
      {
        tenantUserId: 'tu-1',
        notes: 'review me',
        links: [
          {
            linkType: 'portfolio',
            url: 'https://example.com/portfolio',
          },
        ],
      },
      { uprm: { tenantId: 'tenant-1' } },
    );

    expect((controller as any).svc.submitApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        tenantUserId: 'tu-1',
        notes: 'review me',
      }),
    );
    expect(result).toEqual({
      application: expect.objectContaining({
        id: 'app-1',
        status: 'submitted',
      }),
    });
  });
});
