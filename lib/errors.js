export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (msg, details) => new AppError(400, 'bad_request', msg, details);
export const validationFailed = (msg, details) => new AppError(422, 'validation_failed', msg, details);
export const unauthorized = (msg = 'Please sign in.') => new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'You do not have permission to do this.') => new AppError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found.') => new AppError(404, 'not_found', msg);
export const conflict = (msg, details) => new AppError(409, 'conflict', msg, details);
export const tooMany = (msg = 'Too many attempts. Please wait and try again.') => new AppError(429, 'rate_limited', msg);
