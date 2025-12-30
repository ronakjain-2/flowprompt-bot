/**
 * NodeBB Plugin: FlowPrompt Bot - Client-side composer integration
 * Adds optional Flow selection dropdown to topic composer for support category
 */

(function () {
  const PLUGIN_ID = 'nodebb-plugin-flowprompt-bot';

  // Configuration from plugin
  const config = window.config || {};
  const apiBaseUrl = config.relative_path || '';

  // Get support category ID from backend config (injected by plugin)
  // Fallback to window.config if available, otherwise use default
  const SUPPORT_CATEGORY_ID =
    window.flowpromptBotConfig?.supportCategoryId ||
    config.flowpromptBot?.supportCategoryId ||
    6; // Fallback default

  /**
   * Initialize the flow selector in composer
   */
  function initFlowSelector() {
    // Wait for composer to be ready
    if (typeof app === 'undefined' || !app.alert) {
      setTimeout(initFlowSelector, 100);
      return;
    }

    // Hook into composer submit to capture flowId
    $(window).on('action:composer.submit', (ev, data) => {
      handleComposerSubmit(ev, data);
    });

    // Hook into composer category change to show/hide flow selector
    $(window).on('action:composer.category-changed', (ev, data) => {
      handleCategoryChange(ev, data);
    });

    // Hook into composer loaded to inject flow selector
    $(window).on('action:composer.loaded', (ev, data) => {
      handleComposerLoaded(ev, data);
    });
  }

  /**
   * Handle composer submit - attach flowId if selected
   */
  function handleComposerSubmit(ev, data) {
    const flowSelect = $('#flowprompt-flow-select');

    if (flowSelect.length && flowSelect.is(':visible')) {
      const selectedFlowId = flowSelect.val();

      // Only attach if a flow is selected (not "No Flow")
      if (
        selectedFlowId &&
        selectedFlowId !== 'none' &&
        selectedFlowId !== 'loading'
      ) {
        // Attach flowId to multiple locations for maximum compatibility
        if (data.payload) {
          data.payload.flowId = selectedFlowId;
        }

        if (data.data) {
          data.data.flowId = selectedFlowId;
        }

        // Set directly on data object and req.body if available
        data.flowId = selectedFlowId;

        // Also set on post object if it exists
        if (data.post) {
          data.post.flowId = selectedFlowId;
        }

        console.log(
          '[FlowPromptBot] Attaching flowId to topic:',
          selectedFlowId,
        );
      }
    }
  }

  /**
   * Handle category change - show/hide flow selector
   */
  function handleCategoryChange(ev, data) {
    const cid = parseInt(data.cid, 10);
    const flowSelector = $('#flowprompt-flow-selector');

    // Get current support category ID (may have been loaded from backend)
    const supportCid =
      window.flowpromptBotConfig?.supportCategoryId || SUPPORT_CATEGORY_ID;

    if (cid === supportCid) {
      // Show flow selector for support category
      flowSelector.slideDown(200);
      loadUserFlows();
    } else {
      // Hide flow selector for other categories
      flowSelector.slideUp(200);
    }
  }

  /**
   * Handle composer loaded - inject flow selector UI
   */
  function handleComposerLoaded(ev, data) {
    // Only inject for new topics (not editing)
    if (data.action !== 'topics.post') {
      return;
    }

    const composerEl = $('[component="composer"]');

    if (!composerEl.length) {
      return;
    }

    // Check if already injected
    if ($('#flowprompt-flow-selector').length) {
      return;
    }

    // Inject flow selector after category selector
    const categoryRow = composerEl
      .find('[data-name="category"]')
      .closest('.row');

    if (categoryRow.length) {
      const flowSelectorHtml = `
        <div id="flowprompt-flow-selector" class="row" style="display: none;">
          <div class="col-lg-12">
            <label for="flowprompt-flow-select" class="form-label">
              Select Flow (Optional)
            </label>
            <select 
              id="flowprompt-flow-select" 
              class="form-control" 
              name="flowId"
              data-name="flowId"
            >
              <option value="none">No Flow (Optional)</option>
              <option value="loading" disabled>Loading flows...</option>
            </select>
            <small class="form-text text-muted">
              Optionally link this topic to one of your FlowPrompt flows
            </small>
          </div>
        </div>
      `;

      categoryRow.after(flowSelectorHtml);

      // Check initial category
      const initialCid = parseInt(composerEl.find('[name="cid"]').val(), 10);

      // Get current support category ID (may have been loaded from backend)
      const supportCid =
        window.flowpromptBotConfig?.supportCategoryId || SUPPORT_CATEGORY_ID;

      if (initialCid === supportCid) {
        $('#flowprompt-flow-selector').show();
        loadUserFlows();
      }
    }
  }

  /**
   * Load user's flows from FlowPrompt API
   */
  async function loadUserFlows() {
    const select = $('#flowprompt-flow-select');

    if (!select.length) {
      return;
    }

    // Set loading state
    select.html('<option value="loading" disabled>Loading flows...</option>');
    select.prop('disabled', true);

    try {
      // Get current user's session token or use NodeBB's API
      const response = await fetch(
        `${apiBaseUrl}/api/plugins/${PLUGIN_ID}/flows`,
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      // Clear loading option
      select.html('<option value="none">No Flow (Optional)</option>');

      if (result.success && result.data && result.data.length > 0) {
        // Add flow options
        // Handle different response structures from FlowPrompt API
        result.data.forEach((flow) => {
          // FlowVersion structure: { flowId: { _id, name }, ... }
          // Or direct Flow structure: { _id, name, ... }
          const flowId = flow.flowId?._id || flow.flowId || flow._id;
          const flowName =
            flow.flowId?.name ||
            flow.name ||
            flow.label ||
            `Flow ${flowId}` ||
            'Unnamed Flow';

          // Only add if we have a valid flowId
          if (flowId) {
            select.append(
              $('<option></option>')
                .attr('value', flowId.toString())
                .text(flowName),
            );
          }
        });

        select.prop('disabled', false);
      } else {
        // No flows available
        select.append(
          $('<option></option>')
            .attr('value', 'none')
            .text('No flows available'),
        );
        select.prop('disabled', false);
      }
    } catch (error) {
      console.error('[FlowPromptBot] Error loading flows:', error);

      // Show error state
      select.html('<option value="none">Error loading flows</option>');
      select.prop('disabled', false);

      // Show user-friendly message
      app.alert({
        type: 'warning',
        alert_id: 'flowprompt-flows-error',
        title: 'Flow Loading Error',
        message:
          'Unable to load flows. You can still create the topic without selecting a flow.',
        timeout: 5000,
      });
    }
  }

  /**
   * Load support category ID from backend config
   */
  async function loadSupportCategoryId() {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/plugins/${PLUGIN_ID}/config`,
        {
          method: 'GET',
          credentials: 'include',
        },
      );

      if (response.ok) {
        const result = await response.json();

        if (result.supportCategoryId) {
          // Update global config
          window.flowpromptBotConfig = {
            supportCategoryId: result.supportCategoryId,
          };
          return result.supportCategoryId;
        }
      }
    } catch (error) {
      console.warn('[FlowPromptBot] Could not load category config:', error);
    }
    return SUPPORT_CATEGORY_ID;
  }

  // Initialize when DOM is ready
  $(document).ready(async () => {
    // Load category ID from backend
    const categoryId = await loadSupportCategoryId();

    if (categoryId && categoryId !== SUPPORT_CATEGORY_ID) {
      // Update if different from default
      window.flowpromptBotConfig = {
        supportCategoryId: categoryId,
      };
    }

    initFlowSelector();
  });

  // Also initialize on ajaxify (NodeBB page navigation)
  $(window).on('action:ajaxify.end', () => {
    initFlowSelector();
  });
})();
