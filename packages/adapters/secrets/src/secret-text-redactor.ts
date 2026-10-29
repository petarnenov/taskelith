import { redactSecrets } from './scrub.js';

// The Execution module's SessionTextRedactor port over redactSecrets.
export class SecretTextRedactor {
  redact(text: string): string {
    return redactSecrets(text);
  }
}
