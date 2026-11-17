/* Career Arcade — the data model.
 *
 * Two halves, deliberately kept apart:
 *   PUBLIC   scraped rows in /data/*.json. Committed to the repo. No personal data, ever.
 *   PRIVATE  everything about you, in IndexedDB on this machine. Never leaves the device.
 *
 * A feed row is public. The moment you touch it, an ItemRecord is created on the device and the
 * public row is snapshotted into it, so your copy survives the source deleting the listing.
 */

/** @typedef {'hackathon'|'job'|'internship'|'news'|'scheme'|'note'} ItemType */
/** @typedef {'active'|'expired'|'archived'|'saved'} ItemStatus */
/** @typedef {'platform'|'manual'|'external'} Trust */

/**
 * A public row as the scrapers write it (UI Spec v2 section 17.1).
 * @typedef {object} FeedItem
 * @property {string} id
 * @property {ItemType} type
 * @property {string} title
 * @property {string} [org]
 * @property {string} [summary]
 * @property {string} url
 * @property {{name: string, host: string, note?: string}} source
 * @property {string} [firstSeen]   ISO. First time any scrape saw it.
 * @property {string} [lastSeen]    ISO. Last time a scrape confirmed it is still up.
 * @property {string} [lastChanged] ISO. Last time a field that matters changed.
 * @property {string} [deadline]    ISO.
 * @property {string} [startDate]
 * @property {string} [endDate]
 * @property {string} [expiresAt]
 * @property {string[]} [skills]
 * @property {string} [city]
 * @property {string} [state]
 * @property {string} [country]
 * @property {string} [mode]
 * @property {number} [sourceCount]
 * @property {string} [cluster]
 * @property {boolean} [_mock]
 */

/**
 * The device-side record for one item. Absent means you never touched it.
 * @typedef {object} ItemRecord
 * @property {string} id              same id as the FeedItem
 * @property {ItemStatus} status
 * @property {string} state           lifecycle label: SEEN SAVED PLANNED PINNED DONE EXPIRED DRAWER KEPT GOLD
 * @property {number|null} saved_at
 * @property {number|null} planned_for
 * @property {number|null} drawer_at
 * @property {boolean} pinned_desk
 * @property {boolean} pinned_wall
 * @property {string|null} wall_zone
 * @property {{x: number, y: number, rot: number}|null} desk_position
 * @property {string[]} strings       ids of items tied to this one by a red string
 * @property {string[]} locked_strings strings you tied by hand, which auto-linking may not cut
 * @property {FeedItem|null} snapshot the public row as it was when you saved it
 * @property {string[]} notes         ids of notes about this item
 * @property {Trust} trust
 * @property {{match: string[], gap: string[], unknown: string[]}|null} fit
 * @property {string|null} why_shown
 * @property {string|null} dup_cluster_id
 * @property {number|null} last_checked_at
 * @property {number|null} last_changed_at
 * @property {number|null} expires_at
 */

/**
 * @typedef {object} Note
 * @property {string} id
 * @property {string} title
 * @property {string} body_md
 * @property {{id: string, kind: 'image'|'audio'|'link', name: string, data: string}[]} attachments
 * @property {string[]} tags
 * @property {string[]} related_ids
 * @property {string|null} source_item_id
 * @property {{question: string, evidence: string, decision: string, outcome: string, next: string}|null} synthesis
 * @property {number} created
 * @property {number} updated
 */

/** @typedef {'applied'|'screen'|'interview'|'offer'|'reject'} AppStage */

/**
 * @typedef {object} Application
 * @property {string} id
 * @property {string|null} item_id
 * @property {string} title
 * @property {string} org
 * @property {string|null} url
 * @property {AppStage|'planned'} stage
 * @property {{stage: string, at: number}[]} dates
 * @property {string} contact
 * @property {string[]} materials
 * @property {string} next_action
 * @property {number|null} next_action_at
 * @property {Trust} trust
 * @property {string} notes
 * @property {number} updated
 */

/**
 * @typedef {object} Goal
 * @property {string} id
 * @property {string} title
 * @property {number|null} target_date
 * @property {{text: string, done: boolean, done_at: number|null}[]} checkpoints
 * @property {string} wall_zone
 * @property {boolean} gold
 * @property {number} created
 */

/**
 * @typedef {object} WallPin
 * @property {string} id
 * @property {'text'|'photo'|'item_ref'|'goal_ref'} type
 * @property {string} content     the text, a data URI, or the referenced id
 * @property {string} caption
 * @property {string} zone
 * @property {{x: number, y: number, rot: number}} position
 * @property {number} pinned_at
 */

/**
 * What the feed thinks you are interested in. `explicit` is what you typed and never decays.
 * @typedef {object} Interest
 * @property {string} id          the keyword, lowercased. Also the key.
 * @property {string} label
 * @property {'explicit'|'inferred'} kind
 * @property {number} weight      0..1
 * @property {string} source      what created it: 'you', 'save', 'open', 'read', 'plan'
 * @property {number} recency     ms timestamp of the last time it moved
 * @property {boolean} paused
 * @property {number} seen
 * @property {number[]} skips
 * @property {number|null} decayed_at
 */

/**
 * The official deadline is locked to the source. Everything else is yours to edit.
 * @typedef {object} DeadlinePlan
 * @property {string} id            same as item_id
 * @property {string} item_id
 * @property {number|null} official_deadline
 * @property {number|null} start_by
 * @property {{text: string, done: boolean}[]} checkpoints
 * @property {{lead_time: number, channels: string[], snoozed_until: number|null}[]} reminders
 */

/**
 * @typedef {object} RefreshLog
 * @property {string} id
 * @property {number} started_at
 * @property {number|null} finished_at
 * @property {string} source
 * @property {number} items_new
 * @property {number} items_changed
 * @property {number} items_expired
 * @property {'running'|'ok'|'error'} status
 * @property {string|null} error
 */

export const ITEM_TYPES = /** @type {ItemType[]} */ (['hackathon', 'job', 'internship', 'news', 'scheme', 'note']);
export const APP_STAGES = /** @type {(AppStage|'planned')[]} */ (['planned', 'applied', 'screen', 'interview', 'offer', 'reject']);
export const TRUST = /** @type {Trust[]} */ (['platform', 'manual', 'external']);
export const WALL_ZONES = ['MOTIVATION', 'GOALS', 'MEMORIES', 'PINNED FROM DESK', 'RANDOM'];

let seq = 0;
/** Sortable, collision-free within a session, and readable in the inspector. */
export const uid = (prefix = 'x') =>
  `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const ms = v => (v == null ? null : (typeof v === 'number' ? v : new Date(v).getTime()));

/** @returns {ItemRecord} */
export const blankItemRecord = id => ({
  id, status: 'active', state: 'SEEN',
  saved_at: null, planned_for: null, drawer_at: null,
  pinned_desk: false, pinned_wall: false, wall_zone: null, desk_position: null,
  strings: [], locked_strings: [], snapshot: null, notes: [],
  trust: 'external', fit: null, why_shown: null, dup_cluster_id: null,
  last_checked_at: null, last_changed_at: null, expires_at: null
});

/** @returns {Note} */
export const blankNote = (over = {}) => ({
  id: uid('n'), title: '', body_md: '', attachments: [], tags: [], related_ids: [],
  source_item_id: null, synthesis: null, created: Date.now(), updated: Date.now(), ...over
});

/** @returns {Application} */
export const blankApplication = (over = {}) => ({
  id: uid('a'), item_id: null, title: '', org: '', url: null, stage: 'planned',
  dates: [], contact: '', materials: [], next_action: '', next_action_at: null,
  trust: 'manual', notes: '', updated: Date.now(), ...over
});

/** @returns {Goal} */
export const blankGoal = (over = {}) => ({
  id: uid('g'), title: '', target_date: null, checkpoints: [], wall_zone: 'GOALS',
  gold: false, created: Date.now(), ...over
});

/** @returns {WallPin} */
export const blankWallPin = (over = {}) => ({
  id: uid('w'), type: 'text', content: '', caption: '', zone: 'RANDOM',
  position: { x: 0, y: 0, rot: 0 }, pinned_at: Date.now(), ...over
});

/** @returns {Interest} */
export const blankInterest = (id, over = {}) => ({
  id, label: id, kind: 'inferred', weight: 0.2, source: 'save', recency: Date.now(),
  paused: false, seen: 0, skips: [], decayed_at: null, ...over
});

/** @returns {DeadlinePlan} */
export const blankPlan = (item_id, official = null) => ({
  id: item_id, item_id, official_deadline: ms(official), start_by: null, checkpoints: [], reminders: []
});

/** @returns {RefreshLog} */
export const newRefreshLog = source => ({
  id: uid('r'), started_at: Date.now(), finished_at: null, source,
  items_new: 0, items_changed: 0, items_expired: 0, status: 'running', error: null
});

/**
 * When an item stops being valid. Unsaved items past this are gone; saved ones are archived.
 * @param {Partial<FeedItem>} it
 */
export const expiresAt = it =>
  ms(it.expiresAt) ?? ms(it.deadline) ?? ms(it.endDate)
  ?? (it.lastSeen ? new Date(it.lastSeen).getTime() + 30 * 864e5 : Infinity);

/**
 * The freshness receipt, in the three dates the spec asks for.
 * @param {Partial<FeedItem>} it
 */
export const receipt = it => ({
  reported: ms(it.firstSeen),
  checked: ms(it.lastSeen),
  changed: ms(it.lastChanged) ?? ms(it.lastSeen),
  expires: expiresAt(it)
});
