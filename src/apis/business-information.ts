import { domainOf, items, text } from '../entities.ts';
import type { ApiEntry } from '../types.ts';

export default {
  api: 'business-information',
  discovery: 'https://mybusinessbusinessinformation.googleapis.com/$discovery/rest?version=v1',
  scopes: ['business.manage'],
  // This API lists locations but not accounts; Account Management lists the accounts.
  entities: [
    {
      api: 'business-account-management',
      method: 'mybusinessaccountmanagement.accounts.list',
      entities: (data) =>
        items(data, 'accounts').flatMap((a) => {
          const id = text(a.name);
          return id ? [{ kind: 'account', id, name: text(a.accountName) }] : [];
        }),
      children: {
        account: {
          method: 'mybusinessbusinessinformation.accounts.locations.list',
          params: (parent) => ({ parent: parent?.id, readMask: 'name,title,websiteUri' }),
          entities: (data, parent) =>
            items(data, 'locations').flatMap((l) => {
              const id = text(l.name);
              return id
                ? [
                    {
                      kind: 'location',
                      id,
                      name: text(l.title),
                      parent: parent?.id,
                      domain: domainOf(l.websiteUri),
                    },
                  ]
                : [];
            }),
        },
      },
    },
  ],
} satisfies ApiEntry;
