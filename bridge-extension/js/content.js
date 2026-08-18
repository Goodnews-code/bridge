(() => {
  if (window.top !== window) return;
  if (location.protocol === "chrome-extension:") return;
  if (document.getElementById("nairadirect-root")) return;

  const DISMISS_KEY = "nairadirect-dismissed";
  const PAID_KEY = "nairadirect-paid";

  chrome.runtime.sendMessage({ type: "CLAIM_RECEIPT" }, (receipt) => {
    if (receipt) {
      sessionStorage.setItem(PAID_KEY, JSON.stringify(receipt));
      nairaDirectShowPaid(receipt);
      return;
    }
    const cached = sessionStorage.getItem(PAID_KEY);
    if (cached) {
      nairaDirectShowPaid(JSON.parse(cached));
      return;
    }
    chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
      if (!enabled) return;
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
      window.setTimeout(runDetection, 700);
    });
  });

  async function runDetection() {
    const detection = detectCheckout();
    if (!detection) return;

    const quote = await requestQuote(detection);
    if (!quote || quote.error) return;
    showOverlay(detection, quote);
  }

  function detectCheckout() {
    const text = (document.body && document.body.innerText ? document.body.innerText : "").slice(
      0,
      20000
    );
    const title = document.title || "";
    const href = location.href.toLowerCase();

    const hostHints = [
      "checkout.stripe.com",
      "pay.stripe.com",
      "paypal.com",
      "pay.paddle.com",
      "lemonsqueezy.com",
      "billing.stripe.com",
    ];
    const pageHints = /checkout|subscribe|payment|billing|pay now|add your card|order summary/i;
    const isPaymentContext =
      hostHints.some((host) => href.includes(host)) ||
      pageHints.test(title) ||
      pageHints.test(text.slice(0, 4000));

    const parsed = parseAmount(text) || parseAmount(title);
    if (!parsed) return null;
    if (!isPaymentContext && parsed.amount < 1) return null;
    if (!isPaymentContext && parsed.currency === "NGN") return null;
    if (parsed.currency === "NGN") return null;

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
    const usd = source.match(/(?:USD|US\$|\$)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i);
    if (usd) return { amount: toNumber(usd[1]), currency: "USD" };

    const eur = source.match(/(?:EUR|€)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i);
    if (eur) return { amount: toNumber(eur[1]), currency: "EUR" };

    const gbp = source.match(/(?:GBP|£)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i);
    if (gbp) return { amount: toNumber(gbp[1]), currency: "GBP" };

    const generic = source.match(
      /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(USD|EUR|GBP)/i
    );
    if (generic) return { amount: toNumber(generic[1]), currency: generic[2].toUpperCase() };

    return null;
  }

  function toNumber(value) {
    return Number(String(value).replace(/,/g, ""));
  }

  function findPayButton() {
    const nodes = Array.from(document.querySelectorAll("button, a, input[type='submit']"));
    return nodes.find((node) => /pay|subscribe|checkout|complete order/i.test(node.textContent || node.value || ""));
  }

  function inferMerchant(title) {
    const cleaned = title.split(/[-|•·]/)[0].trim();
    return cleaned || location.hostname.replace(/^www\./, "");
  }

  function requestQuote(detection) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "GET_QUOTE", payload: detection },
        (response) => resolve(response || { error: "No response" })
      );
    });
  }

  async function showOverlay(detection, quote) {
    const host = document.createElement("div");
    host.id = "nairadirect-root";
    host.style.all = "initial";
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    nairaDirectAttachOverlayStyles(shadow);

    const dismiss = () => {
      sessionStorage.setItem(DISMISS_KEY, "1");
      host.remove();
    };

    await nairaDirectMountOffer(shadow, detection, quote, {
      onYes: () => {
        chrome.runtime.sendMessage({
          type: "OPEN_CHECKOUT",
          payload: detection,
        });
        dismiss();
      },
      onNo: dismiss,
    });
  }
})();
