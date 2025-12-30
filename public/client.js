define('flowprompt-composer', ['composer'], (composer) => {
  const PLUGIN_ID = 'nodebb-plugin-flowprompt-bot';

  composer.addComposerControl({
    id: 'flowprompt-flow',
    label: 'Select Flow (Optional)',
    icon: 'fa-project-diagram',
    position: 'left',

    async action(composerInstance) {
      const templateData = composerInstance?.templateData?.flowpromptBot;

      if (!templateData?.enabled) {
        return;
      }

      const cid = composerInstance.category?.cid;

      if (Number(cid) !== Number(templateData.supportCategoryId)) {
        return;
      }

      // Prevent duplicate UI
      if (composerInstance.container.querySelector('#flowprompt-flow-select')) {
        return;
      }

      const wrapper = document.createElement('div');

      wrapper.className = 'form-group';
      wrapper.style.marginBottom = '10px';

      const label = document.createElement('label');

      label.textContent = 'Select Flow (Optional)';

      const select = document.createElement('select');

      select.id = 'flowprompt-flow-select';
      select.className = 'form-control';

      select.innerHTML = `<option value="">No Flow (Optional)</option>`;

      wrapper.appendChild(label);
      wrapper.appendChild(select);

      composerInstance.container
        .querySelector('.composer-body')
        .prepend(wrapper);

      try {
        const res = await fetch(`/api/plugins/${PLUGIN_ID}/flows`, {
          credentials: 'include',
        });

        const result = await res.json();

        if (result?.success && Array.isArray(result.data)) {
          result.data.forEach((flow) => {
            const opt = document.createElement('option');

            opt.value = flow.id;
            opt.textContent = flow.name;
            select.appendChild(opt);
          });
        }
      } catch (err) {
        console.error('[FlowPromptBot] Failed to load flows', err);
      }

      // Persist selection into composer payload
      select.addEventListener('change', () => {
        composerInstance.setData('flowId', select.value || null);
      });
    },
  });
});
