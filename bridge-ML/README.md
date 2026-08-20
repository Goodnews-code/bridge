# Bridge ML

Standalone FX checkout **risk model**. Product overview and how to run the demo: **[root README](../README.md)**.

`bridge-risk-logit-sklearn-v1` — logistic regression:

1. Synthetic rows in `data/*.csv` (planted labels, not real Wema fraud outcomes)
2. `python/train.py` fits sklearn `LogisticRegression`
3. TypeScript runtime scores with exported weights (`src/trainedWeights.ts`)

GeoIP is a deterministic stub. Latest synthetic metrics: `artifacts/metrics.json` (ROC-AUC ≈ 0.77, accuracy ≈ 0.71).

Features: log amount, velocity, high-value flags, suspicious merchant text, off-hours, new vs returning device, stub IP/country risk.

The extension shows a blocked overlay if the API returns `RISK_BLOCKED`. The scorer is **not** on the live `POST /payment-quotes` path yet; FX math stays deterministic. Backend adapter: `bridge-backend/src/services/risk/riskService.ts`.

---

## Layout

```
bridge-ML/
  data/                 synthetic train/test CSVs
  artifacts/            weights.json + metrics.json
  python/
    generate_data.py
    train.py
    requirements.txt
  src/
    riskModel.ts        runtime scorer
    trainedWeights.ts   auto-generated coefficients
    cli-demo.ts
```

---

## Train

```bash
cd bridge-ML
python -m pip install -r python/requirements.txt
python python/generate_data.py          # 8k train + 2k test
python python/train.py                  # artifacts/ + src/trainedWeights.ts
npm install
npm run build
npm run demo
```

---

## Score from TypeScript

```ts
import { RiskService } from "bridge-ml";

const riskService = new RiskService();
const assessment = riskService.score({
  amount: 50,
  currency: "USD",
  merchantName: "Acme",
  deviceId: "device_abc",
  ip: "127.0.0.1",
});
```

Wire the package into the backend with `"bridge-ml": "file:../bridge-ML"` when you mount scoring on quotes.
