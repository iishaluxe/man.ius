import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TaskInspector } from "@/components/TaskInspector";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ChevronRight, CircleAlert, Clock3, Command, FileArchive, HardDrive, Loader2, Play, Plus, ShieldCheck, Sparkles, TerminalSquare, TimerReset, Waypoints } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const statusTone: Record<string, string> = {
  draft: "status-muted",
  planning: "status-active",
  queued: "status-active",
  executing: "status-active",
  waiting_approval: "status-warning",
  verifying: "status-active",
  recovering: "status-warning",
  completed: "status-success",
  blocked: "status-warning",
  failed: "status-danger",
  cancelled: "status-muted",
};

function formatTarget(target: string) {
  return target.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function Home() {
  const [goal, setGoal] = useState("");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState<"auto" | "cloud_sandbox" | "persistent_workspace" | "local_bridge">("auto");
  const [steps, setSteps] = useState(24);
  const [budget, setBudget] = useState(500);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const overview = trpc.agent.overview.useQuery(undefined, { retry: false });
  const models = trpc.agent.models.useQuery(undefined, { retry: false });
  const [modelId, setModelId] = useState("");
  const createTask = trpc.agent.create.useMutation();
  const generatePlan = trpc.agent.generatePlan.useMutation();
  const runTask = trpc.agent.runTask.useMutation();
  const cancelTask = trpc.agent.cancel.useMutation();

  const tasks = overview.data?.tasks ?? [];
  const activeTask = useMemo(() => tasks.find(task => ["planning", "queued", "executing", "waiting_approval", "verifying", "recovering"].includes(task.status)), [tasks]);
  const completedCount = tasks.filter(task => task.status === "completed").length;

  const launchTask = async () => {
    if (goal.trim().length < 12) {
      toast.error("Give the agent a clear goal of at least 12 characters.");
      return;
    }
    try {
      const task = await createTask.mutateAsync({
        title: title.trim() || undefined,
        goal: goal.trim(),
        executionTarget: target,
        modelId: modelId || undefined,
        maxSteps: steps,
        maxRuntimeSeconds: 1800,
        maxTokens: 120000,
        maxBudgetCents: budget,
      });
      toast.success("Task captured. Generating a bounded plan…");
      await generatePlan.mutateAsync({ taskId: task.id });
      toast.success("Plan checkpointed. Running the plan through the execution adapter…");
      setGoal("");
      setTitle("");
      await utils.agent.overview.invalidate();

      // Plan generation and execution are separate steps so a planning
      // failure never triggers real capability dispatches. A run failure
      // here (blocked, waiting on approval, etc.) is a normal outcome, not
      // an unexpected error, so it gets its own try/catch and its own
      // (non-error) toast rather than falling into the block above.
      try {
        const result = await runTask.mutateAsync({ taskId: task.id });
        if (result.outcome === "completed") toast.success(result.message);
        else if (result.outcome === "waiting_approval") toast(result.message);
        else if (result.outcome !== "no_op") toast.warning(result.message);
      } catch (runError) {
        toast.error(runError instanceof Error ? runError.message : "The task could not run.");
      }
      await utils.agent.overview.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The task could not be planned.");
      await utils.agent.overview.invalidate();
    }
  };

  const cancel = async (taskId: string) => {
    try {
      await cancelTask.mutateAsync({ taskId });
      toast.success("Cancellation signal issued.");
      await utils.agent.overview.invalidate();
    } catch {
      toast.error("Could not cancel this task.");
    }
  };

  return (
    <div className="control-plane">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">AUTONOMOUS OPERATIONS</p>
          <h1>Turn intent into verified work.</h1>
          <p className="workspace-subtitle">A policy-aware computer runtime for complex tasks across isolated cloud, persistent, and local execution targets.</p>
        </div>
        <div className="runtime-badge"><span className="pulse-dot" /> Control plane online</div>
      </header>

      <section className="composer-panel" aria-label="Create an autonomous task">
        <div className="composer-heading"><div className="heading-icon"><Sparkles size={18} /></div><div><h2>New autonomous task</h2><p>Describe the outcome. Aegis builds a bounded plan, checkpoints it, and only executes through approved capabilities.</p></div></div>
        <div className="composer-fields">
          <Input value={title} onChange={event => setTitle(event.target.value)} placeholder="Task title — optional" className="title-input" />
          <Textarea value={goal} onChange={event => setGoal(event.target.value)} placeholder="What should the agent accomplish? Include the intended outcome, constraints, and verification standard…" className="goal-input" />
        </div>
        <div className="composer-controls">
          <div className="control-group"><label>Execution target</label><select value={target} onChange={event => setTarget(event.target.value as typeof target)}>{overview.data?.targets.map(item => <option key={item.id} value={item.id}>{item.label} — {item.readiness === "approval-required" ? "approval gate" : item.readiness === "connection-required" ? "connection required" : "policy-routed"}</option>) ?? <option value="auto">Auto</option>}</select></div>
          <div className="control-group"><label>Planning model</label><select value={modelId} onChange={event => setModelId(event.target.value)}><option value="">Platform default</option>{models.data?.map(model => <option key={model.id} value={model.id}>{model.id}</option>)}</select></div>
          <div className="control-group compact"><label>Step limit</label><Input type="number" min={2} max={100} value={steps} onChange={event => setSteps(Number(event.target.value))} /></div>
          <div className="control-group compact"><label>Budget</label><Input type="number" min={1} value={budget} onChange={event => setBudget(Number(event.target.value))} /><span className="control-suffix">¢</span></div>
          <Button className="launch-button" onClick={launchTask} disabled={createTask.isPending || generatePlan.isPending}>{createTask.isPending || generatePlan.isPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} {generatePlan.isPending ? "Planning" : "Create task"}</Button>
        </div>
      </section>

      <section className="metric-grid" aria-label="System overview">
        <div className="metric-card"><div className="metric-icon lilac"><Waypoints size={18} /></div><div><span>Active tasks</span><strong>{overview.data?.activeCount ?? 0}</strong><small>{activeTask ? activeTask.currentPhase : "No task in flight"}</small></div></div>
        <div className="metric-card"><div className="metric-icon mint"><CheckCircle2 size={18} /></div><div><span>Verified results</span><strong>{completedCount}</strong><small>Evidence required before completion</small></div></div>
        <div className="metric-card"><div className="metric-icon amber"><ShieldCheck size={18} /></div><div><span>Pending approvals</span><strong>{overview.data?.approvals.length ?? 0}</strong><small>Owner-only review queue</small></div></div>
        <div className="metric-card"><div className="metric-icon blue"><HardDrive size={18} /></div><div><span>Execution targets</span><strong>{overview.data?.targets.length ?? 4}</strong><small>One task contract, many computers</small></div></div>
      </section>

      <section className="workspace-grid">
        <div className="task-list-panel">
          <div className="panel-heading"><div><p className="eyebrow">TASK MANAGER</p><h2>Recent work</h2></div><Badge variant="outline">{tasks.length} tracked</Badge></div>
          {overview.isLoading ? <div className="empty-state"><Loader2 className="animate-spin" size={20} /> Loading task ledger…</div> : tasks.length === 0 ? <div className="empty-state"><div className="empty-glyph"><Plus size={18} /></div><h3>Start with an outcome</h3><p>Create a task to establish a durable goal, budget, target, plan, evidence chain, and artifact provenance record.</p></div> : <div className="task-rows">{tasks.map(task => <article key={task.id} className="task-row" role="button" tabIndex={0} onClick={() => setSelectedTaskId(task.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelectedTaskId(task.id); }}><div className="task-identity"><div className="task-title-row"><h3>{task.title}</h3><span className={`status-chip ${statusTone[task.status]}`}>{task.status.replaceAll("_", " ")}</span></div><p>{task.goal}</p><div className="task-meta"><span><TerminalSquare size={13} /> {formatTarget(task.executionTarget)}</span><span><TimerReset size={13} /> {task.usedSteps}/{task.maxSteps} steps</span><span><Command size={13} /> {task.usedBudgetCents}/{task.maxBudgetCents}¢</span></div></div><div className="task-actions"><span>{task.currentPhase}</span>{["planning", "queued", "executing", "waiting_approval", "verifying", "recovering"].includes(task.status) ? <Button variant="ghost" size="icon" aria-label={`Cancel ${task.title}`} onClick={event => { event.stopPropagation(); cancel(task.id); }}><CircleAlert size={17} /></Button> : <ChevronRight size={18} />}</div></article>)}</div>}
        </div>

        <aside className="right-rail">
          <section className="rail-panel">
            <div className="panel-heading"><div><p className="eyebrow">TRUST LAYER</p><h2>Safety posture</h2></div><ShieldCheck size={18} className="trust-icon" /></div>
            <div className="safety-list"><div><span className="safety-check">01</span><p><strong>Secret references only</strong><small>Values are injected only at execution time and never returned to the model.</small></p></div><div><span className="safety-check">02</span><p><strong>Independent verification</strong><small>Delegated work remains untrusted until evidence satisfies the task contract.</small></p></div><div><span className="safety-check">03</span><p><strong>Always reachable stop</strong><small>The kill switch cancels active control-plane tasks at any point.</small></p></div></div>
          </section>
          <section className="rail-panel alert-panel">
            <div className="panel-heading"><div><p className="eyebrow">OWNER SIGNALS</p><h2>Alert channels</h2></div><Clock3 size={18} /></div>
            <ul><li><span />Approval requests</li><li><span />Budget limits</li><li><span />Unrecoverable failures</li><li><span />Verified artifacts</li></ul>
            <p>All operational alerts route to the platform owner—not generic users.</p>
          </section>
          <section className="rail-panel artifact-panel"><FileArchive size={18} /><div><strong>Artifact provenance</strong><p>Every stored output is paired with its source capability, checksum, model context, and immutable task record.</p></div></section>
        </aside>
      </section>
      {selectedTaskId ? <TaskInspector taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} /> : null}
    </div>
  );
}
