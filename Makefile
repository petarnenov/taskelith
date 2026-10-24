# Single definition of the repository checks: the pre-push gate and CI `verify`.
NODE_PIN := $(shell cat .nvmrc)
NPM_PIN := $(shell sed -n 's/.*npm install --global npm@\([0-9.]*\) --ignore-scripts.*/\1/p' .github/workflows/release.yml | head -n 1)

SPECKIT_IMAGE := taskelith-speckit:1.2.3
SPECKIT_BASE := python@sha256:d98cc29d3266e535dd9da1099688d9cb3ca4753813571e071763d17725460962
SPECKIT_CAPTURE := docs/qualification/speckit-1.2.3
UV_PIN := 0.13.5

.PHONY: verify verify-checks toolchain hooks doctor setup speckit-image speckit-capture speckit-lock contract-compatibility

# Uses the .nvmrc Node.js when nvm has it, so no 'nvm use' is needed first.
verify:
	@NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use $(MAKE) --no-print-directory verify-checks

verify-checks: toolchain
	npm test
	$(MAKE) contract-compatibility
	npm run verify:dependencies
	npm run openspec -- validate --all --strict --no-interactive
	npm run verify:archive
	npm run verify:package

toolchain:
	@node_version="$$(node -v 2>/dev/null || echo 'none')"; \
	if [ "$$node_version" != "v$(NODE_PIN)" ]; then \
		echo "make verify: Node $$node_version does not match .nvmrc (v$(NODE_PIN)). With nvm, run make setup to install Node.js $(NODE_PIN); without nvm, install Node.js $(NODE_PIN) yourself." >&2; \
		exit 1; \
	fi
	@npm_version="$$(npm -v)"; \
	if [ "$$npm_version" != "$(NPM_PIN)" ]; then \
		echo "make verify: npm $$npm_version does not match the CI pin ($(NPM_PIN)). Run make setup." >&2; \
		exit 1; \
	fi

hooks:
	git config core.hooksPath .githooks

# Fails on an undeclared breaking contract change since the origin/dev merge
# base; runs oasdiff as its digest-pinned container, so it needs Docker.
contract-compatibility:
	node --experimental-strip-types scripts/check-contract-compatibility.ts

# SpecKit runs only in its digest-pinned container (G1 decision D5); see
# docs/qualification/speckit.md.
speckit-image:
	docker build --quiet --build-arg BASE=$(SPECKIT_BASE) --tag $(SPECKIT_IMAGE) tools/speckit

speckit-capture: speckit-image
	rm -rf $(SPECKIT_CAPTURE).tmp
	mkdir -p $(SPECKIT_CAPTURE).tmp
	docker run --rm --network none --user "$$(id -u):$$(id -g)" --env HOME=/tmp \
		--volume "$(CURDIR)/tools/speckit:/tools:ro" --volume "$(CURDIR)/$(SPECKIT_CAPTURE).tmp:/out" \
		$(SPECKIT_IMAGE) bash /tools/capture.sh || { rm -rf $(SPECKIT_CAPTURE).tmp; exit 1; }
	rm -rf $(SPECKIT_CAPTURE)
	mv $(SPECKIT_CAPTURE).tmp $(SPECKIT_CAPTURE)

speckit-lock:
	docker run --rm --user "$$(id -u):$$(id -g)" --env HOME=/tmp --volume "$(CURDIR)/tools/speckit:/work" --workdir /work $(SPECKIT_BASE) sh -c \
		'pip install --quiet --target /tmp/uv uv==$(UV_PIN) && /tmp/uv/bin/uv pip compile --quiet --generate-hashes \
		--python-version 3.13 --python-platform x86_64-unknown-linux-gnu --no-header --output-file requirements.txt requirements.in'

# Checks that this clone can build and verify; changes nothing.
# Uses the .nvmrc Node.js when nvm has it.
doctor:
	@NODE_PIN=$(NODE_PIN) NPM_PIN=$(NPM_PIN) bash scripts/with-pinned-node.sh use bash scripts/run-node-script.sh scripts/doctor.ts

# Installs what is missing: the .nvmrc Node.js (as nvm's default), the npm
# pin, the locked dependencies, and the pre-push hook.
setup:
	@NODE_PIN=$(NODE_PIN) NPM_PIN=$(NPM_PIN) bash scripts/with-pinned-node.sh install bash scripts/run-node-script.sh scripts/setup.ts
