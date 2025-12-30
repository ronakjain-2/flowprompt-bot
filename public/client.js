console.log('[FlowPromptBot] client.js LOADED');

const SUPPORT_CID = Number(window.flowpromptSupportCategoryId);
const CREATED_FLAG = 'flowprompt:topicJustCreated';

/* --------------------------------------------------
 * 1️⃣ Detect topic submission
 * -------------------------------------------------- */
$(window).on('action:composer.submit', () => {
  console.log('[FlowPromptBot] composer.submit detected');
  sessionStorage.setItem(CREATED_FLAG, '1');
});

/* --------------------------------------------------
 * 2️⃣ Detect topic page load (NodeBB v4 way)
 * -------------------------------------------------- */
$(window).on('action:ajaxify.end', async () => {
  // Only act if topic was just created
  if (!sessionStorage.getItem(CREATED_FLAG)) return;

  const data = ajaxify.data || {};
  const { tid } = data;
  const cid = Number(data.cid);
  const { uid } = data;

  console.log('[FlowPromptBot] ajaxify.end', { tid, cid, uid });

  // Cleanup flag so modal shows only once
  sessionStorage.removeItem(CREATED_FLAG);

  // Guards
  if (!tid) return;

  if (cid !== SUPPORT_CID) return;

  if (uid !== app.user.uid) return;

  console.log('[FlowPromptBot] Opening Flow modal');
  openFlowModal(tid);
});

/* --------------------------------------------------
 * 3️⃣ Fetch flows
 * -------------------------------------------------- */
async function fetchFlows() {
  console.log('[FlowPromptBot] Fetching flows');

  const res = await fetch('/api/plugins/nodebb-plugin-flowprompt-bot/flows', {
    credentials: 'include',
  });

  const json = await res.json();

  return json?.data || [];
}

/* --------------------------------------------------
 * 4️⃣ Open modal
 * -------------------------------------------------- */
async function openFlowModal(tid) {
  const flows = await fetchFlows();

  const options = flows.length
    ? flows.map((f) => `<option value="${f.id}">${f.name}</option>`).join('')
    : '<option disabled>No flows available</option>';

  const modal = app.alert({
    title: 'Link a Flow (optional)',
    message: `
      <select class="form-control" id="flowprompt-flow-select">
        <option value="">Skip</option>
        ${options}
      </select>
    `,
    buttons: {
      ok: { text: 'Save', className: 'btn-primary' },
      cancel: { text: 'Skip', className: 'btn-default' },
    },
  });

  modal.on('click', '.btn-primary', async () => {
    const flowId = $('#flowprompt-flow-select').val();

    if (!flowId) return;

    console.log('[FlowPromptBot] Linking flow', flowId);

    await fetch('/api/plugins/nodebb-plugin-flowprompt-bot/link-flow', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tid, flowId }),
    });
  });
}
