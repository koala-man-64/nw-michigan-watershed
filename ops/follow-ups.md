# Security Follow-ups

## FE-BUILD-001: Replace `react-scripts` with a maintained frontend build toolchain

- **Why it is tracked:** `npm audit --omit=dev` still reports high-severity issues through the current CRA-era dependency tree.
- **Target outcome:** migrate the client to a maintained build stack, update the GitHub Actions workflows, and remove `react-scripts` from `client/package.json`.
- **Exit criteria:** production build/test commands no longer depend on `react-scripts`, the advisory client audit no longer reports the current CRA transitive findings, and SWA deployment behavior remains unchanged.

## QA-E2E-001: Revisit browser smoke coverage after lower-layer suites stabilize

- **Why it is tracked:** backend pytest, frontend integration tests, and contract coverage now guard the highest-risk paths; adding Playwright/Cypress in the same wave would increase maintenance cost before the new baseline settles.
- **Target outcome:** evaluate one thin browser smoke test only after the current API and React test layers have been stable in CI for multiple release cycles.
- **Exit criteria:** the team agrees the lower-layer suite is reliable, the critical path to smoke-test is explicitly chosen, and any browser automation is added without duplicating existing integration coverage.
