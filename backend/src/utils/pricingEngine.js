// utils/pricingEngine.js
//
// THIS FILE IS THE HEART OF THE PRICING SYSTEM.
//
// Idea: an item's price is never stored in the DB (except a PriceSnapshot at sale time).
// Whenever a price is needed (listing, item detail, invoice preview) it is calculated LIVE:
//
//   gold_value   = net_weight x today's gold rate (for that purity)
//   making       = per the pricing profile (per gram / % of gold / flat)
//   wastage      = gross_weight x wastage% x gold rate
//   stone_value  = total of all stones on the item (rate x weight)
//   subtotal     = gold_value + making + wastage + stone_value + other_charges
//   final_price  = subtotal + GST
//
// So when the gold rate changes tomorrow, every price updates automatically - no need to
// edit any item manually. Only at the moment of sale is a snapshot frozen.
//
// IMPORTANT (changed): an item has exactly ONE sales channel - RETAIL or WHOLESALE - decided
// by how it entered inventory. We no longer force both prices onto every item. The item's own
// channel decides which pricing profile is used.
import db from '../models/index.js';

const { GoldRate, PricingProfile } = db;

export const CHANNELS = ['RETAIL', 'WHOLESALE'];

/**
 * Returns the single sales channel an item belongs to.
 * Priority: explicit `channel` column -> legacy is_wholesale/is_retail flags -> RETAIL.
 */
export function getItemChannel(item) {
  if (!item) return 'RETAIL';
  if (item.channel && CHANNELS.includes(item.channel)) return item.channel;
  if (item.is_wholesale && !item.is_retail) return 'WHOLESALE';
  return 'RETAIL';
}

// Latest gold rate for this tenant/branch/purity up to today (or a given date).
export async function getLatestGoldRate({ tenant_id, branch_id, metal_type, purity, asOfDate }) {
  const { Op } = await import('sequelize');
  const dateFilter = asOfDate ? { [Op.lte]: asOfDate } : { [Op.lte]: new Date() };

  const rate = await GoldRate.findOne({
    where: {
      tenant_id,
      metal_type,
      purity,
      rate_date: dateFilter,
      [Op.or]: [{ branch_id }, { branch_id: null }],
    },
    // branch-specific rate wins over a tenant-wide rate
    order: [['rate_date', 'DESC'], ['branch_id', 'DESC']],
    limit: 1,
  });

  return rate; // can be null if no rate has ever been set - caller must handle it
}

// Find the most specific pricing profile: branch+category > branch only > category only > tenant default
export async function resolvePricingProfile({ tenant_id, branch_id, category_id, profile_type }) {
  const candidates = await PricingProfile.findAll({
    where: { tenant_id, profile_type, is_active: true },
  });

  const score = (p) => (p.branch_id === branch_id ? 2 : p.branch_id === null ? 0 : -1)
    + (p.category_id === category_id ? 2 : p.category_id === null ? 0 : -1);

  const valid = candidates.filter((p) => (p.branch_id === branch_id || p.branch_id === null)
    && (p.category_id === category_id || p.category_id === null));

  if (valid.length === 0) return null;
  valid.sort((a, b) => score(b) - score(a));
  return valid[0];
}

function computeStoneValue(stones) {
  return (stones || []).reduce((sum, s) => {
    if (s.stone_rate == null) return sum;
    return sum + parseFloat(s.stone_rate) * parseFloat(s.stone_weight_carat || 0);
  }, 0);
}

/**
 * Full price breakdown for one item under one profile type (RETAIL / WHOLESALE).
 * `item` must include: ProductMaster (with category_id, metal_type), MetalDetail,
 * StoneDetails[], BulkItem (for BULK), override_price.
 */
export async function computeItemPrice(item, profileType, { asOfDate } = {}) {
  if (item.override_price != null) {
    return {
      profile_type: profileType,
      final_price: parseFloat(item.override_price),
      is_override: true,
      breakdown: { note: 'Price was set manually - the formula was skipped for this item.' },
    };
  }

  const product = item.ProductMaster;
  const metal = item.MetalDetail;
  if (!product || !metal) {
    throw new Error('This item has no linked design or metal detail, so its price cannot be calculated.');
  }

  const purity = metal.purity || product.default_purity;

  // For BULK items MetalDetail/gross_weight holds the weight of the WHOLE LOT (all pieces).
  // Price is always quoted PER PIECE, so we must derive the average per-piece weight here -
  // otherwise the price would come out multiplied by the number of pieces.
  let grossWeight = parseFloat(metal.gross_weight || 0);
  let netWeight = parseFloat(metal.net_weight ?? (grossWeight - parseFloat(metal.less_weight || 0)));
  if (item.mode === 'BULK' && item.BulkItem && Number(item.BulkItem.total_pieces) > 0) {
    const pieces = Number(item.BulkItem.total_pieces);
    grossWeight = parseFloat(item.BulkItem.total_gross_weight) / pieces;
    netWeight = parseFloat(item.BulkItem.total_net_weight) / pieces;
  }

  const goldRate = await getLatestGoldRate({
    tenant_id: item.tenant_id, branch_id: item.branch_id, metal_type: product.metal_type, purity, asOfDate,
  });
  if (!goldRate) {
    throw new Error(`No rate has been set for ${purity} ${product.metal_type}. Add today's rate on the Metal Rates page first.`);
  }
  const ratePerGram = parseFloat(goldRate.rate_per_gram);

  const profile = await resolvePricingProfile({
    tenant_id: item.tenant_id, branch_id: item.branch_id, category_id: product.category_id, profile_type: profileType,
  });
  if (!profile) {
    throw new Error(`No ${profileType} pricing profile has been set up yet. Create one on the Pricing page.`);
  }

  // A design-level override (making/wastage set on the ProductMaster) beats the general profile
  const makingType = product.making_charge_type || profile.making_charge_type;
  const makingValue = product.making_charge_value != null ? parseFloat(product.making_charge_value) : parseFloat(profile.making_charge_value);
  const wastagePercent = product.wastage_percent_override != null ? parseFloat(product.wastage_percent_override) : parseFloat(profile.wastage_percent);

  const goldValue = netWeight * ratePerGram;

  let makingCharge = 0;
  if (makingType === 'PER_GRAM') makingCharge = netWeight * makingValue;
  else if (makingType === 'PERCENT_OF_GOLD') makingCharge = goldValue * (makingValue / 100);
  else makingCharge = makingValue; // FLAT

  const wastageAmount = grossWeight * (wastagePercent / 100) * ratePerGram;

  const stones = item.StoneDetails || [];
  const stoneValue = computeStoneValue(stones);

  const otherCharges = parseFloat(profile.other_charges_flat || 0);

  const subtotal = goldValue + makingCharge + wastageAmount + stoneValue + otherCharges;
  const gstAmount = subtotal * (parseFloat(profile.gst_percent) / 100);
  const finalPrice = subtotal + gstAmount;

  return {
    profile_type: profileType,
    is_override: false,
    breakdown: {
      purity,
      gold_rate_used: ratePerGram,
      net_weight: round3(netWeight),
      gross_weight: round3(grossWeight),
      gold_value: round2(goldValue),
      making_charge: round2(makingCharge),
      making_charge_type: makingType,
      making_charge_value: makingValue,
      wastage_percent: wastagePercent,
      wastage_amount: round2(wastageAmount),
      stone_value: round2(stoneValue),
      other_charges: round2(otherCharges),
      subtotal: round2(subtotal),
      gst_percent: parseFloat(profile.gst_percent),
      gst_amount: round2(gstAmount),
    },
    final_price: round2(finalPrice),
  };
}

/**
 * The price an item is actually sold at - calculated only for the channel the item came in on.
 * Returns: { channel, price | error }
 */
export async function computeChannelPrice(item, opts = {}) {
  const channel = getItemChannel(item);
  try {
    const price = await computeItemPrice(item, channel, opts);
    return { channel, price, error: null };
  } catch (e) {
    return { channel, price: null, error: e.message };
  }
}

/**
 * Backwards-compatible shape used by reports and the dashboard.
 * Only the item's own channel is priced; the other channel is returned as not applicable,
 * because an item belongs to one channel only.
 */
export async function computeBothPrices(item, opts = {}) {
  const { channel, price, error } = await computeChannelPrice(item, opts);
  const notApplicable = { not_applicable: true, error: `This item is ${channel} stock.` };

  return {
    channel,
    price: price || { error },
    retail: channel === 'RETAIL' ? (price || { error }) : notApplicable,
    wholesale: channel === 'WHOLESALE' ? (price || { error }) : notApplicable,
  };
}

function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }
