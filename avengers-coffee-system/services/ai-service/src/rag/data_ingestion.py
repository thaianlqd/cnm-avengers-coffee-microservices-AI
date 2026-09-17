import os
import json
import logging
from sqlalchemy.sql import text
from src.common.db import get_db_engine

logger = logging.getLogger(__name__)

RAW_DATA_DIR = os.path.join(os.path.dirname(__file__), "raw_data")

def load_all_rag_data() -> list:
    """
    Tải toàn bộ dữ liệu RAG từ 2 nguồn:
    1. Các file JSON tĩnh trong thư mục raw_data.
    2. Cơ sở dữ liệu Supabase (bảng menu.san_pham).
    """
    docs = []
    
    # 1. Nạp dữ liệu từ file JSON tĩnh
    if os.path.exists(RAW_DATA_DIR):
        for filename in os.listdir(RAW_DATA_DIR):
            if filename.endswith(".json"):
                filepath = os.path.join(RAW_DATA_DIR, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            docs.extend(data)
                        logger.info(f"[Data Ingestion] Loaded {len(data)} items from {filename}")
                except Exception as e:
                    logger.error(f"[Data Ingestion] Error reading {filename}: {e}")
    
    # 2. Nạp dữ liệu mô tả sản phẩm từ Database
    try:
        engine = get_db_engine()
        with engine.connect() as conn:
            # Chỉ lấy các sản phẩm có mô tả
            query = text("SELECT ma_san_pham, ten_san_pham, mo_ta FROM menu.san_pham WHERE mo_ta IS NOT NULL AND mo_ta != ''")
            result = conn.execute(query)
            
            db_docs_count = 0
            for row in result:
                ma_sp = row[0]
                ten_sp = row[1]
                mo_ta = row[2]
                docs.append({
                    "id": f"product_{ma_sp}",
                    "title": f"Mô tả sản phẩm: {ten_sp}",
                    "content": f"Sản phẩm {ten_sp} có mô tả như sau: {mo_ta}"
                })
                db_docs_count += 1
                if "Americano Mơ" in ten_sp:
                    logger.info(f"[Data Ingestion DEBUG] FOUND Americano Mơ! mo_ta='{mo_ta}'")
            
            # Check if it was skipped due to NULL
            check_query = text("SELECT ma_san_pham, ten_san_pham, mo_ta FROM menu.san_pham WHERE ten_san_pham LIKE '%Americano Mơ%'")
            check_res = conn.execute(check_query).fetchall()
            logger.info(f"[Data Ingestion DEBUG] Raw query for Americano Mơ: {check_res}")
            
            logger.info(f"[Data Ingestion] Loaded {db_docs_count} product descriptions from database.")
    except Exception as e:
        logger.error(f"[Data Ingestion] Failed to fetch product descriptions from DB: {e}")
        
    return docs

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    data = load_all_rag_data()
    print(f"Total documents ingested: {len(data)}")
