import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { KumaDeliveryRecoveryService } from "./kuma-delivery-recovery.service";

@Injectable()
export class SentryDeliveryRecoveryService extends KumaDeliveryRecoveryService {
  constructor(@Inject(PrismaService) prisma: PrismaService, @Inject(ExecutionQueueService) queue: ExecutionQueueService) { super(prisma, queue); }
  protected override get deliveryPrefix() { return "sentry-v1:"; }
  protected override get providerName() { return "Sentry"; }
}
