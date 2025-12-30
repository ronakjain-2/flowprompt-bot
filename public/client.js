(function () {
  const PLUGIN_ID = 'nodebb-plugin-flowprompt-bot';

  // Fires every time composer is opened
  $(window).on('action:composer.loaded', async (ev, data) => {
    try {
      const composer = data?.composer;

      if (!composer || !composer.container) {
        return;
      }

      const templateData = composer?.templateData?.flowpromptBot;

      if (!templateData?.enabled) {
        return;
      }

      const cid = Number(composer.category?.cid);

      if (cid !== Number(templateData.supportCategoryId)) {
        return;
      }

      // Prevent duplicate dropdown
      if (composer.container.find('#flowprompt-flow-select').length) {
        return;
      }

      const $wrapper = $(`
        <div class="form-group flowprompt-flow-wrapper">
          <label>Select Flow (Optional)</label>
          <select id="flowprompt-flow-select" class="form-control">
            <option value="">No Flow (Optional)</option>
          </select>
        </div>
      `);

      // Insert above textarea
      composer.container.find('.composer-body').prepend($wrapper);

      // Load flows
      const res = await fetch(`/api/plugins/${PLUGIN_ID}/flows`, {
        credentials: 'include',
      });

      const result = await res.json();

      if (result?.success && Array.isArray(result.data)) {
        result.data.forEach((flow) => {
          $('#flowprompt-flow-select').append(
            `<option value="${flow.id}">${flow.name}</option>`,
          );
        });
      }

      // Persist selection into composer payload
      $('#flowprompt-flow-select').on('change', function () {
        composer.setData('flowId', this.value || null);
      });
    } catch (err) {
      console.error('[FlowPromptBot] Composer injection failed', err);
    }
  });
})();
