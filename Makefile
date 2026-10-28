# Single definition of the repository checks: the pre-push gate and CI `verify`.
NODE_PIN := $(shell cat .nvmrc)
NPM_PIN := $(shell sed -n 's/.*npm install --global npm@\([0-9.]*\) --ignore-scripts.*/\1/p' .github/workflows/release.yml | head -n 1)

# Compose projects are named per worktree, so parallel worktrees never share
# services; make verify and manual use get separate projects.
SERVICES_ID := $(shell printf '%s' '$(CURDIR)' | cksum | cut -d ' ' -f 1)
VERIFY_SERVICES := taskelith-$(SERVICES_ID)-verify
DEV_SERVICES := taskelith-$(SERVICES_ID)-dev

UBUNTU_BASE := ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac
NODE_LINUX_X64_SHA256 := eb6728e77c576a35162c122c45ccadf224d89ff00abc8dae46cc2897c6002d7c
NODE_LINUX_ARM64_SHA256 := 33c37be234ba8bee041961047b19160f4d7d0f164e8e246f78bdd10feff148b3
LINUX_CGROUP_IMAGE := taskelith-linux-cgroup:test

# The minimal local installation is one Compose project per worktree.
INSTALLATION := taskelith-$(SERVICES_ID)-installation
INSTALLATION_PINS := TASKELITH_UBUNTU_BASE=$(UBUNTU_BASE) TASKELITH_NODE_VERSION=$(NODE_PIN) \
	TASKELITH_NODE_SHA256_AMD64=$(NODE_LINUX_X64_SHA256) TASKELITH_NODE_SHA256_ARM64=$(NODE_LINUX_ARM64_SHA256)

VERIFY_STAMP := node --experimental-strip-types scripts/verify-stamp.ts

SPECKIT_IMAGE := taskelith-speckit:1.2.3
SPECKIT_BASE := python@sha256:d98cc29d3266e535dd9da1099688d9cb3ca4753813571e071763d17725460962
SPECKIT_CAPTURE := docs/qualification/speckit-1.2.3
UV_PIN := 0.13.5

.PHONY: verify verify-stamped verify-checks toolchain hooks dependency-inventory doctor setup speckit-image speckit-capture speckit-lock contract-compatibility findings integrate record record-check \
	test docker-slot services-up services-down verify-linux-cgroup verify-linux-crash-windows verify-linux-g2-scenarios installation-build installation-bootstrap installation-broker-config installation-certificates installation-ca installation-start \
	installation-stop installation-enroll installation-enrollment-token verify-installation verify-worker-image-reproducible installation-smoke qualify-harnesses \
	scenario-fresh-composition scenario-worker-disk-loss scenario-worker-kill \
	scenario-worker-namespace-confinement worker-seccomp-profile linux-test-image linux-test-suites \
	scenario-worker-lifecycle scenario-native-worker-lifecycle native-acceptance

# Uses the .nvmrc Node.js when nvm has it, so no 'nvm use' is needed first.
verify:
	@NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use $(MAKE) --no-print-directory verify-stamped

# Runs the checks of the branch's profile and stamps a clean tree that
# passed them, so that the pre-push hook can reuse the run.
verify-stamped: toolchain
	@profile="$$($(VERIFY_STAMP) profile)" && tree="$$($(VERIFY_STAMP) start)" && \
		$(MAKE) --no-print-directory verify-checks VERIFY_PROFILE="$$profile" && \
		$(VERIFY_STAMP) write "$$profile" "$$tree"

# VERIFY_PROFILE=docs-only skips only the Docker test suites of make test.
verify-checks: toolchain
	npm run verify:comments
	npm run verify:private-keys
	npm run verify:findings
	$(if $(filter docs-only,$(VERIFY_PROFILE)),@echo "make verify: docs-only profile skips make test",$(MAKE) --no-print-directory test)
	$(MAKE) contract-compatibility
	npm run verify:dependencies
	npm run openspec -- validate --all --strict --no-interactive
	npm run verify:links
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

# Review records tool: ARGS is validate, index, reviewers, or effect (the last
# three take --json), or checklist; a usage error prints every option.
findings:
	@set -f; NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use npm run --silent findings -- $(ARGS)

# Runs npm test with the .nvmrc Node.js against its own services, which stop
# also when tests fail; fails closed without Docker. Holds the Docker slot.
test:
	@NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use node --experimental-strip-types scripts/docker-slot.ts run -- \
		bash scripts/services.sh run $(VERIFY_SERVICES) npm test

# Prints who holds the Docker slot of make test and who waits for it.
docker-slot:
	@NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use node --experimental-strip-types scripts/docker-slot.ts status

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

# The test image of the Linux tests, with the Node.js of the Docker host's
# architecture (x86_64 or aarch64).
linux-test-image:
	@case "$$(docker info --format '{{.Architecture}}')" in \
		x86_64|amd64|x86-64) node_arch=x64; node_sha256=$(NODE_LINUX_X64_SHA256) ;; \
		aarch64|arm64) node_arch=arm64; node_sha256=$(NODE_LINUX_ARM64_SHA256) ;; \
		*) echo "make linux-test-image: no pinned Node.js for this Docker host" >&2; exit 1 ;; \
	esac; \
	docker build --quiet --build-arg BASE=$(UBUNTU_BASE) --build-arg NODE_VERSION=$(NODE_PIN) \
		--build-arg NODE_ARCH="$$node_arch" --build-arg NODE_SHA256="$$node_sha256" \
		--tag $(LINUX_CGROUP_IMAGE) tools/linux-cgroup >/dev/null

# Opt-in privileged cgroup v2 tests of the worker supervisor; kept out of
# make verify, which stays unprivileged. PATTERN selects tests by name.
verify-linux-cgroup:
	@NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use npm run build
	@$(MAKE) --no-print-directory linux-test-image
	docker run --rm --privileged --cgroupns=private --network none --volume "$(CURDIR):/repo:ro" $(LINUX_CGROUP_IMAGE) \
		$(if $(PATTERN),--test-name-pattern='$(PATTERN)')

# Opt-in G2 crash windows on Linux (privileged, host network), out of make
# verify; PATTERN selects and SKIP_PATTERN skips tests by name.
verify-linux-crash-windows:
	@NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use npm run build
	@$(MAKE) --no-print-directory linux-test-image
	@NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use bash scripts/services.sh run taskelith-$(SERVICES_ID)-crash-windows \
		bash scripts/linux-crash-windows.sh $(LINUX_CGROUP_IMAGE) $(if $(PATTERN),--test-name-pattern='$(PATTERN)') \
		$(if $(SKIP_PATTERN),--test-skip-pattern='$(SKIP_PATTERN)')

# Opt-in G2 races, stale generations, and partitions through the Linux
# cgroup supervisor (privileged, host network); FILES and PATTERN select.
G2_SCENARIO_FILES := test/g2-cancellation-races.test.ts test/g2-stale-generations.test.ts test/g2-partition.test.ts
verify-linux-g2-scenarios:
	@NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use npm run build
	@$(MAKE) --no-print-directory linux-test-image
	@NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use bash scripts/services.sh run taskelith-$(SERVICES_ID)-g2-scenarios \
		bash scripts/linux-crash-windows.sh $(LINUX_CGROUP_IMAGE) $(if $(PATTERN),--test-name-pattern='$(PATTERN)') \
		-- $(or $(FILES),$(G2_SCENARIO_FILES))

# Opt-in: runs the test files of SUITES in the Linux test image, without
# privileges or network, as an unprivileged user, on a fresh volume.
linux-test-suites:
	@if [ -z "$(SUITES)" ]; then echo "make linux-test-suites: set SUITES to test files" >&2; exit 2; fi
	@NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use npm run build
	@$(MAKE) --no-print-directory linux-test-image
	docker run --rm --network none --user 2000:2000 --volume /tmp --volume "$(CURDIR):/repo:ro" --workdir /repo \
		--entrypoint node $(LINUX_CGROUP_IMAGE) --experimental-strip-types --test \
		$(if $(PATTERN),--test-name-pattern='$(PATTERN)') $(SUITES)

# Minimal local installation (docs/local-installation.md); the targets after
# this build need TASKELITH_POSTGRES_PASSWORD. Builds both images.
installation-build:
	@$(INSTALLATION_PINS) bash scripts/installation.sh build $(INSTALLATION)

# Migrates and initializes once; prints the operator secret only this once.
# Arguments reach the script through the environment, never as shell text.
installation-bootstrap:
	@TASKELITH_ACTOR="$$ACTOR" TASKELITH_REASON="$$REASON" bash scripts/installation.sh bootstrap $(INSTALLATION)

# Installs the broker trust again, for example after a failed bootstrap.
installation-broker-config:
	@bash scripts/installation.sh broker-config $(INSTALLATION)

# Issues the API and NATS server certificates again (397 days, provisional)
# and restarts the running broker and control plane to load them.
installation-certificates:
	@bash scripts/installation.sh certificates $(INSTALLATION)

# Prints the installation's public CA, for a native worker to trust.
installation-ca:
	@bash scripts/installation.sh installation-ca $(INSTALLATION)

installation-start:
	@bash scripts/installation.sh start $(INSTALLATION)

# Stops the containers and keeps their volumes.
installation-stop:
	@bash scripts/installation.sh stop $(INSTALLATION)

# Enrolls the Linux worker container; needs TASKELITH_OPERATOR_TOKEN.
installation-enroll:
	@bash scripts/installation.sh enroll $(INSTALLATION)

# Prints a token for a native worker, for example a macOS one.
installation-enrollment-token:
	@TASKELITH_WORKER_PLATFORM="$$PLATFORM" TASKELITH_WORKER_ARCHITECTURE="$$ARCHITECTURE" \
		TASKELITH_WORKER_HOSTNAME="$$WORKER_HOSTNAME" bash scripts/installation.sh enrollment-token $(INSTALLATION)

# Opt-in image build and bring-up on a throwaway project; kept out of
# make verify, like verify-linux-cgroup.
verify-installation:
	@$(INSTALLATION_PINS) bash scripts/installation.sh verify $(INSTALLATION)-verify

# Opt-in: builds the worker image twice without the build cache and fails
# unless both builds give one image ID; kept out of make verify.
verify-worker-image-reproducible:
	@$(INSTALLATION_PINS) bash scripts/installation.sh check-reproducible $(INSTALLATION)-reproducible

# Opt-in end-to-end smoke on a throwaway project: submit, assign, execute,
# and store the result of a test-only scripted process.
installation-smoke:
	@NODE_PIN=$(NODE_PIN) $(INSTALLATION_PINS) bash scripts/with-pinned-node.sh use bash scripts/installation.sh smoke $(INSTALLATION)-smoke

# Opt-in G2 failure scenarios on throwaway projects (item 24a); each records
# its result in TASKELITH_SCENARIO_RESULTS when set. Builds the harness first.
SCENARIO_RUN := NODE_PIN=$(NODE_PIN) $(INSTALLATION_PINS) bash scripts/with-pinned-node.sh use bash -c \
	'npm run --silent build && bash scripts/installation.sh "$$0" "$$1"'

scenario-fresh-composition:
	@$(SCENARIO_RUN) scenario-fresh-composition $(INSTALLATION)-smoke

scenario-worker-disk-loss:
	@$(SCENARIO_RUN) scenario-worker-disk-loss $(INSTALLATION)-scenario

scenario-worker-kill:
	@$(SCENARIO_RUN) scenario-worker-kill $(INSTALLATION)-scenario

# Opt-in item 25a check of the worker's seccomp profile.
scenario-worker-namespace-confinement:
	@$(SCENARIO_RUN) scenario-worker-namespace-confinement $(INSTALLATION)-scenario

# Opt-in item 25b: install, start, stop, and restart of the Linux worker
# container, and of a native worker on this host against the installation.
scenario-worker-lifecycle:
	@$(SCENARIO_RUN) scenario-worker-lifecycle $(INSTALLATION)-scenario

scenario-native-worker-lifecycle:
	@$(SCENARIO_RUN) scenario-native-worker-lifecycle $(INSTALLATION)-scenario

# Opt-in item 25b: runs the native acceptance proofs of this host's matrix
# entries (ENTRIES: macos, linux) and records each into RESULTS.
native-acceptance:
	@if [ -z "$(RESULTS)" ]; then echo "make native-acceptance: set RESULTS to a results.jsonl file" >&2; exit 2; fi
	@NODE_PIN=$(NODE_PIN) $(INSTALLATION_PINS) LINUX_TEST_IMAGE=$(LINUX_CGROUP_IMAGE) SERVICES=taskelith-$(SERVICES_ID)-acceptance \
		ENTRIES="$(ENTRIES)" bash scripts/with-pinned-node.sh use bash scripts/native-acceptance.sh "$(RESULTS)"

# Rederives the worker's seccomp profile from the pinned Docker default.
worker-seccomp-profile:
	@NODE_PIN=$(NODE_PIN) bash scripts/with-pinned-node.sh use \
		node --experimental-strip-types scripts/worker-seccomp-profile.ts write

# Opt-in: builds the worker-harnesses variant per platform (PLATFORMS, default
# linux/amd64 linux/arm64) and runs the credential-free steps, into OUT.
qualify-harnesses:
	@if [ -z "$$OUT" ]; then echo "make qualify-harnesses: set OUT to a directory outside the worktree" >&2; exit 2; fi
	@$(INSTALLATION_PINS) PLATFORMS="$$PLATFORMS" bash scripts/harness-qualification.sh "$$OUT"

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

# make would expand these arguments when it exports them, so they reach
# the script under other names, as typed; its makes get no MAKEFLAGS.
unexport BRANCH TITLE BODY RESUME CHANGE LOG

# Coordinator: integrates the archived change BRANCH into dev with one pull
# request (scripts/integrate.sh); RESUME=1 continues a stopped integration.
integrate: export TASKELITH_INTEGRATE_BRANCH := $(value BRANCH)
integrate: export TASKELITH_INTEGRATE_TITLE := $(value TITLE)
integrate: export TASKELITH_INTEGRATE_BODY := $(value BODY)
integrate:
	@NODE_PIN=$(NODE_PIN) env -u MAKEFLAGS -u MFLAGS -u MAKELEVEL bash scripts/with-pinned-node.sh use \
		bash scripts/integrate.sh $(if $(value RESUME),--resume) \
		"$$TASKELITH_INTEGRATE_BRANCH" "$$TASKELITH_INTEGRATE_TITLE" "$$TASKELITH_INTEGRATE_BODY"

# Writes the generated part of CHANGE's verification.md from LOG, a make
# verify log; record-check fails when that part differs from the tree.
record record-check: export TASKELITH_RECORD_CHANGE := $(value CHANGE)
record: export TASKELITH_RECORD_LOG := $(value LOG)
record:
	@NODE_PIN=$(NODE_PIN) env -u MAKEFLAGS -u MFLAGS -u MAKELEVEL bash scripts/with-pinned-node.sh use \
		node --experimental-strip-types scripts/verification-record.ts write \
		"$$TASKELITH_RECORD_CHANGE" "$$TASKELITH_RECORD_LOG"

record-check:
	@NODE_PIN=$(NODE_PIN) env -u MAKEFLAGS -u MFLAGS -u MAKELEVEL bash scripts/with-pinned-node.sh use \
		node --experimental-strip-types scripts/verification-record.ts check "$$TASKELITH_RECORD_CHANGE"

# Checks that this clone can build and verify; changes nothing.
# Uses the .nvmrc Node.js when nvm has it.
doctor:
	@NODE_PIN=$(NODE_PIN) NPM_PIN=$(NPM_PIN) bash scripts/with-pinned-node.sh use bash scripts/run-node-script.sh scripts/doctor.ts

# Installs what is missing: the .nvmrc Node.js (as nvm's default), the npm
# pin, the locked dependencies, and the pre-push hook.
setup:
	@NODE_PIN=$(NODE_PIN) NPM_PIN=$(NPM_PIN) bash scripts/with-pinned-node.sh install bash scripts/run-node-script.sh scripts/setup.ts
