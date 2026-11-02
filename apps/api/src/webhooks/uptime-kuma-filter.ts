import { BadRequestException } from "@nestjs/common";

/** Validate at publish and again at ingress; an invalid filter must not silently match all. */
export function readUptimeKumaFilter(config: Record<string, unknown>) {
  const monitorId = config.monitorId === undefined || config.monitorId === "" ? "" : config.monitorId;
  const statusFilter = config.statusFilter === undefined ? "any" : config.statusFilter;
  if (typeof monitorId !== "string" || (monitorId !== "" && !/^[A-Za-z0-9_-]{1,100}$/.test(monitorId)) || typeof statusFilter !== "string" || !["any", "0", "1", "2", "3"].includes(statusFilter)) {
    throw new BadRequestException({ code: "UPTIME_KUMA_FILTER_INVALID", message: "Choose a valid monitor ID and alert status." });
  }
  return { monitorId, statusFilter };
}

export function matchesUptimeKumaFilter(config: Record<string, unknown>, monitorId: string, status: number) {
  const filter = readUptimeKumaFilter(config);
  return (!filter.monitorId || filter.monitorId === monitorId) && (filter.statusFilter === "any" || filter.statusFilter === String(status));
}
