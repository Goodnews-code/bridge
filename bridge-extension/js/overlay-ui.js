function nairaDirectFormatFx(amount, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch (_error) {
    return `${currency} ${amount}`;
  }
}

function nairaDirectAttachOverlayStyles(root) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("css/overlay.css");
  root.appendChild(link);
}

async function nairaDirectMountOffer(parent, detection, quote, handlers) {
  const response = await fetch(chrome.runtime.getURL("pages/overlay.html"));
  const html = await response.text();
  const wrap = document.createElement("div");
  wrap.className = "nd-wrap";
  wrap.innerHTML = html;

  wrap.querySelector("#nd-merchant").textContent = detection.merchant;
  wrap.querySelector("#nd-fx").textContent = nairaDirectFormatFx(
    detection.amount,
    detection.currency
  );
  wrap.querySelector("#nd-naira").textContent = nairaDirectFormatNaira(quote.amountToTransferNGN);
  // A Naira checkout is settled 1:1 with no FX spread — show a transfer message
  // rather than a nonsensical "Rate ₦1 / NGN · 0% fee" line.
  wrap.querySelector("#nd-meta").textContent =
    detection.currency === "NGN"
      ? "Pay by bank transfer · no exchange fee"
      : `Rate ₦${Math.round(quote.exchangeRate).toLocaleString("en-NG")} / ${detection.currency} · includes ${quote.spreadPercent}% fee`;

  wrap.querySelector(".nd-yes").addEventListener("click", handlers.onYes);
  wrap.querySelector(".nd-no").addEventListener("click", handlers.onNo);
  wrap.querySelector(".nd-close").addEventListener("click", handlers.onNo);

  parent.appendChild(wrap);
  return wrap;
}
