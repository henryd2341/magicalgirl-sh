export class InputValidationError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "InputValidationError";
    this.code = code;
  }
}

// Issued only around pure patch computation, before any repository write.
export class VariablePatchRejectedError extends Error {
  public readonly code: string;

  public constructor(cause: InputValidationError) {
    super(cause.message, { cause });
    this.name = "VariablePatchRejectedError";
    this.code = cause.code;
  }
}
