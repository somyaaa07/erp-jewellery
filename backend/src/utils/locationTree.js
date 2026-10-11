// utils/locationTree.js
// Helpers for the storage hierarchy (Safe > Box > Sub-box > Tray ...). The tree is small
// (hundreds of nodes per branch), so it is loaded once and resolved in memory.
import db from '../models/index.js';

export const MAX_DEPTH = 10;

export async function loadLocations(tenant_id, branch_id, transaction) {
  const where = { tenant_id };
  if (branch_id) where.branch_id = branch_id;
  return db.Location.findAll({ where, transaction, order: [['name', 'ASC']] });
}

export function indexById(locations) {
  const byId = new Map();
  locations.forEach((l) => byId.set(l.id, l));
  return byId;
}

// "Main Safe > Box B1 > Tray T1"
export function pathNames(locationId, byId) {
  const names = [];
  const seen = new Set();
  let cur = byId.get(locationId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    names.unshift(cur.name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : null;
  }
  return names;
}

export const pathString = (locationId, byId) => pathNames(locationId, byId).join(' > ');

// Nearest ancestor (or the location itself) of a given container type, e.g. the COUNTER a tray is on.
export function nearestOfType(locationId, byId, type) {
  const seen = new Set();
  let cur = byId.get(locationId);
  while (cur && !seen.has(cur.id)) {
    if (cur.container_type === type) return cur;
    seen.add(cur.id);
    cur = cur.parent_id ? byId.get(cur.parent_id) : null;
  }
  return null;
}

// The location itself plus everything nested inside it, at any depth.
export function subtreeIds(rootId, locations) {
  const children = new Map();
  locations.forEach((l) => {
    if (!children.has(l.parent_id)) children.set(l.parent_id, []);
    children.get(l.parent_id).push(l.id);
  });
  const out = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    out.push(id);
    (children.get(id) || []).forEach((c) => stack.push(c));
  }
  return out;
}

export function subtreeHeight(rootId, locations) {
  const children = new Map();
  locations.forEach((l) => {
    if (!children.has(l.parent_id)) children.set(l.parent_id, []);
    children.get(l.parent_id).push(l.id);
  });
  const walk = (id) => 1 + Math.max(0, ...(children.get(id) || []).map(walk));
  return walk(rootId);
}
