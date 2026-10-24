const CONTROL_CHARACTER = /\p{Cc}/u;

// Text shown to people but never interpreted by the domain: 1 to maxLength
// UTF-16 code units without a character of the Unicode category Cc.
export function isDisplayText(text: string, maxLength: number): boolean {
  return text.length > 0 && text.length <= maxLength && !CONTROL_CHARACTER.test(text);
}
