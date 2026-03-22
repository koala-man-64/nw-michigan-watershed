# Drift Report

## Summary
- Mode: `audit`
- Generated at: `2026-03-22T14:15:57.899972+00:00`
- Baseline: `main` (default main)
- Compare: `main` -> `HEAD`
- Drift score: **45.0** (threshold fail: `35.0`)
- Result: **FAIL**

## Top Drift Hotspots
| File/Module | Findings | Score |
|---|---:|---:|
| `(command-output)` | 1 | 15.0 |
| `.github/workflows/build-deploy-nwmiws-swa-dev.yml` | 1 | 7.5 |
| `.github/workflows/build-deploy-nwmiws-swa-prod.yml` | 1 | 7.5 |
| `.codex/skills/business-partner-agent/agents/openai.yaml` | 1 | 7.5 |
| `.codedrift.yml` | 1 | 7.5 |

## Category Findings
### Config/Infra Drift
- **[HIGH] Configuration/infra files changed** (confidence 0.8)
  - Expected vs Observed: Pipeline and infra changes should preserve or strengthen quality/safety gates. | CI/deploy/configuration files were modified.
  - Files: `.codex/skills/business-partner-agent/agents/openai.yaml`, `.github/workflows/build-deploy-nwmiws-swa-dev.yml`, `.github/workflows/build-deploy-nwmiws-swa-prod.yml`
  - Evidence:
    - .github/workflows/build-deploy-nwmiws-swa-dev.yml: -      - name: Lint Client
    - .github/workflows/build-deploy-nwmiws-swa-dev.yml: -        run: npm run lint
    - .github/workflows/build-deploy-nwmiws-swa-dev.yml: -      - name: Lint API
    - .github/workflows/build-deploy-nwmiws-swa-dev.yml: -        run: npm run lint
    - .github/workflows/build-deploy-nwmiws-swa-dev.yml: -      - name: Test Client
    - .github/workflows/build-deploy-nwmiws-swa-dev.yml: -        run: npm test -- --watchAll=false
  - Attribution:
    - `.github/workflows/build-deploy-nwmiws-swa-dev.yml`
      - d6594016|koala-man-64|2026-03-21|Restrict prod workflow to main
    - `.github/workflows/build-deploy-nwmiws-swa-prod.yml`
      - d6594016|koala-man-64|2026-03-21|Restrict prod workflow to main
  - Recommendation: Review config deltas with release/security owners and validate gates remain enforced.
  - Verification:
    - `Run CI pipeline in branch`
    - `Validate deploy plans and policy checks`
- **[MEDIUM] Recent config churn detected** (confidence 0.6)
  - Expected vs Observed: Configuration should remain stable and coordinated across contributors. | 12 recent commits touched config/infra files in lookback window.
  - Evidence:
    - Lookback config-touching commits: 12
  - Recommendation: Consolidate config ownership, batch related changes, and document rationale in PRs.
  - Verification:
    - `Inspect recent config PRs`
    - `Audit gate consistency across workflows`
- **[LOW] Configuration loading issues** (confidence 1.0)
  - Expected vs Observed: A valid `.codedrift.yml` should be available and parse cleanly. | Configuration was missing or partially invalid.
  - Files: `.codedrift.yml`
  - Evidence:
    - Configuration file missing: .codedrift.yml. Using built-in defaults.
  - Recommendation: Create or fix `.codedrift.yml` using the sample in this skill.
  - Verification:
    - `Validate YAML syntax`
    - `Re-run drift audit`

## Suggested Remediation Plan
1. **[HIGH] Configuration/infra files changed** (Config/Infra Drift)
   - What to change: Review config deltas with release/security owners and validate gates remain enforced.
   - Why: Expected: Pipeline and infra changes should preserve or strengthen quality/safety gates. Observed: CI/deploy/configuration files were modified.
   - Patch approach: Apply deterministic fixes first (formatter/lint/rule-based edits), then targeted manual refactors.
   - Risk: medium
   - Verification:
     - `Run CI pipeline in branch`
     - `Validate deploy plans and policy checks`
2. **[MEDIUM] Recent config churn detected** (Config/Infra Drift)
   - What to change: Consolidate config ownership, batch related changes, and document rationale in PRs.
   - Why: Expected: Configuration should remain stable and coordinated across contributors. Observed: 12 recent commits touched config/infra files in lookback window.
   - Patch approach: Apply deterministic fixes first (formatter/lint/rule-based edits), then targeted manual refactors.
   - Risk: medium
   - Verification:
     - `Inspect recent config PRs`
     - `Audit gate consistency across workflows`
3. **[LOW] Configuration loading issues** (Config/Infra Drift)
   - What to change: Create or fix `.codedrift.yml` using the sample in this skill.
   - Why: Expected: A valid `.codedrift.yml` should be available and parse cleanly. Observed: Configuration was missing or partially invalid.
   - Patch approach: Apply deterministic fixes first (formatter/lint/rule-based edits), then targeted manual refactors.
   - Risk: low
   - Verification:
     - `Validate YAML syntax`
     - `Re-run drift audit`

## Appendix
### Tool Run Status
- `quality-gates` `<none>` -> **unavailable**
```text
No standards commands configured.
```
