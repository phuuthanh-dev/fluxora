import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";

type ErrorResponse = {
  code: string;
  message: string;
  details?: unknown;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const requestId = request.headers["x-request-id"]?.toString() ?? randomUUID();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.toErrorResponse(exception, status);

    if (!(exception instanceof HttpException)) {
      console.error(`[${requestId}] Unhandled API error`, exception);
    }

    response.status(status).json({ ...body, requestId });
  }

  private toErrorResponse(exception: unknown, status: number): ErrorResponse {
    if (!(exception instanceof HttpException)) {
      return { code: "INTERNAL_ERROR", message: "An unexpected error occurred." };
    }

    const response = exception.getResponse();
    if (typeof response === "string") {
      return { code: `HTTP_${status}`, message: response };
    }
    if (response && typeof response === "object" && !Array.isArray(response)) {
      const record = response as Record<string, unknown>;
      const code = typeof record.code === "string" ? record.code : `HTTP_${status}`;
      const message = typeof record.message === "string" ? record.message : exception.message;
      return record.details === undefined ? { code, message } : { code, message, details: record.details };
    }
    return { code: `HTTP_${status}`, message: exception.message };
  }
}
