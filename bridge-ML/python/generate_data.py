"""
Generate synthetic Bridge FX-checkout risk samples.

Labels are NOT real Wema fraud outcomes. They follow a planted logistic
process (plus noise) so sklearn can learn recoverable weights for demos.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

FEATURE_COLS = [
    "log_amount",
    "velocity_10m",
    "high_value",
    "very_high_value",
    "suspicious_merchant",
    "off_hours",
    "new_device",
    "ip_risk",
    "non_ng_context",
]

# Planted "true" weights used only to synthesize labels (not the final model).
TRUE_BIAS = -2.4
TRUE_WEIGHTS = np.array(
    [
        0.32,  # log_amount
        0.48,  # velocity_10m
        0.9,  # high_value
        1.6,  # very_high_value
        1.1,  # suspicious_merchant
        0.28,  # off_hours
        0.38,  # new_device
        1.0,  # ip_risk
        0.22,  # non_ng_context
    ],
    dtype=float,
)

CURRENCIES = ["USD", "EUR", "GBP"]
MERCHANTS_OK = [
    "Stripe Demo Store",
    "Amazon",
    "Netflix",
    "Spotify",
    "Shopify Merchant",
    "Apple",
]
MERCHANTS_BAD = [
    "Anonymous Crypto Mix",
    "Dark Web Market",
    "XXX Test Casino",
    "Wallet Drain Services",
    "Gambling Anonymous Hub",
]


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def sample_features(n: int, rng: np.random.Generator) -> pd.DataFrame:
    # Mixture: mostly retail, some mid, some whale / abuse attempts.
    bucket = rng.choice(["retail", "mid", "whale"], size=n, p=[0.72, 0.2, 0.08])
    amount_usd = np.empty(n, dtype=float)
    for i, b in enumerate(bucket):
        if b == "retail":
            amount_usd[i] = float(np.exp(rng.normal(3.0, 0.7)))
        elif b == "mid":
            amount_usd[i] = float(rng.uniform(500, 2400))
        else:
            amount_usd[i] = float(rng.uniform(2500, 9000))
    amount_usd = np.clip(amount_usd, 5, 9000)

    high_value = (amount_usd >= 500).astype(float)
    very_high_value = (amount_usd >= 2500).astype(float)

    # Velocity: mostly 1–2, occasional bursts.
    velocity = rng.choice(
        [1, 2, 3, 4, 5, 6, 8, 10],
        size=n,
        p=[0.45, 0.25, 0.12, 0.07, 0.05, 0.03, 0.02, 0.01],
    ).astype(float)

    suspicious = rng.binomial(1, 0.08, size=n).astype(float)
    # Whales slightly more likely to look abusive in the synthetic process.
    suspicious = np.where(very_high_value == 1, np.maximum(suspicious, rng.binomial(1, 0.35, size=n)), suspicious)

    # Correlated: bad merchants more often on high-risk IP / new device.
    new_device = rng.binomial(1, 0.35 + 0.25 * suspicious, size=n).astype(float)
    ip_risk = rng.choice([0.0, 0.45, 1.0], size=n, p=[0.7, 0.2, 0.1])
    ip_risk = np.where(suspicious == 1, np.maximum(ip_risk, 0.45), ip_risk)
    off_hours = rng.binomial(1, 0.18, size=n).astype(float)
    non_ng = rng.binomial(1, 0.25, size=n).astype(float)

    merchants = []
    for s in suspicious:
        pool = MERCHANTS_BAD if s else MERCHANTS_OK
        merchants.append(str(rng.choice(pool)))

    countries = np.where(non_ng == 1, rng.choice(["US", "DE", "CN", "RU"], size=n), "NG")
    currencies = rng.choice(CURRENCIES, size=n)

    return pd.DataFrame(
        {
            "amount_usd": np.round(amount_usd, 2),
            "currency": currencies,
            "merchant_name": merchants,
            "country": countries,
            "log_amount": np.round(np.log1p(amount_usd), 4),
            "velocity_10m": velocity,
            "high_value": high_value,
            "very_high_value": very_high_value,
            "suspicious_merchant": suspicious,
            "off_hours": off_hours,
            "new_device": new_device,
            "ip_risk": ip_risk,
            "non_ng_context": non_ng,
        }
    )


def label_rows(df: pd.DataFrame, rng: np.random.Generator, flip_rate: float = 0.05) -> pd.Series:
    x = df[FEATURE_COLS].to_numpy(dtype=float)
    logit = TRUE_BIAS + x @ TRUE_WEIGHTS
    p = sigmoid(logit)
    y = (rng.random(len(df)) < p).astype(int)
    # Label noise (mis-tagged ops / chargebacks).
    flip = rng.random(len(df)) < flip_rate
    y = np.where(flip, 1 - y, y)
    return pd.Series(y, name="is_risky")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic Bridge risk CSV data")
    parser.add_argument("--n-train", type=int, default=8000)
    parser.add_argument("--n-test", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data",
    )
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(args.seed)

    train = sample_features(args.n_train, rng)
    train["is_risky"] = label_rows(train, rng)
    test = sample_features(args.n_test, rng)
    test["is_risky"] = label_rows(test, rng)

    train_path = args.out_dir / "synthetic_risk_train.csv"
    test_path = args.out_dir / "synthetic_risk_test.csv"
    train.to_csv(train_path, index=False)
    test.to_csv(test_path, index=False)

    rate = train["is_risky"].mean()
    print(f"Wrote {train_path} ({len(train)} rows, risky={rate:.1%})")
    print(f"Wrote {test_path} ({len(test)} rows, risky={test['is_risky'].mean():.1%})")
    print(f"Features: {', '.join(FEATURE_COLS)}")


if __name__ == "__main__":
    main()
