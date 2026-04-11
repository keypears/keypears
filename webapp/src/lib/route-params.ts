/**
 * TanStack Router param configs that preserve literal characters in URLs.
 * By default, TanStack encodes params with encodeURIComponent, which converts
 * valid URL characters like @ to %40. These configs pass params through
 * without extra encoding.
 *
 * Every route with dynamic params MUST use one of these configs.
 */

export const addressParam = {
  stringify: ({ address }: { address: string }) => ({ address }),
  parse: ({ address }: { address: string }) => ({ address }),
};

export const profileParam = {
  stringify: ({ profile }: { profile: string }) => ({ profile }),
  parse: ({ profile }: { profile: string }) => ({ profile }),
};

export const idParam = {
  stringify: ({ id }: { id: string }) => ({ id }),
  parse: ({ id }: { id: string }) => ({ id }),
};
