# Verification Notes

The public entry route renders the signed-out Aegis Computer access gate with the expected product identity, sign-in action, and security positioning. The protected control-plane dashboard requires a valid session, so task creation, planning, approval, and kill-switch interactions must be exercised after the owner signs in through the preview.

The screenshot service may capture the short authentication loading state before the access gate resolves. Direct inspection confirmed the rendered signed-out experience after the authentication query settled.

For the initial cloud-sandbox adapter, E2B’s official documentation confirms that `E2B_API_KEY` is the expected server-side environment variable and that the JavaScript SDK validates it by creating a sandbox. The credential check will use this bounded creation path and must destroy the validation sandbox immediately after the test.

The current E2B documentation also confirms the JavaScript SDK supports sandbox creation, bounded command execution, filesystem operations, snapshots, network updates, pause, and kill. The cloud adapter can therefore use the SDK as an implementation detail while retaining the application’s provider-neutral execution contract.

For alternative coordinator hosting, Oracle’s official Always Free documentation states that accounts can receive two AMD micro instances and up to 2 Arm OCPUs with 12 GB of memory, subject to capacity and idle-instance reclamation. Oracle warns that Always Free capacity may be unavailable in a home region and that instances deemed idle over a seven-day period can be reclaimed. AWS’s official site could not be opened in the current research browser due to site policy restrictions, so AWS terms will be assessed from its official documentation search result and presented as a non-permanent alternative rather than as the recommended free host.

Google Cloud’s official free-tier page currently lists one e2-micro Compute Engine instance per month in its non-expiring free tier, alongside separate introductory credits for new customers. That instance is adequate only for a very light coordinator and may be more constrained than Oracle’s Arm allocation; Cloud Run is described as a stateless container platform, which is unsuitable by itself for the coordinator’s durable background worker.

Sources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm and https://cloud.google.com/free

The live development preview was inspected again after the checkpoint. The unauthenticated Aegis Computer entry screen renders correctly with its branded sign-in prompt, security statement, and control-plane entry action. The earlier all-dark checkpoint image was a capture timing artifact while authentication state was loading, not a client or server rendering error.

Observed dashboard evidence: the screenshot harness rendered the control-plane dashboard at desktop and mobile widths, showing the kill switch, goal composer, target/model/budget controls, zero-state task ledger, safety posture, alert channels, and artifact provenance panel. The dashboard’s typography, contrast, command hierarchy, and responsive stacking appeared legible in those captured states. An authenticated browser-session walkthrough and a detailed task workspace with persisted plan/event/artifact/checkpoint data have not yet been exercised and remain pending validation.
