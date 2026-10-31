import { createMachine } from 'xstate';

export const hostedRunMachine = createMachine({
  id: 'hostedRun', initial: 'new', context: {},
  states: {
    new: { on: { LOCKED: { target: 'admitting' } } },
    admitting: { on: { ADMITTED: { target: 'admitted' }, DENIED: { target: 'rejected' } } },
    admitted: { on: { DISPATCH: { target: 'dispatching' } } },
    dispatching: { on: { QUEUED: { target: 'queued' }, QUEUE_UNKNOWN: { target: 'uncertain' } } },
    uncertain: { on: { QUEUED: { target: 'queued' }, INTERRUPT_UNSTARTED: { target: 'interrupting' } } },
    queued: { type: 'final' },
    unstarted: { on: {
      CLAIM: ({ context }) => context.matchingLock && context.liveLock ? { target: 'claiming' } : undefined,
      INTERRUPT_UNSTARTED: ({ context }) => context.matchingLock ? { target: 'interrupting' } : undefined,
      INTERRUPT: ({ context }) => context.matchingLock ? { target: 'interrupting' } : undefined,
    } },
    claiming: { on: { CLAIMED: { target: 'started' }, LOST: { target: 'ignored' } } },
    started: { on: {
      COMPLETE: ({ context }) => context.matchingLock ? { target: 'completing' } : undefined,
      FAIL: ({ context }) => context.matchingLock ? { target: 'failing' } : undefined,
      INTERRUPT: ({ context }) => context.matchingLock ? { target: 'interrupting' } : undefined,
    } },
    completing: { on: { COMMITTED: { target: 'complete' } } },
    failing: { on: { COMMITTED: { target: 'failed' } } },
    interrupting: { on: { COMMITTED: { target: 'failed' } } },
    complete: { type: 'final' }, failed: { type: 'final' },
    rejected: { type: 'final' }, ignored: { type: 'final' }, missing: { type: 'final' },
  },
});

export function hostedRunFromFacts(run, chat, now = Date.now()) {
  const value = !run ? 'missing' : run.status === 'running' ? (run.started ? 'started' : 'unstarted') : run.status;
  return hostedRunMachine.resolveState({ value, context: {
    matchingLock: !!run && chat?.lock_id === run.id,
    liveLock: !!chat && chat.lock_until > now,
  } });
}
