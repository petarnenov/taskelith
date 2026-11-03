import { Fragment } from 'react';

// A run without a space, such as an identifier or a digest, may break every
// 16 characters at phone width; the text and a copy of it stay unchanged.
export function Breakable({ text }: { readonly text: string }) {
  const parts = text.match(/\s+|\S{1,16}/g) ?? [];
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 && isWord(part) && isWord(parts[index - 1]!) ? <wbr /> : null}
      {part}
    </Fragment>
  ));
}

function isWord(part: string): boolean {
  return !/\s/.test(part);
}
