import { createAsyncLogic, createCallbackLogic, createMachine, types } from 'xstate';

const eventData = /** @type {import('xstate').TypeSchema<{ data: any }>} */ (types());
const errorMessage = error => error.message;
const paused = 'Updates paused. Use Refresh to reconnect.';

/** Coordinates independent initial reads and keeps restore pending through its list refresh. @param {any} services */
export function createProjectListMachine(services) {
  return createMachine({
    id: 'project-list',
    schemas: { events: {
      START: types(), RELOAD: types(), LIST_SETTLED: types(),
      RESTORE: /** @type {import('xstate').TypeSchema<{ projectId: string }>} */ (types()),
    } },
    context: /** @type {any} */ ({ projects: null, quota: null, deletedProjects: [], restoring: null, restoredId: null, error: '', restoreError: '', afterRestore: false }),
    initial: 'unready',
    states: {
      unready: { on: { START: { target: 'active' } } },
      active: {
        type: 'parallel',
        states: {
          list: {
            initial: 'loading',
            on: { RELOAD: () => ({ target: '.loading', reenter: true, context: { afterRestore: true } }) },
            states: {
              loading: { invoke: {
                src: createAsyncLogic({ run: ({ signal }) => services.list(signal) }),
                onDone: ({ event }, enq) => { enq.raise({ type: 'LIST_SETTLED' }); return { target: 'ready', context: { projects: event.output, error: '', afterRestore: false } }; },
                onError: ({ context, event }, enq) => {
                  enq.raise({ type: 'LIST_SETTLED' });
                  if (!context.afterRestore && event.error.status === 401) enq(services.navigate, '/sign-in');
                  return { target: 'ready', context: { error: context.afterRestore ? 'Your project was restored, but the list could not refresh. Reload this page.' : event.error.message, afterRestore: false } };
                },
              } },
              ready: {},
            },
          },
          trash: {
            initial: 'loading', states: {
              loading: { invoke: {
                src: createAsyncLogic({ run: ({ signal }) => services.deleted(signal) }),
                onDone: ({ context, event }) => ({ target: 'ready', context: { deletedProjects: event.output.filter(project => project.id !== context.restoredId) } }),
                onError: ({ event }) => ({ target: 'ready', context: { restoreError: event.error.message } }),
              } }, ready: {},
            },
          },
          quota: {
            initial: 'loading', states: {
              loading: { invoke: {
                src: createAsyncLogic({ run: ({ signal }) => services.quota(signal) }),
                onDone: ({ event }) => ({ target: 'ready', context: { quota: event.output } }),
                onError: { target: 'ready' },
              } }, ready: {},
            },
          },
          restore: {
            initial: 'idle', states: {
              idle: { on: { RESTORE: ({ event }) => ({ target: 'saving', context: { restoring: event.projectId, restoreError: '' } }) } },
              saving: {
                tags: ['restoring'], invoke: {
                  src: createAsyncLogic({ run: ({ input }) => services.restore(input) }), input: ({ context }) => context.restoring,
                  onDone: ({ context }, enq) => {
                    enq.raise({ type: 'RELOAD' });
                    return { target: 'refreshing', context: { restoredId: context.restoring, deletedProjects: context.deletedProjects.filter(project => project.id !== context.restoring) } };
                  },
                  onError: ({ event }) => ({ target: 'idle', context: { restoring: null, restoreError: event.error.message } }),
                },
              },
              refreshing: { tags: ['restoring'], on: { LIST_SETTLED: () => ({ target: 'idle', context: { restoring: null } }) } },
            },
          },
        },
      },
    },
  });
}

/** One submit and its UI refresh form one operation; navigation can keep it pending. @param {any} services */
export function createProjectMutationMachine(services) {
  return createMachine({
    id: 'project-mutation',
    schemas: { events: { SUBMIT: eventData, CLEAR: types(), ERROR: /** @type {import('xstate').TypeSchema<{ message: string }>} */ (types()) } },
    context: /** @type {any} */ ({ data: null, result: null, error: '' }), initial: 'idle',
    on: { ERROR: ({ event }) => ({ context: { error: event.message } }), CLEAR: () => ({ context: { error: '' } }) },
    states: {
      idle: { on: { SUBMIT: ({ event }) => ({ target: 'submitting', context: { data: event.data, error: '' } }) } },
      submitting: {
        tags: ['busy'], invoke: {
          src: createAsyncLogic({ run: ({ input }) => services.submit(input) }), input: ({ context }) => context.data,
          onDone: ({ event }) => ({ target: 'refreshing', context: { result: event.output } }),
          onError: ({ event }) => ({ target: 'idle', context: { error: (services.failure || errorMessage)(event.error) } }),
        },
      },
      refreshing: {
        tags: ['busy'], invoke: {
          src: createAsyncLogic({ run: ({ input }) => services.committed(input.result, input.data) }), input: ({ context }) => context,
          onDone: () => ({ target: services.redirecting ? 'redirecting' : 'idle' }),
          onError: ({ event }) => ({ target: 'idle', context: { error: (services.failure || errorMessage)(event.error) } }),
        },
      },
      redirecting: { tags: ['busy'] },
    },
  });
}

/** A selection owns its requests; leaving a load aborts and ignores its replies. @param {any} services */
export function createProjectReviewMachine(services) {
  const load = createCallbackLogic(({ input, sendBack }) => {
    const controller = new AbortController();
    const signal = controller.signal;
    // Handle review failure immediately while metadata is still loading. A
    // missing To-be is normal, and a cold render must not delay the header.
    const rendered = Promise.resolve().then(() => services.review(input, signal)).then(value => ({ value }), error => ({ error }));
    void (async () => {
      try {
        const list = await services.models(input, signal);
        if (signal.aborted) return;
        sendBack({ type: 'METADATA', models: list });
        const result = await rendered;
        const exists = input.model === 'as-is' || !!list.toBe;
        if (exists && result.error) throw result.error;
        if (!signal.aborted) sendBack({ type: 'LOADED', models: list, review: exists ? result.value : null });
      } catch (error) {
        if (!signal.aborted) sendBack({ type: 'LOAD_FAILED', error });
      }
    })();
    return () => controller.abort();
  });
  return createMachine({
    id: 'project-review',
    schemas: { events: {
      SELECT: /** @type {import('xstate').TypeSchema<{ selection: any }>} */ (types()),
      REFRESH: types(), STOP: types(),
      NOTICE: /** @type {import('xstate').TypeSchema<{ message: string }>} */ (types()),
      METADATA: /** @type {import('xstate').TypeSchema<{ models: any }>} */ (types()),
      LOADED: /** @type {import('xstate').TypeSchema<{ models: any; review: any }>} */ (types()),
      LOAD_FAILED: /** @type {import('xstate').TypeSchema<{ error: any }>} */ (types()),
    } },
    context: /** @type {any} */ ({ selection: null, models: null, review: null, error: '', notice: '', announce: false }),
    initial: 'unready',
    on: {
      SELECT: ({ event }) => ({ target: '.active', reenter: true, context: { selection: event.selection, announce: false } }),
      NOTICE: ({ event }) => ({ context: { notice: event.message } }),
      STOP: { target: '.closed' },
    },
    states: {
      unready: {}, closed: { type: 'final' },
      active: {
        initial: 'loading',
        on: { REFRESH: () => ({ target: '.loading', reenter: true, context: { announce: false } }) },
        states: {
          loading: {
            tags: ['loading'], invoke: { src: load, input: ({ context }) => context.selection },
            on: {
              METADATA: ({ event }) => ({ context: { models: event.models } }),
              LOADED: ({ context, event }) => ({ target: 'viewing', context: { models: event.models, review: event.review, error: '', notice: context.announce ? 'The latest revision is ready.' : context.notice, announce: false } }),
              LOAD_FAILED: ({ context, event }, enq) => {
                if (event.error.status === 401) enq(services.navigate, context.selection);
                return { target: context.models ? 'viewing' : 'failed', context: { error: event.error.message } };
              },
            },
          },
          failed: {},
          viewing: {
            initial: 'choose', states: {
              choose: { always: ({ context }) => ({ target: context.selection.revision ? 'historical' : 'waiting' }) },
              historical: {},
              waiting: { after: { 5000: () => ({ target: services.visible() ? 'checking' : 'waiting', reenter: true }) } },
              checking: { invoke: {
                src: createAsyncLogic({ run: ({ input, signal }) => services.models(input, signal) }), input: ({ context }) => context.selection,
                onDone: ({ context, event }) => {
                  const revision = (context.selection.model === 'as-is' ? event.output.asIs : event.output.toBe)?.revision || 0;
                  return revision !== (context.review?.revision || 0)
                    ? { target: '#project-review.active.loading', context: { models: event.output, announce: true } }
                    : { target: 'waiting', context: { models: event.output, notice: context.notice === paused ? '' : context.notice } };
                },
                onError: () => ({ target: 'waiting', context: { notice: paused } }),
              } },
            },
          },
        },
      },
    },
  });
}
