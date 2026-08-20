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
      bridgeShowPaid(receipt);
      return;
    }
    offerPayInNaira();
  });

  function offerPayInNaira() {
    chrome.runtime.sendMessage(
      {
        type: "GET_QUOTE",
        payload: { ...detection, sourceUrl: location.href },
      },
      async (quote) => {
        if (!quote || quote.error) {
          if (quote && quote.code === "RISK_BLOCKED") {
            await bridgeMountBlocked(document.body, detection, quote, {
              onDismiss: () => {
                const offer = document.querySelector(".nd-wrap");
                if (offer) offer.remove();
              },
            });
          }
          return;
        }
        await bridgeMountOffer(document.body, detection, quote, {
          onYes: () => {
            chrome.runtime.sendMessage({
              type: "OPEN_CHECKOUT",
              payload: { ...detection, quoteId: quote.quoteId },
            });
          },
          onNo: () => {
            const offer = document.querySelector(".nd-wrap");
            if (offer) offer.remove();
          },
        });
      }
    );
  }
})();
