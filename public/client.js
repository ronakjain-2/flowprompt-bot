(function () {
  const PLUGIN_ID = 'nodebb-plugin-flowprompt-bot';
  let injected = false;

  async function injectDropdown(composer) {
    if (!composer || !composer.container || injected) return;

    const cid = Number(composer.category?.cid);
    const supportCid = Number(window.flowpromptSupportCategoryId);

    if (!cid || cid !== supportCid) return;

    if (composer.container.find('#flowprompt-flow-select').length) {
      injected = true;
      return;
    }

    const $el = $(`
      <div class="form-group">
        <label>Flow (Optional)</label>
        <select id="flowprompt-flow-select" class="form-control">
          <option value="">No Flow</option>
        </select>
      </div>
    `);

    composer.container.find('.composer-body').prepend($el);

    const res = await fetch(`/api/plugins/${PLUGIN_ID}/flows`, {
      credentials: 'include',
    });

    const json = await res.json();

    if (json?.success && Array.isArray(json.data)) {
      json.data.forEach((flow) => {
        $('#flowprompt-flow-select').append(
          `<option value="${flow.id}">${flow.name}</option>`,
        );
      });
    }

    $('#flowprompt-flow-select').on('change', function () {
      composer.setData('flowId', this.value || null);
    });

    injected = true;
    console.log('[FlowPromptBot] Flow dropdown ready');
  }

  $(window).on('action:composer.loaded', (e, data) => {
    injected = false;
    injectDropdown(data.composer);
  });

  $(window).on('action:composer.categorySelected', (e, data) => {
    injectDropdown(data.composer);
  });
})();
