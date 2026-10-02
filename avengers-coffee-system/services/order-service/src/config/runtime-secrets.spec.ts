import { assertProductionSecrets, secretWithDevDefault } from './runtime-secrets';

describe('production secret configuration', () => {
  const original = process.env;
  afterEach(() => { process.env = original; });

  it('uses an explicit development default outside production', () => {
    process.env = { ...original, NODE_ENV: 'test' };
    delete process.env.TEST_SECRET;
    expect(secretWithDevDefault('TEST_SECRET', 'dev-only')).toBe('dev-only');
  });

  it('fails fast when a required production secret is absent', () => {
    process.env = { ...original, NODE_ENV: 'production' };
    delete process.env.TEST_SECRET;
    expect(() => assertProductionSecrets(['TEST_SECRET'])).toThrow('TEST_SECRET');
  });
});
