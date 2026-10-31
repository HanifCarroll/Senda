import { createAsyncLogic, createMachine, types } from 'xstate';
import { signInDestination, signInRetry } from '../../shared/model-links.js';

const clearMessages = { error: '', notice: '' };
const accountError = 'The account service could not be reached. Try again.';
const verificationNotice = 'Check your inbox for a verification link. Once your email is verified, return here to sign in.';

function signInIssue(issue) {
  if (!issue) return '';
  if (issue === 'access_denied') return 'Sign-in was cancelled. You can try again.';
  if (issue === 'account_not_linked' || issue === 'email_not_verified') return 'Use an email sign-in link to access this account.';
  if (['INVALID_TOKEN', 'TOKEN_EXPIRED', 'EXPIRED_TOKEN'].includes(issue)) return 'This sign-in link is unavailable or has expired. Request a new link below.';
  return 'Sign-in could not be completed. Please try again.';
}

/** Browser services are injected so actors never read window during SSR. @param {any} services */
export function createSignInMachine(services) {
  const callbacks = () => {
    const { origin, search } = services.location();
    return { callbackURL: origin + signInDestination(search), errorCallbackURL: origin + signInRetry(search) };
  };
  return createMachine({
    id: 'email-sign-in',
    schemas: { events: {
      START: /** @type {import('xstate').TypeSchema<{ issue?: string | null }>} */ (types()),
      SEND: /** @type {import('xstate').TypeSchema<{ email: string }>} */ (types()),
      GOOGLE: types(), LINK_SENT: types(), EDIT: types(),
    } },
    context: /** @type {any} */ ({ config: null, error: '' }),
    initial: 'unready',
    states: {
      unready: { on: { START: ({ event }) => ({ target: 'loading', context: { error: signInIssue(event.issue) } }) } },
      loading: {
        invoke: {
          src: createAsyncLogic({ run: ({ signal }) => services.load(signal) }),
          onDone: ({ event }) => ({ target: 'available', context: { config: event.output } }),
          onError: ({ event }) => ({ target: 'unavailable', context: { error: event.error.message } }),
        },
      },
      unavailable: {},
      available: {
        type: 'parallel',
        states: {
          delivery: {
            initial: 'unsent',
            states: {
              unsent: { on: { LINK_SENT: { target: 'sent' } } },
              sent: { tags: ['sent'], on: { EDIT: { target: 'unsent' } } },
            },
          },
          request: {
            initial: 'idle',
            states: {
              idle: {
                on: {
                  SEND: ({ context }) => context.config?.loginMethods?.magicLink ? { target: 'sending', context: { error: '' } } : undefined,
                  GOOGLE: ({ context }) => context.config?.loginMethods?.google ? { target: 'google', context: { error: '' } } : undefined,
                },
              },
              sending: {
                tags: ['busy'],
                invoke: {
                  src: createAsyncLogic({ run: ({ input }) => services.magicLink(input) }),
                  input: ({ event }) => ({ email: event.email.trim(), ...callbacks() }),
                  onDone: ({ event }, enq) => {
                    if (event.output.error) return { target: 'idle', context: { error: event.output.error.message || 'The sign-in link could not be sent. Try again.' } };
                    enq.raise({ type: 'LINK_SENT' });
                    return { target: 'idle' };
                  },
                  onError: () => ({ target: 'idle', context: { error: 'The sign-in service could not be reached. Try again.' } }),
                },
              },
              google: {
                tags: ['busy'],
                invoke: {
                  src: createAsyncLogic({ run: () => services.social({ provider: 'google', ...callbacks() }) }),
                  onDone: ({ event }, enq) => {
                    const result = event.output;
                    if (!result.error && result.data?.url) enq(services.navigate, result.data.url);
                    return { target: 'idle', context: { error: result.error ? result.error.message || 'Google sign-in could not be started. Try again.' : '' } };
                  },
                  onError: () => ({ target: 'idle', context: { error: 'Google sign-in could not be reached. Try again.' } }),
                },
              },
            },
          },
        },
      },
    },
  });
}

/** @param {any} services */
export function createPasswordMachine(services) {
  const clearForm = { error: '', notice: '', verifyEmail: '' };
  const formInput = ({ event }) => event.data;
  const passwordRequest = register => createAsyncLogic({ run: async ({ input }) => {
    const { origin, search } = services.location();
    const result = await (register
      ? services.signUp({ ...input, callbackURL: origin + '/sign-in' + search })
      : services.signIn(input));
    return { ...result, email: input.email, destination: signInDestination(search) };
  } });
  const submitFailure = ({ context }) => ({ target: context.verifyEmail ? 'verification' : 'editing', context: { error: accountError } });
  const editable = (toggle, extra = {}) => ({
    TOGGLE_ACCOUNT: () => ({ target: toggle, context: clearForm }),
    ...extra,
  });
  const signInEditable = editable('#password-register', { RESET: ({ context }) => context.accountEmail ? { target: '#password-reset', context: clearForm } : undefined });
  const verification = (id, mode, events) => {
    const on = {
      ...events,
      SUBMIT: () => ({ target: `${mode}.submitting`, context: clearMessages }),
      RESEND: ({ context }) => context.accountEmail && context.verifyEmail ? { target: 'resending', context: { error: '' } } : undefined,
    };
    return {
      id, initial: 'editing',
      states: {
        editing: { on }, sent: { on },
        resending: {
          tags: ['busy'],
          invoke: {
            src: createAsyncLogic({ run: ({ input }) => {
              const { origin, search } = services.location();
              return services.verify({ email: input, callbackURL: origin + signInRetry(search) });
            } }),
            input: ({ context }) => context.verifyEmail,
            onDone: ({ event }) => event.output.error
              ? { target: 'editing', context: { error: event.output.error.message || 'Try again in a moment.' } }
              : { target: 'sent', context: { notice: 'If this address needs verification, a new link is on its way. Check your inbox and spam folder.' } },
            onError: () => ({ target: 'editing', context: { error: 'The email service could not be reached. Try again.' } }),
          },
        },
      },
    };
  };
  return createMachine({
    id: 'password-account',
    schemas: { events: {
      START: types(), TOGGLE_ACCOUNT: types(), RESET: types(), RESEND: types(),
      SUBMIT: /** @type {import('xstate').TypeSchema<{ data: { email: string; password: string; name: string } }>} */ (types()),
    } },
    context: /** @type {any} */ ({ accountEmail: false, verifyEmail: '', notice: '', error: '' }),
    initial: 'unready',
    states: {
      unready: { on: { START: { target: 'ready' } } },
      ready: {
        type: 'parallel',
        states: {
          capabilities: {
            initial: 'loading',
            states: {
              loading: { invoke: {
                src: createAsyncLogic({ run: ({ signal }) => services.load(signal) }),
                onDone: ({ event }) => ({ target: 'complete', context: { accountEmail: !!event.output.accountEmail } }),
                onError: { target: 'complete' },
              } },
              complete: {},
            },
          },
          form: {
            initial: 'signIn',
            states: {
              signIn: {
                id: 'password-sign-in', initial: 'editing',
                states: {
                  editing: { on: { ...signInEditable, SUBMIT: () => ({ target: 'submitting', context: clearMessages }) } },
                  submitting: {
                    tags: ['busy'],
                    invoke: {
                      src: passwordRequest(false), input: formInput,
                      onDone: ({ context, event }, enq) => {
                        const result = event.output;
                        if (result.error?.code === 'EMAIL_NOT_VERIFIED') return { target: 'verification', context: { verifyEmail: result.email, error: result.error.message || 'Check your email and password.' } };
                        if (result.error) return { target: context.verifyEmail ? 'verification' : 'editing', context: { error: result.error.message || 'Check your email and password.' } };
                        enq(services.navigate, result.destination);
                        return { target: 'redirecting' };
                      },
                      onError: submitFailure,
                    },
                  },
                  verification: verification('password-verification', '#password-account.ready.form.signIn', signInEditable),
                  redirecting: { tags: ['busy'] },
                },
              },
              register: {
                id: 'password-register', initial: 'editing',
                states: {
                  editing: { on: { ...editable('#password-sign-in'), SUBMIT: () => ({ target: 'submitting', context: clearMessages }) } },
                  submitting: {
                    tags: ['busy'],
                    invoke: {
                      src: passwordRequest(true), input: formInput,
                      onDone: ({ context, event }, enq) => {
                        const result = event.output;
                        if (result.error?.code === 'EMAIL_NOT_VERIFIED') return { target: 'verification', context: { verifyEmail: result.email, error: result.error.message || 'Check your email and password.' } };
                        if (result.error) return { target: context.verifyEmail ? 'verification' : 'editing', context: { error: result.error.message || 'Check your email and password.' } };
                        if (!result.data?.token) return { target: '#password-verification', context: { verifyEmail: result.email, notice: verificationNotice } };
                        enq(services.navigate, result.destination);
                        return { target: 'redirecting' };
                      },
                      onError: submitFailure,
                    },
                  },
                  verification: verification('password-register-verification', '#password-account.ready.form.register', editable('#password-sign-in')),
                  redirecting: { tags: ['busy'] },
                },
              },
              reset: {
                id: 'password-reset', initial: 'editing',
                states: {
                  editing: { on: { ...editable('#password-sign-in'), SUBMIT: () => ({ target: 'submitting', context: clearMessages }) } },
                  sent: { on: { ...editable('#password-sign-in'), SUBMIT: () => ({ target: 'submitting', context: clearMessages }) } },
                  submitting: {
                    tags: ['busy'],
                    invoke: {
                      src: createAsyncLogic({ run: ({ input }) => services.reset({ email: input.email, redirectTo: services.location().origin + '/reset-password' }) }), input: formInput,
                      onDone: ({ event }) => event.output.error
                        ? { target: 'editing', context: { error: event.output.error.message || 'Try again in a moment.' } }
                        : { target: 'sent', context: { notice: 'If an account uses this email address, a password-reset link is on its way. Check your inbox and spam folder.' } },
                      onError: () => ({ target: 'editing', context: { error: accountError } }),
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

/** @param {any} services */
export function createConsentMachine(services) {
  return createMachine({
    id: 'consent',
    schemas: { events: {
      START: /** @type {import('xstate').TypeSchema<{ query: string }>} */ (types()),
      SELECT: /** @type {import('xstate').TypeSchema<{ project: string }>} */ (types()),
      ACCEPT: types(), REJECT: types(),
    } },
    context: /** @type {any} */ ({ query: '', data: null, project: '', error: '' }),
    initial: 'unready',
    states: {
      unready: { on: { START: ({ event }) => ({ target: 'loading', context: { query: event.query } }) } },
      loading: {
        invoke: {
          src: createAsyncLogic({ run: ({ input, signal }) => services.load(input, signal) }), input: ({ context }) => context.query,
          onDone: ({ event }) => ({ target: 'ready', context: {
            data: event.output,
            project: event.output.scopes.includes('projects:write') || event.output.projects.length !== 1 ? 'new' : event.output.projects[0].id,
          } }),
          onError: ({ context, event }, enq) => {
            if (event.error.status === 401) {
              enq(services.navigate, `/sign-in?${context.query}`);
              return { target: 'redirecting' };
            }
            return { target: 'unavailable', context: { error: event.error.message } };
          },
        },
      },
      unavailable: {},
      ready: {
        on: {
          SELECT: ({ event }) => ({ context: { project: event.project } }),
          ACCEPT: ({ context }) => context.project ? { target: 'submitting', context: { error: '' } } : undefined,
          REJECT: () => ({ target: 'submitting', context: { error: '' } }),
        },
      },
      submitting: {
        tags: ['busy'],
        invoke: {
          src: createAsyncLogic({ run: async ({ input }) => {
            const value = await services.decide(input);
            const target = value.redirect_uri || value.url;
            if (!target) throw new Error('The agent did not provide a return address. Start the connection again.');
            return target;
          } }),
          input: ({ context, event }) => {
            const accept = event.type === 'ACCEPT';
            const access = context.project === 'new'
              ? context.data.scopes.includes('projects:write') ? { createProjects: true } : { connectOnly: true }
              : { projectId: context.project };
            return { query: context.query, accept, ...(accept ? access : {}) };
          },
          onDone: ({ event }, enq) => { enq(services.navigate, event.output); return { target: 'redirecting' }; },
          onError: ({ event }) => ({ target: 'ready', context: { error: event.error.message } }),
        },
      },
      redirecting: { tags: ['busy'] },
    },
  });
}

/** @param {any} services */
export function createConnectionMachine(services) {
  return createMachine({
    id: 'agent-connection',
    schemas: { events: { OPEN: types(), CLOSE: types(), COPY_FAILED: types(), REVOKE: types() } },
    context: /** @type {any} */ ({ data: null, error: '', browserTools: null }),
    initial: 'closed',
    states: {
      closed: { on: { OPEN: () => ({ target: 'open', context: { error: '' } }) } },
      open: {
        type: 'parallel',
        on: { CLOSE: { target: 'closed' }, COPY_FAILED: () => ({ context: { error: 'Select the URL and copy it from the field.' } }) },
        states: {
          connection: {
            initial: 'loading',
            states: {
              loading: { invoke: {
                src: createAsyncLogic({ run: ({ signal }) => services.load(signal) }),
                onDone: ({ event }) => ({ target: 'ready', context: { data: event.output } }),
                onError: ({ event }) => ({ target: 'ready', context: { error: event.error.message } }),
              } },
              ready: { on: { REVOKE: ({ context }) => context.data?.connections?.length ? { target: 'revoking' } : undefined } },
              revoking: {
                tags: ['revoking'],
                invoke: {
                  src: createAsyncLogic({ run: ({ signal }) => services.revoke(signal) }),
                  onDone: ({ context }) => ({ target: 'ready', context: { data: { ...context.data, connections: [] } } }),
                  onError: ({ event }) => ({ target: 'ready', context: { error: event.error.message } }),
                },
              },
            },
          },
          tools: {
            initial: 'loading',
            states: {
              loading: { invoke: {
                src: createAsyncLogic({ run: () => services.tools() }),
                onDone: ({ event }) => ({ target: 'complete', context: { browserTools: event.output } }),
                onError: () => ({ target: 'complete', context: { browserTools: null } }),
              } },
              complete: {},
            },
          },
        },
      },
    },
  });
}

/** @param {any} services */
export function createBillingMachine(services) {
  return createMachine({
    id: 'billing',
    schemas: { events: {
      START: /** @type {import('xstate').TypeSchema<{ checkout: boolean }>} */ (types()),
      OPEN: /** @type {import('xstate').TypeSchema<{ action: string }>} */ (types()),
    } },
    context: /** @type {any} */ ({ plan: null, error: '', checkout: false, attempts: 0, action: null }),
    initial: 'unready',
    states: {
      unready: { on: { START: ({ event }) => ({ target: 'active', context: { checkout: event.checkout, attempts: 0 } }) } },
      active: {
        type: 'parallel',
        states: {
          reconciliation: {
            initial: 'loading',
            on: { START: ({ event }) => ({ target: '.loading', context: { checkout: event.checkout, attempts: 0 } }) },
            states: {
              loading: {
                invoke: {
                  src: createAsyncLogic({ run: ({ signal }) => services.load(signal) }),
                  onDone: ({ context, event }) => context.checkout && event.output.available && !event.output.subscription?.active && context.attempts < 12
                    ? { target: 'waiting', context: { plan: event.output, attempts: context.attempts + 1 } }
                    : { target: 'complete', context: { plan: event.output } },
                  onError: ({ event }, enq) => {
                    if (event.error.status === 401) {
                      enq(services.navigate, '/sign-in?plan=pro');
                      return { target: 'unauthorized' };
                    }
                    return { target: 'failed', context: { error: event.error.message } };
                  },
                },
              },
              waiting: { after: { 5000: { target: 'loading' } } },
              complete: {}, failed: {}, unauthorized: {},
            },
          },
          action: {
            initial: 'idle',
            states: {
              idle: { on: { OPEN: ({ event }) => ({ target: 'opening', context: { action: event.action, error: '' } }) } },
              opening: {
                tags: ['opening'],
                invoke: {
                  src: createAsyncLogic({ run: ({ input }) => services.open(input) }), input: ({ context }) => context.action,
                  onDone: ({ event }, enq) => { enq(services.navigate, event.output.url); return { target: 'redirecting' }; },
                  onError: ({ event }) => ({ target: 'idle', context: { error: event.error.message, action: null } }),
                },
              },
              redirecting: { tags: ['opening'] },
            },
          },
        },
      },
    },
  });
}
