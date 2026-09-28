/**
 * Async Route Handler Wrapper
 * 
 * WHY: Eliminates repetitive try-catch boilerplate across controllers and ensures
 * all unhandled Promise rejections are safely forwarded to Express's global error handler.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
