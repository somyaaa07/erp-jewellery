// Flat list of every storage location with its full path ("Main Safe > Box B1"), for dropdowns.
import { useEffect, useState } from 'react';
import api from '../api/axios';

export function buildOptions(locations) {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const pathOf = (l) => {
    const names = [];
    const seen = new Set();
    let cur = l;
    while (cur && !seen.has(cur.id)) { seen.add(cur.id); names.unshift(cur.name); cur = cur.parent_id ? byId.get(cur.parent_id) : null; }
    return names.join(' > ');
  };
  const rootOf = (l) => {
    const seen = new Set();
    let cur = l;
    while (cur.parent_id && byId.has(cur.parent_id) && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.parent_id); }
    return cur;
  };
  return locations
    .map((l) => ({
      id: l.id, name: l.name, level: l.level, parent_id: l.parent_id, container_type: l.container_type,
      branch_id: l.branch_id, storage_type: l.storage_type, label: pathOf(l), in_wholesale: rootOf(l).storage_type === 'WHOLESALE_STORE',
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export default function useLocationOptions(scope) {
  const [options, setOptions] = useState([]);
  const reload = () => {
    if (scope && !scope.ready) return;
    api.get('/locations', { params: scope ? scope.params : {} })
      .then((res) => setOptions(buildOptions(Array.isArray(res.data) ? res.data : [])))
      .catch(() => setOptions([]));
  };
  useEffect(reload, [scope?.ready, scope?.branchId]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    options,
    reload,
    counters: options.filter((o) => o.container_type === 'COUNTER'),
    wholesaleBoxes: options.filter((o) => o.in_wholesale),
  };
}
