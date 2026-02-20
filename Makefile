.PHONY: setup test test-e2e lint check localstack localstack-stop

setup:
	npm install --legacy-peer-deps

test:
	npm run check

test-e2e:
	cd backend && npm run test:e2e

lint:
	npm run lint && npm run lint:backend && npm run lint:ml

localstack:
	docker compose up -d
	@echo "Waiting for LocalStack..."
	@timeout 60 bash -c 'until curl -s http://localhost:4566/_localstack/health | grep -qE "\"(running|available)\""; do sleep 1; done'
	@echo "LocalStack ready at http://localhost:4566"

localstack-stop:
	docker compose down
