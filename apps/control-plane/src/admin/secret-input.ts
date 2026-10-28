import { stderr, stdin } from 'node:process';

// The first line of standard input. On a terminal the prompt goes to
// standard error and the typed characters are not echoed.
export function readStandardInputLine(prompt: string, input: NodeJS.ReadStream = stdin): Promise<string> {
  const terminal = input.isTTY === true;
  if (terminal) {
    stderr.write(prompt);
    input.setRawMode(true);
  }
  return new Promise((resolve) => {
    let line = '';
    const finish = () => {
      input.off('data', onData);
      input.off('end', finish);
      if (terminal) {
        input.setRawMode(false);
        stderr.write('\n');
      }
      input.pause();
      resolve(line);
    };
    const onData = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      const end = text.search(/[\r\n\u0003\u0004]/);
      line += end === -1 ? text : text.slice(0, end);
      if (end !== -1) finish();
    };
    input.on('data', onData);
    input.on('end', finish);
    input.resume();
  });
}
