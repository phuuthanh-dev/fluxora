import { CallHandler, ExecutionContext, Injectable, NestInterceptor, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { SSE_METADATA } from "@nestjs/common/constants";
import { Observable, defer, finalize } from "rxjs";

/** Keep ordinary controller work alive until it finishes, even if the client
 * disconnects. SSE streams have their own shutdown lifecycle. */
@Injectable()
export class RequestDrainInterceptor implements NestInterceptor, OnModuleDestroy {
  private stopping = false;
  private readonly pending = new Set<Promise<void>>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return defer(() => {
      if (this.stopping) throw new ServiceUnavailableException("Server is shutting down.");
      if (Reflect.getMetadata(SSE_METADATA, context.getHandler())) return next.handle();
      let finish!: () => void;
      const done = new Promise<void>((resolve) => { finish = resolve; });
      this.pending.add(done);
      return defer(() => next.handle()).pipe(finalize(() => { this.pending.delete(done); finish(); }));
    });
  }

  async onModuleDestroy() {
    this.stopping = true;
    await Promise.all([...this.pending]);
  }
}
