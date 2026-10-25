// Prints each crash point it passes, synchronously, so that a SIGKILL loses
// no output; the armed environment kills it at one.
import { writeSync } from 'node:fs';
import { crashPointsFromEnvironment } from '@taskelith/testing';

const crashPoints = crashPointsFromEnvironment();
for (const point of ['W1.before', 'W1.after', 'W1.before', 'W1.after', 'W2.before']) {
  crashPoints.reach(point);
  writeSync(1, `${point}\n`);
}
