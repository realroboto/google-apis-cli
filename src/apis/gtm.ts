import { domainOf, items, text } from '../entities.ts';
import type { ApiEntry } from '../types.ts';

export default {
  api: 'gtm',
  discovery: 'https://tagmanager.googleapis.com/$discovery/rest?version=v2',
  // IDs are paths (`accounts/1/containers/2`). The container name carries its public ID
  // (GTM-…). shortcut: all domain keys of a container share one space-separated domain cell;
  // upgrade to one row per domain when a find must tell them apart.
  entities: [
    {
      method: 'tagmanager.accounts.list',
      entities: (data) =>
        items(data, 'account').flatMap((a) => {
          const id = text(a.path);
          return id ? [{ kind: 'account', id, name: text(a.name) }] : [];
        }),
      children: {
        account: {
          method: 'tagmanager.accounts.containers.list',
          params: (parent) => ({ parent: parent?.id }),
          entities: (data, parent) =>
            items(data, 'container').flatMap((c) => {
              const id = text(c.path);
              if (!id) return [];
              const names = [text(c.name), text(c.publicId)].filter(Boolean);
              const domains = Array.isArray(c.domainName) ? c.domainName.map(domainOf) : [];
              return [
                {
                  kind: 'container',
                  id,
                  name: names.join(' ') || undefined,
                  parent: parent?.id,
                  domain: [...new Set(domains.filter(Boolean))].join(' ') || undefined,
                },
              ];
            }),
        },
      },
    },
  ],
} satisfies ApiEntry;
