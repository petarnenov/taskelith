# Single definition of the repository checks: the pre-push gate and CI `verify`.
NODE_PIN := $(shell cat .nvmrc)
NPM_PIN := $(shell sed -n 's/.*npm install --global npm@\([0-9.]*\) --ignore-scripts.*/\1/p' .github/workflows/release.yml | head -n 1)

# Compose projects are named per worktree, so parallel worktrees never share
# services; make verify and manual use get separate projects.
SERVICES_ID := $(shell printf '%s' '$(CURDIR)' | cksum | cut -d ' ' -f 1)
VERIFY_SERVICES := taskelith-$(SERVICES_ID)-verify
DEV_SERVICES := taskelith-$(SERVICES_ID)-dev

LINUX_CGROUP_IMAGE := taskelith-linux-cgroup:test
LINUX_CGROUP_BASE := ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac
NODE_LINUX_X64_SHA256 := eb6728e77c576a35162c122c45ccadf224d89ff00abc8dae46cc2897c6002d7c

SPECKIT_IMAGE := taskelith-speckit:1.2.3
SPECKIT_BASE := python@sha256:d98cc29d3266e535dd9da1099688d9cb3ca4753813571e071763d17725460962
SPECKIT_CAPTURE := docs/qualification/speckit-1.2.3
UV_PIN := 0.13.5

.PHONY: verify verify-checks toolchain hooks dependency-inventory doctor setup speckit-image speckit-capture speckit-lock contract-compatibility \
	test services-up services-down verify-linux-cgroup

# Uses the .nvmrc Node.js when nvm has it, so no 'nvm use' is needed first.
verify:
	@NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use $(MAKE) --no-print-directory verify-checks

verify-checks: toolchain
	npm run verify:comments
	$(MAKE) --no-print-directory test
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
	git config merge.dependency-inventory.driver true

# Regenerates docs/dependencies, for example after a merge left it stale; it
# reinstalls first, because the inventory reads the installed packages.
dependency-inventory:
	@NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use sh -c 'npm ci --ignore-scripts && npm run inventory:dependencies'

# Runs npm test with the .nvmrc Node.js against its own services, which stop
# also when tests fail; fails closed without Docker.
test:
	@NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use bash scripts/services.sh run $(VERIFY_SERVICES) npm test

# Starts PostgreSQL, NATS, and Toxiproxy for manual integration test runs
# and prints the URLs to export.
services-up:
	@bash scripts/services.sh up $(DEV_SERVICES)

# Stops the services of services-up and discards their data.
services-down:
	@bash scripts/services.sh down $(DEV_SERVICES)

# Fails on an undeclared breaking contract change since the origin/dev merge
# base; runs oasdiff as its digest-pinned container, so it needs Docker.
contract-compatibility:
	node --experimental-strip-types scripts/check-contract-compatibility.ts

# Opt-in privileged cgroup v2 tests of the worker supervisor; kept out of
# make verify, which stays unprivileged. x86_64 Docker hosts only.
verify-linux-cgroup:
	@if [ "$$(docker info --format '{{.Architecture}}')" != "x86_64" ]; then \
		echo "make verify-linux-cgroup: needs an x86_64 Docker host; the image pins the linux-x64 Node.js." >&2; \
		exit 1; \
	fi
	@NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use npm run build
	docker build --quiet --build-arg BASE=$(LINUX_CGROUP_BASE) --build-arg NODE_VERSION=$(NODE_PIN) \
		--build-arg NODE_SHA256=$(NODE_LINUX_X64_SHA256) --tag $(LINUX_CGROUP_IMAGE) tools/linux-cgroup
	docker run --rm --privileged --cgroupns=private --network none --volume "$(CURDIR):/repo:ro" $(LINUX_CGROUP_IMAGE)

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
