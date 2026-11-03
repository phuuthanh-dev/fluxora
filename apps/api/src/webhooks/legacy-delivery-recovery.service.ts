import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { KumaDeliveryRecoveryService } from "./kuma-delivery-recovery.service";

/** Restore accepted legacy/GitHub deliveries only when they never started. */
@Injectable()
export class LegacyDeliveryRecoveryService extends KumaDeliveryRecoveryService {
  constructor(@Inject(PrismaService) prisma: PrismaService, @Inject(ExecutionQueueService) queue: ExecutionQueueService) { super(prisma, queue); }
  protected override get deliveryPrefix() { return "webhook:"; }
  protected override get providerName() { return "Webhook"; }
}
