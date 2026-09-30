import { LalamoveService } from './lalamove.service';

describe('optional Lalamove provider', () => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    LALAMOVE_ENABLED: process.env.LALAMOVE_ENABLED,
    LALAMOVE_API_KEY: process.env.LALAMOVE_API_KEY,
    LALAMOVE_API_SECRET: process.env.LALAMOVE_API_SECRET,
  };
  afterEach(() => {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('constructs in production without provider credentials when disabled', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LALAMOVE_ENABLED = 'false';
    delete process.env.LALAMOVE_API_KEY;
    delete process.env.LALAMOVE_API_SECRET;
    const provider = new LalamoveService();
    expect(provider.isEnabled()).toBe(false);
    await expect(provider.getOrderDetail('demo')).rejects.toMatchObject({
      response: { code: 'LALAMOVE_DISABLED' },
    });
    await expect(
      provider.getDriverLocation('demo', 'driver'),
    ).rejects.toMatchObject({ response: { code: 'LALAMOVE_DISABLED' } });
    expect(() => provider.assertAvailable()).toThrow();
  });

  it('fails only the provider call if explicitly enabled without credentials', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LALAMOVE_ENABLED = 'true';
    delete process.env.LALAMOVE_API_KEY;
    delete process.env.LALAMOVE_API_SECRET;
    const provider = new LalamoveService();
    expect(provider.isEnabled()).toBe(true);
    await expect(provider.getOrderDetail('demo')).rejects.toMatchObject({
      response: { code: 'LALAMOVE_CONFIGURATION_MISSING' },
    });
  });
});
