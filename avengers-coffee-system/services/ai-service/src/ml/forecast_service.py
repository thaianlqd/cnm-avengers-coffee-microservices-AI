"""
Demand Forecasting Model
Primary: Prophet (if installed)
Fallback: Holt-Winters triple exponential smoothing (pure NumPy)

Provides per-branch forecasting for:
  - orders  (number of orders per day)
  - revenue (total revenue per day)
"""
import logging
from datetime import datetime, timedelta
from typing import List, Optional

import numpy as np
import pandas as pd
from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
    logger.info("[Forecast] Prophet is available ✓")
except ImportError:
    PROPHET_AVAILABLE = False
    logger.info("[Forecast] Prophet not found — using Holt-Winters fallback")


# ──────────────────────────────────────────────────────────────────────────────
# Holt-Winters Triple Exponential Smoothing (weekly seasonality)
# ──────────────────────────────────────────────────────────────────────────────

def _holt_winters(series: np.ndarray, periods: int, season_len: int = 7):
    """Returns list of (yhat, yhat_lower, yhat_upper) for `periods` future steps."""
    n = len(series)

    if n < season_len * 2:
        avg = float(np.mean(series)) if n > 0 else 20.0
        std = float(np.std(series)) if n > 1 else avg * 0.15
        return [(max(0.0, avg), max(0.0, avg - 1.5 * std), avg + 1.5 * std)] * periods

    # Initialise
    alpha, beta, gamma = 0.35, 0.05, 0.45
    level = float(np.mean(series[:season_len]))
    if level == 0:
        level = 1.0
    trend = float(np.mean(series[season_len: 2 * season_len]) - np.mean(series[:season_len])) / season_len
    seasonal = [float(series[i]) / level for i in range(season_len)]

    levels = [level]
    trends = [trend]

    # Smooth
    for i in range(season_len, n):
        s_idx = i % season_len
        prev_l, prev_t = levels[-1], trends[-1]
        denom = seasonal[s_idx] if seasonal[s_idx] != 0 else 1.0
        new_l = alpha * (series[i] / denom) + (1.0 - alpha) * (prev_l + prev_t)
        new_t = beta * (new_l - prev_l) + (1.0 - beta) * prev_t
        new_s = gamma * (series[i] / new_l) if new_l != 0 else seasonal[s_idx]
        seasonal[s_idx] = new_s
        levels.append(new_l)
        trends.append(new_t)

    # Residual std for confidence interval
    fitted = np.array([levels[max(0, i - season_len)] * seasonal[i % season_len] for i in range(season_len, n)])
    residuals = series[season_len:] - fitted
    sigma = float(np.std(residuals))

    last_l, last_t = levels[-1], trends[-1]
    forecasts = []
    for h in range(1, periods + 1):
        s_idx = (n + h - 1) % season_len
        yhat = max(0.0, (last_l + h * last_t) * seasonal[s_idx])
        width = 1.64 * sigma * np.sqrt(h)  # 90% interval grows with horizon
        forecasts.append((yhat, max(0.0, yhat - width), yhat + width))

    return forecasts


# ──────────────────────────────────────────────────────────────────────────────
# Main model class
# ──────────────────────────────────────────────────────────────────────────────

class DemandForecastModel:
    def __init__(self):
        self.is_trained: bool = False
        self.prophet_models: dict = {}       # key → Prophet model
        self.hw_params: dict = {}            # key → (series np.ndarray, dates)
        self.trained_at: Optional[datetime] = None
        self.history_df: Optional[pd.DataFrame] = None
        self.total_records: int = 0
        self.branches: List[str] = []
        self._using_prophet: bool = False
        self.insufficient_data: bool = False
        self.insufficient_data_reason: Optional[str] = None
        self.data_source: str = "none"

    def _mark_insufficient_data(self, reason: str) -> None:
        self.insufficient_data = True
        self.insufficient_data_reason = reason
        self.data_source = "none"
        self.prophet_models = {}
        self.hw_params = {}
        self.total_records = 0
        self.branches = []
        self.is_trained = True
        self.trained_at = datetime.utcnow()

    # ------------------------------------------------------------------
    def train(self, engine: Engine) -> None:
        logger.info("[Forecast] Starting training...")
        self.insufficient_data = False
        self.insufficient_data_reason = None
        self.data_source = "none"
        try:
            with engine.connect() as conn:
                df = pd.DataFrame(
                    conn.execute(text("""
                        SELECT
                            DATE(dh.ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh') AS ngay,
                            dh.co_so_ma   AS branch_code,
                            COUNT(*)      AS so_don,
                            SUM(dh.tong_tien) AS doanh_thu
                        FROM orders.don_hang dh
                        WHERE dh.ngay_tao >= NOW() - INTERVAL '180 days'
                        GROUP BY DATE(dh.ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh'), dh.co_so_ma
                        ORDER BY ngay
                    """)).fetchall(),
                    columns=["ngay", "branch_code", "so_don", "doanh_thu"],
                )

            if df.empty:
                logger.warning("[Forecast] No real data found — returning insufficient_data")
                self.history_df = pd.DataFrame(columns=["ngay", "branch_code", "so_don", "doanh_thu"])
                self._mark_insufficient_data("NO_REAL_DATA")
                return

            self.data_source = "real"

            df["ngay"] = pd.to_datetime(df["ngay"])
            df["so_don"] = df["so_don"].astype(float)
            df["doanh_thu"] = df["doanh_thu"].astype(float)

            self.history_df = df
            self.branches = df["branch_code"].dropna().unique().tolist()
            self.total_records = len(df)

            # Compile training sets: one per (branch|ALL) × metric
            sets = {}
            agg = df.groupby("ngay")[["so_don", "doanh_thu"]].sum().reset_index()
            for metric in ("so_don", "doanh_thu"):
                sets[("ALL", metric)] = agg[["ngay", metric]].rename(columns={"ngay": "ds", metric: "y"})

            for branch in self.branches:
                branch_df = df[df["branch_code"] == branch]
                for metric in ("so_don", "doanh_thu"):
                    key = (branch, metric)
                    sets[key] = branch_df[["ngay", metric]].rename(columns={"ngay": "ds", metric: "y"})

            if PROPHET_AVAILABLE:
                self._train_prophet(sets)
            else:
                self._train_hw(sets)

            self.is_trained = True
            self.trained_at = datetime.utcnow()
            logger.info(f"[Forecast] Trained on {self.total_records} records, {len(self.branches)} branches")

        except Exception as exc:
            logger.error(f"[Forecast] Training failed: {exc}", exc_info=True)
            self.history_df = pd.DataFrame(columns=["ngay", "branch_code", "so_don", "doanh_thu"])
            self._mark_insufficient_data("TRAINING_ERROR")

    def _train_prophet(self, sets: dict) -> None:
        self._using_prophet = True
        for key, train_df in sets.items():
            if len(train_df) < 2:
                continue
            try:
                m = Prophet(
                    seasonality_mode="multiplicative",
                    weekly_seasonality=True,
                    daily_seasonality=False,
                    changepoint_prior_scale=0.05,
                    interval_width=0.80,
                )
                m.fit(train_df)
                self.prophet_models[key] = m
            except Exception as exc:
                logger.warning(f"[Prophet] Failed for {key}: {exc}")

    def _train_hw(self, sets: dict) -> None:
        self._using_prophet = False
        for key, train_df in sets.items():
            if len(train_df) < 2:
                continue
            series = train_df.sort_values("ds")["y"].values.astype(float)
            dates = train_df.sort_values("ds")["ds"].values
            self.hw_params[key] = (series, dates)

    # ------------------------------------------------------------------
    # Prediction helpers
    # ------------------------------------------------------------------
    def _predict_prophet(self, key: tuple, periods: int) -> list:
        m = self.prophet_models[key]
        future = m.make_future_dataframe(periods=periods)
        fc = m.predict(future).tail(periods)
        return [
            {
                "ds": row["ds"].strftime("%Y-%m-%d"),
                "yhat": max(0.0, round(float(row["yhat"]), 1)),
                "yhat_lower": max(0.0, round(float(row["yhat_lower"]), 1)),
                "yhat_upper": round(float(row["yhat_upper"]), 1),
                "is_forecast": True,
            }
            for _, row in fc.iterrows()
        ]

    def _predict_hw(self, key: tuple, periods: int) -> list:
        series, dates = self.hw_params[key]
        forecasts = _holt_winters(series, periods)
        last_date = pd.Timestamp(dates[-1]) if len(dates) else pd.Timestamp.now()
        return [
            {
                "ds": (last_date + timedelta(days=i + 1)).strftime("%Y-%m-%d"),
                "yhat": round(yhat, 1),
                "yhat_lower": round(lo, 1),
                "yhat_upper": round(hi, 1),
                "is_forecast": True,
            }
            for i, (yhat, lo, hi) in enumerate(forecasts)
        ]

    def _predict_simple(self, branch_code: str, metric: str, periods: int) -> list:
        """Last-resort: compute from raw history_df."""
        if self.history_df is None:
            return []
        y_col = "so_don" if metric == "orders" else "doanh_thu"
        if branch_code == "ALL":
            df = self.history_df.groupby("ngay")[[y_col]].sum().reset_index()
        else:
            df = self.history_df[self.history_df["branch_code"] == branch_code]

        if df.empty:
            return []

        series = df.sort_values("ngay")[y_col].values.astype(float)
        forecasts = _holt_winters(series, periods)
        last_date = pd.Timestamp.now()
        return [
            {
                "ds": (last_date + timedelta(days=i + 1)).strftime("%Y-%m-%d"),
                "yhat": round(yhat, 1),
                "yhat_lower": round(lo, 1),
                "yhat_upper": round(hi, 1),
                "is_forecast": True,
            }
            for i, (yhat, lo, hi) in enumerate(forecasts)
        ]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def predict(self, branch_code: str = "ALL", periods: int = 14, metric: str = "orders") -> list:
        """Returns `periods` forecast points for the given branch + metric."""
        if not self.is_trained or self.insufficient_data:
            return []

        y_col = "so_don" if metric == "orders" else "doanh_thu"
        key = (branch_code, y_col)

        # Prophet path
        if PROPHET_AVAILABLE and key in self.prophet_models:
            try:
                return self._predict_prophet(key, periods)
            except Exception as exc:
                logger.warning(f"[Prophet] predict failed: {exc}")

        # Holt-Winters path
        if key in self.hw_params:
            return self._predict_hw(key, periods)

        # Last resort
        return self._predict_simple(branch_code, metric, periods)

    def get_historical(self, branch_code: str = "ALL", days: int = 30, metric: str = "orders") -> list:
        """Returns `days` of historical daily data for the chart."""
        if self.history_df is None or self.insufficient_data:
            return []

        y_col = "so_don" if metric == "orders" else "doanh_thu"
        cutoff = pd.Timestamp.now() - timedelta(days=days)
        recent = self.history_df[self.history_df["ngay"] >= cutoff]

        if branch_code == "ALL":
            grouped = recent.groupby("ngay")[y_col].sum().reset_index()
        else:
            grouped = recent[recent["branch_code"] == branch_code][["ngay", y_col]]

        return [
            {
                "ds": row["ngay"].strftime("%Y-%m-%d"),
                "yhat": round(float(row[y_col]), 1),
                "yhat_lower": None,
                "yhat_upper": None,
                "is_forecast": False,
            }
            for _, row in grouped.sort_values("ngay").iterrows()
        ]

    def get_stats(self) -> dict:
        return {
            "is_trained": self.is_trained,
            "total_records": self.total_records,
            "branches": self.branches,
            "models_count": len(self.prophet_models) if PROPHET_AVAILABLE else len(self.hw_params),
            "engine": "Prophet" if (PROPHET_AVAILABLE and self.prophet_models) else "Holt-Winters (NumPy)",
            "trained_at": self.trained_at.isoformat() if self.trained_at else None,
            "insufficient_data": self.insufficient_data,
            "insufficient_data_reason": self.insufficient_data_reason,
            "data_source": self.data_source,
        }
