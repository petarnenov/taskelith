import type { LaunchAuthorityClient, LaunchAuthorizationRequest, LaunchOutcome } from '@taskelith/execution';
import type { Result } from '@taskelith/kernel';
import { Gate } from './waiting.ts';

export interface AnsweredRequest {
  readonly request: LaunchAuthorizationRequest;
  readonly answer: Result<LaunchOutcome>;
}

// The worker's HTTP launch authority with gates before each request and
// each answer, so a scenario orders them; all requests and answers are kept.
export class OrderedAuthority implements LaunchAuthorityClient {
  readonly sent: LaunchAuthorizationRequest[] = [];
  readonly answered: AnsweredRequest[] = [];
  // Open by default; a scenario replaces one to hold that step.
  beforeRequest = openGate();
  beforeAnswer = openGate();
  #client: LaunchAuthorityClient | undefined;

  readonly wrap = (client: LaunchAuthorityClient): LaunchAuthorityClient => {
    this.#client = client;
    return this;
  };

  async authorize(request: LaunchAuthorizationRequest): Promise<Result<LaunchOutcome>> {
    if (this.#client === undefined) throw new Error('the authority is not wrapped');
    this.sent.push(request);
    await this.beforeRequest.opened;
    const answer = await this.#client.authorize(request);
    await this.beforeAnswer.opened;
    this.answered.push({ request, answer });
    return answer;
  }

  // Sends a request of the scenario's own, past the gates and unrecorded.
  direct(request: LaunchAuthorizationRequest): Promise<Result<LaunchOutcome>> {
    if (this.#client === undefined) throw new Error('the authority is not wrapped');
    return this.#client.authorize(request);
  }

  get grants(): LaunchOutcome[] {
    return this.answered.flatMap(({ answer }) => (answer.ok && answer.value.kind === 'granted' ? [answer.value] : []));
  }
}

function openGate(): Gate {
  const gate = new Gate();
  gate.open();
  return gate;
}
