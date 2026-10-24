# Single definition of the repository checks: the local pre-push gate and the GitHub `verify` job.
NODE_PIN := $(shell cat .nvmrc)
NPM_PIN := $(shell sed -n 's/.*npm install --global npm@\([0-9.]*\) --ignore-scripts.*/\1/p' .github/workflows/release.yml | head -n 1)

.PHONY: verify toolchain hooks

verify: toolchain
	npm test
	npm run verify:dependencies
	npm run openspec -- validate --all --strict --no-interactive
	npm run verify:package

toolchain:
	@node_version="$$(node -v)"; \
	if [ "$$node_version" != "v$(NODE_PIN)" ]; then \
		echo "make verify: Node $$node_version does not match .nvmrc (v$(NODE_PIN)). Run 'nvm use' first." >&2; \
		exit 1; \
	fi
	@npm_version="$$(npm -v)"; \
	if [ "$$npm_version" != "$(NPM_PIN)" ]; then \
		echo "make verify: npm $$npm_version does not match the CI pin ($(NPM_PIN)). Run 'npm install --global npm@$(NPM_PIN) --ignore-scripts'." >&2; \
		exit 1; \
	fi

hooks:
	git config core.hooksPath .githooks
