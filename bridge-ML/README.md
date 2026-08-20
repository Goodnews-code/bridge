# Bridge ML

Standalone FX checkout **risk model** used by Bridge (`bridge-backend`).

## What it is

`bridge-risk-logit-sklearn-v1` — logistic regression:

1. **Synthetic data** (`data/*.csv`) — random FX checkouts with planted risk labels  
2. **sklearn training** (`python/train.py`) — fits `LogisticRegression`  
3. **TypeScript runtime** — scores live quotes with exported weights  

Labels are sandbox-only (not real Wema fraud outcomes). GeoIP is a deterministic stub.

## Layout

```
bridge-ML/
  data/                 # synthetic train/test CSVs
  artifacts/            # weights.json + metrics.json
  python/
    generate_data.py    # create random labeled rows
    train.py            # fit sklearn → export TS weights
    requirements.txt
  src/
    riskModel.ts        # runtime scorer
    trainedWeights.ts   # auto-generated coefficients
    cli-demo.ts
```

## Train from scratch

```bash
cd bridge-ML
python -m pip install -r python/requirements.txt
python python/generate_data.py          # 8k train + 2k test
python python/train.py                  # writes artifacts/ + src/trainedWeights.ts
npm run build
npm run demo
```

Latest test metrics (synthetic): see `artifacts/metrics.json` (approx. ROC-AUC ~0.77).

## Use from the backend

Already wired via `"bridge-ml": "file:../bridge-ML"`.

```ts
import { riskService } from "bridge-ml";

const assessment = riskService.score({
  amount: 50,
  currency: "USD",
  merchantName: "Acme",
  deviceId: "device_abc",
  ip: "127.0.0.1",
});
```
