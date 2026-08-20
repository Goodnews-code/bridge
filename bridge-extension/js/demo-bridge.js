/**
 * Demo merchant runs as an extension page, so content.js cannot inject.
 * Reuses overlay.html + overlay.css via overlay-ui.js.
 */
(() => {
  const detection = {
    amount: 12.99,
    currency: "USD",
    merchant: "Northwind SaaS",
  };

  chrome.runtime.sendMessage({ type: "CLAIM_RECEIPT" }, (receipt) => {
    if (receipt) {
      nairaDirectShowPaid(receipt);
      return;
    }
    offerPayInNaira();
  });

  function offerPayInNaira() {
    chrome.runtime.sendMessage({ type: "GET_QUOTE", payload: detection }, async (quote) => {
      if (!quote || quote.error) {
        console.warn(
          `[Bridge] Demo checkout couldn't load a quote, so no offer is shown. ${
            (quote && quote.error) || "No response from the extension service worker."
          }${quote && quote.code ? ` (${quote.code})` : ""} — is the backend running at the API base in js/config.js?`
        );
        return;
      }
      await nairaDirectMountOffer(document.body, detection, quote, {
        onYes: () => {
          chrome.runtime.sendMessage({
            type: "OPEN_CHECKOUT",
            payload: { ...detection, quoteId: quote.quoteId, sourceUrl: location.href },
          });
        },
        onNo: () => {
          const offer = document.querySelector(".nd-wrap");
          if (offer) offer.remove();
        },
      });
    });
  }
})();
