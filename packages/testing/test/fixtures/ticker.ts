// Starts a child of its own, then prints both PIDs, so that tests can reach
// the whole process group.
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
process.stdout.write(`ready ${process.pid} ${child.pid}\n`);
setInterval(() => {}, 1000);
