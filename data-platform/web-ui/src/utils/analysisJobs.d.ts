export const jobStorageKey: string;
export const jobStages: Record<string, string>;
export function runAnalysisJob(record: any, options?: {
  fetcher?: typeof fetch; onUpdate?: (job: any) => void; onCheckpoint?: (record: any) => void;
  signal?: AbortSignal; wait?: (ms: number) => Promise<void>;
}): Promise<any>;
