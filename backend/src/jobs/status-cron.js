import { supabase } from '../supabase.js';

const CRON_INTERVAL_MS = 5 * 60 * 1000; // Every 5 minutes

/**
 * Status advancement cron job.
 *
 * Rules:
 *  CLEAN + age >= cleaning_interval_minutes    → NEEDS_CLEANING
 *  NEEDS_CLEANING + age >= 2× interval          → OVERDUE
 *
 * This runs entirely via service role, bypasses RLS, and triggers
 * Supabase Realtime notifications to the admin dashboard.
 */
export function startStatusCron() {
  console.log('[StatusCron] Starting — running every 5 minutes');
  // Run immediately on startup, then on interval
  runStatusAdvancement();
  const handle = setInterval(runStatusAdvancement, CRON_INTERVAL_MS);

  // Return cleanup function (useful for testing)
  return () => clearInterval(handle);
}

async function runStatusAdvancement() {
  const now = new Date();
  console.log(`[StatusCron] Running at ${now.toISOString()}`);

  try {
    // ── 1. CLEAN → NEEDS_CLEANING ────────────────────────────────────────────
    // Find toilets that are CLEAN but last_cleaned_at is older than cleaning_interval_minutes
    const { data: cleanToilets, error: cleanErr } = await supabase
      .from('toilets')
      .select('id, last_cleaned_at, cleaning_interval_minutes')
      .eq('status', 'CLEAN')
      .eq('active', true)
      .not('last_cleaned_at', 'is', null);

    if (cleanErr) {
      console.error('[StatusCron] Error fetching CLEAN toilets:', cleanErr.message);
    } else {
      const needsCleaningIds = (cleanToilets || [])
        .filter(t => {
          const ageMinutes = (Date.now() - new Date(t.last_cleaned_at).getTime()) / 60000;
          return ageMinutes >= t.cleaning_interval_minutes;
        })
        .map(t => t.id);

      if (needsCleaningIds.length > 0) {
        const { error: updateErr } = await supabase
          .from('toilets')
          .update({ status: 'NEEDS_CLEANING' })
          .in('id', needsCleaningIds);

        if (updateErr) {
          console.error('[StatusCron] Error advancing CLEAN → NEEDS_CLEANING:', updateErr.message);
        } else {
          console.log(`[StatusCron] Advanced ${needsCleaningIds.length} toilet(s): CLEAN → NEEDS_CLEANING`);
        }
      }
    }

    // ── 2. NEEDS_CLEANING → OVERDUE ─────────────────────────────────────────
    // Find NEEDS_CLEANING toilets where it's been 2× the cleaning interval since last clean
    const { data: needsCleaningToilets, error: ncErr } = await supabase
      .from('toilets')
      .select('id, last_cleaned_at, cleaning_interval_minutes, created_at')
      .eq('status', 'NEEDS_CLEANING')
      .eq('active', true);

    if (ncErr) {
      console.error('[StatusCron] Error fetching NEEDS_CLEANING toilets:', ncErr.message);
    } else {
      const overdueIds = (needsCleaningToilets || [])
        .filter(t => {
          // Use last_cleaned_at if available, otherwise created_at as baseline
          const baseline = t.last_cleaned_at ? new Date(t.last_cleaned_at) : new Date(t.created_at);
          const ageMinutes = (Date.now() - baseline.getTime()) / 60000;
          return ageMinutes >= 2 * t.cleaning_interval_minutes;
        })
        .map(t => t.id);

      if (overdueIds.length > 0) {
        const { error: overdueErr } = await supabase
          .from('toilets')
          .update({ status: 'OVERDUE' })
          .in('id', overdueIds);

        if (overdueErr) {
          console.error('[StatusCron] Error advancing NEEDS_CLEANING → OVERDUE:', overdueErr.message);
        } else {
          console.log(`[StatusCron] Advanced ${overdueIds.length} toilet(s): NEEDS_CLEANING → OVERDUE`);
        }
      }
    }

    // ── 3. NOT_CLEANED → OVERDUE ─────────────────────────────────────────────
    // Toilets that have never been cleaned and have been active for 2× the cleaning interval
    const { data: notCleanedToilets, error: ncErr2 } = await supabase
      .from('toilets')
      .select('id, created_at, cleaning_interval_minutes')
      .eq('status', 'NOT_CLEANED')
      .eq('active', true)
      .is('last_cleaned_at', null);

    if (!ncErr2) {
      const overdue2 = (notCleanedToilets || [])
        .filter(t => {
          const ageMinutes = (Date.now() - new Date(t.created_at).getTime()) / 60000;
          return ageMinutes >= 2 * t.cleaning_interval_minutes;
        })
        .map(t => t.id);

      if (overdue2.length > 0) {
        await supabase.from('toilets').update({ status: 'OVERDUE' }).in('id', overdue2);
        console.log(`[StatusCron] Advanced ${overdue2.length} never-cleaned toilet(s): NOT_CLEANED → OVERDUE`);
      }
    }

    console.log('[StatusCron] Cycle complete');
  } catch (err) {
    console.error('[StatusCron] Unexpected error:', err);
  }
}
