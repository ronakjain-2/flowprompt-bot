/* globals app, ajaxify, socket */

(function () {
  const SUPPORT_CID = 6; // 🔴 CHANGE if your support category id is different
  const CREATED_FLAG = 'flowprompt_topic_created';

  console.log('[FlowPromptBot] client.js LOADED');

  /**
   * Fired when composer is opened (new topic / reply)
   */
  $(window).on('action:composer.loaded', () => {
    console.log('[FlowPromptBot] composer.loaded fired -> when click on topic');
  });

  /**
   * Fired when topic page is loaded
   */
  $(window).on('action:topic.loaded', (ev, data) => {
    console.log('[FlowPromptBot] topic.loaded fired', data);
  });

  /**
   * Fired when user submits composer (topic created)
   */
  $(window).on('action:composer.submit', () => {
    console.log('[FlowPromptBot] composer.submit detected');
    sessionStorage.setItem(CREATED_FLAG, '1');
  });

  /**
   * Fired after ajax navigation (topic page opens after creation)
   */
  $(window).on('action:ajaxify.end', () => {
    if (!sessionStorage.getItem(CREATED_FLAG)) return;

    const data = ajaxify.data || {};
    const { tid } = data;
    const cid = Number(data.cid);

    console.log('[FlowPromptBot] ajaxify.end', {
      tid,
      cid,
      appUser: app.user && app.user.uid,
    });

    // Remove flag so modal opens only once
    sessionStorage.removeItem(CREATED_FLAG);

    if (!tid) return;

    if (cid !== SUPPORT_CID) return;

    console.log('[FlowPromptBot] Opening Flow modal');
    openFlowModal(tid);
  });

  /**
   * Opens modal and loads flows
   */
  async function openFlowModal(tid) {
    try {
      console.log('[FlowPromptBot] Fetching flows');

      const flows = await fetchFlows();

      showModal({
        title: 'Link Flow (Optional)',
        body: buildModalBody(flows),
        buttons: [
          {
            text: 'Skip',
            className: 'btn-secondary',
            click() {
              console.log('[FlowPromptBot] Flow selection skipped');
            },
          },
          {
            text: 'Save',
            className: 'btn-primary',
            async click() {
              const flowId = $('#flowprompt-flow-select').val();

              if (!flowId) {
                console.log('[FlowPromptBot] No flow selected');
                return;
              }

              await linkFlowToTopic(tid, flowId);
            },
          },
        ],
      });
    } catch (err) {
      console.error('[FlowPromptBot] Modal error', err);
    }
  }

  /**
   * Fetch flows from backend
   */
  async function fetchFlows() {
    const res = await fetch('/api/plugins/nodebb-plugin-flowprompt-bot/flows', {
      credentials: 'same-origin',
    });

    if (!res.ok) {
      throw new Error('Failed to fetch flows');
    }

    const data = await res.json();

    console.log('[FlowPromptBot] Flows received', data);
    return data.flows || [];
  }

  /**
   * Save flow-topic mapping
   */
  async function linkFlowToTopic(tid, flowId) {
    try {
      await fetch('/api/plugins/nodebb-plugin-flowprompt-bot/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ tid, flowId }),
      });

      console.log('[FlowPromptBot] Flow linked successfully');
    } catch (err) {
      console.error('[FlowPromptBot] Failed to link flow', err);
    }
  }

  /**
   * Build dropdown HTML
   */
  function buildModalBody(flows) {
    if (!flows.length) {
      return `
        <p>You don’t have any flows yet.</p>
        <p>You can still create the topic without linking a flow.</p>
      `;
    }

    const options = flows
      .map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`)
      .join('');

    return `
      <div class="form-group">
        <label>Select Flow (optional)</label>
        <select id="flowprompt-flow-select" class="form-control">
          <option value="">-- No Flow --</option>
          ${options}
        </select>
      </div>
    `;
  }

  /**
   * Simple modal helper (NodeBB compatible)
   */
  function showModal({ title, body, buttons }) {
    const modal = bootbox.dialog({
      title,
      message: body,
      buttons: buttons.reduce((acc, btn, i) => {
        acc[`b${i}`] = {
          label: btn.text,
          className: btn.className,
          callback: btn.click,
        };
        return acc;
      }, {}),
    });

    return modal;
  }

  /**
   * Escape HTML helper
   */
  function escapeHtml(str) {
    return String(str).replace(
      /[&<>"']/g,
      (m) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[m],
    );
  }
})();
