export class ScribeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ScribeError';
    this.code = code;
    this.details = details;
  }
}

export function requireThat(condition, code, message, details) {
  if (!condition) throw new ScribeError(code, message, details);
}

export function publicError(error) {
  return {
    code: error.code || (error.name === 'ZodError' ? 'INVALID_REQUEST' : 'FAILED'),
    message: error.name === 'ZodError' ? 'The request does not match the schema.' : error.message,
    details: error.issues || error.details || {},
  };
}
