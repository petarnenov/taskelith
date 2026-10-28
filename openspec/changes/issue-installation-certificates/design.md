## Context

G3 plan row 26 (`secure-remote-connectivity`, [G3 plan](/docs/g3-plan.md#work-items)) and decision D11 (b) of the [G3 plan](/docs/g3-plan.md#owner-decisions) ask for an installation certificate authority for the API, the broker, and enrollment, and an operator-supplied certificate for the browser endpoint that falls back to the installation authority. The [JetStream spike](/docs/g2-jetstream-spike.md) left TLS to the first gate that enrolls a remote worker, the [trust model](/docs/trust-model.md) section 4 puts enrollment over TLS, and [ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5 maps "TLS and the installation certificate authority" to item 26. The G3 plan's deferrals keep PostgreSQL plain on localhost while it is co-located with the control plane. The coordinator split item 26 into 26a (this change: issue the certificates and turn TLS on), 26b (the worker pins the installation authority at enrollment), 26c (delivery of a rotated credential generation), and 26d (the private-network bind and the remote acceptance worker).

Before this change, `connectTransport`, `connectWorkerTransport`, and `connectSystemAccount` took an optional `TransportTls` (O3 (c)), the control-plane API listened with `node:http`, and the installation's NATS allowed only plain clients.

## Decisions

The choices came from the owner's away delegate, away run `20261027T221048Z-claude-63826`. Decisions 1 (authority key storage), 2 (validity), 3 (worker authentication), and 5 (issuing library) are pending the owner's review.

1. **Authority key storage.** The authority's certificate and PKCS#8 private key are the document `control-plane/installation-authority`, a regular file of mode `0600` in the `0700` namespace, created once by the durable file rule, like `broker-authority`. An encrypted key, a hardware module, and a key outside the data root were not chosen: the namespace already holds the broker's signing seeds under the same protection, and a passphrase would need its own secret store.
2. **Validity.** Authority 10 years; server certificate 397 days, inside the 398-day limit that browsers enforce, re-issued by `make installation-certificates`. Both values are provisional, and authority rollover is deferred to G6 ([G3 plan deferrals](/docs/g3-plan.md#g2-closure-deferrals)). A server certificate starts one hour before its issuance, so that a client clock slightly behind accepts it.
3. **Worker authentication.** Workers keep the bearer secret and the NATS user JWT of D9 (a), over TLS that authenticates only the server. Rejected alternative: mutual TLS with a client certificate per worker. It roughly doubles the rotation work (a certificate generation beside each credential generation, its delivery, and its revocation), while D9 (a) already authenticates the worker on both channels.
4. **Later sub-changes, recorded for them.** 26b carries the authority's fingerprint in the enrollment bundle, with no trust on first use (decision 4); 26c keeps generation N until the worker confirms N+1, with a cap of `max(grace window, 7 days)` (decision 6), `rotate-worker` only requests a rotation (decision 7), and the worker generates its own NKey (decision 9).
5. **Issuing library.** `@peculiar/x509` behind the `CertificateIssuer` port of `@taskelith/fleet`, with keys from Node's WebCrypto. The fallback, if the library must go, is the `openssl` binary behind the same port; never `node-forge`. Version 2.2.0, not 3.x: 3.0.0 and 3.1.0 were both published on 2026-10-27, one day before this change, and changed the major version; the [qualification record](/docs/qualification/peculiar-x509-2.2.0/README.md) has the details. The library needs a `Reflect` metadata polyfill that it does not declare, so the adapter also depends on `reflect-metadata@0.2.2` and loads it first.
6. **Algorithm.** ECDSA P-256 with SHA-256 for the authority and every server certificate, which nats-server, Node, and current browsers accept. Serial numbers are 128 random bits.
7. **Where the hosts come from.** The administrative entry reads `TASKELITH_API_HOSTS` and `TASKELITH_NATS_HOSTS`, comma-separated DNS names or IP addresses, default `localhost,127.0.0.1,::1`; wildcards and invalid names fail and name the variable. The composition sets `control-plane` and `nats` in addition to the localhost names, because the services reach each other by those names.
8. **Two listeners.** The worker API and the browser endpoint are separate HTTPS listeners on the same request handler, so that workers never need to trust an operator's authority and the browser never needs the installation authority. The browser endpoint takes the operator's certificate and key, or, without both, the installation's API server certificate. Both refuse TLS below 1.2. The composition root has no plain listener; a missing, mismatched, unreadable, or expired certificate fails the start and names the setting or file. `createApiServer` still serves plain HTTP when it gets no TLS, for unit tests of the request handling only.
9. **Broker trust by default.** When `TASKELITH_NATS_CA` is not set, the control plane and the administrative entry read `control-plane/installation-ca.pem` of their data root through the namespace's owner, mode, and link checks, so their NATS connections use TLS with it. Before `init` the namespace has no installation record and the connection stays plain, which `init` does not use. An initialized installation without the file fails before any broker connection and names it (review pass 1); `issue-installation-certificates` needs no broker, so it skips this read and writes the file again. The installation's NATS requires TLS (no `allow_non_tls`), so a plain client is refused by the server. The integration services keep their test CA and `allow_non_tls` for the Toxiproxy route.
10. **Local worker trust without pinning.** The Linux worker container mounts a read-only trust volume that the setup step fills with the public authority certificate, and gets it as `TASKELITH_NATS_CA` and as `NODE_EXTRA_CA_CERTS`, Node's process-wide additional trust, which its `fetch` of the control-plane API uses. This adds the installation authority to the system roots; pinning only the installation authority is 26b.
11. **Re-issue.** `issue-installation-certificates` needs an initialized installation and its authority; it issues both server certificates first, so a refused authority, one whose key is another's, that is no CA (review pass 1), or that has expired or ends before the new certificate (review pass 2; rollover is G6), changes no file, and then replaces the four server certificate files and the public authority file. The two files of one certificate are written one after the other, so a crash between them leaves a pair that does not match, and the next start fails, naming the key file and `make installation-certificates`, until the command runs again. The script then copies the broker's files and restarts the running broker and control plane.
12. **Redaction.** A PEM private-key block of any type (`PRIVATE KEY`, `RSA`, `EC`, `ENCRYPTED`, `OPENSSH`, and others) is a secret shape in time linear in the text; a begin marker without an end hides the rest of the text, because a cut key is still secret. Public `CERTIFICATE` blocks stay. `scrubEnvironment` also drops variables named like `TLS_KEY` or `SSL_KEY`, which name key files.
13. **Repository hygiene.** `make verify` runs `npm run verify:private-keys`, which refuses a tracked file named `*.pem`, `*.key`, `*.p12`, or `*.pfx` and a tracked file holding a PEM private-key block. Tests generate keys and certificates at run time in temporary directories; `.gitignore` ignores `*.pem` and `*.key`.

## Sources

- [G3 plan](/docs/g3-plan.md) row 26 and D11; the deferrals entry "TLS and the installation certificate authority".
- [JetStream spike](/docs/g2-jetstream-spike.md), the TLS note under deferrals.
- [Trust model](/docs/trust-model.md) section 4.
- [ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5, "TLS and the installation certificate authority".
- [Installation contract](/docs/contracts/installation-and-enrollment.md) sections 1 (O3), 3, and 7.

## Review checklist

The output of `make findings ARGS="checklist --capability installation-enrollment,nats-transport,trust-and-operational-foundation,control-plane-api,worker-contact,local-installation --at 46e21ef19e624bc50f264a5b307e3058292ee294"`, verbatim; it is saved as [checklist.json](checklist.json):

```text
Review checklist (capabilities installation-enrollment, nats-transport, trust-and-operational-foundation, control-plane-api, worker-contact, local-installation), most frequent finding categories first:
1. error-handling (3): A failure is swallowed, misreported, or leaves inconsistent state. Example: "The commit time was read inside the build arguments, so a failed git log went unnoticed and the check read it twice"
2. contract-drift (2): Code, a contract document, and its specification disagree. Example: "The requirement and doc claimed one image ID with the build cache, though a cached COPY layer keeps older file times"
3. docs (2): Documentation is missing, wrong, or out of date with the change. Example: "The Dockerfile comment said each RUN clamps, though the harnesses stage does not"
4. redaction (2): A secret or private value can leak into output, logs, or records. Example: "Sequential split and join replacement breaks overlapping occurrences, redacts inside markers, grows the output, and hides a touched shape secret's suffix"
5. spec-wording (2): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "The spec and doc said make verify checks the clamp of changed times, though it checks the suffix"
6. evidence-mismatch (1): A recorded result, count, or claim differs from what the checks show. Example: "The harness variant build was not run with Docker after the change"
7. missing-fail-before-test (1): A fix has no test that fails before it and passes after it. Example: "The Dockerfile test fixed its stage list, so a new unclamped stage of the worker passed"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (60): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
2. docs (45): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
3. spec-wording (26): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
4. stale-citation (23): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
5. process (11): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
6. contract-drift (9): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
7. scope (5): The change does more or less than its assigned scope. Example: "Design D6 defines size M as a contract, its spec, and its port types, while the SCM follow-up also changes the port's readers and conformance case"

Dev commit: 46e21ef19e624bc50f264a5b307e3058292ee294.
```

How the change guards against the listed categories: every new failure returns a `Result` that names the setting or file (error-handling, redaction); the contract, the specs, and the guide are edited in the same change and checked against the code (contract-drift, docs); scenarios state observable outcomes (spec-wording); `verification.md` records only checks that ran, with their output (evidence-mismatch); and each behaviour has a test that fails without it (missing-fail-before-test).

## Risks and limitations

- Installations initialized before this change have no authority, and the rule of decision 1 fails them closed; a local installation is re-bootstrapped on fresh volumes. No deployed installation exists.
- `NODE_EXTRA_CA_CERTS` trusts the installation authority in addition to the system roots, for the local worker only, until 26b pins it.
- The composition serves the browser endpoint on the installation certificate; mounting operator files into the container is left to 26d with the private-network bind.
- `issue-installation-certificates` writes no audit row; it needs host access to the data root, like `init`.
- The `@peculiar/x509` 2.x line may get fewer fixes once 3.x is established; the qualification record names the upgrade check.
