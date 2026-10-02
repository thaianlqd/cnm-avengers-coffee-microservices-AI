export function secretWithDevDefault(name: string, developmentDefault: string): string {
  const value = String(process.env[name] || '').trim();
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required production configuration: ${name}`);
  }
  return developmentDefault;
}


export function assertProductionSecrets(names: string[]): void {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = names.filter(name => !String(process.env[name] || '').trim());
  if (missing.length) throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
}
