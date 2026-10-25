// Prints each crash point it passes; the armed environment kills it at one.
import { crashPointsFromEnvironment } from '@taskelith/testing';

const crashPoints = crashPointsFromEnvironment();
for (const point of ['W1.before', 'W1.after', 'W1.before', 'W1.after', 'W2.before']) {
  crashPoints.reach(point);
  process.stdout.write(`${point}\n`);
}
