import { domainOf, items, text } from '../entities.ts';
import type { ApiEntry } from '../types.ts';

export default {
  api: 'merchant-accounts',
  discovery: 'https://merchantapi.googleapis.com/$discovery/rest?version=accounts_v1',
  // `homePageUri` (output only) gives the domain without one homepage call per account.
  entities: [
    {
      method: 'merchantapi.accounts.list',
      entities: (data) =>
        items(data, 'accounts').flatMap((a) => {
          const id = text(a.name);
          return id
            ? [{ kind: 'account', id, name: text(a.accountName), domain: domainOf(a.homePageUri) }]
            : [];
        }),
    },
  ],
} satisfies ApiEntry;
