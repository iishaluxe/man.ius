import { notifyOwner } from "../_core/notification";

export type OwnerAlertKind = "approval" | "budget" | "failure" | "completion";

export async function alertOwner(input: {
  kind: OwnerAlertKind;
  taskId: string;
  taskTitle: string;
  detail: string;
}) {
  const titles: Record<OwnerAlertKind, string> = {
    approval: "Aegis Computer requires approval",
    budget: "Aegis Computer task reached its budget",
    failure: "Aegis Computer task needs attention",
    completion: "Aegis Computer verified an artifact",
  };

  return notifyOwner({
    title: titles[input.kind],
    content: `Task ${input.taskTitle} (${input.taskId}): ${input.detail}`.slice(0, 20_000),
  });
}
