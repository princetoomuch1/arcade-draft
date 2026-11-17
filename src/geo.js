/* Approximate city centroids, for placing pins only. UI Spec v2 section 11.1.
   These are rounded public coordinates, good to a few km: enough to put a pin in the right
   place on a 2u-per-cell map, not enough to navigate by. No map tiles, no network. */

export const CITIES = {
  'rajkot':      [22.30, 70.80],
  'jamnagar':    [22.47, 70.07],
  'ahmedabad':   [23.03, 72.58],
  'gandhinagar': [23.22, 72.65],
  'surat':       [21.17, 72.83],
  'vadodara':    [22.31, 73.18],
  'bhavnagar':   [21.76, 72.15],
  'mumbai':      [19.08, 72.88],
  'pune':        [18.52, 73.86],
  'bengaluru':   [12.97, 77.59],
  'hyderabad':   [17.39, 78.49],
  'chennai':     [13.08, 80.27],
  'delhi':       [28.61, 77.21],
  'noida':       [28.54, 77.39],
  'gurugram':    [28.46, 77.03],
  'kolkata':     [22.57, 88.36],
  'jaipur':      [26.91, 75.79],
  'indore':      [22.72, 75.86],
  'kochi':       [9.93, 76.27],
  'bhopal':      [23.26, 77.41]
};
export const HOME = { name: 'Rajkot', lat: 22.30, lon: 70.80 };

export function coordsOf(item) {
  if (typeof item.lat === 'number' && typeof item.lon === 'number') return [item.lat, item.lon];
  const key = String(item.city || '').toLowerCase().trim();
  return CITIES[key] || null;
}

const R = 6371;
const rad = d => d * Math.PI / 180;

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const [la1, lo1] = a, [la2, lo2] = b;
  const dLa = rad(la2 - la1), dLo = rad(lo2 - lo1);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing in degrees, 0 = north, clockwise. */
export function bearing(a, b) {
  const [la1, lo1] = a, [la2, lo2] = b;
  const y = Math.sin(rad(lo2 - lo1)) * Math.cos(rad(la2));
  const x = Math.cos(rad(la1)) * Math.sin(rad(la2)) - Math.sin(rad(la1)) * Math.cos(rad(la2)) * Math.cos(rad(lo2 - lo1));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** Equirectangular projection into a whole-u box. Honest for a coarse pixel map. */
export function project([lat, lon], box) {
  const { minLat, maxLat, minLon, maxLon, w, h } = box;
  const x = Math.floor((lon - minLon) / (maxLon - minLon) * (w - 1));
  const y = Math.floor((maxLat - lat) / (maxLat - minLat) * (h - 1));
  return [Math.max(0, Math.min(w - 1, x)), Math.max(0, Math.min(h - 1, y))];
}

export const BOXES = {
  STATE:   { minLat: 20.0, maxLat: 24.8, minLon: 68.0, maxLon: 74.6, label: 'GUJARAT' },
  COUNTRY: { minLat: 6.0,  maxLat: 36.0, minLon: 68.0, maxLon: 97.5, label: 'INDIA' },
  WORLD:   { minLat: -58,  maxLat: 80,   minLon: -180, maxLon: 180,  label: 'WORLD' }
};
