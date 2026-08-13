import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CheckCheck, CircleAlert, FileArchive, FileCheck2, Loader2, ScrollText, ShieldCheck, X } from "lucide-react";

const eventIcon = {
  info: ScrollText,
  success: CheckCheck,
  warning: CircleAlert,
  error: CircleAlert,
  policy: ShieldCheck,
} as const;

export function TaskInspector({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const detail = trpc.agent.detail.useQuery({ taskId });

  if (detail.isLoading) {
    return <section className="inspector-panel loading-inspector"><Loader2 size={18} className="animate-spin" /> Opening durable task record…</section>;
  }

  if (!detail.data) return null;
  const { task, plan, events, approvals, artifacts, checkpoints } = detail.data;

  return (
    <section className="inspector-panel" aria-label={`Task workspace for ${task.title}`}>
      <header className="inspector-header">
        <div>
          <p className="eyebrow">TASK WORKSPACE</p>
          <div className="inspector-title"><h2>{task.title}</h2><Badge className="workspace-status">{task.status.replaceAll("_", " ")}</Badge></div>
          <p>{task.currentPhase}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close task workspace"><X size={18} /></Button>
      </header>

      <div className="inspector-summary">
        <div><span>Target</span><strong>{task.executionTarget.replaceAll("_", " ")}</strong></div>
        <div><span>Budget</span><strong>{task.usedBudgetCents} / {task.maxBudgetCents}¢</strong></div>
        <div><span>Tokens</span><strong>{task.usedTokens.toLocaleString()} / {task.maxTokens.toLocaleString()}</strong></div>
        <div><span>Checkpoints</span><strong>{checkpoints.length}</strong></div>
      </div>

      <div className="inspector-grid">
        <div className="inspector-column plan-column">
          <div className="inspector-section-heading"><div><p className="eyebrow">BOUNDED PLAN</p><h3>Execution path</h3></div><span>{plan.length} steps</span></div>
          {plan.length ? <ol className="plan-steps">{plan.map(step => <li key={step.id}><span className="plan-number">{String(step.sequence).padStart(2, "0")}</span><div><div className="step-heading"><h4>{step.title}</h4><Badge variant="outline" className={`risk-${step.risk}`}>{step.risk}</Badge></div><p>{step.description}</p><small><strong>{step.capability}</strong> · Evidence: {step.expectedEvidence}</small></div></li>)}</ol> : <div className="inspector-empty">The plan is waiting for the model gateway.</div>}
        </div>
        <div className="inspector-column event-column">
          <div className="inspector-section-heading"><div><p className="eyebrow">OBSERVABILITY</p><h3>Execution ledger</h3></div><span>{events.length} events</span></div>
          {events.length ? <div className="event-stream">{events.map(event => { const Icon = eventIcon[event.level]; return <article className={`event-item event-${event.level}`} key={event.id}><span className="event-icon"><Icon size={13} /></span><div><h4>{event.title}</h4><p>{event.content}</p><small>{new Date(event.createdAt).toLocaleString()} · {event.kind}</small></div></article> })}</div> : <div className="inspector-empty">Events will appear here as the control plane observes execution.</div>}
        </div>
      </div>

      <div className="inspector-footer-grid">
        <div className="artifact-record"><FileArchive size={17} /><div><p className="eyebrow">ARTIFACTS</p><strong>{artifacts.length} provenance-backed record{artifacts.length === 1 ? "" : "s"}</strong><span>{artifacts.length ? artifacts.map(artifact => artifact.name).join(", ") : "No artifact has been packaged."}</span></div></div>
        <div className="artifact-record"><FileCheck2 size={17} /><div><p className="eyebrow">APPROVALS</p><strong>{approvals.filter(approval => approval.status === "pending").length} awaiting owner decision</strong><span>{approvals.length ? approvals.map(approval => `${approval.action} · ${approval.status}`).join(" | ") : "No sensitive action is pending."}</span></div></div>
      </div>
    </section>
  );
}
