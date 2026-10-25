// A secret's stored form; the secret itself is shown once and never stored.
export type SecretHash = string & { readonly secretHash: unique symbol };
