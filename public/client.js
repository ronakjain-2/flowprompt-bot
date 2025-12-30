(async function () {
  const SUPPORT_CID = Number(window.flowpromptSupportCategoryId);
  let lastTopicId = null;

  socket.on('flowprompt:topicCreated', async (payload) => {
    if (!payload || payload.cid !== SUPPORT_CID) return;

    lastTopicId = payload.tid;
    showFlowModal();
  });

  async function fetchFlows() {
    const res = await fetch('/api/plugins/nodebb-plugin-flowprompt-bot/flows', {
      credentials: 'include',
    });
    const json = await res.json();

    return json?.data || [];
  }

  async function showFlowModal() {
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
        ok: {
          text: 'Save',
          className: 'btn-primary',
        },
        cancel: {
          text: 'Skip',
          className: 'btn-default',
        },
      },
    });

    modal.on('click', '.btn-primary', async () => {
      const flowId = $('#flowprompt-flow-select').val();

      if (!flowId) return;

      await fetch('/api/plugins/nodebb-plugin-flowprompt-bot/link-flow', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tid: lastTopicId,
          flowId,
        }),
      });
    });
  }
})();
