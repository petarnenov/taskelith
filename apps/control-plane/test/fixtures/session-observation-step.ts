// Applies one observation with the crash point that the environment arms;
// a killed run prints nothing after its last reached point.
import { writeSync } from 'node:fs';
import { ObservationService } from '@taskelith/control-plane';
import { PostgresDatabase } from '@taskelith/postgres';
import { crashPointsFromEnvironment } from '@taskelith/testing';
import { timelineOver } from '../session-timeline-fixtures.ts';

const [, , url, message] = process.argv;
const database = new PostgresDatabase(new URL(url!), { crashPoints: crashPointsFromEnvironment() });
const service = new ObservationService(database, { timelineOver, newConfirmationId: () => 'confirmation-step', newRequestId: () => 'request-step' });

const result = await service.apply(JSON.parse(message!));
writeSync(1, `${JSON.stringify(result)}\n`);
await database.close();
