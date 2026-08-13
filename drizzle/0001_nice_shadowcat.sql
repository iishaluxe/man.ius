CREATE TABLE `agent_approvals` (
	`id` varchar(64) NOT NULL,
	`taskId` varchar(64) NOT NULL,
	`action` varchar(240) NOT NULL,
	`rationale` text NOT NULL,
	`risk` enum('medium','high','critical') NOT NULL,
	`status` enum('pending','approved','rejected','expired') NOT NULL DEFAULT 'pending',
	`contextJson` text NOT NULL,
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`decidedAt` timestamp,
	CONSTRAINT `agent_approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_artifacts` (
	`id` varchar(64) NOT NULL,
	`taskId` varchar(64) NOT NULL,
	`kind` enum('report','project_archive','log','screenshot','browser_trace','workspace_snapshot') NOT NULL,
	`name` varchar(255) NOT NULL,
	`objectKey` varchar(512) NOT NULL,
	`objectUrl` varchar(1024) NOT NULL,
	`contentType` varchar(160) NOT NULL,
	`checksum` varchar(128) NOT NULL,
	`sourceCapability` varchar(120) NOT NULL,
	`provenanceJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_artifacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_checkpoints` (
	`id` varchar(64) NOT NULL,
	`taskId` varchar(64) NOT NULL,
	`sequence` int NOT NULL,
	`summary` text NOT NULL,
	`stateJson` text NOT NULL,
	`workspaceSnapshotKey` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_checkpoints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_execution_events` (
	`id` varchar(64) NOT NULL,
	`taskId` varchar(64) NOT NULL,
	`kind` varchar(120) NOT NULL,
	`level` enum('info','success','warning','error','policy') NOT NULL DEFAULT 'info',
	`title` varchar(240) NOT NULL,
	`content` text NOT NULL,
	`metadataJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_execution_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_plan_steps` (
	`id` varchar(64) NOT NULL,
	`taskId` varchar(64) NOT NULL,
	`sequence` int NOT NULL,
	`title` varchar(240) NOT NULL,
	`description` text NOT NULL,
	`capability` varchar(120) NOT NULL,
	`expectedEvidence` text NOT NULL,
	`risk` enum('low','medium','high') NOT NULL DEFAULT 'low',
	`status` enum('pending','active','complete','skipped','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_plan_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_policies` (
	`id` varchar(64) NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(240) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`rulesJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_tasks` (
	`id` varchar(64) NOT NULL,
	`ownerId` int NOT NULL,
	`title` varchar(240) NOT NULL,
	`goal` text NOT NULL,
	`executionTarget` enum('auto','cloud_sandbox','persistent_workspace','local_bridge') NOT NULL DEFAULT 'auto',
	`status` enum('draft','planning','queued','executing','waiting_approval','verifying','recovering','completed','blocked','failed','cancelled') NOT NULL DEFAULT 'draft',
	`modelId` varchar(160),
	`maxSteps` int NOT NULL DEFAULT 24,
	`maxRuntimeSeconds` int NOT NULL DEFAULT 1800,
	`maxTokens` int NOT NULL DEFAULT 120000,
	`maxBudgetCents` int NOT NULL DEFAULT 500,
	`usedSteps` int NOT NULL DEFAULT 0,
	`usedTokens` int NOT NULL DEFAULT 0,
	`usedBudgetCents` int NOT NULL DEFAULT 0,
	`currentPhase` varchar(120) DEFAULT 'Awaiting plan',
	`workspaceRef` varchar(255),
	`cancellationRequested` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`startedAt` timestamp,
	`completedAt` timestamp,
	CONSTRAINT `agent_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `agent_approvals_task_status_idx` ON `agent_approvals` (`taskId`,`status`);--> statement-breakpoint
CREATE INDEX `agent_artifacts_task_created_idx` ON `agent_artifacts` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agent_checkpoints_task_sequence_idx` ON `agent_checkpoints` (`taskId`,`sequence`);--> statement-breakpoint
CREATE INDEX `agent_execution_events_task_created_idx` ON `agent_execution_events` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agent_plan_steps_task_sequence_idx` ON `agent_plan_steps` (`taskId`,`sequence`);--> statement-breakpoint
CREATE INDEX `agent_policies_owner_idx` ON `agent_policies` (`ownerId`);--> statement-breakpoint
CREATE INDEX `agent_tasks_owner_created_idx` ON `agent_tasks` (`ownerId`,`createdAt`);