import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const taskStatuses = [
  "draft",
  "planning",
  "queued",
  "executing",
  "waiting_approval",
  "verifying",
  "recovering",
  "completed",
  "blocked",
  "failed",
  "cancelled",
] as const;

export const executionTargets = [
  "auto",
  "cloud_sandbox",
  "persistent_workspace",
  "local_bridge",
] as const;

export const agentTasks = mysqlTable(
  "agent_tasks",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    ownerId: int("ownerId").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    goal: text("goal").notNull(),
    executionTarget: mysqlEnum("executionTarget", executionTargets)
      .default("auto")
      .notNull(),
    status: mysqlEnum("status", taskStatuses).default("draft").notNull(),
    modelId: varchar("modelId", { length: 160 }),
    maxSteps: int("maxSteps").default(24).notNull(),
    maxRuntimeSeconds: int("maxRuntimeSeconds").default(1800).notNull(),
    maxTokens: int("maxTokens").default(120000).notNull(),
    maxBudgetCents: int("maxBudgetCents").default(500).notNull(),
    usedSteps: int("usedSteps").default(0).notNull(),
    usedTokens: int("usedTokens").default(0).notNull(),
    usedBudgetCents: int("usedBudgetCents").default(0).notNull(),
    currentPhase: varchar("currentPhase", { length: 120 }).default("Awaiting plan"),
    workspaceRef: varchar("workspaceRef", { length: 255 }),
    cancellationRequested: boolean("cancellationRequested").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
  },
  table => [index("agent_tasks_owner_created_idx").on(table.ownerId, table.createdAt)]
);

export const agentPlanSteps = mysqlTable(
  "agent_plan_steps",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("taskId", { length: 64 }).notNull(),
    sequence: int("sequence").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    description: text("description").notNull(),
    capability: varchar("capability", { length: 120 }).notNull(),
    expectedEvidence: text("expectedEvidence").notNull(),
    risk: mysqlEnum("risk", ["low", "medium", "high"]).default("low").notNull(),
    status: mysqlEnum("status", ["pending", "active", "complete", "skipped", "failed"])
      .default("pending")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("agent_plan_steps_task_sequence_idx").on(table.taskId, table.sequence)]
);

export const agentExecutionEvents = mysqlTable(
  "agent_execution_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("taskId", { length: 64 }).notNull(),
    kind: varchar("kind", { length: 120 }).notNull(),
    level: mysqlEnum("level", ["info", "success", "warning", "error", "policy"])
      .default("info")
      .notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    content: text("content").notNull(),
    metadataJson: text("metadataJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("agent_execution_events_task_created_idx").on(table.taskId, table.createdAt)]
);

export const agentCheckpoints = mysqlTable(
  "agent_checkpoints",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("taskId", { length: 64 }).notNull(),
    sequence: int("sequence").notNull(),
    summary: text("summary").notNull(),
    stateJson: text("stateJson").notNull(),
    workspaceSnapshotKey: varchar("workspaceSnapshotKey", { length: 512 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("agent_checkpoints_task_sequence_idx").on(table.taskId, table.sequence)]
);

export const agentApprovals = mysqlTable(
  "agent_approvals",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("taskId", { length: 64 }).notNull(),
    action: varchar("action", { length: 240 }).notNull(),
    rationale: text("rationale").notNull(),
    risk: mysqlEnum("risk", ["medium", "high", "critical"]).notNull(),
    status: mysqlEnum("status", ["pending", "approved", "rejected", "expired"])
      .default("pending")
      .notNull(),
    contextJson: text("contextJson").notNull(),
    requestedAt: timestamp("requestedAt").defaultNow().notNull(),
    decidedAt: timestamp("decidedAt"),
  },
  table => [index("agent_approvals_task_status_idx").on(table.taskId, table.status)]
);

export const agentArtifacts = mysqlTable(
  "agent_artifacts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("taskId", { length: 64 }).notNull(),
    kind: mysqlEnum("kind", ["report", "project_archive", "log", "screenshot", "browser_trace", "workspace_snapshot"])
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    objectKey: varchar("objectKey", { length: 512 }).notNull(),
    objectUrl: varchar("objectUrl", { length: 1024 }).notNull(),
    contentType: varchar("contentType", { length: 160 }).notNull(),
    checksum: varchar("checksum", { length: 128 }).notNull(),
    sourceCapability: varchar("sourceCapability", { length: 120 }).notNull(),
    provenanceJson: text("provenanceJson").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("agent_artifacts_task_created_idx").on(table.taskId, table.createdAt)]
);

export const agentPolicies = mysqlTable(
  "agent_policies",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    ownerId: int("ownerId").notNull(),
    name: varchar("name", { length: 240 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    rulesJson: text("rulesJson").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("agent_policies_owner_idx").on(table.ownerId)]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AgentTask = typeof agentTasks.$inferSelect;
export type AgentPlanStep = typeof agentPlanSteps.$inferSelect;
export type AgentExecutionEvent = typeof agentExecutionEvents.$inferSelect;
export type AgentCheckpoint = typeof agentCheckpoints.$inferSelect;
export type AgentApproval = typeof agentApprovals.$inferSelect;
export type AgentArtifact = typeof agentArtifacts.$inferSelect;
