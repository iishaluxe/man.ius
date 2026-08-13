import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { Activity, Boxes, CircleGauge, Command, LockKeyhole, ShieldAlert, Sparkles, Workflow } from "lucide-react";
import { toast } from "sonner";
import { useRef, useState } from "react";

const navItems = [
  { icon: CircleGauge, label: "Control plane", active: true },
  { icon: Workflow, label: "Task runs" },
  { icon: Activity, label: "Observability" },
  { icon: ShieldAlert, label: "Approvals" },
  { icon: Boxes, label: "Execution targets" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const isMobile = useIsMobile();
  const [isStopping, setIsStopping] = useState(false);
  const [isLoginStarting, setIsLoginStarting] = useState(false);
  const loginInFlight = useRef(false);
  const killAll = trpc.agent.killAll.useMutation();

  const stopEverything = async () => {
    setIsStopping(true);
    try {
      const result = await killAll.mutateAsync();
      toast.success(result.cancelled ? `${result.cancelled} active task${result.cancelled === 1 ? "" : "s"} cancelled.` : "No active task required cancellation.");
    } catch {
      toast.error("The kill switch could not reach the control plane.");
    } finally {
      setIsStopping(false);
    }
  };

  const beginLogin = () => {
    if (loginInFlight.current) return;
    loginInFlight.current = true;
    setIsLoginStarting(true);
    startLogin();
  };

  if (loading) return <div className="min-h-screen bg-[#080a0f]" />;

  if (!user) {
    return (
      <main className="auth-gate">
        <div className="auth-grid" />
        <section className="auth-card">
          <div className="brand-mark brand-mark-large"><Sparkles size={18} /></div>
          <p className="eyebrow">Aegis Computer</p>
          <h1>Controlled autonomy, built for consequential work.</h1>
          <p>Sign in to orchestrate tasks across isolated computers with verification, policy controls, and a permanent kill switch.</p>
          <Button onClick={beginLogin} disabled={isLoginStarting} className="auth-button">{isLoginStarting ? "Opening secure sign-in…" : "Enter control plane"}</Button>
          <div className="auth-footer"><LockKeyhole size={14} /> Identity, task state, and secret references remain protected.</div>
        </section>
      </main>
    );
  }

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="aegis-sidebar">
        <SidebarHeader className="aegis-sidebar-header">
          <div className="brand-lockup">
            <div className="brand-mark"><Sparkles size={15} /></div>
            <div className="brand-copy"><span>Aegis</span><small>COMPUTER</small></div>
          </div>
        </SidebarHeader>
        <SidebarContent className="aegis-sidebar-content">
          <p className="sidebar-kicker">ORCHESTRATION</p>
          <SidebarMenu className="aegis-menu">
            {navItems.map(item => (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton isActive={item.active} tooltip={item.label} className="aegis-menu-button" onClick={() => !item.active && toast.info(`${item.label} is being assembled in the next workspace pass.`)}>
                  <item.icon size={16} />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="aegis-sidebar-footer">
          <Button variant="outline" className="kill-button" disabled={isStopping || killAll.isPending} onClick={stopEverything}>
            <Command size={15} /> {isStopping ? "Stopping…" : "Kill switch"}
          </Button>
          <div className="operator-card">
            <Avatar className="operator-avatar"><AvatarFallback>{user.name?.slice(0, 1).toUpperCase() || "A"}</AvatarFallback></Avatar>
            <div className="operator-copy"><span>{user.name || "Operator"}</span><small>Owner console</small></div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="aegis-inset">
        {isMobile ? <header className="mobile-header"><SidebarTrigger /><span>Aegis Computer</span><Button variant="outline" size="sm" className="kill-button" onClick={stopEverything}><Command size={14} /></Button></header> : null}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
