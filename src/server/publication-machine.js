import { createActor, createAsyncLogic, createMachine, toPromise } from 'xstate';

const failure = ({ event }) => ({ target: 'failed', context: { error: event.error } });
const publicationMachine = createMachine({
  id: 'modelPublication',
  context: ({ input }) => ({ operations: input, prepared: null, error: null }),
  initial: 'preparing',
  states: {
    preparing: { invoke: {
      src: createAsyncLogic({ run: ({ input }) => input.operations.prepare() }),
      input: ({ context }) => context,
      onDone: ({ event }) => ({ target: 'uploaded', context: { prepared: event.output } }),
      onError: failure,
    } },
    uploaded: { always: { target: 'publishing' } },
    publishing: { invoke: {
      src: createAsyncLogic({ run: ({ input }) => input.operations.publish(input.prepared) }),
      input: ({ context }) => context,
      onDone: ({ context, event }) => ({
        target: context.operations.accepted(event.output) ? 'published' : 'rejected',
      }),
      onError: ({ event }) => ({ target: 'ambiguous', context: { error: event.error } }),
    } },
    rejected: { invoke: {
      src: createAsyncLogic({ run: async ({ input }) => {
        await input.operations.reject(input.prepared);
        throw new Error('The model publication was rejected.');
      } }),
      input: ({ context }) => context,
      onError: failure,
    } },
    ambiguous: { invoke: {
      src: createAsyncLogic({ run: async ({ input }) => {
        // A thrown commit may already have saved the model. Only the caller's
        // canonical reconciliation may decide whether its content can be erased.
        if (input.operations.reconcile) await input.operations.reconcile(input.prepared, input.error);
        throw input.error;
      } }),
      input: ({ context }) => context,
      onError: failure,
    } },
    published: { type: 'final' },
    failed: { type: 'final' },
  },
  output: ({ context }) => ({ prepared: context.prepared, error: context.error }),
});

// reject/reconcile must throw the domain error after any permitted cleanup.
// No retries, actor persistence or inspector are involved in publication.
export async function publishModelContent(operations) {
  const actor = createActor(publicationMachine, { input: operations });
  actor.start();
  try {
    const result = await toPromise(actor);
    if (result.error) throw result.error;
    return result.prepared;
  } finally { actor.stop(); }
}
