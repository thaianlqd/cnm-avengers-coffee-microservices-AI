import { NewsService } from './news.service';

describe('read-only Kubernetes demo', () => {
  const previous = process.env.K8S_DEMO_READ_ONLY;
  afterEach(() => {
    if (previous === undefined) delete process.env.K8S_DEMO_READ_ONLY;
    else process.env.K8S_DEMO_READ_ONLY = previous;
  });
  it('never clears/seeds articles on startup', async () => {
    process.env.K8S_DEMO_READ_ONLY = 'true';
    const repo = { clear: jest.fn(), save: jest.fn() };
    await new NewsService(repo as any).onModuleInit();
    expect(repo.clear).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('reads article detail without changing view counts', async () => {
    process.env.K8S_DEMO_READ_ONLY = 'true';
    const article = { id: 'synthetic', views: 4 };
    const repo = { findOne: jest.fn().mockResolvedValue(article), increment: jest.fn() };
    expect(await new NewsService(repo as any).findOne('synthetic')).toEqual(article);
    expect(repo.increment).not.toHaveBeenCalled();
  });
});
