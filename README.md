# ThrottleX

ThrottleX is a production-ready distributed API rate limiting service.

## Docker

Start the app, Redis, and the Nginx reverse proxy together:

```bash
docker compose up --build
```

Once running:

- Application: http://localhost:8080
- Health: http://localhost:8080/health
- Metrics: http://localhost:8080/metrics
- Limited: http://localhost:8080/limited

## Monitoring

- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (default login: `admin` / `admin`)

The Prometheus datasource and the ThrottleX dashboard are auto-provisioned on first startup — no manual configuration is required.
