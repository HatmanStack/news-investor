.PHONY: setup test test-e2e lint check ministack ministack-stop dev build-admin deploy-admin

setup:
	npm install --legacy-peer-deps

test:
	npm run check

test-e2e:
	cd backend && npm run test:e2e

lint:
	npm run lint && npm run lint:backend && npm run lint:ml

ministack:
	docker compose up -d
	@echo "Waiting for MiniStack..."
	@timeout 60 bash -c 'until curl -s http://localhost:4566/_ministack/health | grep -qE "\"(running|available)\""; do sleep 1; done'
	@echo "MiniStack ready at http://localhost:4566"

ministack-stop:
	docker compose down

dev: setup ministack  ## One-step local development setup
	@echo "Ready. Run 'npm start' to start the Expo dev server."

build-admin:
	cd admin && npm run build

deploy-admin:
	cd admin && npm run deploy
