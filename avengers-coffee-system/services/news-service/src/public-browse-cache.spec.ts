import { gunzipSync } from 'node:zlib';
import { PublicBrowseCache } from './public-browse-cache';

const response = () => ({ json: jest.fn(), type: jest.fn(), vary: jest.fn(), setHeader: jest.fn(), end: jest.fn() });
const request = (gzip = false) => ({ acceptsEncodings: () => gzip ? 'gzip' : false });
const data = (res: ReturnType<typeof response>) => JSON.parse(res.end.mock.calls[0][0].toString());

describe('public HTTP snapshot cache in read-only demo', () => {
  const previous = { demo: process.env.K8S_DEMO_READ_ONLY, ttl: process.env.PUBLIC_BROWSE_CACHE_TTL_MS };
  beforeEach(() => { process.env.K8S_DEMO_READ_ONLY = 'true'; process.env.PUBLIC_BROWSE_CACHE_TTL_MS = '5000'; });
  afterEach(() => {
    jest.restoreAllMocks();
    for (const [key, value] of [['K8S_DEMO_READ_ONLY', previous.demo], ['PUBLIC_BROWSE_CACHE_TTL_MS', previous.ttl]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
  });
  it('coalesces reads, preserves full JSON/gzip equality and protects snapshot from later object mutation', async () => {
    const cache = new PublicBrowseCache(); const payload = { items: [{ name: 'Cà phê', price: 40000 }], total: 1 };
    const load = jest.fn().mockResolvedValue(payload); const a = response(), b = response();
    await Promise.all([cache.respond('products',load,request() as any,a as any), cache.respond('products',load,request(true) as any,b as any)]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(data(a)).toEqual(payload);
    expect(JSON.parse(gunzipSync(b.end.mock.calls[0][0]).toString())).toEqual(payload);
    expect(b.setHeader).toHaveBeenCalledWith('Content-Encoding', 'gzip');
    payload.items[0].price = 1;
    const c = response(); await cache.respond('products',load,request() as any,c as any);
    expect(data(c).items[0].price).toBe(40000);
  });
  it('refreshes after expiry and isolates different public query keys', async () => {
    let now = 1000; jest.spyOn(Date, 'now').mockImplementation(() => now);
    const cache = new PublicBrowseCache(), load = jest.fn().mockResolvedValue({ total: 1 });
    await cache.respond('products',load,request() as any,response() as any);
    await cache.respond('categories',load,request() as any,response() as any);
    expect(load).toHaveBeenCalledTimes(2);
    now += 5001; await cache.respond('products',load,request() as any,response() as any);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it('never caches failures or keeps a rejected in-flight operation', async () => {
    const cache = new PublicBrowseCache(), load = jest.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue(4);
    const res = response(); await expect(cache.respond('products',load,request() as any,res as any)).rejects.toThrow('offline');
    expect(res.end).not.toHaveBeenCalled();
    await cache.respond('products',load,request() as any,res as any);
    expect(data(res)).toBe(4); expect(load).toHaveBeenCalledTimes(2);
  });
  it('preserves normal Compose JSON behavior with demo disabled', async () => {
    delete process.env.K8S_DEMO_READ_ONLY;
    const cache = new PublicBrowseCache(), load = jest.fn().mockResolvedValue({ total: 1 }), res = response();
    await cache.respond('products',load,request() as any,res as any);
    await cache.respond('products',load,request() as any,res as any);
    expect(load).toHaveBeenCalledTimes(2); expect(res.json).toHaveBeenCalledTimes(2);
    expect(res.end).not.toHaveBeenCalled();
  });
  it('bounds entries and clamps excessive TTL to five seconds', async () => {
    process.env.PUBLIC_BROWSE_CACHE_TTL_MS = '60000';
    let now = 1000; jest.spyOn(Date, 'now').mockImplementation(() => now);
    const cache = new PublicBrowseCache(), load = jest.fn().mockResolvedValue(1);
    for (let i=0;i<17;i++) await cache.respond(String(i),load,request() as any,response() as any);
    await cache.respond('0',load,request() as any,response() as any); expect(load).toHaveBeenCalledTimes(18);
    now += 5001; await cache.respond('16',load,request() as any,response() as any); expect(load).toHaveBeenCalledTimes(19);
  });
  it('never serves an expired snapshot when refresh fails', async () => {
    let now = 1000; jest.spyOn(Date, 'now').mockImplementation(() => now);
    const cache = new PublicBrowseCache(), load = jest.fn().mockResolvedValueOnce({ total: 2 }).mockRejectedValueOnce(Error('offline')), res = response();
    await cache.respond('products',load,request() as any,res as any); now += 5001;
    await expect(cache.respond('products',load,request() as any,res as any)).rejects.toThrow('offline');
    expect(res.end).toHaveBeenCalledTimes(1);
  });
  it('TTL zero bypasses snapshot cache without changing JSON contract', async () => {
    process.env.PUBLIC_BROWSE_CACHE_TTL_MS = '0';
    const cache = new PublicBrowseCache(), load = jest.fn().mockResolvedValue({ total: 5 }), res = response();
    await cache.respond('products',load,request() as any,res as any);
    expect(res.json).toHaveBeenCalledWith({ total: 5 }); expect(res.setHeader).not.toHaveBeenCalled();
  });
});
