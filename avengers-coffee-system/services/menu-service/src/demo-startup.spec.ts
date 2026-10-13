import { AppService } from './app.service';

it('does not migrate variants during a read-only Kubernetes demo', async () => {
  const previous = process.env.K8S_DEMO_READ_ONLY;
  process.env.K8S_DEMO_READ_ONLY = 'true';
  try {
    const service = new AppService({} as any, {} as any, {} as any, {} as any);
    const migrate = jest.spyOn(service, 'migrateExistingVariants');
    await service.onApplicationBootstrap();
    expect(migrate).not.toHaveBeenCalled();
  } finally {
    if (previous === undefined) delete process.env.K8S_DEMO_READ_ONLY;
    else process.env.K8S_DEMO_READ_ONLY = previous;
  }
});
