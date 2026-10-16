export const FREE_TEXT: string;
export interface GuidedDraft { question: string; contract: Record<string, any>; time?: any; mission?: string }
export function switchMissionDraft(drafts: Record<string, any>, from: string | null, to: string | null, current?: { prompt?: string; guided?: GuidedDraft | null }): { drafts: Record<string, any>; prompt: string; guided: GuidedDraft | null; reset: Record<string, boolean> };
export function missionContract(capabilities: any, missionId: string | null): any;
export function missionControls(capabilities: any, missionId: string | null): Array<{ id: string; required: boolean }>;
export function periodOptions(capabilities: any): Array<{ id: string; label: string; phrase: string; time: any }>;
export function defaultSlots(capabilities: any, missionId: string): Record<string, any>;
export function dimensionValues(capabilities: any, dimension: string): Array<{ value: string; label: string }>;
export function buildGuided(capabilities: any, missionId: string, slots: Record<string, any>): { ready: boolean; missing?: string[]; question?: string; contract?: Record<string, any>; time?: any };
export function guidedActive(guided: GuidedDraft | null | undefined, prompt: string): boolean;
export function workspaceRequestFields(guided: GuidedDraft | null | undefined, prompt: string): Record<string, any>;
export function detectedScope(preflight: any): { filters: Array<{ kind: string; label: string }>; axes: Array<{ kind: string; label: string }>; summary: string };
export function depthOptions(capabilities: any): Array<any>;
