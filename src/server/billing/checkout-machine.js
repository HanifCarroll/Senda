import { createActor, createAsyncLogic, createMachine, toPromise } from 'xstate';

// One request owns one actor. The surrounding D1 lease and Stripe's canonical
// records remain authoritative; no payment actor snapshot is persisted.
export function createCheckoutMachine(services) {
  const failed = ({ event }) => ({ target: 'failed', context: { error: event.error } });
  const step = (name, next) => ({ invoke: {
    src: createAsyncLogic({ run: () => services[name]() }),
    onDone: { target: next }, onError: failed,
  } });
  return createMachine({
    id: 'checkout-session', initial: 'checkingHold',
    context: { result: null, error: null },
    output: ({ context }) => ({ result: context.result, error: context.error }),
    states: {
      checkingHold: step('checkHold', 'resolvingCustomer'),
      resolvingCustomer: step('resolveCustomer', 'checkingSubscriptions'),
      checkingSubscriptions: step('checkSubscriptions', 'readingSession'),
      readingSession: { invoke: {
        src: createAsyncLogic({ run: () => services.readSession() }),
        onDone: ({ event }) => event.output.url
          ? { target: 'complete', context: { result: { url: event.output.url } } }
          : { target: event.output.exists ? 'rotatingAttempt' : 'creatingSession' },
        onError: failed,
      } },
      rotatingAttempt: step('rotateAttempt', 'creatingSession'),
      creatingSession: { invoke: {
        src: createAsyncLogic({ run: () => services.createSession() }),
        onDone: ({ event }) => ({ target: 'complete', context: { result: event.output } }),
        onError: failed,
      } },
      complete: { type: 'final' }, failed: { type: 'final' },
    },
  });
}

export async function checkoutSession(services) {
  const actor = createActor(createCheckoutMachine(services));
  const finished = toPromise(actor);
  actor.start();
  try {
    const output = await finished;
    if (output.error) throw output.error;
    return output.result;
  } finally { actor.stop(); }
}
