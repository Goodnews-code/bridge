function bridgeFormatFx(amount, currency) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch (_error) {
    return `${currency} ${amount}`;
  }
}

function bridgeAttachOverlayStyles(root) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("css/overlay.css");
  root.appendChild(link);
}

function bridgeRiskMeta(risk) {
  if (!risk || !risk.decision) return "";
  const label =
    risk.decision === "allow"
      ? "low risk"
      : risk.decision === "review"
        ? "needs review"
        : "blocked";
  let meta = ` · Risk ${label} (${Number(risk.score).toFixed(2)})`;
  if (risk.model) meta += ` · ${risk.model}`;
  if (risk.context && risk.context.country) {
    meta += ` · ${risk.context.country}/${risk.context.ipRiskBucket}`;
  }
  if (risk.context && risk.context.deviceStatus === "new") {
    meta += " · new device";
  }
  return meta;
}

async function bridgeMountOffer(parent, detection, quote, handlers) {
  const response = await fetch(chrome.runtime.getURL("pages/overlay.html"));
  const html = await response.text();
  const wrap = document.createElement("div");
  wrap.className = "nd-wrap";
  wrap.innerHTML = html;

  wrap.querySelector("#nd-merchant").textContent = detection.merchant;
  wrap.querySelector("#nd-fx").textContent = bridgeFormatFx(
    detection.amount,
    detection.currency
  );
  wrap.querySelector("#nd-naira").textContent = bridgeFormatNaira(quote.totalNgn);
  const feePct =
    quote.spreadPercent != null
      ? quote.spreadPercent
      : Math.round((quote.feeRate || 0) * 1000) / 10;
  let meta = `Rate ₦${Math.round(quote.rate).toLocaleString("en-NG")} / ${detection.currency} · includes ${feePct}% spread`;
  meta += bridgeRiskMeta(quote.risk);
  wrap.querySelector("#nd-meta").textContent = meta;

  wrap.querySelector(".nd-yes").addEventListener("click", handlers.onYes);
  wrap.querySelector(".nd-no").addEventListener("click", handlers.onNo);
  wrap.querySelector(".nd-close").addEventListener("click", handlers.onNo);

  parent.appendChild(wrap);
  return wrap;
}

/** Shown when bridge-ML denies the quote (RISK_BLOCKED). */
async function bridgeMountBlocked(parent, detection, block, handlers) {
  const response = await fetch(chrome.runtime.getURL("pages/overlay.html"));
  const html = await response.text();
  const wrap = document.createElement("div");
  wrap.className = "nd-wrap";
  wrap.innerHTML = html;

  const risk = block.details || block.risk || {};
  const reasons = Array.isArray(risk.reasons) ? risk.reasons : [];
  const score = risk.score != null ? Number(risk.score).toFixed(2) : "—";

  wrap.querySelector("#nd-merchant").textContent = detection.merchant;
  wrap.querySelector("#nd-fx").textContent = bridgeFormatFx(
    detection.amount,
    detection.currency
  );
  wrap.querySelector("#nd-naira").textContent = "Blocked";
  wrap.querySelector(".nd-brand p").textContent =
    "Bridge risk controls blocked this Pay in Naira request.";
  wrap.querySelector("#nd-meta").textContent = [
    `Score ${score}`,
    risk.model || "bridge-ml",
    ...reasons.slice(0, 3),
  ]
    .filter(Boolean)
    .join(" · ");

  const yes = wrap.querySelector(".nd-yes");
  yes.textContent = "Understood";
  yes.addEventListener("click", handlers.onDismiss);
  wrap.querySelector(".nd-no").hidden = true;
  wrap.querySelector(".nd-close").addEventListener("click", handlers.onDismiss);

  parent.appendChild(wrap);
  return wrap;
}
