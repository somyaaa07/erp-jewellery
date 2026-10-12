// backend/src/utils/attendanceCalculator.js
/**
 * Authoritative Attendance Calculation Engine
 *
 * Computes:
 * - Late arrival minutes with grace period
 * - Early departure minutes
 * - Actual working hours (strictly requires both actual check-in and checkout)
 * - Overnight shifts across midnight
 */

/**
 * Convert time string "HH:mm:ss" or "HH:mm" to minutes from 00:00.
 * @param {string|null} timeStr
 * @returns {number|null}
 */
export function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * Format total minutes as "Xh Ym" or "0h 0m"
 * @param {number|null} minutes
 * @returns {string}
 */
export function formatMinutesToHuman(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '—';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hrs}h ${mins}m`;
}

/**
 * Calculate attendance metrics from shift schedules and actual punch times.
 *
 * @param {Object} shift - { start_time, end_time, grace_period_minutes, half_day_threshold_hours, is_overnight }
 * @param {string|null} actualCheckIn - "HH:mm:ss" or "HH:mm"
 * @param {string|null} actualCheckOut - "HH:mm:ss" or "HH:mm"
 * @returns {Object} {
 *   late_minutes: number,
 *   early_departure_minutes: number,
 *   working_hours: number|null,
 *   is_incomplete: boolean,
 *   is_half_day_suggested: boolean,
 *   is_overnight: boolean
 * }
 */
export function calculateAttendanceMetrics(shift, actualCheckIn, actualCheckOut) {
  const result = {
    late_minutes: 0,
    early_departure_minutes: 0,
    working_hours: null,
    is_incomplete: false,
    is_half_day_suggested: false,
    is_overnight: false,
  };

  const actualInMins = timeToMinutes(actualCheckIn);
  const actualOutMins = timeToMinutes(actualCheckOut);

  // If no check-in, cannot compute timings
  if (actualInMins === null) {
    result.is_incomplete = true;
    return result;
  }

  // Shift schedule evaluation
  if (shift && shift.start_time && shift.end_time) {
    const shiftStartMins = timeToMinutes(shift.start_time);
    let shiftEndMins = timeToMinutes(shift.end_time);
    const grace = parseInt(shift.grace_period_minutes || 0, 10);

    // Determine overnight shift
    const isOvernight = Boolean(shift.is_overnight || (shiftEndMins !== null && shiftEndMins < shiftStartMins));
    result.is_overnight = isOvernight;

    if (isOvernight && shiftEndMins !== null && shiftEndMins < shiftStartMins) {
      shiftEndMins += 1440; // Shift ends next morning
    }

    // 1. Calculate Late Minutes
    if (shiftStartMins !== null) {
      const diffIn = actualInMins - shiftStartMins;
      if (diffIn > grace) {
        result.late_minutes = diffIn;
      } else {
        result.late_minutes = 0;
      }
    }

    // 2. Calculate Early Departure Minutes (only if actual checkout exists)
    if (actualOutMins !== null && shiftEndMins !== null) {
      let effectiveOutMins = actualOutMins;
      if (isOvernight && effectiveOutMins < shiftStartMins) {
        effectiveOutMins += 1440; // Checkout occurred next day
      }

      const diffOut = shiftEndMins - effectiveOutMins;
      if (diffOut > 0) {
        result.early_departure_minutes = diffOut;
      } else {
        result.early_departure_minutes = 0;
      }
    }
  }

  // 3. Calculate Working Hours (strictly requires BOTH check-in and check-out)
  if (actualInMins !== null && actualOutMins !== null) {
    let effectiveOut = actualOutMins;
    if (result.is_overnight && effectiveOut < actualInMins) {
      effectiveOut += 1440;
    } else if (!result.is_overnight && effectiveOut < actualInMins) {
      // Midnight crossover even if not explicitly configured as overnight
      effectiveOut += 1440;
    }

    const durationMinutes = effectiveOut - actualInMins;
    if (durationMinutes >= 0) {
      result.working_hours = Number((durationMinutes / 60).toFixed(2));
      result.is_incomplete = false;

      // Half-day check against threshold if configured
      const halfDayThreshold = parseFloat(shift?.half_day_threshold_hours || 4.0);
      if (result.working_hours < halfDayThreshold) {
        result.is_half_day_suggested = true;
      }
    }
  } else {
    // Missing checkout: attendance is incomplete
    result.is_incomplete = true;
    result.working_hours = null;
  }

  return result;
}

/**
 * Validate punch times consistency.
 * Throws an error if punch times are logically impossible.
 */
export function validatePunchTimes(actualCheckIn, actualCheckOut, isOvernight = false) {
  if (actualCheckIn && actualCheckOut) {
    const inMins = timeToMinutes(actualCheckIn);
    const outMins = timeToMinutes(actualCheckOut);
    if (inMins !== null && outMins !== null) {
      if (!isOvernight && outMins < inMins) {
        throw new Error('Check-out time cannot be earlier than check-in time for same-day shifts');
      }
    }
  }
}
