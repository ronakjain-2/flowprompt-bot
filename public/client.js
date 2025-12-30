(async function () {
  const SUPPORT_CID = Number(window.flowpromptSupportCategoryId);

  /**
   * Detect topic page load
   */
  $(window).on('action:topic.loaded', async (e, data) => {
    const topic = data?.topic;

    if (!topic) return;

    // Only for support category
    if (Number(topic.cid) !== SUPPORT_CID) return;

    // Only show once (on first load after creation)
    if (topic.flowId !== undefined) return;

    // Ensure this user is the author
    if (topic.uid !== app.user.uid) return;

    console.log('[FlowPromptBot] Opening flow modal');

    openFlowModal(topic.tid);
  });

  async function fetchFlows() {
    console.log('[FlowPromptBot] Fetching flows');
    const res = await fetch('/api/plugins/nodebb-plugin-flowprompt-bot/flows', {
      credentials: 'include',
    });
    const json = await res.json();

    return json?.data || [];
  }

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

      await fetch('/api/plugins/nodebb-plugin-flowprompt-bot/link-flow', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tid, flowId }),
      });

      console.log('[FlowPromptBot] Flow linked:', flowId);
    });
  }
})();
