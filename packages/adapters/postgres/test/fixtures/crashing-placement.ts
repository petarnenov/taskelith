// Commits one placement with the crash point that the environment arms; a
// killed run prints nothing after its last reached point.
import { writeSync } from 'node:fs';
import { PostgresDatabase } from '@taskelith/postgres';
import { crashPointsFromEnvironment } from '@taskelith/testing';
import { assignment, command } from '../fixtures.ts';

const database = new PostgresDatabase(new URL(process.argv[2]!), { crashPoints: crashPointsFromEnvironment() });
const result = await database.transaction(async (tx) => {
  const added = await tx.assignments.add(assignment('assignment-1'));
  return added.ok ? tx.outbox.append(command('offer-assignment-1')) : added;
});
writeSync(1, `${JSON.stringify(result)}\n`);
await database.close();
