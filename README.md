# ThrottleX

ThrottleX is a production-ready distributed API rate limiting service.

## Docker

Before starting the stack, copy the example environment file and set the Grafana admin credentials (required — see [Monitoring security](#monitoring-security) below):

```bash
cp .env.example .env
# edit .env and set GF_SECURITY_ADMIN_USER / GF_SECURITY_ADMIN_PASSWORD
```

Start the app, Redis, and the Nginx reverse proxy together:

```bash
docker compose up --build
```

Once running:

- Application: http://localhost:8080
- Health: http://localhost:8080/health
- Limited: http://localhost:8080/limited

`/metrics` is intentionally **not** reachable at `http://localhost:8080/metrics` — see below.

## Monitoring

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001

### Monitoring security

**`/metrics`** is a Prometheus scrape target, not a public endpoint — it can reveal internal traffic volume and error-rate details. It's blocked at the Nginx layer (`docker/nginx.conf`, `location /metrics { deny all; return 403; }`), so external requests through Nginx (port `8080`) get a `403`. This doesn't affect scraping: Prometheus reaches the app directly over the internal Docker network (`app:3000`, see `prometheus/prometheus.yml`) and never goes through Nginx, so it's unaffected by this restriction.

**Grafana** no longer ships with default `admin`/`admin` credentials. The admin username/password are supplied via `GF_SECURITY_ADMIN_USER` and `GF_SECURITY_ADMIN_PASSWORD` in `.env` (see `.env.example`), passed into the `grafana` service through `docker-compose.yml`. If these aren't set, `docker compose up` fails fast with an explicit error instead of silently falling back to a default password. `.env` is gitignored — never commit real credentials.

For public, read-only access to dashboards, Grafana's **anonymous access** feature is enabled and pinned to the `Viewer` organization role (`GF_AUTH_ANONYMOUS_ENABLED=true`, `GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer` in `docker-compose.yml`). This means:

- Anyone who can reach `http://localhost:3001` sees the auto-provisioned **ThrottleX Overview** dashboard immediately, with no login required.
- The `Viewer` role structurally cannot edit, save, or create dashboards, or view/change data source configuration — editing still requires signing in with the admin credentials above.
- The existing auto-provisioned datasource and dashboard (`grafana/provisioning/`) are unchanged and continue to work exactly as before for the admin account.

This was chosen over Grafana's **Public Dashboards** ("Externally shared dashboards") feature because, while that feature is available in Grafana OSS, enabling it is a manual, per-dashboard action performed via the Grafana UI/API *after* the instance is already running (there's no environment-variable or provisioning-file equivalent) — anonymous `Viewer` access achieves the same "public, read-only, no editing" outcome declaratively, with no manual post-deploy step and no extra moving parts. If you'd prefer a shareable link to a single dashboard instead of making the whole Grafana instance publicly viewable, you can still do this manually: log in as admin, open the dashboard, **Share → Share externally → Anyone with the link**.

> **Migrating an existing deployment?** `GF_SECURITY_ADMIN_USER`/`GF_SECURITY_ADMIN_PASSWORD` are only applied by Grafana the *first time* it initializes its database — on a fresh `grafana-data` volume, both take effect immediately. If Grafana has already run before (an existing `grafana-data` volume with the old default `admin`/`admin` credentials), setting these variables alone will **not** retroactively change the already-created account. Rotate it once with:
> ```bash
> docker compose exec grafana grafana cli admin reset-admin-password '<value of GF_SECURITY_ADMIN_PASSWORD from your .env>'
> ```
> Note this resets the *password* for the existing admin account only — the *username* stays whatever it already was (typically `admin`) unless you also rename it via Server Admin → Users in the Grafana UI, or start from a fresh volume.
