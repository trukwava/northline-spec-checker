/* Northline Atelier / Contrast Room.
   Pure comparison engine + read-only browser presentation. Never approves or imports evidence. */

const KEYS = {
  jobReference: 'Job reference', printMethod: 'Print method', dueDate: 'Due date',
  artwork: 'Artwork revision', finish: 'Surface finish',
  emboss: 'Emboss / deboss', handling: 'Special handling', unit: 'Dimension unit'
};
export const nameOf = field => KEYS[field] || String(field).replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
export const signature = record => JSON.stringify([record?.value ?? null, record?.unit ?? null]);
export const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

/** Contrast only current unquoted assertions. Neither questions nor quotations establish values. */
export function compareJob(job) {
  const groups = new Map();
  const sources = new Map((job.messages || []).map(message => [message.id, message]));
  for (const candidate of job.candidates || []) {
    const group = groups.get(candidate.field) || { field: candidate.field, asserted: new Map(), context: [] };
    if (candidate.kind === 'assertion' && !job.candidateReviews?.[candidate.id]) {
      const key = signature(candidate);
      if (!group.asserted.has(key)) group.asserted.set(key, []);
      group.asserted.get(key).push(candidate);
    } else group.context.push({...candidate, kind:job.candidateReviews?.[candidate.id]?'rejected assertion':candidate.kind});
    groups.set(candidate.field, group);
  }
  const contested = [];
  for (const group of groups.values()) {
    if (group.asserted.size < 2) continue;
    contested.push({
      field: group.field,
      selected: job.resolutions?.[group.field] || null,
      alternatives: [...group.asserted.values()].map(candidates => ({
        value: candidates[0].value,
        unit: candidates[0].unit,
        records: candidates.map(candidate => ({...candidate, sourceName: sources.get(candidate.sourceId)?.name || 'Source record'}))
      })),
      context: group.context.map(candidate => ({...candidate, sourceName: sources.get(candidate.sourceId)?.name || 'Source record'}))
    });
  }
  const release = (job.revisions || []).at(-1) || null;
  const released = release?.spec || {};
  const current = job.resolutions || {};
  const changes = [];
  if (release) {
    for (const field of new Set([...Object.keys(released), ...Object.keys(current)])) {
      const before = released[field], after = current[field];
      if (!before && !after) continue;
      if (before && !after) changes.push({field, kind:'unresolved', before, after:null});
      else if (!before && after) changes.push({field, kind:'added', before:null, after});
      else if (signature(before) !== signature(after)) changes.push({field, kind:'changed', before, after});
    }
  }
  const newSources = release ? (job.messages || []).filter(message => !(release.sourceIds || []).includes(message.id)) : [];
  const excluded = (job.candidates || []).filter(candidate => job.candidateReviews?.[candidate.id]).map(candidate => ({
    ...candidate, sourceName:sources.get(candidate.sourceId)?.name||'Source record',
    review:job.candidateReviews[candidate.id]
  }));
  const priorReviews=release?.candidateReviewSnapshot||{};
  const activeReviews=job.candidateReviews||{};
  const reviewChanges=release ? [...new Set([...Object.keys(priorReviews),...Object.keys(activeReviews)])]
    .filter(id=>JSON.stringify(priorReviews[id]||null)!==JSON.stringify(activeReviews[id]||null))
    .map(id=>({id, field:job.candidates?.find(candidate=>candidate.id===id)?.field||'unknown',before:priorReviews[id]||null,after:activeReviews[id]||null})) : [];
  return { contested, release, changes, newSources, excluded, reviewChanges, sources, blockers: job.issues || [] };
}

const formatValue = record => record ? `${safe(record.value)}${record.unit ? ' <span class="contrast-unit">'+safe(record.unit)+'</span>' : ''}` : '<span class="contrast-muted">Unresolved</span>';
const sourceButton = record => `<button type="button" class="contrast-source" data-evidence="${safe(record.sourceId)}" data-line="${Number(record.line) || 1}">${safe(record.sourceName)} · L${Number(record.line) || 1} ↗</button>`;
const sectionCard = group => `<article class="contrast-case"><header class="contrast-case-head"><div><span class="contrast-index">CONTESTED FIELD / ${safe(group.field.toUpperCase())}</span><h3>${safe(nameOf(group.field))}</h3></div><span class="contrast-caution">${group.selected ? 'REVIEWED DECISION' : 'DECISION REQUIRED'}</span></header><div class="contrast-columns">${group.alternatives.map((alternative,i) => `<div class="contrast-option"><span class="contrast-sequence">CLAIM / ${String(i+1).padStart(2,'0')}</span><div class="contrast-option-value">${formatValue(alternative)}</div><div class="contrast-subtitle">${alternative.records.length} direct assertion${alternative.records.length===1?'':'s'} — not automatically approved</div><div class="contrast-evidence">${alternative.records.map(sourceButton).join('')}</div></div>`).join('')}</div>${group.selected ? `<div class="contrast-verdict"><span>RECORDED REVIEWER DECISION</span><strong>${formatValue(group.selected)}</strong><small>${safe(group.selected.basis || 'Review decision')}</small></div>` : `<div class="contrast-verdict attention"><span>UNRESOLVED</span><p>No selected value. The reviewer must inspect source evidence and confirm a decision in the specification ledger.</p></div>`}${group.context.length ? `<details class="contrast-context"><summary>${group.context.length} question / quoted-history record${group.context.length===1?'':'s'} excluded from assertions</summary><div>${group.context.map(record => `<div class="contrast-context-row"><span>${safe(record.kind)}</span><strong>${safe(record.raw)}</strong>${sourceButton(record)}</div>`).join('')}</div></details>` : ''}<button type="button" class="contrast-ledger-link" data-to-field="${safe(group.field)}">Review ${safe(nameOf(group.field).toLowerCase())} in the ledger ↗</button></article>`;
const deltaCard = change => `<div class="contrast-delta-row"><div><span class="contrast-index">${safe(change.kind.toUpperCase())}</span><h4>${safe(nameOf(change.field))}</h4></div><div class="contrast-before"><span>APPROVED SNAPSHOT</span><strong>${formatValue(change.before)}</strong></div><span class="contrast-delta-arrow" aria-hidden="true">→</span><div class="contrast-after"><span>CURRENT REVIEW STATE</span><strong>${formatValue(change.after)}</strong></div></div>`;

function draw(job, mount) {
  const comparison = compareJob(job);
  const {contested, release, changes, newSources, excluded, reviewChanges, blockers} = comparison;
  mount.innerHTML = `<div class="contrast-head"><div class="contrast-heading"><span class="contrast-index">NORTHLINE ATELIER / INTELLIGENCE STUDIO / 02</span><h2 id="contrast-title">The difference <em>matters.</em></h2><p>Claims are not approvals. Questions are not changes. This room separates source disagreement from a human's signed release.</p></div><button id="contrast-close" type="button" class="contrast-close" aria-label="Close comparison room">×</button><div class="contrast-badge">${safe(job.id)}<span>${safe(job.type)}</span></div></div>
  <div class="contrast-metrics"><div><span>COMPETING FIELDS</span><strong>${contested.length.toString().padStart(2,'0')}</strong></div><div><span>DIFFERENT FROM RELEASE</span><strong>${changes.length.toString().padStart(2,'0')}</strong></div><div><span>NEW SOURCE RECORDS</span><strong>${newSources.length.toString().padStart(2,'0')}</strong></div><div><span>BLOCKING FINDINGS</span><strong>${blockers.length.toString().padStart(2,'0')}</strong></div></div>
  <div class="contrast-section-title"><div><span class="contrast-index">ACT I / THE CLAIMS</span><h3>Evidence in opposition.</h3></div><p>Each column is an asserted value from imported source text, not a proposed automatic winner.</p></div>
  ${contested.length ? contested.map(sectionCard).join('') : `<div class="contrast-empty"><span class="contrast-flower">✳</span><strong>No competing direct assertions.</strong><p>This does not mean the case is production-ready. Missing data and other blocking rules still apply.</p><button type="button" data-tab="matrix">Inspect the specification ledger ↗</button></div>`}
  ${excluded.length?`<section class="contrast-excluded" aria-label="Rejected source assertions"><span class="contrast-index">ADJUDICATED EVIDENCE / ${excluded.length} REJECTED</span><h3>Rejected, not erased.</h3><p>These assertions remain traceable but are excluded from active conflicts and cannot be confirmed until restored.</p>${excluded.map(record=>`<div class="contrast-excluded-item"><span>${safe(nameOf(record.field))}: <strong>${safe(record.raw)}</strong><small>${safe(record.review.reason)}</small></span>${sourceButton(record)}</div>`).join('')}</section>`:''}
  <div class="contrast-section-title contrast-second-act"><div><span class="contrast-index">ACT II / THE RELEASE DELTA</span><h3>What changed since sign-off?</h3></div><p>A previous release is never silently rewritten. This comparison uses the saved approved snapshot.</p></div>
  ${release ? `<div class="contrast-release-strip"><span>REFERENCE / APPROVED REVISION ${safe(release.number)}</span><span>Approved ${safe(new Date(release.approvedAt).toLocaleDateString('en-US',{timeZone:'America/New_York'}))} · ${safe(release.approvedBy)}</span></div>${changes.length ? `<div class="contrast-delta-list">${changes.map(deltaCard).join('')}</div>` : '<div class="contrast-empty compact"><strong>No resolved specification changes versus the latest release.</strong><p>New evidence may still need review even when resolved values are identical.</p></div>'}${reviewChanges.length ? `<div class="contrast-new-sources"><h4>${reviewChanges.length} candidate review decision${reviewChanges.length===1?'':'s'} changed since approval</h4>${reviewChanges.map(change=>`<div><span>${safe(nameOf(change.field))} · ${change.after?'Rejected: '+safe(change.after.reason):'Restored since sign-off'}</span><button type="button" data-to-field="${safe(change.field)}">Open ledger ↗</button></div>`).join('')}</div>` : ''}${newSources.length ? `<div class="contrast-new-sources"><h4>${newSources.length} source record${newSources.length===1?'':'s'} added after approval</h4>${newSources.map(source=>`<div><span>${safe(source.name)}</span><button type="button" data-evidence="${safe(source.id)}">Open source ↗</button></div>`).join('')}</div>` : ''}` : '<div class="contrast-empty compact"><strong>No approved revision exists yet.</strong><p>Release deltas appear after a human reviewer approves a work-order revision.</p></div>'}
  <footer class="contrast-footer"><span>READ ONLY · SYNTHETIC DATA · NO MANUFACTURABILITY CERTIFICATION</span><button data-tab="matrix" type="button">Go to the specification ledger ↗</button></footer>`;
  mount.querySelector('#contrast-close').addEventListener('click',()=>mount.closest('dialog').close());
}

function initialize() {
  const mast = document.querySelector('.mast-actions');
  if (!mast || document.querySelector('#contrast-launch')) return;
  const button = document.createElement('button');
  button.type = 'button'; button.id = 'contrast-launch'; button.className = 'contrast-launch';
  button.textContent = 'Contrast Room ↗'; button.setAttribute('aria-haspopup','dialog');
  mast.prepend(button);
  const dialog = document.createElement('dialog');
  dialog.id = 'contrast-room'; dialog.className='contrast-dialog';
  dialog.setAttribute('aria-labelledby','contrast-title');
  dialog.innerHTML = '<div id="contrast-body"></div>';
  document.body.append(dialog);
  dialog.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (target?.matches('[data-evidence],[data-to-field],[data-tab]')) dialog.close();
    if (event.target === dialog) dialog.close();
  }, true);
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Inspecting…';
    try {
      const response = await fetch('/api/jobs');
      if (!response.ok) throw Error(`Local API returned ${response.status}`);
      const jobs = await response.json();
      const selected = document.querySelector('#jobs .job-card.active[data-job]')?.dataset.job;
      const job = jobs.find(item => item.id === selected);
      if (!job) throw Error('Select a case to inspect its evidence.');
      draw(job, dialog.querySelector('#contrast-body'));
      dialog.showModal();
    } catch (error) {
      const alert = document.querySelector('#error');
      if (alert) alert.textContent = `Contrast Room unavailable: ${error.message}`;
    } finally {button.disabled = false;button.textContent = original;}
  });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
}