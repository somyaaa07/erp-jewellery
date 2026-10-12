// backend/src/utils/leaveCalculator.js

/**
 * Helper to parse a YYYY-MM-DD string into a Date object at UTC midnight.
 * Avoids timezone drift issues.
 * @param {string} dateStr
 * @returns {Date}
 */
export function parseDateOnly(dateStr) {
  if (!dateStr || typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    throw new Error(`Invalid date format '${dateStr}'. Expected YYYY-MM-DD.`);
  }
  const [year, month, day] = dateStr.trim().split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Format a Date object to YYYY-MM-DD.
 * @param {Date} date
 * @returns {string}
 */
export function formatDateOnly(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Check if a date string falls on a Sunday.
 * In Indian retail/jewellery operations without a custom roster, Sunday is the default weekly off.
 * @param {string} dateStr
 * @returns {boolean}
 */
export function isSunday(dateStr) {
  const dt = parseDateOnly(dateStr);
  return dt.getUTCDay() === 0;
}

/**
 * Generate all dates between start and end date (inclusive) as YYYY-MM-DD strings.
 * @param {string} startDateStr
 * @param {string} endDateStr
 * @returns {string[]}
 */
export function getDatesInRange(startDateStr, endDateStr) {
  const start = parseDateOnly(startDateStr);
  const end = parseDateOnly(endDateStr);

  if (start > end) {
    throw new Error(`Start date (${startDateStr}) cannot be after end date (${endDateStr}).`);
  }

  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(formatDateOnly(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Calculate chargeable leave days, applying policy exclusions (weekly-offs and holidays)
 * and splitting deductions across calendar years.
 *
 * @param {Object} params
 * @param {string} params.startDate - YYYY-MM-DD
 * @param {string} params.endDate - YYYY-MM-DD
 * @param {boolean} params.isHalfDay - whether this is a half-day leave
 * @param {Object} params.leaveType - LeaveType record { exclude_weekly_offs, exclude_holidays, is_paid, name }
 * @param {Array} [params.existingAttendances] - existing attendance records for the dates (e.g. marked HOLIDAY or WEEKLY_OFF)
 * @returns {Object} {
 *   total_days: number,
 *   yearly_breakdown: Object.<string, number>, // e.g. { "2026": 2.0, "2027": 1.0 }
 *   chargeable_dates: string[],
 *   excluded_dates: Array<{ date: string, reason: string }>
 * }
 */
export function calculateChargeableLeaveDays({
  startDate,
  endDate,
  isHalfDay = false,
  leaveType = {},
  existingAttendances = [],
}) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (start > end) {
    throw new Error(`Start date (${startDate}) cannot be after end date (${endDate}).`);
  }

  // Handle Half-day leave
  if (isHalfDay) {
    if (startDate !== endDate) {
      throw new Error(`Half-day leave must start and end on the exact same date (${startDate} != ${endDate}).`);
    }

    const year = String(start.getUTCFullYear());
    return {
      total_days: 0.5,
      yearly_breakdown: { [year]: 0.5 },
      chargeable_dates: [startDate],
      excluded_dates: [],
    };
  }

  // Build map of recorded attendances by date for O(1) status check
  const attendanceMap = new Map();
  if (Array.isArray(existingAttendances)) {
    existingAttendances.forEach((att) => {
      if (att && att.attendance_date) {
        attendanceMap.set(att.attendance_date, att.status);
      }
    });
  }

  const allDates = getDatesInRange(startDate, endDate);
  const chargeable_dates = [];
  const excluded_dates = [];
  const yearly_breakdown = {};

  const excludeWeeklyOffs = Boolean(leaveType.exclude_weekly_offs);
  const excludeHolidays = Boolean(leaveType.exclude_holidays);

  for (const dateStr of allDates) {
    const recordedStatus = attendanceMap.get(dateStr);

    // 1. Check Holiday exclusion (from recorded attendance punch)
    if (excludeHolidays && recordedStatus === 'HOLIDAY') {
      excluded_dates.push({ date: dateStr, reason: 'HOLIDAY' });
      continue;
    }

    // 2. Check Weekly-off exclusion (either recorded punch or default Sunday)
    if (excludeWeeklyOffs) {
      if (recordedStatus === 'WEEKLY_OFF') {
        excluded_dates.push({ date: dateStr, reason: 'WEEKLY_OFF' });
        continue;
      }
      if (isSunday(dateStr)) {
        excluded_dates.push({ date: dateStr, reason: 'SUNDAY_WEEKLY_OFF' });
        continue;
      }
    }

    // Day is chargeable
    chargeable_dates.push(dateStr);
    const year = dateStr.slice(0, 4);
    yearly_breakdown[year] = (yearly_breakdown[year] || 0) + 1.0;
  }

  const total_days = chargeable_dates.length;

  return {
    total_days,
    yearly_breakdown,
    chargeable_dates,
    excluded_dates,
  };
}
