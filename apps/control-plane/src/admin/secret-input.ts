import { stderr, stdin } from 'node:process';
import { StringDecoder } from 'node:string_decoder';
import { err, failure, ok, type Result } from '@taskelith/kernel';

const INTERRUPT = '\u0003';
const END_OF_INPUT = '\u0004';
const BACKSPACE = '\b';
const DELETE = '\u007f';
const KILL_LINE = '\u0015';
const C0_CONTROL = /^[\u0000-\u001f]$/u;

// The line so far, or the answer once the line is complete.
type Step = { readonly line: string } | { readonly answer: Result<string> };

// The first line of standard input. On a terminal the prompt goes to
// standard error, typed characters are not echoed, and keys edit the line.
export function readStandardInputLine(prompt: string, input: NodeJS.ReadStream = stdin): Promise<Result<string>> {
  const terminal = input.isTTY === true;
  const step = terminal ? terminalStep : pipedStep;
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
      for (const character of decoder.write(chunk)) {
        const next = step(line, character);
        if ('answer' in next) return finish(next.answer);
        line = next.line;
      }
    };
    const onEnd = () => finish(ok(line + decoder.end()));
    input.on('data', onData);
    input.on('end', onEnd);
    input.resume();
  });
}

// A new secret: on a terminal it is typed twice and both entries must
// match; piped input is read once.
export async function readConfirmedSecret(prompt: string, confirmation: string, input: NodeJS.ReadStream = stdin): Promise<Result<string>> {
  const first = await readStandardInputLine(prompt, input);
  if (!first.ok || input.isTTY !== true) return first;
  const second = await readStandardInputLine(confirmation, input);
  if (!second.ok) return second;
  return second.value === first.value ? first : err(refused('the two entries differ', 'entries-differ'));
}

// Raw mode does no line editing, so the reader does it.
function terminalStep(line: string, character: string): Step {
  switch (character) {
    case '\r':
    case '\n':
      return { answer: ok(line) };
    case INTERRUPT:
      return { answer: err(cancelled()) };
    case END_OF_INPUT:
      return line === '' ? { answer: err(cancelled()) } : { line };
    case BACKSPACE:
    case DELETE:
      return { line: Array.from(line).slice(0, -1).join('') };
    case KILL_LINE:
      return { line: '' };
    default:
      if (C0_CONTROL.test(character)) return { answer: err(refused('the input holds a control key', 'control-character')) };
      return { line: line + character };
  }
}

function pipedStep(line: string, character: string): Step {
  if (character === '\r' || character === '\n' || character === END_OF_INPUT) return { answer: ok(line) };
  if (character === INTERRUPT) return { answer: err(cancelled()) };
  return { line: line + character };
}

function cancelled() {
  return refused('the input was cancelled', 'cancelled');
}

function refused(why: string, reason: string) {
  return failure('invalid', `${why}, so nothing was changed`, { reason });
}
