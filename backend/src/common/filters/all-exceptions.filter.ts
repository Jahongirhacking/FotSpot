// src/common/filters/all-exceptions.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

// Catches ALL exceptions and formats them consistently:
// { success: false, error: "...", statusCode: 400, timestamp: "..." }
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | string[];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      // NestJS validation errors return { message: string[] }
      message =
        typeof exceptionResponse === "object" && "message" in exceptionResponse
          ? (exceptionResponse as any).message
          : exception.message;
    } else {
      // Unexpected errors (DB errors, runtime errors, etc.)
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = "Internal server error";
      // Log the full error for debugging
      this.logger.error("Unhandled exception", exception);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      error: message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
