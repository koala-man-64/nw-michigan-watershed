# TLS History Remediation Runbook

Do not run the history rewrite from a dirty working tree. Use a fresh mirror clone and coordinate with collaborators before force-pushing.

## 1. Coordination

1. Freeze merges and notify anyone with an active branch that history will be rewritten.
2. Rotate or revoke the affected certificate and key before or immediately after the force-push.
3. Identify any cached container images, release artifacts, or deployment bundles that may still contain the legacy TLS files.

## 2. Rewrite Procedure

```bash
git clone --mirror https://github.com/koala-man-64/nw-michigan-watershed nw-michigan-watershed.git
cd nw-michigan-watershed.git
git filter-repo \
  --path client/nginx/ssl/server.key \
  --path client/nginx/ssl/server.crt \
  --invert-paths
git log --all -- client/nginx/ssl/server.key client/nginx/ssl/server.crt
git push --force --mirror origin
```

Expected result:

- The final `git log` command prints nothing.
- The force-pushed remote no longer exposes the TLS files in any reachable branch or tag.

## 3. Post-Rewrite Actions

1. Ask collaborators to re-clone or hard-reset their local repos to the rewritten remote history.
2. Purge or invalidate any cached build artifacts that may still include the removed files.
3. Confirm GitHub PRs targeting the old history are recreated or rebased.
4. Re-run the advisory secret scan and confirm only new findings remain.

## 4. Certificate Rotation Checklist

- Revoke the old certificate/key pair anywhere it was trusted or deployed.
- Issue a replacement certificate only if a TLS terminator still needs one. Azure Static Web Apps should terminate TLS at the platform edge.
- Record the rotation date, owner, and affected services in the release notes or incident record.
