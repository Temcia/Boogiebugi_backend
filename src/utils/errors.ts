export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(message: string, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "AppError";
  }

  static notFound(message = "Resource not found") {
    return new AppError(message, 404, "NOT_FOUND");
  }

  static unauthorized(message = "Authentication required") {
    return new AppError(message, 401, "UNAUTHORIZED");
  }

  static forbidden(message = "Insufficient permissions") {
    return new AppError(message, 403, "FORBIDDEN");
  }

  static badRequest(message = "Invalid request") {
    return new AppError(message, 400, "BAD_REQUEST");
  }

  static conflict(message = "Resource already exists") {
    return new AppError(message, 409, "CONFLICT");
  }

  static internal(message = "Internal server error") {
    return new AppError(message, 500, "INTERNAL_ERROR");
  }
}
