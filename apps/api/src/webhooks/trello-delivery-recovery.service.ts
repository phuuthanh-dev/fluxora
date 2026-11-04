import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { KumaDeliveryRecoveryService } from "./kuma-delivery-recovery.service";

/** Recover only persisted Trello events that have not started. */
@Injectable()
export class TrelloDeliveryRecoveryService extends KumaDeliveryRecoveryService {
  constructor(@Inject(PrismaService) prisma: PrismaService, @Inject(ExecutionQueueService) queue: ExecutionQueueService) { super(prisma, queue); }
  protected override get deliveryPrefix() { return "trello-v1:"; }
  protected override get providerName() { return "Trello"; }
}
