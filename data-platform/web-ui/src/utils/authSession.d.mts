export interface AuthSession {
  authenticated?: boolean;
  identity: string;
  role?: string;
  permissions?: string[];
  expires_at?: number;
  mode?: 'explicit_development_browser';
}
export function decodeAuthSession(value: unknown): AuthSession;
export function accountStorageKey(base: string, identity: string | null | undefined): string;
export function shouldExpireSession(response: {status: number}, url: unknown): boolean;
export function setAccountIdentity(value: string | null | undefined): void;
export function getAccountIdentity(): string | null;

export function rememberAnalysisDraft(identity: string | null, draft: Record<string, unknown>): void;
export function readAnalysisDraft(identity: string | null): Record<string, any> | null;
export function clearAnalysisDraft(): void;
export function retainAnalysisDraft(identity: string): void;
