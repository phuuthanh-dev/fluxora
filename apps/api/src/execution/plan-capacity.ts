/** This signal is raised only before a live execution phase is claimed. */
export class PlanCapacityWait extends Error {
  constructor() { super("Waiting for an available workspace execution slot."); }
}
