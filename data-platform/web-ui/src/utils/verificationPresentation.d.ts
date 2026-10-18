export function verificationMetrics(verification: any): Array<any>;
export function mergeReconciliation(verification: any, oracle: any): any;
export function numericRows(verification: any): Array<{ label: string; expected: string; reported: string; error: string; status: string; ok: boolean }>;
export function rankingRows(verification: any): Array<{ status: string; detail: string; ok: boolean | null }>;
export function forecastRows(verification: any): Array<{ metric: string; method: string; errors: string; coverage: string }>;
export function trustDimensions(report: any, verification: any): Array<{ id: string; label: string; status: string; passed: number; total: number }>;
