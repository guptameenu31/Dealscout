import type { ErrorCode } from "./types";

export class ApiClientError extends Error {
  code: ErrorCode;
  status: number;
  constructor(code: ErrorCode, message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}
