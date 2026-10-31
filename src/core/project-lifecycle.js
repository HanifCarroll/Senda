import { createMachine, initialTransition, transition } from 'xstate';

export const PROJECT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const projectLifecycle = createMachine({
  id: 'projectLifecycle',
  context: ({ input }) => input,
  initial: 'catalog',
  states: {
    catalog: { always: ({ context }) => ({ target: context.state }) },
    active: { on: { DELETE: { target: 'deleted' } } },
    deleted: { on: {
      RESTORE: ({ context }) => context.deletedAt + PROJECT_RETENTION_MS > context.now ? { target: 'active' } : undefined,
      BEGIN_PURGE: ({ context }) => context.deletedAt + PROJECT_RETENTION_MS <= context.now ? { target: 'purging' } : undefined,
    } },
    purging: { on: {
      BEGIN_PURGE: { target: 'purging' },
      FINISH_PURGE: { target: 'purged' },
    } },
    purged: { type: 'final' },
  },
});

function fromCatalog(row, now) {
  return initialTransition(projectLifecycle, {
    state: row.state, deletedAt: Date.parse(row.deleted_at), now,
  })[0];
}

export function projectIsActive(row) {
  return !!row && fromCatalog(row).matches('active');
}

export function nextProjectState(row, type, now) {
  if (!row) return undefined;
  const current = fromCatalog(row, now), event = { type };
  return current.can(event) ? transition(projectLifecycle, current, event)[0].value : undefined;
}
