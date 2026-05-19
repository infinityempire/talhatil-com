(function () {
  const WHATSAPP_NUMBER = '972501234567';
  const TRACK_ENDPOINT = '/api/track';
  const CTA_EVENT = 'talhatil_checkout_click';

  function getAttribution() {
    const params = new URLSearchParams(window.location.search);
    const payload = {
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
    return payload;
  }

  function encodePayload(payload) {
    const clean = Object.entries(payload)
      .map(([k, v]) => `${k}: ${v || '-'}`)
      .join('\n');
    return encodeURIComponent(`היי טל הטיל, אשמח לרכישה מהירה.\n\nפרטי מקור ליד:\n${clean}`);
  }

  function fireTracking(payload) {
    window.dispatchEvent(new CustomEvent(CTA_EVENT, { detail: payload }));

    if (window.metaPixel?.track) window.metaPixel.track('InitiateCheckout', payload);
    if (window.ttq?.track) window.ttq.track('InitiateCheckout', payload);
    if (window.gtag) window.gtag('event', 'initiate_checkout', payload);

    fetch(TRACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch((error) => console.warn('Track failed:', error));
  }

  const ctaButton = document.getElementById('whatsappCheckoutBtn');
  if (!ctaButton) return;

  ctaButton.addEventListener('click', function (event) {
    event.preventDefault();
    const attribution = getAttribution();
    fireTracking(attribution);

    const message = encodePayload(attribution);
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  });
})();
