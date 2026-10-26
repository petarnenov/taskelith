// Prints "id state certainty" per execution of the journal copy in
// /tmp/journal; installation.sh pipes it into the stopped worker's image.
import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync('/tmp/journal/journal.sqlite');
database.exec('PRAGMA locking_mode = EXCLUSIVE');
const executions = database.prepare(
  'SELECT execution_id, state, uncertain_count FROM execution WHERE state IS NOT NULL ORDER BY execution_id',
).all();
for (const { execution_id: id, state, uncertain_count: uncertain } of executions) {
  process.stdout.write(`${id} ${state} ${uncertain > 0 ? 'uncertain' : 'certain'}\n`);
}
