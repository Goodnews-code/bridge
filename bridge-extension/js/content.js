(() => {
  if (window.top !== window) return;
  if (location.protocol === "chrome-extension:") return;
  if (document.getElementById("bridge-root")) return;

  const DISMISS_KEY = "bridge-dismissed";
  const PAID_KEY = "bridge-paid";
  let offered = false;
  let observer = null;

  chrome.runtime.sendMessage({ type: "CLAIM_RECEIPT" }, (receipt) => {
    if (receipt) {
      sessionStorage.setItem(PAID_KEY, JSON.stringify(receipt));
      bridgeShowPaid(receipt);
      return;
    }
    const cached = sessionStorage.getItem(PAID_KEY);
    if (cached) {
      bridgeShowPaid(JSON.parse(cached));
      return;
    }
    chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
      if (!enabled) return;
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
      startWatching();
    });
  });

  function startWatching() {
    // Gateways often paint the total after JS loads — retry + observe DOM.
    const attempts = [400, 1200, 2500, 4500, 7000];
    attempts.forEach((ms) => window.setTimeout(() => {
      void tryOffer();
    }, ms));

    if (typeof MutationObserver === "function" && document.body) {
      let scheduled = false;
      observer = new MutationObserver(() => {
        if (offered || scheduled) return;
        scheduled = true;
        window.setTimeout(() => {
          scheduled = false;
          void tryOffer();
        }, 350);
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }

  async function tryOffer() {
    if (offered || document.getElementById("bridge-root")) return;
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;

    const detection = detectCheckout();
    if (!detection) return;

    offered = true;
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    const quote = await requestQuote(detection);
    if (!quote || quote.error) {
      if (quote && quote.code === "RISK_BLOCKED") {
        await showBlocked(detection, quote);
        return;
      }
      offered = false;
      return;
    }
    showOverlay(detection, quote);
  }

  function detectCheckout() {
    const text = (document.body && document.body.innerText ? document.body.innerText : "").slice(
      0,
      40000
    );
    const title = document.title || "";
    const href = location.href.toLowerCase();

    const hostHints = [
      "checkout.stripe.com",
      "pay.stripe.com",
      "buy.stripe.com",
      "billing.stripe.com",
      "stripe.com/checkout",
      "paypal.com",
      "paypal.me",
      "pay.paddle.com",
      "checkout.paddle.com",
      "lemonsqueezy.com",
      "gumroad.com",
      "paystack.com",
      "checkout.paystack.com",
    ];
    const pageHints =
      /checkout|subscribe|subscription|payment|billing|pay now|add your card|order summary|complete order|secure checkout|total due|amount due/i;
    const knownHost = hostHints.some((host) => href.includes(host));
    const isPaymentContext =
      knownHost || pageHints.test(title) || pageHints.test(text.slice(0, 6000));

    const parsed =
      parseAmount(text) ||
      parseAmount(title) ||
      parseAmountFromDom();

    if (!parsed) return null;
    if (parsed.currency === "NGN") return null;
    if (!isPaymentContext && parsed.amount < 1) return null;

    if (!isPaymentContext) {
      const payButton = findPayButton();
      if (!payButton) return null;
    }

    return {
      amount: parsed.amount,
      currency: parsed.currency,
      merchant: inferMerchant(title),
    };
  }

  function parseAmount(source) {
    if (!source) return null;

    // Prefer totals near "Total" / "Pay" labels (Stripe Checkout style).
    const labeled = source.match(
      /(?:total|amount due|pay|due today|order total)\s*[:\-]?\s*(?:USD|US\$|\$)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i
    );
    if (labeled) return { amount: toNumber(labeled[1]), currency: "USD" };

    const labeledEur = source.match(
      /(?:total|amount due|pay|due today)\s*[:\-]?\s*(?:EUR|€)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i
    );
    if (labeledEur) return { amount: toNumber(labeledEur[1]), currency: "EUR" };

    const labeledGbp = source.match(
      /(?:total|amount due|pay|due today)\s*[:\-]?\s*(?:GBP|£)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i
    );
    if (labeledGbp) return { amount: toNumber(labeledGbp[1]), currency: "GBP" };

    const usd = source.match(
      /(?:USD|US\$|\$)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i
    );
    if (usd) return { amount: toNumber(usd[1]), currency: "USD" };

    const eur = source.match(
      /(?:EUR|€)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i
    );
    if (eur) return { amount: toNumber(eur[1]), currency: "EUR" };

    const gbp = source.match(
      /(?:GBP|£)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i
    );
    if (gbp) return { amount: toNumber(gbp[1]), currency: "GBP" };

    const generic = source.match(
      /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(USD|EUR|GBP)/i
    );
    if (generic) return { amount: toNumber(generic[1]), currency: generic[2].toUpperCase() };

    return null;
  }

  function parseAmountFromDom() {
    const nodes = document.querySelectorAll(
      "[data-testid*='total'], [class*='Total'], [class*='total'], [class*='Amount'], [class*='amount']"
    );
    for (const node of nodes) {
      const parsed = parseAmount(node.textContent || "");
      if (parsed) return parsed;
    }
    return null;
  }

  function toNumber(value) {
    return Number(String(value).replace(/,/g, ""));
  }

  function findPayButton() {
    const nodes = Array.from(document.querySelectorAll("button, a, input[type='submit']"));
    return nodes.find((node) =>
      /pay|subscribe|checkout|complete order|buy now/i.test(node.textContent || node.value || "")
    );
  }

  function inferMerchant(title) {
    const cleaned = title.split(/[-|•·]/)[0].trim();
    return cleaned || location.hostname.replace(/^www\./, "");
  }

  function requestQuote(detection) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "GET_QUOTE",
          payload: {
            amount: detection.amount,
            currency: detection.currency,
            merchant: detection.merchant,
            sourceUrl: location.href,
          },
        },
        (response) => resolve(response || { error: "No response" })
      );
    });
  }

  async function showBlocked(detection, block) {
    if (document.getElementById("bridge-root")) return;

    const host = document.createElement("div");
    host.id = "bridge-root";
    host.style.all = "initial";
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    bridgeAttachOverlayStyles(shadow);

    const dismiss = () => {
      sessionStorage.setItem(DISMISS_KEY, "1");
      host.remove();
    };

    await bridgeMountBlocked(shadow, detection, block, { onDismiss: dismiss });
  }

  async function showOverlay(detection, quote) {
    if (document.getElementById("bridge-root")) return;

    const host = document.createElement("div");
    host.id = "bridge-root";
    host.style.all = "initial";
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    bridgeAttachOverlayStyles(shadow);

    const dismiss = () => {
      sessionStorage.setItem(DISMISS_KEY, "1");
      host.remove();
    };

    await bridgeMountOffer(shadow, detection, quote, {
      onYes: () => {
        chrome.runtime.sendMessage({
          type: "OPEN_CHECKOUT",
          payload: {
            ...detection,
            quoteId: quote.quoteId,
          },
        });
        dismiss();
      },
      onNo: dismiss,
    });
  }
})();
