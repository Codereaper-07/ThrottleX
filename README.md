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
