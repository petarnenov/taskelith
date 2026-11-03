// The nonce of the page's CSP, which the control plane writes into the
// csp-nonce meta tag, so Mantine's style elements may apply.
export function pageStyleNonce(page: Document): string | undefined {
  const meta = page.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]');
  // A browser hides the attribute once the policy applies; `nonce` stays.
  return meta?.nonce || meta?.getAttribute('nonce') || undefined;
}
