import { items, text } from '../entities.ts';
import { isRecord } from '../json.ts';
import type { ApiEntry } from '../types.ts';

export default {
  api: 'youtube',
  discovery: 'https://youtube.googleapis.com/$discovery/rest?version=v3',
  // The operator's own channels; the custom URL (@handle) joins the title in the name.
  entities: [
    {
      method: 'youtube.channels.list',
      params: () => ({ part: 'snippet', mine: true }),
      entities: (data) =>
        items(data, 'items').flatMap((c) => {
          const id = text(c.id);
          const s = isRecord(c.snippet) ? c.snippet : {};
          const name = [text(s.title), text(s.customUrl)].filter(Boolean).join(' ');
          return id ? [{ kind: 'channel', id, name: name || undefined }] : [];
        }),
    },
  ],
} satisfies ApiEntry;
