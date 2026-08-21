export type RuntimeWorkerStatus =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "failed";

export type RuntimeWorkerHealth = {
  status: RuntimeWorkerStatus;
  runId?: string;
  taskId: string;
  lastCycleAt?: Date;
  lastError?: string;
};
