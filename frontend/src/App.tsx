import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { AppShell } from "./components/AppShell";
import { ProjectProvider, useProject } from "./components/ProjectContext";
import { TourProvider } from "./components/Tour";
import { EmptyState, Loading } from "./components/ui";
import { accessFor, landingPath, useAuth } from "./lib/auth";
import { Link, matchPath, navigate, useLocation } from "./lib/router";
import { AskPage } from "./pages/Ask";
import { DocQAPage } from "./pages/DocQA";
import { DocsPage } from "./pages/Docs";
import { FilesPage } from "./pages/Files";
import { LandingPage } from "./pages/Landing";
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from "./pages/Login";
import { ModernizePage } from "./pages/Modernize";
import { ProjectOverviewPage } from "./pages/ProjectOverview";
import { ProjectsPage } from "./pages/Projects";
import { RulesPage } from "./pages/Rules";
import { SettingsPage } from "./pages/Settings";

// Graph-heavy views load the layout engine on demand to keep first load fast.
const GraphPage = lazy(() => import("./pages/Graph").then((m) => ({ default: m.GraphPage })));
const ImpactPage = lazy(() => import("./pages/Impact").then((m) => ({ default: m.ImpactPage })));
const LineagePage = lazy(() => import("./pages/Lineage").then((m) => ({ default: m.LineagePage })));

const PROJECT_ROUTES: Record<string, () => ReactNode> = {
  "": () => <ProjectOverviewPage />,
  ask: () => <AskPage />,
  graph: () => <GraphPage />,
  impact: () => <ImpactPage />,
  rules: () => <RulesPage />,
  lineage: () => <LineagePage />,
  docs: () => <DocsPage />,
  modernize: () => <ModernizePage />,
  files: () => <FilesPage />,
};

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading && !user) navigate("/login", true);
  }, [loading, user]);
  if (loading || !user) return <Loading label="Checking your session" />;
  return <TourProvider>{children}</TourProvider>;
}

/** Keeps a section out of reach of sign-in roles that may not open it, redirecting to one they can. */
function RequireAccess({ need, children }: { need: "applications" | "docqa"; children: ReactNode }) {
  const { signinRole } = useAuth();
  const allowed = accessFor(signinRole)[need];
  useEffect(() => {
    if (!allowed) navigate(landingPath(signinRole), true);
  }, [allowed, signinRole]);
  if (!allowed) return <Loading label="Redirecting" />;
  return <>{children}</>;
}

/** Waits for the project; pages other than Overview and Files need a finished analysis. */
function ProjectGate({ page }: { page: string }) {
  const { project, error } = useProject();
  if (error) return <AppShell><EmptyState title="Project not available" action={<Link className="btn" to="/projects">Back to projects</Link>}>{error}</EmptyState></AppShell>;
  if (!project) return <AppShell><Loading /></AppShell>;
  if (page !== "" && page !== "files" && project.status !== "ready") {
    return (
      <AppShell>
        <EmptyState title="Results are not ready yet" action={<Link className="btn btn-primary" to={`/projects/${project.id}`}>Go to the project dashboard</Link>}>
          This view needs a completed analysis. Current status: {project.status}.
        </EmptyState>
      </AppShell>
    );
  }
  return <Suspense fallback={<AppShell><Loading /></AppShell>}>{PROJECT_ROUTES[page]()}</Suspense>;
}

export function App() {
  const { path } = useLocation();

  if (path === "/") return <LandingPage />;
  if (path === "/login") return <LoginPage />;
  if (path === "/signup") return <SignupPage />;
  if (path === "/forgot-password") return <ForgotPasswordPage />;
  if (path === "/reset-password") return <ResetPasswordPage />;
  if (path === "/projects") return <RequireAuth><RequireAccess need="applications"><ProjectsPage /></RequireAccess></RequireAuth>;
  if (path === "/doc-qa") return <RequireAuth><RequireAccess need="docqa"><DocQAPage /></RequireAccess></RequireAuth>;
  if (path === "/settings") return <RequireAuth><SettingsPage /></RequireAuth>;

  const m = matchPath("/projects/:id", path) ?? matchPath("/projects/:id/:page", path);
  if (m && /^\d+$/.test(m.id) && (m.page === undefined || m.page in PROJECT_ROUTES)) {
    const page = m.page ?? "";
    return (
      <RequireAuth>
        <RequireAccess need="applications">
          <ProjectProvider projectId={Number(m.id)} key={m.id}>
            <ProjectGate page={page} />
          </ProjectProvider>
        </RequireAccess>
      </RequireAuth>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <EmptyState title="Page not found" action={<Link className="btn btn-primary" to="/">Go to the home page</Link>}>
        The address {path} does not exist.
      </EmptyState>
    </div>
  );
}
