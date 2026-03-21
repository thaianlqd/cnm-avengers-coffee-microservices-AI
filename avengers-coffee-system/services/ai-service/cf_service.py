"""
Collaborative Filtering Recommendation Model
Uses item-based CF with cosine similarity (sklearn).
Falls back to popularity ranking for cold-start users.
"""
import logging
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


class CollaborativeFilterModel:
    def get_popular_items(self, limit: int = 6) -> list:
        """
        Return the top N popular items for fallback recommendations.
        """
        return self.popular_items[:limit]

    def __init__(self):
        self.is_trained = False
        self.user_item_matrix = None
        self.item_similarity = None
        self.item_ids = []
        self.user_ids = []
        self.popular_items = []
        self.item_details = {}
        self.trained_at = None
        self.total_interactions = 0
        self.total_users = 0

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------
    def train(self, engine: Engine) -> None:
        logger.info("[CF] Starting training...")
        try:
            with engine.connect() as conn:
                # ── order interactions ──────────────────────────────
                interactions_df = pd.DataFrame(
                    conn.execute(text("""
                        SELECT
                            dh.ma_nguoi_dung,
                            ct.ma_san_pham::text  AS ma_san_pham,
                            COALESCE(MAX(sp.ten_san_pham), MAX(ct.ten_san_pham), ct.ma_san_pham::text) AS ten_san_pham,
                            SUM(ct.so_luong)      AS total_quantity,
                                                        COUNT(*)              AS order_count,
                                                        MAX(dh.ngay_tao)      AS last_order_at
                        FROM orders.don_hang dh
                        JOIN orders.chi_tiet_don_hang ct
                          ON dh.ma_don_hang = ct.ma_don_hang
                                                LEFT JOIN menu.san_pham sp
                                                    ON sp.ma_san_pham = ct.ma_san_pham
                        WHERE dh.ma_nguoi_dung IS NOT NULL
                          AND dh.ma_nguoi_dung NOT LIKE 'guest-%'
                                                GROUP BY dh.ma_nguoi_dung, ct.ma_san_pham
                    """)).fetchall(),
                    columns=["ma_nguoi_dung", "ma_san_pham", "ten_san_pham", "total_quantity", "order_count", "last_order_at"],
                )

                # ── ratings (bonus signal) ───────────────────────────
                ratings_df = pd.DataFrame(
                    conn.execute(text("""
                        SELECT ma_nguoi_dung, ma_san_pham::text, so_sao
                        FROM orders.danh_gia_san_pham
                        WHERE ma_nguoi_dung IS NOT NULL
                    """)).fetchall(),
                    columns=["ma_nguoi_dung", "ma_san_pham", "so_sao"],
                )

                # ── favorites (strong intent signal) ─────────────────
                try:
                    favorites_df = pd.DataFrame(
                        conn.execute(text("""
                            SELECT
                                ma_nguoi_dung,
                                ma_san_pham::text AS ma_san_pham,
                                COUNT(*)::int AS favorite_count
                            FROM orders.yeu_thich_san_pham
                            WHERE ma_nguoi_dung IS NOT NULL
                            GROUP BY ma_nguoi_dung, ma_san_pham
                        """)).fetchall(),
                        columns=["ma_nguoi_dung", "ma_san_pham", "favorite_count"],
                    )
                except Exception:
                    favorites_df = pd.DataFrame(columns=["ma_nguoi_dung", "ma_san_pham", "favorite_count"])

                # ── promotion usage by product (price sensitivity signal) ──
                promo_df = pd.DataFrame(
                    conn.execute(text("""
                        SELECT
                            dh.ma_nguoi_dung,
                            ct.ma_san_pham::text AS ma_san_pham,
                            COUNT(*)::int AS promo_order_count
                        FROM orders.don_hang dh
                        JOIN orders.chi_tiet_don_hang ct ON ct.ma_don_hang = dh.ma_don_hang
                        WHERE dh.ma_nguoi_dung IS NOT NULL
                          AND dh.ma_nguoi_dung NOT LIKE 'guest-%'
                          AND COALESCE(dh.ma_voucher, '') <> ''
                        GROUP BY dh.ma_nguoi_dung, ct.ma_san_pham
                    """)).fetchall(),
                    columns=["ma_nguoi_dung", "ma_san_pham", "promo_order_count"],
                )

                # ── menu items (for metadata + fallback) ────────────
                menu_df = pd.DataFrame(
                    conn.execute(text("""
                        SELECT
                            sp.ma_san_pham::text AS ma_san_pham,
                            sp.ten_san_pham,
                            sp.gia_ban,
                            sp.hinh_anh_url,
                            dm.ten_danh_muc
                        FROM menu.san_pham sp
                        LEFT JOIN menu.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                        WHERE sp.trang_thai = TRUE
                    """)).fetchall(),
                    columns=["ma_san_pham", "ten_san_pham", "gia_ban", "hinh_anh_url", "ten_danh_muc"],
                )

                # ── popular items (fallback / cold start) ────────────
                pop_df = pd.DataFrame(
                    conn.execute(text("""
                        SELECT ct.ma_san_pham::text, SUM(ct.so_luong) AS total
                        FROM orders.chi_tiet_don_hang ct
                        GROUP BY ct.ma_san_pham
                        ORDER BY total DESC
                        LIMIT 20
                    """)).fetchall(),
                    columns=["ma_san_pham", "total"],
                )

            # Store item metadata
            self.item_details = {
                row["ma_san_pham"]: {
                    "id": row["ma_san_pham"],
                    "name": row["ten_san_pham"],
                    "price": float(row["gia_ban"] or 0),
                    "image": row["hinh_anh_url"],
                    "category": row["ten_danh_muc"],
                    "order_count": 0,
                }
                for _, row in menu_df.iterrows()
            }

            # Build popular items list
            self.popular_items = []
            for _, row in pop_df.iterrows():
                detail = self.item_details.get(
                    row["ma_san_pham"],
                    {"id": row["ma_san_pham"], "name": row["ma_san_pham"], "price": 0, "image": None, "category": None, "order_count": 0},
                )
                self.popular_items.append({
                    **detail,
                    "score": float(row["total"]),
                    "reason": "Được yêu thích nhất",
                })

            if interactions_df.empty:
                logger.warning("[CF] No interaction data, popularity fallback only")
                self.is_trained = True
                self.trained_at = datetime.utcnow()
                return

            # Merge rating bonus
            merged = interactions_df.copy()

            # Base score from real purchases
            merged["score"] = (
                merged["total_quantity"].fillna(0).astype(float)
                + (merged["order_count"].fillna(0).astype(float) * 0.5)
            )

            # Recency bonus: recently purchased items are weighted higher
            now_ts = pd.Timestamp.now()
            merged["last_order_at"] = pd.to_datetime(merged["last_order_at"], errors="coerce", utc=True).dt.tz_convert(None)
            days_since = (now_ts - merged["last_order_at"]).dt.total_seconds().div(86400).fillna(60)
            recency_bonus = (1.5 / (1 + (days_since / 30))).clip(lower=0, upper=1.5)
            merged["score"] = merged["score"] + recency_bonus

            if not ratings_df.empty:
                merged = merged.merge(ratings_df, on=["ma_nguoi_dung", "ma_san_pham"], how="left")
                merged["score"] = merged["score"] + merged["so_sao"].fillna(0).clip(0, 5)

            if not favorites_df.empty:
                merged = merged.merge(favorites_df, on=["ma_nguoi_dung", "ma_san_pham"], how="left")
                merged["score"] = merged["score"] + merged["favorite_count"].fillna(0).astype(float) * 4.0

            if not promo_df.empty:
                merged = merged.merge(promo_df, on=["ma_nguoi_dung", "ma_san_pham"], how="left")
                merged["score"] = merged["score"] + merged["promo_order_count"].fillna(0).astype(float) * 1.25

            merged["score"] = merged["score"].fillna(0).clip(lower=0)

            # Build user-item pivot (implicit feedback)
            pivot = merged.pivot_table(
                index="ma_nguoi_dung",
                columns="ma_san_pham",
                values="score",
                aggfunc="sum",
                fill_value=0,
            )

            self.user_ids = list(pivot.index)
            self.item_ids = list(pivot.columns)
            self.user_item_matrix = pivot.values.astype(float)

            # Item-item cosine similarity
            self.item_similarity = cosine_similarity(self.user_item_matrix.T)

            # Update order_count in item details
            item_totals = merged.groupby("ma_san_pham")["score"].sum()
            for item_id, total in item_totals.items():
                if item_id in self.item_details:
                    self.item_details[item_id]["order_count"] = int(total)

            self.total_interactions = len(merged)
            self.total_users = len(self.user_ids)
            self.is_trained = True
            self.trained_at = datetime.utcnow()
            logger.info(
                f"[CF] Trained: {self.total_users} users | {len(self.item_ids)} items | {self.total_interactions} interactions"
            )
        except Exception as exc:
            logger.error(f"[CF] Training failed: {exc}", exc_info=True)
            self.is_trained = False

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------
    def has_user_history(self, user_id: str) -> bool:
        return user_id in self.user_ids

    def recommend(self, user_id: str, limit: int = 6, branch_code: Optional[str] = None) -> list:
        if not self.is_trained:
            return self.popular_items[:limit]

        # Cold start
        if user_id not in self.user_ids:
            return self.popular_items[:limit]

        user_idx = self.user_ids.index(user_id)
        user_scores = self.user_item_matrix[user_idx]
        interacted = set(int(i) for i in np.where(user_scores > 0)[0])

        if not interacted:
            return self.popular_items[:limit]

        # Score items via item-item similarity
        rec_scores = np.zeros(len(self.item_ids))
        for item_idx in interacted:
            if item_idx < self.item_similarity.shape[0]:
                rec_scores += self.item_similarity[item_idx] * user_scores[item_idx]

        # Zero out already-seen items
        for idx in interacted:
            if idx < len(rec_scores):
                rec_scores[idx] = 0

        top_indices = np.argsort(rec_scores)[::-1]

        results = []
        for idx in top_indices:
            if len(results) >= limit:
                break
            if rec_scores[idx] <= 0:
                break
            item_id = self.item_ids[idx]
            detail = self.item_details.get(
                item_id,
                {"id": item_id, "name": item_id, "price": 0, "image": None, "category": None, "order_count": 0},
            )
            results.append({
                **detail,
                "score": round(float(rec_scores[idx]), 4),
                "reason": "Phù hợp với khẩu vị của bạn",
            })

        # Fill remaining with popular items
        seen_ids = {r["id"] for r in results}
        for item in self.popular_items:
            if len(results) >= limit:
                break
            if item["id"] not in seen_ids:
                results.append({**item, "reason": "Nhiều khách yêu thích"})

        return results[:limit]

    def get_stats(self) -> dict:
        return {
            "is_trained": self.is_trained,
            "total_users": self.total_users,
            "total_items": len(self.item_ids),
            "total_interactions": self.total_interactions,
            "trained_at": self.trained_at.isoformat() if self.trained_at else None,
        }
