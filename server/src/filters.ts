import { Catch, HttpException } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { ApiError } from "./engine";

interface JsonResponse {
    status(code: number): JsonResponse;
    json(body: unknown): void;
}

// Every error becomes {error: message} with the right status
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        const res = host.switchToHttp().getResponse<JsonResponse>();
        if (exception instanceof ApiError) {
            res.status(exception.status).json({ error: exception.message });
            return;
        }
        if (exception instanceof HttpException) {
            res.status(exception.getStatus()).json({ error: exception.message });
            return;
        }
        const type = (exception as { type?: string } | null)?.type;
        if (type === "entity.parse.failed") {
            res.status(400).json({ error: "body must be JSON" });
            return;
        }
        if (type === "entity.too.large") {
            res.status(413).json({ error: "body too large" });
            return;
        }
        res.status(500).json({ error: exception instanceof Error ? exception.message : "internal error" });
    }
}
