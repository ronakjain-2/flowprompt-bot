const axios = require('axios');
const crypto = require('crypto');

const winston = require.main.require('winston');
const nconf = require.main.require('nconf');
const Topics = require.main.require('./src/topics');
const Posts = require.main.require('./src/posts');

const fpConfig = nconf.get('flowprompt') || {};

const SUPPORT_CATEGORY_ID = Number(fpConfig.supportCategoryId);
const WEBHOOK_URL = fpConfig.webhookUrl;
const WEBHOOK_SECRET = fpConfig.webhookSecret;
const FLOWPROMPT_API_URL = fpConfig.apiUrl || '';
const FLOWPROMPT_API_TOKEN = fpConfig.apiToken || '';
const BOT_UID = Number(fpConfig.botUid) || 0;

winston.info('[FlowPromptBot] Plugin loaded', {
  supportCategoryId: SUPPORT_CATEGORY_ID,
  webhookUrl: WEBHOOK_URL ? 'configured' : 'missing',
  apiUrl: FLOWPROMPT_API_URL ? 'configured' : 'missing',
  botUid: BOT_UID || 'not set',
});

if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
  winston.warn('[FlowPromptBot] Webhook config missing');
}

// =========================
// Helpers
// =========================
function signPayload(payload, timestamp) {
  return `sha256=${crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${JSON.stringify(payload)}`)
    .digest('hex')}`;
}

async function sendToFlowPrompt(eventType, payload) {
  if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
    winston.warn('[FlowPromptBot] Webhook not configured, skipping');
    return null;
  }

  const timestamp = Date.now().toString();
  const signature = signPayload(payload, timestamp);

  // Log request payload before sending
  winston.info(`[FlowPromptBot] Sending ${eventType} webhook`, {
    tid: payload.tid,
    cid: payload.cid,
    flowId: payload.flowId || 'none',
  });

  try {
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-flowprompt-event-type': eventType,
        'x-flowprompt-timestamp': timestamp,
        'x-flowprompt-signature': signature,
      },
      timeout: 10000,
    });

    winston.info('[FlowPromptBot] Webhook delivered successfully', {
      status: response.status,
      tid: payload.tid,
    });

    // Return response data for bot reply processing
    return response.data;
  } catch (err) {
    // Log detailed error information
    const errorInfo = {
      message: err.message,
      code: err.code,
      status: err.response?.status,
      tid: payload.tid,
    };

    // Log response body for non-2xx responses
    if (err.response?.data) {
      errorInfo.responseBody = err.response.data;
      winston.error('[FlowPromptBot] Webhook failed with response', errorInfo);
    } else {
      winston.error('[FlowPromptBot] Webhook failed', errorInfo);
    }

    // Do NOT crash NodeBB - return null to indicate failure
    return null;
  }
}

// =========================
// Plugin Hooks
// =========================
const Plugin = {};

/**
 * static:app.load - Initialize plugin
 */
Plugin.init = async function () {
  winston.info('[FlowPromptBot] Plugin initialized');
};

/**
 * static:router.setup - Add API routes for fetching flows
 */
Plugin.setupRoutes = async function (router, middleware) {
  // Inject support category ID into client-side config
  router.get('/api/plugins/nodebb-plugin-flowprompt-bot/config', (req, res) => {
    res.json({
      supportCategoryId: SUPPORT_CATEGORY_ID,
    });
  });
  // Add route to fetch user's flows
  router.get(
    '/api/plugins/nodebb-plugin-flowprompt-bot/flows',
    middleware.authenticate,
    async (req, res) => {
      try {
        const { uid } = req;

        if (!uid) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
          });
        }

        winston.info(`[FlowPromptBot] Fetching flows for user ${uid}`);

        // Get FlowPrompt user ID
        const flowpromptUserId = await getFlowPromptUserId(uid);

        if (!flowpromptUserId) {
          winston.warn(
            `[FlowPromptBot] No FlowPrompt user mapping for NodeBB UID ${uid}`,
          );
          return res.json({
            success: true,
            data: [],
            message: 'No FlowPrompt account linked',
          });
        }

        // Fetch flows from FlowPrompt API
        if (!FLOWPROMPT_API_URL || !FLOWPROMPT_API_TOKEN) {
          winston.warn('[FlowPromptBot] FlowPrompt API not configured');
          return res.json({
            success: true,
            data: [],
            message: 'FlowPrompt API not configured',
          });
        }

        // Fetch flows from FlowPrompt API
        // Note: This endpoint requires user authentication
        // If your FlowPrompt API uses service tokens, you may need to adjust this
        // Alternative: Use /api/internal/flows endpoint if available
        const flowsEndpoint = `${FLOWPROMPT_API_URL}/api/flows/user/flows`;

        const response = await axios.get(flowsEndpoint, {
          headers: {
            Authorization: `Bearer ${FLOWPROMPT_API_TOKEN}`,
            'Content-Type': 'application/json',
            // Pass FlowPrompt user ID - adjust based on your API requirements
            'X-User-Id': flowpromptUserId.toString(),
          },
          params: {
            // Alternative: pass user ID as query param if header doesn't work
            userId: flowpromptUserId.toString(),
          },
          timeout: 10000,
        });

        if (response.data && response.data.success) {
          return res.json({
            success: true,
            data: response.data.data || [],
          });
        }

        return res.json({
          success: true,
          data: [],
        });
      } catch (err) {
        winston.error('[FlowPromptBot] Error fetching flows:', err.message);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch flows',
          message: err.message,
        });
      }
    },
  );
};

/**
 * filter:topic.create
 * Handles optional flowId linking and webhook sending
 */
Plugin.onTopicCreate = async function (hookData) {
  winston.info('[FlowPromptBot] onTopicCreate triggered');

  try {
    const { topic, post, data } = hookData;

    const topicCid = Number(topic?.cid);
    const expectedCid = Number(SUPPORT_CATEGORY_ID);

    winston.info(`[FlowPromptBot] Topic CID normalized: ${topicCid}`);
    winston.info(
      `[FlowPromptBot] Expected SUPPORT_CATEGORY_ID: ${expectedCid}`,
    );

    if (!topic || Number.isNaN(topicCid)) {
      winston.warn('[FlowPromptBot] Invalid topic or cid');
      return hookData;
    }

    // Handle optional flowId linking (ONLY for support category)
    if (topicCid === expectedCid) {
      winston.info(
        '[FlowPromptBot] Category matched - processing support topic',
      );

      // Try multiple sources for flowId (composer may pass it in different places)
      const rawFlowId =
        hookData?.req?.body?.flowId ||
        hookData?.data?.flowId ||
        hookData?.post?.flowId ||
        data?.flowId ||
        null;

      // Clean and validate flowId
      const flowId =
        rawFlowId &&
        typeof rawFlowId === 'string' &&
        rawFlowId.trim() !== '' &&
        rawFlowId !== 'none'
          ? rawFlowId.trim()
          : null;

      winston.info('[FlowPromptBot] FlowId resolved', { flowId, rawFlowId });

      let persistedFlowId = null;

      // Persist flowId if provided
      if (flowId) {
        winston.info(`[FlowPromptBot] FlowId provided: ${flowId}`);

        try {
          // Validate flow ownership before persisting
          const isValid = await validateFlowOwnership(flowId, topic.uid);

          if (isValid) {
            // Persist flowId to topic
            await Topics.setTopicField(topic.tid, 'flowId', flowId);
            persistedFlowId = flowId;
            winston.info(
              `[FlowPromptBot] FlowId ${flowId} linked to topic ${topic.tid}`,
            );
          } else {
            winston.warn(
              `[FlowPromptBot] FlowId ${flowId} validation failed for user ${topic.uid}. Topic created without flow link.`,
            );
          }
        } catch (err) {
          // Log error but don't block topic creation
          winston.error(
            `[FlowPromptBot] Error validating/persisting flowId: ${err.message}`,
            err,
          );
        }
      } else {
        winston.info(
          '[FlowPromptBot] No flowId provided - topic created without flow link',
        );
      }

      // Send webhook (existing behavior)
      const payload = {
        event: 'topic.create',
        tid: topic.tid,
        pid: post?.pid,
        cid: topicCid,
        uid: topic.uid,
        username: topic.user?.username || 'unknown',
        title: topic.title,
        content: post?.content || '',
        timestamp: Date.now(),
        baseUrl: nconf.get('url') || '',
        flowId: persistedFlowId || null, // Use persisted flowId
      };

      winston.info('[FlowPromptBot] Sending webhook');
      const webhookResponse = await sendToFlowPrompt('topic.create', payload);

      // Post bot reply if webhook was successful and bot UID is configured
      if (webhookResponse && BOT_UID) {
        try {
          // Simple deduplication: For new topic creation, bot shouldn't have replied yet
          // Check topic post count - if > 1, bot might have already replied
          const topicData = await Topics.getTopicData(topic.tid);
          const postCount = topicData?.postcount || 1;

          // Only reply if this is still the first post (topic just created)
          // This prevents duplicate replies on retries or if hook fires multiple times
          if (postCount <= 1) {
            // Extract AI response from webhook response
            // Adjust this based on your actual webhook response structure
            const aiResponseText =
              webhookResponse?.reply ||
              webhookResponse?.content ||
              webhookResponse?.message ||
              webhookResponse?.data?.reply ||
              'Thank you for your support request. Our team will review it shortly.';

            // Create bot reply post
            const replyPost = await Posts.create({
              tid: topic.tid,
              uid: BOT_UID,
              content: aiResponseText,
            });

            winston.info('[FlowPromptBot] Bot reply posted', {
              tid: topic.tid,
              pid: replyPost?.pid || 'unknown',
            });
          } else {
            winston.info(
              '[FlowPromptBot] Bot already replied or topic has multiple posts - skipping duplicate reply',
              { tid: topic.tid, postCount },
            );
          }
        } catch (err) {
          // Log error but don't block topic creation
          winston.error(
            `[FlowPromptBot] Error posting bot reply: ${err.message}`,
            err,
          );
        }
      } else if (!BOT_UID) {
        winston.warn(
          '[FlowPromptBot] Bot UID not configured - skipping bot reply',
        );
      } else if (!webhookResponse) {
        winston.warn('[FlowPromptBot] Webhook failed - skipping bot reply');
      }

      winston.info('[FlowPromptBot] Webhook flow completed');
    } else {
      winston.info(
        `[FlowPromptBot] Category ${topicCid} is not support category - skipping flow linking`,
      );
    }
  } catch (err) {
    winston.error('[FlowPromptBot] onTopicCreate error', err);
  }

  return hookData;
};

/**
 * Validate that the flow belongs to the user
 * Returns true if valid, false otherwise
 */
async function validateFlowOwnership(flowId, nodebbUid) {
  if (!FLOWPROMPT_API_URL || !FLOWPROMPT_API_TOKEN) {
    winston.warn(
      '[FlowPromptBot] FlowPrompt API not configured - skipping validation',
    );
    return false;
  }

  try {
    // TODO: Map NodeBB UID to FlowPrompt user ID
    // For now, we'll need to implement user mapping
    // This is a placeholder - you'll need to implement the actual mapping
    const flowpromptUserId = await getFlowPromptUserId(nodebbUid);

    if (!flowpromptUserId) {
      winston.warn(
        `[FlowPromptBot] No FlowPrompt user mapping for NodeBB UID ${nodebbUid}`,
      );
      return false;
    }

    // Fetch flow details from FlowPrompt API
    const response = await axios.get(
      `${FLOWPROMPT_API_URL}/api/flows/${flowId}`,
      {
        headers: {
          Authorization: `Bearer ${FLOWPROMPT_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      },
    );

    if (response.data && response.data.success) {
      const flow = response.data.data;
      const ownerId = flow.ownerId || flow.owner?._id;

      // Validate ownership
      const isValid =
        ownerId && ownerId.toString() === flowpromptUserId.toString();

      winston.info(
        `[FlowPromptBot] Flow ownership validation: ${isValid ? 'VALID' : 'INVALID'}`,
        { flowId, ownerId, flowpromptUserId },
      );

      return isValid;
    }

    return false;
  } catch (err) {
    winston.error(
      `[FlowPromptBot] Error validating flow ownership: ${err.message}`,
      err,
    );
    return false;
  }
}

/**
 * Get FlowPrompt user ID from NodeBB UID
 * TODO: Implement actual user mapping logic
 * This could use a mapping table, SSO, or user metadata
 */
async function getFlowPromptUserId(nodebbUid) {
  // Placeholder implementation
  // You'll need to implement actual user mapping based on your system
  // Options:
  // 1. Store FlowPrompt user ID in NodeBB user settings
  // 2. Use SSO to map users
  // 3. Use a mapping table

  try {
    const User = require.main.require('./src/user');
    const userData = await User.getUserFields(nodebbUid, [
      'flowpromptUserId',
      'email',
    ]);

    // Check if user has flowpromptUserId stored
    if (userData && userData.flowpromptUserId) {
      return userData.flowpromptUserId;
    }

    // Fallback: try to find by email (if you have a mapping API)
    // This is just a placeholder - implement based on your needs
    return null;
  } catch (err) {
    winston.error(
      `[FlowPromptBot] Error getting FlowPrompt user ID: ${err.message}`,
    );
    return null;
  }
}

module.exports = Plugin;
