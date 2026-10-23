import { Injectable } from "@nestjs/common";
import { Subject, filter } from "rxjs";

type ExecutionEvent = { data: { executionId: string; kind: string } };

@Injectable()
export class ExecutionEventsService {
  private readonly events = new Subject<ExecutionEvent>();

  stream(executionId: string) {
    return this.events.pipe(filter((event) => event.data.executionId === executionId));
  }

  publish(executionId: string, kind: string) {
    this.events.next({ data: { executionId, kind } });
  }
}
