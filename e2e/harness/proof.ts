import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { RUN_ID } from './paths';

/**
 * Results for the composition scenario, written to a file of their own.
 *
 * Deliberately not the ndjson stream the other scenarios use. Those feed
 * `npm run analyze`, which selects the newest run in results/raw and rebuilds
 * summary.json from it - so a five-minute pattern run would quietly replace the
 * summary of a 45-minute benchmark with one that measured none of it. This
 * scenario answers its own questions and owns its own artefact.
 *
 * Read-modify-write per proof. The scenario runs single-worker, and the file is
 * small; correctness here matters more than write efficiency.
 */
const OUT = resolve(process.env.BM_COMPOSITION ?? 'results/composition.json');

/** A pattern whose DON'T costs measurably more than its DO. */
export interface CostProof {
  kind: 'cost';
  /** Net median ms for the recommended form and the one it replaces. */
  doMs: number;
  dontMs: number;
  /** Elements on the page the pair was measured against. */
  domNodes: number;
  /** Anything else worth quoting alongside the numbers. */
  facts?: Record<string, string | number | boolean>;
}

/** A pattern whose DON'T is simply wrong, regardless of what it costs. */
export interface CorrectnessProof {
  kind: 'correctness';
  /** What the DON'T produced, and what the DO produced, in the same situation. */
  dont: string;
  did: string;
  facts?: Record<string, string | number | boolean>;
}

export type Proof = (CostProof | CorrectnessProof) & {
  /** Pattern id, matching analysis/composition-patterns.mjs. */
  pattern: string;
  /** Route and parameters the proof was taken against, for reproduction. */
  url: string;
};

interface File {
  runId: string;
  generatedAt: string;
  browserVersion: string | null;
  proofs: Record<string, Proof>;
}

function read(): File {
  try {
    return JSON.parse(readFileSync(OUT, 'utf8')) as File;
  } catch {
    return { runId: RUN_ID, generatedAt: new Date().toISOString(), browserVersion: null, proofs: {} };
  }
}

/**
 * Records one proof, replacing any earlier one for the same pattern.
 *
 * A run that only exercises half the patterns leaves the other half's numbers in
 * place, which would publish two different machines' timings side by side without
 * saying so - hence `runId`: a file whose run id is not the current one is
 * discarded rather than merged.
 */
let fingerprint: string | null = null;

/** Records the browser the proofs were taken against. Called once per run. */
export function setBrowserVersion(version: string | undefined): void {
  fingerprint ??= version ?? null;
}

export function recordProof(proof: Proof): void {
  const file = read();
  const current: File =
    file.runId === RUN_ID
      ? file
      : { runId: RUN_ID, generatedAt: new Date().toISOString(), browserVersion: null, proofs: {} };

  current.generatedAt = new Date().toISOString();
  if (fingerprint) current.browserVersion = fingerprint;
  current.proofs[proof.pattern] = proof;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(current, null, 2) + '\n');
}

export const PROOF_FILE = OUT;
