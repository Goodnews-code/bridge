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
      if (!quote || quote.error) return;
      await nairaDirectMountOffer(document.body, detection, quote, {
        onYes: () => {
          chrome.runtime.sendMessage({ type: "OPEN_CHECKOUT", payload: detection });
        },
        onNo: () => {
          const offer = document.querySelector(".nd-wrap");
          if (offer) offer.remove();
        },
      });
    });
  }
})();
