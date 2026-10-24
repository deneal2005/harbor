// Render Workflow: cash-flow integrity check for Harbor.
// Chain: validate-records -> recompute-forecast -> check-invariants, orchestrated by
// cash-flow-integrity-check. Every task reuses the app's own engine (src/services) so there is a
// single implementation of the financial rules. Read-only: no task changes any record.
import { task } from '@renderinc/sdk/workflows';
import { checkInvariants, composeReport, minimizePayload, recomputeForecast, shapeErrors, validateRecords } from '../src/services/audit.js';

const retry = { maxRetries: 2, waitDurationMs: 1000, backoffScaling: 2 };

const validate = task({ name: 'validate-records', retry, timeoutSeconds: 60, plan: 'starter' },
  function validateTask(ctx, payload) {
    return validateRecords(minimizePayload(payload));
  });

const recompute = task({ name: 'recompute-forecast', retry, timeoutSeconds: 60, plan: 'starter' },
  function recomputeTask(ctx, payload) {
    return recomputeForecast(minimizePayload(payload));
  });

const invariants = task({ name: 'check-invariants', retry, timeoutSeconds: 60, plan: 'starter' },
  function invariantsTask(ctx, payload, recomputed) {
    return checkInvariants(minimizePayload(payload), recomputed);
  });

task({ name: 'cash-flow-integrity-check', timeoutSeconds: 300, plan: 'starter' },
  async function integrityCheck(ctx, payload) {
    const p = minimizePayload(payload);
    const problems = shapeErrors(p);
    if (problems.length) throw new Error(`Invalid audit payload: ${problems.join(', ')}`);
    const validation = await ctx.run(validate, p);
    const runMeta = { taskRunId: ctx.metadata?.taskRunId ?? null };
    if (validation.blocking) return composeReport({ validation, runMeta });
    const recomputed = await ctx.run(recompute, p);
    const inv = await ctx.run(invariants, p, recomputed);
    return composeReport({ validation, recomputed, invariants: inv, runMeta });
  });
