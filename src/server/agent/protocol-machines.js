import { createMachine, initialTransition, transition } from 'xstate';
import { requireThat } from '../../core/errors.js';

// These snapshots exist only for one invocation. Provider usage and run money
// remain in the ledger; no actor snapshot is stored or sent to an inspector.
export const startProtocol = (machine, input) => initialTransition(machine, input)[0];
export function advanceProtocol(machine, snapshot, event) {
  requireThat(snapshot.can(event), 'CONFLICT', 'The agent execution phase changed.');
  return transition(machine, snapshot, event)[0];
}
export const knownProviderRejection = error => [401, 402, 403].includes(error?.statusCode);

export const providerCallMachine = createMachine({
  id: 'providerCall', initial: 'ready',
  states: {
    ready: { on: { RESERVE: { target: 'reserving' } } },
    reserving: { on: { RESERVED: { target: 'reserved' }, DENIED: { target: 'denied' } } },
    reserved: { on: { DISPATCH: { target: 'dispatched' } } },
    dispatched: { on: { RETURNED: { target: 'settling' }, REJECTED: ({ event }) => ({ target: knownProviderRejection(event.error) ? 'failureKnown' : 'failureUnknown' }) } },
    settling: { on: { SETTLED: { target: 'succeeded' }, REJECTED: { target: 'failureUnknown' } } },
    failureKnown: { on: { RECORDED: { target: 'failed' } } },
    failureUnknown: { on: { RECORDED: { target: 'failed' } } },
    succeeded: { type: 'final' }, failed: { type: 'final' }, denied: { type: 'final' },
  },
});

const beginReservation = ({ event }) => ({ target: 'reserving', context: { amount: event.amount } });
export const callAccountingMachine = createMachine({
  id: 'callAccounting', initial: 'available', context: { calls: 0, amount: 0 },
  states: {
    available: { on: { RESERVE: beginReservation } },
    reserving: { on: {
      RESERVED: ({ context }) => ({ target: 'active', context: { calls: context.calls + 1 } }),
      DENIED: () => ({ target: 'available', context: { amount: 0 } }),
    } },
    active: { on: {
      SETTLE: { target: 'settling' },
      FAILURE: ({ event }) => event.outcome !== 'failureUnknown' && knownProviderRejection(event.error)
        ? { target: 'settling' } : { target: 'unknown', context: { amount: 0 } },
    } },
    settling: { on: {
      SETTLED: () => ({ target: 'settled', context: { amount: 0 } }),
      UNMEASURED: () => ({ target: 'unknown', context: { amount: 0 } }),
      WRITE_FAILED: { target: 'active' },
    } },
    settled: { on: { RESERVE: beginReservation } },
    unknown: { on: { RESERVE: beginReservation } },
  },
});

export const mutationMachine = createMachine({
  id: 'agentMutation', initial: 'working',
  context: { createdProject: false, diagramSaved: false },
  states: {
    working: {
      initial: 'clean',
      on: {
        PROJECT_CREATED: () => ({ context: { createdProject: true } }),
        DIAGRAM_SAVED: () => ({ context: { diagramSaved: true } }),
        PROPOSE: { target: '.pending' },
      },
      states: {
        clean: { on: { FINISH: ({ context, event }) => ({ target: event.sanitized || (context.createdProject && !context.diagramSaved) ? '#agentMutation.incomplete' : '#agentMutation.complete' }) } },
        pending: { on: { REVIEW: { target: 'reviewing' }, COPY_BASELINE: { target: 'committing' }, FINISH: { target: '#agentMutation.incomplete' } } },
        reviewing: { on: { SUPPORTED: { target: 'reviewed' }, REJECTED: { target: 'pending' }, FINISH: { target: '#agentMutation.incomplete' } } },
        reviewed: { on: { COMMIT: { target: 'committing' }, REJECTED: { target: 'pending' }, FINISH: { target: '#agentMutation.incomplete' } } },
        committing: { on: { COMMITTED: { target: 'committed' }, REJECTED: { target: 'pending' }, FINISH: { target: '#agentMutation.incomplete' } } },
        committed: { on: { FINISH: ({ context, event }) => ({ target: event.sanitized || (context.createdProject && !context.diagramSaved) ? '#agentMutation.incomplete' : '#agentMutation.complete' }) } },
      },
    },
    complete: { type: 'final' }, incomplete: { type: 'final' },
  },
});
