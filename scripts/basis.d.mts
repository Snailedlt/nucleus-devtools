import type { AiBasis } from '../src/core/api';
export function basisWords(b: AiBasis | undefined): string;
export function basisFiles(b: AiBasis | undefined): { project: string; file: string }[];
