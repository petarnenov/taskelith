import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../session/SessionProvider';
import { changesList, outcomeOf, refused, type Command, type CommandResult, type Settled } from './tokens-model';
import type { IssuedEnrollmentToken, WorkersGateway } from './workers';
import { useWorkersGateway } from './WorkersServices';

// The 201 of an issue or a rotation, shown once; a rotation names the
// token it replaced.
export interface Reveal {
  readonly issued: IssuedEnrollmentToken;
  readonly replaced?: string;
}

export interface TokenCommands {
  // The one command in flight, while one is.
  readonly running?: Command;
  // The last answer, while its notice stands.
  readonly status?: Settled;
  readonly reveal?: Reveal;
  readonly run: (command: Command) => void;
  readonly closeReveal: () => void;
}

// The token commands of the section: one at a time, with the CSRF resend
// of the composer, the secret of a 201 held in this state alone.
export function useTokenCommands(onListChanged: () => void): TokenCommands {
  const gateway = useWorkersGateway();
  const { refresh, signedInGeneration } = useSession();
  const [running, setRunning] = useState<Command>();
  const [status, setStatus] = useState<Settled>();
  const [reveal, setReveal] = useState<Reveal>();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const inFlight = useRef(false);

  // After a CSRF refusal the session is read again once and the command
  // sent again with the renewed token under the same sign-in.
  const answerOf = useCallback(
    async (command: Command): Promise<Settled> => {
      const sentUnder = signedInGeneration();
      let tokenRefreshed = false;
      for (;;) {
        const outcome = outcomeOf(command, await send(gateway, command), tokenRefreshed);
        if (outcome.kind !== 'retry-with-new-token') return outcome;
        const renewed = await refresh();
        if (renewed.kind === 'unavailable') return refused(command, 'token-not-renewed');
        if (renewed.kind === 'anonymous' || !mounted.current || signedInGeneration() !== sentUnder) return refused(command, 'session-changed');
        tokenRefreshed = true;
      }
    },
    [gateway, refresh, signedInGeneration],
  );

  const run = useCallback(
    (command: Command) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setRunning(command);
      void answerOf(command).then((settled) => {
        inFlight.current = false;
        if (!mounted.current) return;
        setRunning(undefined);
        setStatus(settled);
        if (settled.kind === 'issued') setReveal(revealOf(settled.issued, command));
        if (changesList(settled)) onListChanged();
      });
    },
    [answerOf, onListChanged],
  );

  const closeReveal = useCallback(() => setReveal(undefined), []);

  return useMemo(() => ({ running, status, reveal, run, closeReveal }), [running, status, reveal, run, closeReveal]);
}

function send(gateway: WorkersGateway, command: Command): Promise<CommandResult> {
  switch (command.name) {
    case 'issue':
      return gateway.issueEnrollmentToken(command.constraints);
    case 'revoke':
      return gateway.revokeEnrollmentToken(command.tokenId);
    default:
      return gateway.rotateEnrollmentToken(command.tokenId);
  }
}

function revealOf(issued: IssuedEnrollmentToken, command: Command): Reveal {
  return command.name === 'rotate' ? { issued, replaced: command.tokenId } : { issued };
}
