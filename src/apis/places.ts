import type { ApiEntry } from '../types.ts';

const billed = {
  reason: 'Free monthly caps, then billed',
  source: 'https://developers.google.com/maps/billing-and-pricing/pricing',
};

export default {
  api: 'places',
  discovery: 'https://places.googleapis.com/$discovery/rest?version=v1',
  nocache: {
    reason: 'Places terms forbid caching API content (place_id excepted)',
    source: 'https://developers.google.com/maps/documentation/places/web-service/policies',
  },
  paid: {
    'places.places.autocomplete': billed,
    'places.places.get': billed,
    'places.places.photos.getMedia': billed,
    'places.places.searchNearby': billed,
    'places.places.searchText': billed,
  },
} satisfies ApiEntry;
