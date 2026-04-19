ENV ?= .env
COMPOSE = docker compose -f infra/docker/docker-compose.yml --env-file $(ENV)

up:        ; $(COMPOSE) up -d
down:      ; $(COMPOSE) down
logs:      ; $(COMPOSE) logs -f --tail=200
ps:        ; $(COMPOSE) ps
reset:     ; $(COMPOSE) down -v && $(COMPOSE) up -d
psql:      ; $(COMPOSE) exec postgres psql -U $$(grep '^POSTGRES_USER=' $(ENV) | cut -d= -f2) -d $$(grep '^POSTGRES_DB=' $(ENV) | cut -d= -f2)
redis-cli: ; $(COMPOSE) exec redis redis-cli -a $$(grep '^REDIS_PASSWORD=' $(ENV) | cut -d= -f2)
