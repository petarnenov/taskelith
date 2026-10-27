const DISPLAY_TEXT_MAXIMUM = 1024;
// C0 and C1 control characters, which `DisplayText` forbids.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

// Text as `DisplayText`: no control characters, at most 1024 characters,
// and `fallback` when nothing is left.
export function displayText(text: string, fallback: string): string {
  const cleaned = [...text.replace(CONTROL_CHARACTERS, ' ').trim()].slice(0, DISPLAY_TEXT_MAXIMUM).join('');
  return cleaned === '' ? fallback : cleaned;
}
