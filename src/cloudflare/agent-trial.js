import { requireThat } from '../core/errors.js';
import { SENDA_PLAN } from '../server/billing/plan.js';

export async function trialStatus(db, owner) {
  const grant = await db.prepare('SELECT * FROM senda_agent_trials WHERE owner=?')
    .bind(owner).first();
  const usage = await db.prepare(`SELECT
  COALESCE(SUM(CASE WHEN status<>'running' THEN COALESCE(cost_usd,reserved_usd) ELSE 0 END),0) AS used,
  COALESCE(SUM(CASE WHEN status='running' THEN reserved_usd ELSE 0 END),0) AS pending
  FROM senda_agent_runs WHERE trial_owner=?`).bind(owner).first();
  const limitUsd = grant?.limit_usd ?? SENDA_PLAN.trialUsd;
  return {
    projectId: grant?.project || null,
    chatId: grant?.chat || null,
    limitUsd,
    usedUsd: usage.used,
    pendingUsd: usage.pending,
    remainingUsd: Math.max(0, limitUsd - usage.used - usage.pending)
  };
}

export function trialMatches(trial, chatId, projectId) {
  return !trial.chatId || (trial.projectId ? trial.projectId === projectId : trial.chatId === chatId || !!projectId);
}

export async function claimTrial(db, owner, chat) {
  await db.prepare('INSERT INTO senda_agent_trials(owner,chat,project,limit_usd,created) VALUES(?,?,?,?,?) ON CONFLICT(owner) DO NOTHING')
    .bind(owner, chat.id, chat.project || null, SENDA_PLAN.trialUsd, new Date().toISOString()).run();
  let trial = await trialStatus(db, owner);
  if (!trial.projectId && trial.chatId !== chat.id && chat.project) {
    // Recover an uncreated trial without abandoning its lifetime usage or an active reply.
    await db.prepare(`UPDATE senda_agent_trials SET chat=?,project=? WHERE owner=? AND project IS NULL
      AND NOT EXISTS(SELECT 1 FROM senda_agent_runs WHERE trial_owner=? AND status='running')
      AND EXISTS(SELECT 1 FROM senda_projects WHERE id=? AND owner=?)
      AND EXISTS(SELECT 1 FROM senda_agent_chats WHERE id=? AND owner=? AND project=? AND lock_id=?)`)
      .bind(chat.id, chat.project, owner, owner, chat.project, owner, chat.id, owner, chat.project, chat.lock_id).run();
    trial = await trialStatus(db, owner);
    requireThat(trial.projectId === chat.project, 'CONFLICT',
      'A trial reply is still being prepared. Open your original conversation and wait for it to finish before choosing an existing project.');
  }
  requireThat(trialMatches(trial, chat.id, chat.project), 'TRIAL_PROJECT',
    'Your free Luna trial is for one project. Continue that project, or choose Pro to use Luna on other projects.');
  return { kind: 'trial', limitUsd: trial.limitUsd, dailyUsd: trial.limitUsd };
}

export async function bindTrialProject(db, owner, chatId, projectId, runId) {
  const results = await db.batch([
    db.prepare(`UPDATE senda_agent_trials SET project=? WHERE owner=? AND chat=? AND project IS NULL
   AND EXISTS(SELECT 1 FROM senda_projects WHERE id=? AND owner=?)
   AND EXISTS(SELECT 1 FROM senda_agent_chats WHERE id=? AND owner=? AND lock_id=?)`)
      .bind(projectId, owner, chatId, projectId, owner, chatId, owner, runId),
    db.prepare(`UPDATE senda_agent_chats SET project=? WHERE id=? AND owner=? AND lock_id=?
   AND EXISTS(SELECT 1 FROM senda_agent_trials WHERE owner=? AND project=?)`)
      .bind(projectId, chatId, owner, runId, owner, projectId),
  ]);
  requireThat(results.every(r => r.meta.changes === 1), 'TRIAL_PROJECT',
    'This project could not be linked to your trial. Your saved work is safe.');
}
