// Publishes one outbox row and crashes where the environment arms it; the
// outbox lives in memory, so a rerun starts with the row unpublished again.
import { writeSync } from 'node:fs';
import { connectTransport, JetStreamPublisher, OutboxPublisher, TransportAddress } from '@taskelith/nats';
import { crashPointsFromEnvironment, integrationSecret } from '@taskelith/testing';
import { FakeOutbox, outboxRow } from '../fakes.ts';
import { offer } from '../messages.ts';

const [server, installationId] = process.argv.slice(2);
const address = TransportAddress.of(installationId!);
if (!address.ok) throw new Error(address.error.message);
const creds = integrationSecret('integration.creds');
const transport = await connectTransport({ server: new URL(server!), address: address.value, creds });
if (!transport.ok) throw new Error(transport.error.message);
const crashPoints = crashPointsFromEnvironment();
const outbox = new FakeOutbox([outboxRow('command-1', 'workers.worker-1.commands', offer('command-1'))]);
outbox.onMark = () => crashPoints.reach('OutboxPublish.before');

const round = await new OutboxPublisher(outbox, new JetStreamPublisher(transport.value.js), address.value).publishPending();
writeSync(1, `${JSON.stringify(round)}\n`);
await transport.value.close();
