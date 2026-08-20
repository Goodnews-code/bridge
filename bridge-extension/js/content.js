(() => {
  if (window.top !== window) return;
  if (location.protocol === "chrome-extension:") return;
  if (document.getElementById("bridge-root")) return;

  const DISMISS_KEY = "bridge-dismissed";
  const PAID_KEY = "bridge-paid";

  // Amount grammar. One number shape reused by every currency matcher: either a
  // comma-grouped number ("1,234.56") or a plain one ("5000", "12.99"). The first
  // branch requires at least one comma group (hence `+`), so a plain 4+ digit
  // number falls through to the second branch instead of being clipped to 3 digits.
  const AMOUNT_NUM =
    "([0-9]{1,3}(?:,[0-9]{3})+(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)";

  // Currency symbol/code prefixes, most specific first so "US$", "C$", "A$" win
  // over a bare "$" (which defaults to USD and is therefore checked last). This is
  // exactly the backend's supported set (src/types/money.ts) — anything else is
  // intentionally not matched, so it never reaches the API to be rejected.
  const PREFIXED = [
    { currency: "USD", sym: "US\\$|USD" },
    { currency: "CAD", sym: "CA\\$|C\\$|CAD" },
    { currency: "AUD", sym: "AU\\$|A\\$|AUD" },
    { currency: "EUR", sym: "EUR|€" },
    { currency: "GBP", sym: "GBP|£" },
    { currency: "JPY", sym: "JPY|¥" },
    { currency: "NGN", sym: "NGN|₦" },
    { currency: "USD", sym: "\\$" },
  ];
  const SUFFIX_CODES = "USD|EUR|GBP|JPY|CAD|AUD|NGN";

  // Labels that name the amount a shopper actually pays, and labels that name a
  // partial figure we must never mistake for the total.
  const TOTAL_RE =
    /\b(grand\s+total|order\s+total|total\s+due|amount\s+due|amount\s+to\s+pay|you\s+pay|total)\b/i;
  const NEGATIVE_RE =
    /\b(sub[\s-]?total|tax|vat|gst|hst|shipping|delivery|discount|you\s+save|savings?)\b/i;

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
      startDetection();
    });
  });

  // Detect the checkout total, tolerating SPA / late-rendering pages. Runs an
  // initial pass immediately, then watches the DOM and re-checks periodically
  // (bounded to ~12s). Debounced. At most one quote is in flight at a time; a
  // failed quote is retried, and detection stops only once the offer is shown.
  function startDetection() {
    let finished = false;
    let scheduled = false;
    let quoting = false; // a quote request is in flight — don't start another
    let shown = false; // the offer is on screen — we're done
    const logged = new Set();

    // Explain, exactly once per reason, why no offer appeared. Kept quiet on
    // ordinary pages (we only reach here past the payment-context gate), so the
    // console isn't spammed on every site the user visits.
    const diag = (reason, ...rest) => {
      if (logged.has(reason)) return;
      logged.add(reason);
      console.warn(`[Bridge] ${reason}`, ...rest);
    };

    const stop = () => {
      finished = true;
      observer.disconnect();
      window.clearTimeout(deadline);
      window.clearInterval(poll);
    };

    const attempt = async () => {
      scheduled = false;
      if (finished || quoting || shown) return;

      let detection;
      try {
        detection = detectCheckout(diag);
      } catch (error) {
        diag(`Detection threw — ${error && error.message ? error.message : error}`);
        return;
      }
      if (!detection) return; // keep watching; the page may still be rendering

      quoting = true;
      const quote = await requestQuote(detection);
      quoting = false;
      if (finished || shown) return;

      if (quote && quote.code === "RISK_BLOCKED") {
        shown = true;
        stop();
        await showBlocked(detection, quote);
        return;
      }

      // A failed quote must NOT kill detection: the backend may not be running
      // yet, or the page may re-render. Log why, keep watching, and let the next
      // mutation / poll try again (bounded by the deadline below).
      if (!quote || quote.error) {
        diag(
          `Quote request failed — offer not shown. ${
            (quote && quote.error) || "No response from the extension service worker."
          }${quote && quote.code ? ` (${quote.code})` : ""}`
        );
        return;
      }

      shown = true;
      stop();
      showOverlay(detection, quote);
      console.info("[Bridge] Pay-in-Naira offer shown.");
    };

    const schedule = () => {
      if (finished || scheduled) return;
      scheduled = true;
      window.setTimeout(attempt, 300);
    };

    const observer = new MutationObserver(schedule);
    // Bounded lifetime. The observer catches SPA / late renders; the interval
    // also retries on static pages (e.g. so a backend started moments after the
    // page loads still gets a chance without a manual reload).
    const deadline = window.setTimeout(stop, 12000);
    const poll = window.setInterval(schedule, 2000);

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    schedule();
  }

  // Only offer on a genuine payment/checkout page AND only when a pay button is
  // present — never from a stray price on an arbitrary page. The amount we surface
  // is the order TOTAL, not the first figure we happen to find.
  function detectCheckout(diag) {
    if (!isPaymentContext()) return null; // ordinary page — stay silent

    if (!findPayButton()) {
      if (diag) diag("Looks like a payment page, but no pay / checkout button was found — not offering.");
      return null;
    }

    const parsed = findTotalAmount();
    if (!parsed || !(parsed.amount > 0)) {
      if (diag) diag("Pay button present, but no total in a supported currency was found — not offering.");
      return null;
    }

    return {
      amount: parsed.amount,
      currency: parsed.currency,
      merchant: inferMerchant(document.title || ""),
    };
  }

  // A page is a payment context if it is a known gateway host, its path looks like
  // a checkout, or its title / visible text carries strong checkout wording.
  function isPaymentContext() {
    const href = location.href.toLowerCase();
    const path = location.pathname.toLowerCase();
    const title = document.title || "";
    const text = (document.body && document.body.innerText ? document.body.innerText : "").slice(0, 4000);

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
    if (hostHints.some((host) => href.includes(host))) return true;

    if (/checkout|payment|billing|subscribe/.test(path)) return true;

    const pageHints =
      /checkout|subscribe|payment|billing|pay now|order summary|order total|place order|complete (your )?(order|purchase)/i;
    return pageHints.test(title) || pageHints.test(text);
  }

  // The total the shopper pays. Prefer an amount whose surrounding text names it as
  // the total; fall back to the largest currency amount on the page (on a checkout
  // the grand total is virtually always the largest money figure). Heuristic, but
  // only ever runs once the page is confirmed a checkout with a pay button.
  function findTotalAmount() {
    return findLabelledTotal() || findLargestAmount();
  }

  function findLabelledTotal() {
    if (!document.body || typeof document.createTreeWalker !== "function") return null;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    let node;
    let scanned = 0;

    while ((node = walker.nextNode()) && scanned < 5000) {
      scanned++;
      const label = node.nodeValue || "";
      if (!TOTAL_RE.test(label) || NEGATIVE_RE.test(label)) continue;

      // Amount in the same text node, else the parent element, else the next
      // sibling element (labels and amounts often sit in adjacent cells / spans).
      let parsed = parseAmount(label);
      if (!parsed) {
        const el = node.parentElement;
        if (el) {
          parsed = parseAmount(el.textContent || "");
          if (!parsed && el.nextElementSibling) {
            parsed = parseAmount(el.nextElementSibling.textContent || "");
          }
        }
      }
      if (parsed) hits.push(parsed);
    }

    if (!hits.length) return null;
    return hits.reduce((best, current) => (current.amount > best.amount ? current : best));
  }

  function findLargestAmount() {
    const text = (document.body && document.body.innerText ? document.body.innerText : "").slice(0, 20000);
    const all = parseAllAmounts(text);
    if (!all.length) return null;
    return all.reduce((best, current) => (current.amount > best.amount ? current : best));
  }

  // First amount + currency in a string (specific symbols before bare "$").
  function parseAmount(source) {
    for (const { currency, sym } of PREFIXED) {
      const match = source.match(new RegExp(`(?:${sym})\\s*${AMOUNT_NUM}`, "i"));
      if (match) return { amount: toNumber(match[1]), currency };
    }
    const suffixed = source.match(new RegExp(`${AMOUNT_NUM}\\s*(${SUFFIX_CODES})`, "i"));
    if (suffixed) return { amount: toNumber(suffixed[1]), currency: suffixed[2].toUpperCase() };
    return null;
  }

  // Every amount + currency in a string. Used to pick the largest as the total.
  function parseAllAmounts(source) {
    const results = [];

    const prefixAlt = PREFIXED.map((p) => p.sym).join("|");
    const prefixRe = new RegExp(`(${prefixAlt})\\s*${AMOUNT_NUM}`, "gi");
    let m;
    while ((m = prefixRe.exec(source))) {
      results.push({ amount: toNumber(m[2]), currency: markerToCurrency(m[1]) });
    }

    const suffixRe = new RegExp(`${AMOUNT_NUM}\\s*(${SUFFIX_CODES})\\b`, "gi");
    while ((m = suffixRe.exec(source))) {
      results.push({ amount: toNumber(m[1]), currency: m[2].toUpperCase() });
    }

    return results.filter((r) => Number.isFinite(r.amount) && r.amount > 0);
  }

  function markerToCurrency(marker) {
    const m = marker.toUpperCase();
    if (m === "US$" || m === "USD" || m === "$") return "USD";
    if (m === "CA$" || m === "C$" || m === "CAD") return "CAD";
    if (m === "AU$" || m === "A$" || m === "AUD") return "AUD";
    if (m === "EUR" || m === "€") return "EUR";
    if (m === "GBP" || m === "£") return "GBP";
    if (m === "JPY" || m === "¥") return "JPY";
    if (m === "NGN" || m === "₦") return "NGN";
    return "USD";
  }

  function toNumber(value) {
    return Number(String(value).replace(/,/g, ""));
  }

  // A genuine pay / checkout control must exist — this is what separates a real
  // checkout from a page that merely quotes a price. Real buttons phrase the
  // action many ways and often carry the label in aria-label / title / value
  // rather than text, so we check those too. Word-boundaried so we never match
  // "pay" inside an unrelated word.
  function findPayButton() {
    const nodes = Array.from(
      document.querySelectorAll(
        "button, a, input[type='submit'], input[type='button'], [role='button']"
      )
    );
    const re =
      /\b(pay|pay\s?now|pay\s+with|place\s+(the\s+)?order|complete\s+(order|purchase|payment|checkout)|buy(\s+now)?|order\s+now|subscribe|check\s?out|proceed\s+to\s+(pay|payment|checkout)|continue\s+to\s+(pay|payment)|confirm(\s+and\s+pay)?|make\s+payment|submit\s+payment)\b/i;
    return nodes.find((node) => {
      const attr = (name) => (node.getAttribute ? node.getAttribute(name) || "" : "");
      const label = [
        node.textContent || "",
        node.value || "",
        attr("aria-label"),
        attr("title"),
        attr("name"),
      ].join(" ");
      return re.test(label);
    });
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
          payload: { ...detection, quoteId: quote.quoteId, sourceUrl: location.href },
        });
        dismiss();
      },
      onNo: dismiss,
    });
  }
})();
