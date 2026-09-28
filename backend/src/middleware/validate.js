import { ApiError } from '../utils/ApiError.js';

/**
 * Zod Schema Validation Middleware
 * 
 * WHY: Strict input validation on every parameter, query, and request body prevents
 * injection attacks, malformed JSON states, and unexpected schema types.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const result = schema.safeParse(req[source]);
      if (!result.success) {
        const errorMessages = result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        throw ApiError.badRequest(
          errorMessages[0]?.message || 'Input validation failed',
          'VALIDATION_ERROR',
          errorMessages
        );
      }
      // Assign parsed/sanitized data back to request
      req[source] = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
}
