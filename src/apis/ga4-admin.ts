import { domainOf, items, text } from '../entities.ts';
import { isRecord } from '../json.ts';
import type { ApiEntry, Entity, EntitySource } from '../types.ts';

// Per property: its data streams; a web stream's default URI gives the domain.
const dataStreams: EntitySource = {
  method: 'analyticsadmin.properties.dataStreams.list',
  params: (parent) => ({ parent: parent?.id }),
  entities: (data, parent) =>
    items(data, 'dataStreams').flatMap((s) => {
      const id = text(s.name);
      const uri = isRecord(s.webStreamData) ? s.webStreamData.defaultUri : undefined;
      return id
        ? [
            {
              kind: 'stream',
              id,
              name: text(s.displayName),
              parent: parent?.id,
              domain: domainOf(uri),
            },
          ]
        : [];
    }),
};

export default {
  api: 'ga4-admin',
  discovery: 'https://analyticsadmin.googleapis.com/$discovery/rest?version=v1beta',
  // Account summaries list every account and its properties in one list.
  entities: [
    {
      method: 'analyticsadmin.accountSummaries.list',
      entities: (data) =>
        items(data, 'accountSummaries').flatMap((a): Entity[] => {
          const id = text(a.account);
          const account = id ? [{ kind: 'account', id, name: text(a.displayName) }] : [];
          const properties = items(a, 'propertySummaries').flatMap((p) => {
            const property = text(p.property);
            return property
              ? [
                  {
                    kind: 'property',
                    id: property,
                    name: text(p.displayName),
                    parent: text(p.parent),
                  },
                ]
              : [];
          });
          return [...account, ...properties];
        }),
      children: { property: dataStreams },
    },
  ],
} satisfies ApiEntry;
