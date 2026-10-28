import { stderr, stdin } from 'node:process';
import { StringDecoder } from 'node:string_decoder';
import { err, failure, ok, type Result } from '@taskelith/kernel';

const LINE_END = /[\r\n\u0003\u0004]/;
const INTERRUPT = '\u0003';

// The first line of standard input. On a terminal the prompt goes to
// standard error, typed characters are not echoed, and Ctrl-C cancels.
export function readStandardInputLine(prompt: string, input: NodeJS.ReadStream = stdin): Promise<Result<string>> {
  const terminal = input.isTTY === true;
  if (terminal) {
    stderr.write(prompt);
    input.setRawMode(true);
  }
  return new Promise((resolve) => {
    const decoder = new StringDecoder('utf8');
    let line = '';
    const finish = (answer: Result<string>) => {
      input.off('data', onData);
      input.off('end', onEnd);
      if (terminal) {
        input.setRawMode(false);
        stderr.write('\n');
      }
      input.pause();
      resolve(answer);
    };
    const onData = (chunk: Buffer) => {
      const text = decoder.write(chunk);
      const end = text.search(LINE_END);
      if (end === -1) {
        line += text;
        return;
      }
      finish(text[end] === INTERRUPT ? err(cancelled()) : ok(line + text.slice(0, end)));
    };
    const onEnd = () => finish(ok(line + decoder.end()));
    input.on('data', onData);
    input.on('end', onEnd);
    input.resume();
  });
}

function cancelled() {
  return failure('invalid', 'the input was cancelled, so nothing was changed', { reason: 'cancelled' });
}
