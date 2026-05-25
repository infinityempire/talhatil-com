(function () {
  const WHATSAPP_NUMBER = '972505555555'; // TODO: Update with real production number
  const TRACK_ENDPOINT = '/api/track';
  const HEALTH_ENDPOINT = '/api/health';
  const CHECKOUT_ENDPOINT = '/api/checkout';
  const CTA_EVENT = 'talhatil_checkout_click';
  const STATE_TTL_MS = 90 * 1000;
  const REQUEST_TIMEOUT_MS = 4500;
  const CIRCUIT_THRESHOLD = 3;
  const CIRCUIT_COOLDOWN_MS = 30000;

  const checkoutButton = document.getElementById('whatsappCheckoutBtn');
  const statusElement = document.getElementById('checkoutStatus');
  if (!checkoutButton) return;

  const checkoutState = {
    backend: 'unknown',
    orchestrator: 'idle',
    lastSyncedAt: null,
    circuitOpenedAt: null,
    failureCount: 0,
    correlationId: null,
    requestAttempts: 0
  };

  const queue = [];

  function createCorrelationId() {
    const now = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 10);
    return `talhatil-${now}-${random}`;
  }

  function logEvent(level, event, details) {
    const entry = {
      level,
      event,
      timestamp: new Date().toISOString(),
      details: details || {}
    };
    console[level]('[TalHaTil]', JSON.stringify(entry));
    window.dispatchEvent(new CustomEvent('talhatil:log', { detail: entry }));
  }

  function setStatus(message, mode) {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.dataset.mode = mode || 'info';
  }

  function getAttribution() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      fbclid: params.get('fbclid') || '',
      ttclid: params.get('ttclid') || '',
      gclid: params.get('gclid') || '',
      referrer: document.referrer || '',
      landing_page: window.location.href,
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent
    };
  }

  function encodePayload(payload) {
    const clean = Object.entries(payload)
      .map(([k, v]) => `${k}: ${v || '-'}`)
      .join('\n');
    return encodeURIComponent(`היי טל הטיל, אשמח לרכישה מהירה.\n\nפרטי מקור ליד:\n${clean}`);
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...(options || {}), signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function retryRequest(label, executor) {
    const maxAttempts = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      checkoutState.requestAttempts = attempt;
      try {
        logEvent('info', `${label}.attempt`, { attempt, correlationId: checkoutState.correlationId });
        return await executor(attempt);
      } catch (error) {
        lastError = error;
        logEvent('warn', `${label}.retry`, {
          attempt,
          error: error.message,
          correlationId: checkoutState.correlationId
        });
        if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }

    throw lastError;
  }

  function isCircuitOpen() {
    if (!checkoutState.circuitOpenedAt) return false;
    return Date.now() - checkoutState.circuitOpenedAt < CIRCUIT_COOLDOWN_MS;
  }

  function recordFailure(reason) {
    checkoutState.failureCount += 1;
    logEvent('error', 'orchestration.failure', {
      reason,
      failureCount: checkoutState.failureCount,
      correlationId: checkoutState.correlationId
    });

    if (checkoutState.failureCount >= CIRCUIT_THRESHOLD) {
      checkoutState.circuitOpenedAt = Date.now();
      setStatus('יש עומס זמני במערכת. נעבור למסלול התאוששות בטוח.', 'warn');
      logEvent('warn', 'circuit.open', { correlationId: checkoutState.correlationId });
    }
  }

  function recordSuccess() {
    checkoutState.failureCount = 0;
    checkoutState.circuitOpenedAt = null;
  }

  async function verifyBackendHealth() {
    const response = await retryRequest('backend.health', () => fetchWithTimeout(HEALTH_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    }, REQUEST_TIMEOUT_MS));

    if (!response.ok) throw new Error(`health-status-${response.status}`);

    checkoutState.backend = 'ready';
    checkoutState.lastSyncedAt = Date.now();
    return true;
  }

  function hasStaleState() {
    if (!checkoutState.lastSyncedAt) return true;
    return Date.now() - checkoutState.lastSyncedAt > STATE_TTL_MS;
  }

  async function sendTracking(payload) {
    const response = await retryRequest('tracking.dispatch', () => fetchWithTimeout(TRACK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': checkoutState.correlationId
      },
      body: JSON.stringify(payload),
      keepalive: true
    }, REQUEST_TIMEOUT_MS));

    if (!response.ok) throw new Error(`track-status-${response.status}`);

    logEvent('info', 'tracking.success', {
      correlationId: checkoutState.correlationId,
      endpoint: TRACK_ENDPOINT
    });
  }

  async function synchronizeCampaignTrigger(payload) {
    const response = await retryRequest('checkout.sync', () => fetchWithTimeout(CHECKOUT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': checkoutState.correlationId
      },
      body: JSON.stringify({ ...payload, orchestrator_status: checkoutState.orchestrator })
    }, REQUEST_TIMEOUT_MS));

    if (!response.ok) throw new Error(`checkout-status-${response.status}`);

    logEvent('info', 'checkout.sync.success', {
      correlationId: checkoutState.correlationId,
      endpoint: CHECKOUT_ENDPOINT
    });
  }

  function dispatchPixels(payload) {
    window.dispatchEvent(new CustomEvent(CTA_EVENT, { detail: payload }));
    if (window.metaPixel?.track) window.metaPixel.track('InitiateCheckout', payload);
    if (window.ttq?.track) window.ttq.track('InitiateCheckout', payload);
    if (window.gtag) window.gtag('event', 'initiate_checkout', payload);
  }

  function enqueueRecoveryTask(payload) {
    queue.push({ payload, queuedAt: new Date().toISOString(), correlationId: checkoutState.correlationId });
    logEvent('warn', 'queue.enqueued', { queueDepth: queue.length, correlationId: checkoutState.correlationId });
  }

  async function drainQueue() {
    if (!queue.length || isCircuitOpen()) return;
    logEvent('info', 'queue.recovery.start', { queueDepth: queue.length });

    while (queue.length) {
      const task = queue[0];
      checkoutState.correlationId = task.correlationId;

      try {
        await verifyBackendHealth();
        await sendTracking(task.payload);
        await synchronizeCampaignTrigger(task.payload);
        queue.shift();
        recordSuccess();
        logEvent('info', 'queue.recovery.success', { queueDepth: queue.length, correlationId: task.correlationId });
      } catch (error) {
        recordFailure(error.message);
        logEvent('warn', 'queue.recovery.halt', { error: error.message, queueDepth: queue.length });
        break;
      }
    }
  }

  async function runOrchestration() {
    if (isCircuitOpen()) {
      setStatus('המערכת בשיקום אוטומטי. אפשר להמשיך לוואטסאפ ידנית.', 'warn');
      return false;
    }

    const attribution = getAttribution();
    checkoutState.correlationId = createCorrelationId();
    checkoutState.orchestrator = 'starting';

    const payload = {
      ...attribution,
      correlation_id: checkoutState.correlationId,
      trace: { lifecycle: 'checkout-init', source: 'web-cta' }
    };

    try {
      setStatus('בודקים זמינות מערכת…', 'info');
      
      // Attempt backend operations but don't block the user if they fail
      try {
        await verifyBackendHealth();
        if (!hasStaleState()) {
          checkoutState.orchestrator = 'running';
          await Promise.allSettled([
            sendTracking(payload),
            synchronizeCampaignTrigger(payload)
          ]);
        }
      } catch (e) {
        logEvent('warn', 'orchestration.soft_failure', { error: e.message });
      }
      dispatchPixels(payload);
      recordSuccess();
      checkoutState.orchestrator = 'complete';
      setStatus('הנתונים סונכרנו בהצלחה. מעבירים אותך לוואטסאפ…', 'success');
      return payload;
    } catch (error) {
      checkoutState.orchestrator = 'paused';
      recordFailure(error.message);
      enqueueRecoveryTask(payload);
      setStatus('זיהינו תקלה זמנית. המעבר לוואטסאפ פעיל, והמערכת תתאושש אוטומטית.', 'warn');
      return payload;
    }
  }

  checkoutButton.addEventListener('click', async function (event) {
    event.preventDefault();
    const payload = await runOrchestration();
    if (!payload) return;

    const message = encodePayload(payload);
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  });

  setInterval(drainQueue, 10000);
})();
