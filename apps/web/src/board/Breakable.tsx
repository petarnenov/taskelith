import { Fragment } from 'react';

const BREAK_EVERY = 16;

// A digest or identifier has no space, so it may break every 16 characters
// at phone width; the text and a copy of it stay unchanged.
export function Breakable({ text }: { readonly text: string }) {
  const parts = text.match(new RegExp(`.{1,${BREAK_EVERY}}`, 'g')) ?? [];
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index === 0 ? null : <wbr />}
      {part}
    </Fragment>
  ));
}
