import React, { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { createAdminApi } from "./adminApi";
import type {
  AdminBootstrap,
  AuditEvent,
  CustomerProfile,
  DatasetVersion,
  FeatureFlag,
  ImportDatasetRequest,
  PublishedRelease,
} from "./types";

const adminApi = createAdminApi();

function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-kicker">Platform Admin</span>
          <h1>NWMIWS</h1>
          <p>Customer profile, release control, and audit trail.</p>
        </div>
        <nav className="nav">
          <Link to="/">Dashboard</Link>
          <a href="#customer-profile">Customer profile</a>
          <a href="#feature-flags">Feature flags</a>
          <a href="#dataset-release">Dataset release</a>
          <a href="#audit-events">Audit events</a>
        </nav>
        <div className="sidebar-footer">
          <div>
            <span className="label">Signed in as</span>
            <strong>{user?.email}</strong>
          </div>
          <button type="button" className="ghost-button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">{children}</main>
    </div>
  );
}

function LoginPage() {
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    await signIn();
    setBusy(false);
    navigate("/", { replace: true });
  }

  return (
    <section className="login-page">
      <div className="login-panel">
        <span className="brand-kicker">Entra-ready access</span>
        <h1>Operator console for a packaged customer deployment.</h1>
        <p>
          This shell is wired for Microsoft Entra auth and targets the platform API,
          with a mock mode reserved for tests and offline development.
        </p>
        <button type="button" className="primary-button" onClick={handleSignIn} disabled={busy}>
          {busy || status === "authenticated" ? "Signing in..." : "Sign in with Microsoft Entra"}
        </button>
      </div>
    </section>
  );
}

function Dashboard() {
  const [bootstrap, setBootstrap] = useState<AdminBootstrap | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [datasetVersions, setDatasetVersions] = useState<DatasetVersion[]>([]);
  const [currentRelease, setCurrentRelease] = useState<PublishedRelease | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [importRequest, setImportRequest] = useState<ImportDatasetRequest>({
    datasetId: "dataset-2026-q2",
    sourceFiles: "NWMIWS_Site_Data_testing_varied.csv, locations.csv, info.csv",
    notes: "Quarterly refresh staged through the admin shell.",
  });

  useEffect(() => {
    let mounted = true;
    adminApi.getBootstrap().then((next) => {
      if (!mounted) return;
      setBootstrap(next);
      setCustomerProfile(next.customerProfile);
      setFeatureFlags(next.featureFlags);
      setDatasetVersions(next.datasetVersions);
      setCurrentRelease(next.currentRelease);
      setAuditEvents(next.auditEvents);
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function refreshAudit() {
    setAuditEvents(await adminApi.getAuditEvents());
  }

  async function handleSaveProfile() {
    if (!customerProfile) return;
    setBusy(true);
    setMessage("");
    const saved = await adminApi.updateCustomerProfile(customerProfile);
    setCustomerProfile(saved);
    await refreshAudit();
    setMessage("Customer profile saved.");
    setBusy(false);
  }

  async function handleToggleFlag(flag: FeatureFlag) {
    setBusy(true);
    const updated = await adminApi.updateFeatureFlag(flag.key, !flag.enabled);
    setFeatureFlags((prev) => prev.map((item) => (item.key === updated.key ? updated : item)));
    await refreshAudit();
    setBusy(false);
  }

  async function handleImport() {
    setBusy(true);
    const nextVersion = await adminApi.importDataset(importRequest);
    setDatasetVersions((prev) => [nextVersion, ...prev]);
    await refreshAudit();
    setMessage(`Imported dataset version ${nextVersion.versionId}.`);
    setBusy(false);
  }

  async function handleValidate(versionId: string) {
    setBusy(true);
    const nextVersion = await adminApi.validateDataset(versionId);
    setDatasetVersions((prev) => prev.map((item) => (item.versionId === versionId ? nextVersion : item)));
    await refreshAudit();
    setMessage(`Validated ${versionId}.`);
    setBusy(false);
  }

  async function handlePublish(versionId: string) {
    setBusy(true);
    const release = await adminApi.publishDataset(versionId);
    setDatasetVersions((prev) =>
      prev.map((item) => (item.versionId === versionId ? { ...item, status: "published" } : item))
    );
    setCurrentRelease(release);
    await refreshAudit();
    setMessage(`Published release ${release.releaseId}.`);
    setBusy(false);
  }

  async function handleRollback() {
    if (!currentRelease) return;
    setBusy(true);
    const release = await adminApi.rollbackRelease(currentRelease.releaseId);
    setCurrentRelease(release);
    await refreshAudit();
    setMessage(`Rolled back from ${currentRelease.releaseId}.`);
    setBusy(false);
  }

  const latestDraft = useMemo(
    () =>
      datasetVersions.find((version) => version.status === "draft" || version.status === "validated") ??
      null,
    [datasetVersions]
  );

  return (
    <AppShell>
      <section className="hero">
        <div>
          <span className="brand-kicker">Customer-pack operations</span>
          <h2>Release control for a single-tenant watershed deployment.</h2>
          <p>
            Bootstrap: {bootstrap?.config.apiBaseUrl ?? "/api"} | Auth mode:{" "}
            {bootstrap?.config.authMode ?? "mock"} | Active release: {currentRelease?.releaseId}
          </p>
        </div>
        <div className="status-card">
          <span className="label">System message</span>
          <strong>{message || "Ready for customer profile and dataset actions."}</strong>
        </div>
      </section>

      <section className="grid">
        <article className="panel" id="customer-profile">
          <header>
            <div>
              <span className="panel-kicker">Customer profile</span>
              <h3>Branding and support metadata</h3>
            </div>
            <button type="button" className="primary-button" onClick={handleSaveProfile} disabled={busy}>
              Save profile
            </button>
          </header>
          <div className="form-grid">
            {customerProfile &&
              ([
                ["customerName", "Customer name"],
                ["organizationName", "Organization"],
                ["supportContactName", "Support contact"],
                ["supportEmail", "Support email"],
                ["supportPhone", "Support phone"],
                ["legalLink", "Legal link"],
                ["defaultPublishedDatasetId", "Default dataset"],
              ] as const).map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    value={customerProfile[key]}
                    onChange={(event) =>
                      setCustomerProfile((current) =>
                        current ? { ...current, [key]: event.target.value } : current
                      )
                    }
                  />
                </label>
              ))}
          </div>
        </article>

        <article className="panel" id="feature-flags">
          <header>
            <div>
              <span className="panel-kicker">Feature flags</span>
              <h3>Commercial controls</h3>
            </div>
          </header>
          <div className="flag-list">
            {featureFlags.map((flag) => (
              <button
                key={flag.key}
                type="button"
                className={`flag-row ${flag.enabled ? "is-on" : ""}`}
                onClick={() => handleToggleFlag(flag)}
                disabled={busy}
              >
                <span>
                  <strong>{flag.label}</strong>
                  <small>{flag.description}</small>
                </span>
                <em>{flag.enabled ? "On" : "Off"}</em>
              </button>
            ))}
          </div>
        </article>

        <article className="panel" id="dataset-release">
          <header>
            <div>
              <span className="panel-kicker">Dataset release</span>
              <h3>Import, validate, publish, rollback</h3>
            </div>
          </header>
          <div className="form-grid">
            <label>
              <span>Dataset ID</span>
              <input
                value={importRequest.datasetId}
                onChange={(event) =>
                  setImportRequest((current) => ({ ...current, datasetId: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Source files</span>
              <input
                value={importRequest.sourceFiles}
                onChange={(event) =>
                  setImportRequest((current) => ({ ...current, sourceFiles: event.target.value }))
                }
              />
            </label>
            <label className="full-width">
              <span>Notes</span>
              <textarea
                value={importRequest.notes}
                onChange={(event) =>
                  setImportRequest((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </label>
          </div>
          <div className="action-row">
            <button type="button" className="ghost-button" onClick={handleImport} disabled={busy}>
              Import dataset
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => latestDraft && handleValidate(latestDraft.versionId)}
              disabled={busy || !latestDraft}
            >
              Validate latest draft
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => latestDraft && handlePublish(latestDraft.versionId)}
              disabled={busy || !latestDraft}
            >
              Publish latest draft
            </button>
            <button type="button" className="ghost-button" onClick={handleRollback} disabled={busy}>
              Roll back current release
            </button>
          </div>
          <div className="dataset-list">
            {datasetVersions.map((version) => (
              <div key={version.versionId} className="dataset-row">
                <div>
                  <strong>{version.versionId}</strong>
                  <small>
                    {version.datasetId} | {version.status} | {version.sourceFiles.length} files
                  </small>
                </div>
                <div className="row-actions">
                  <button type="button" onClick={() => handleValidate(version.versionId)} disabled={busy}>
                    Validate
                  </button>
                  <button type="button" onClick={() => handlePublish(version.versionId)} disabled={busy}>
                    Publish
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel" id="audit-events">
          <header>
            <div>
              <span className="panel-kicker">Audit events</span>
              <h3>Operator trace</h3>
            </div>
          </header>
          <div className="audit-list">
            {auditEvents.map((event) => (
              <div key={event.eventId} className="audit-row">
                <strong>{event.action}</strong>
                <span>{event.actor}</span>
                <small>{event.resource}</small>
                <p>{event.details}</p>
                <em>{new Date(event.timestamp).toLocaleString()}</em>
              </div>
            ))}
          </div>
        </article>
      </section>
    </AppShell>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
