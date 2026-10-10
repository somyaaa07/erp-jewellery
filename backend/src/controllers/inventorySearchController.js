// controllers/inventorySearchController.js
// One search over everything physical: trays (grouped per design) and wholesale lots.
// Results always show the CURRENT place - the movement history lives in the audit trail.
//
//   GET /inventory-search?q=&design_id=&counter_id=&location_id=&category_id=&kind=&quantity_status=
//     q                text matched against design code/name, tray name, item code, HUID and the
//                      location path (so typing a box or counter name works too)
//     design_id        one design: shows every tray and box it is in
//     counter_id       everything on that counter (its trays, and anything nested in it)
//     location_id      everything inside that container, at any depth
//     category_id      optional filter on the design's category
//     kind             TRAY | WHOLESALE (default both)
//     quantity_status  CONFIRMED | UNKNOWN | ISSUED_TO_KARIGAR (wholesale lots)
import db from '../models/index.js';
import {
  loadLocations, indexById, pathString, nearestOfType, subtreeIds,
} from '../utils/locationTree.js';

const {
  Item, BulkItem, MetalDetail, ProductMaster, Category, DisplayTray, DisplayTrayItem,
} = db;

const round3 = (n) => Number(Number(n || 0).toFixed(3));

export const searchInventory = async (req, res, next) => {
  try {
    const tenant_id = req.scope.tenant_id;
    const branch_id = req.query.branch_id || req.scope.branch_id || null;
    const q = String(req.query.q || '').trim().toLowerCase();
    const { design_id, counter_id, location_id, category_id, kind, quantity_status } = req.query;

    const locations = await loadLocations(tenant_id, branch_id);
    const byId = indexById(locations);
    const scopeId = counter_id || location_id || null;
    const allowed = scopeId ? new Set(subtreeIds(Number(scopeId), locations)) : null;

    const rows = [];

    // ---- Trays: one row per tray + design ----
    if (!kind || kind === 'TRAY') {
      const trayWhere = { tenant_id, is_active: true };
      if (branch_id) trayWhere.branch_id = branch_id;
      const trays = await DisplayTray.findAll({ where: trayWhere });
      const trayById = new Map(trays.map((t) => [t.id, t]));

      const pieceWhere = { tenant_id, status: 'ON_DISPLAY' };
      if (branch_id) pieceWhere.branch_id = branch_id;
      if (design_id) pieceWhere.product_master_id = design_id;
      const pieces = await DisplayTrayItem.findAll({
        where: pieceWhere,
        include: [{ model: ProductMaster, include: [Category] }],
      });

      const groups = new Map();
      pieces.forEach((p) => {
        const tray = trayById.get(p.tray_id);
        if (!tray) return;
        if (allowed && !(tray.location_id && allowed.has(tray.location_id))) return;
        const key = `${p.tray_id}:${p.product_master_id}`;
        if (!groups.has(key)) groups.set(key, { tray, product: p.ProductMaster, pieces: [] });
        groups.get(key).pieces.push(p);
      });

      groups.forEach(({ tray, product, pieces: ps }) => {
        const path = tray.location_id ? pathString(tray.location_id, byId) : null;
        const counter = tray.location_id ? nearestOfType(tray.location_id, byId, 'COUNTER') : null;
        const withImage = ps.find((p) => p.image_url);
        rows.push({
          kind: 'TRAY',
          product_master_id: product?.id, design_code: product?.design_code, design_name: product?.product_name,
          category_id: product?.category_id, category: product?.Category?.name || null,
          image_url: withImage?.image_url || product?.default_image_url || null,
          tray_id: tray.id, tray_name: tray.name,
          location_id: tray.location_id, location_path: path || 'Not placed',
          counter: counter?.name || null, counter_id: counter?.id || null,
          pieces: ps.length, weight: round3(ps.reduce((s, p) => s + Number(p.weight), 0)),
          quantity_status: 'CONFIRMED',
          item_codes: ps.map((p) => p.item_code), huids: ps.map((p) => p.huid_code).filter(Boolean),
        });
      });
    }

    // ---- Wholesale lots: one row per design per box ----
    if (!kind || kind === 'WHOLESALE') {
      const itemWhere = { tenant_id, status: 'IN_STOCK', is_tray_display: false, mode: 'BULK' };
      if (branch_id) itemWhere.branch_id = branch_id;
      if (design_id) itemWhere.product_master_id = design_id;
      const lots = await Item.findAll({
        where: itemWhere,
        include: [BulkItem, MetalDetail, { model: ProductMaster, include: [Category] }],
      });
      lots.forEach((lot) => {
        if (allowed && !allowed.has(lot.location_id)) return;
        const status = lot.BulkItem?.quantity_status || 'CONFIRMED';
        rows.push({
          kind: 'WHOLESALE',
          item_id: lot.id,
          product_master_id: lot.product_master_id, design_code: lot.ProductMaster?.design_code, design_name: lot.ProductMaster?.product_name,
          category_id: lot.ProductMaster?.category_id, category: lot.ProductMaster?.Category?.name || null,
          image_url: lot.ProductMaster?.default_image_url || null,
          tray_id: null, tray_name: null,
          location_id: lot.location_id, location_path: pathString(lot.location_id, byId),
          counter: null, counter_id: null,
          pieces: Number(lot.BulkItem?.total_pieces || 0), weight: round3(lot.BulkItem?.total_gross_weight),
          quantity_status: status,
          item_codes: [], huids: [],
        });
      });
    }

    const filtered = rows.filter((r) => {
      if (category_id && Number(r.category_id) !== Number(category_id)) return false;
      if (quantity_status && r.quantity_status !== quantity_status) return false;
      if (!q) return true;
      const hay = [
        r.design_code, r.design_name, r.tray_name, r.location_path, r.counter, ...r.item_codes, ...r.huids,
      ].filter(Boolean).join(' | ').toLowerCase();
      return hay.includes(q);
    });

    filtered.sort((a, b) => (
      String(a.design_code).localeCompare(String(b.design_code))
      || String(a.counter || '').localeCompare(String(b.counter || ''))
      || String(a.tray_name || '').localeCompare(String(b.tray_name || ''))
    ));

    res.json({
      count: filtered.length,
      rows: filtered.slice(0, 500),
      totals: {
        tray_pieces: filtered.filter((r) => r.kind === 'TRAY').reduce((s, r) => s + r.pieces, 0),
        wholesale_pieces: filtered.filter((r) => r.kind === 'WHOLESALE').reduce((s, r) => s + r.pieces, 0),
        weight: round3(filtered.reduce((s, r) => s + r.weight, 0)),
      },
    });
  } catch (err) { next(err); }
};
