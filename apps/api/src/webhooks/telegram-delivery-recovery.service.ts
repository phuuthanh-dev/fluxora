import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { KumaDeliveryRecoveryService } from "./kuma-delivery-recovery.service";

/** Reuse the initial-delivery recovery rules with a distinct provider prefix. */
@Injectable()
export class TelegramDeliveryRecoveryService extends KumaDeliveryRecoveryService {
  constructor(@Inject(PrismaService) prisma: PrismaService, @Inject(ExecutionQueueService) queue: ExecutionQueueService) { super(prisma, queue); }
  protected override get deliveryPrefix() { return "telegram-v1:"; }
  protected override get providerName() { return "Telegram"; }
}
