import os
import sys

# Thêm đường dẫn gốc vào sys.path để import được src
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.sql import text
from src.common.db import get_db_engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def generate_description(ten_sp: str) -> str:
    ten_sp_lower = ten_sp.lower()
    
    if "americano" in ten_sp_lower:
        if "mơ" in ten_sp_lower:
            return f"{ten_sp} mang đến sự phá cách độc đáo. Vị đắng nhẹ thanh tao của cà phê Espresso hòa quyện cùng mứt mơ chua ngọt, thơm mát, tạo nên thức uống giải khát bừng tỉnh năng lượng cho những ngày hè oi ả."
        elif "chanh leo" in ten_sp_lower:
            return f"{ten_sp} là bản giao hưởng hoàn hảo giữa cà phê đậm đà và vị chua thanh, thơm lừng của chanh leo tươi. Một lựa chọn sảng khoái, đánh bay cơn khát tức thì."
        elif "phúc bồn tử" in ten_sp_lower:
            return f"{ten_sp} quyến rũ với sắc đỏ mọng từ phúc bồn tử. Sự kết hợp giữa vị chua ngọt trái cây và hậu vị đắng nhẹ của cà phê mang đến cảm giác sảng khoái, mới mẻ chưa từng có."
        else:
            return f"Thưởng thức {ten_sp} với hương vị cà phê nguyên bản đậm đà. Được chiết xuất từ những hạt cà phê Arabica thượng hạng, mang lại sự sảng khoái và tỉnh táo tức thì."
            
    elif "cà phê" in ten_sp_lower or "coffee" in ten_sp_lower or "bạc xỉu" in ten_sp_lower:
        return f"{ten_sp} là sự kết tinh tinh hoa từ những hạt cà phê rang xay chuẩn vị. Đậm đà, thơm lừng và mang đậm dấu ấn riêng, giúp bạn bắt đầu ngày mới tràn đầy cảm hứng."
        
    elif "trà" in ten_sp_lower or "tea" in ten_sp_lower:
        return f"Tận hưởng sự thanh mát từ {ten_sp}. Nền trà hảo hạng kết hợp cùng nguyên liệu tươi mới, mang đến hương thơm nhẹ nhàng và vị ngọt thanh tao, giúp thư giãn tinh thần hiệu quả."
        
    elif "bánh" in ten_sp_lower or "croissant" in ten_sp_lower or "macaron" in ten_sp_lower:
        return f"Nhâm nhi {ten_sp} thơm lừng, nướng mới mỗi ngày. Vỏ bánh xốp giòn, nhân mềm mịn đậm vị, cực kỳ hoàn hảo khi thưởng thức cùng một ly cà phê hay trà ấm."
        
    elif "đá xay" in ten_sp_lower or "freeze" in ten_sp_lower:
        return f"Đập tan cơn khát với {ten_sp} mát lạnh. Đá xay nhuyễn mịn quyện cùng hương vị ngọt ngào, béo ngậy, mang lại trải nghiệm giải nhiệt đỉnh cao."
        
    else:
        return f"Khám phá hương vị đặc trưng của {ten_sp}. Sản phẩm được pha chế từ nguyên liệu tuyển chọn khắt khe, mang đến trải nghiệm vị giác tuyệt vời và trọn vẹn nhất."

def fill_missing_descriptions():
    try:
        engine = get_db_engine()
        with engine.connect() as conn:
            # Tìm các sản phẩm chưa có mô tả
            query = text("SELECT ma_san_pham, ten_san_pham FROM menu.san_pham WHERE mo_ta IS NULL OR mo_ta = ''")
            result = conn.execute(query).fetchall()
            
            if not result:
                logger.info("Tuyệt vời! Tất cả sản phẩm đều đã có mô tả.")
                return
                
            logger.info(f"Tìm thấy {len(result)} sản phẩm thiếu mô tả. Bắt đầu cập nhật...")
            
            update_query = text("UPDATE menu.san_pham SET mo_ta = :mo_ta WHERE ma_san_pham = :ma_sp")
            
            updated_count = 0
            for row in result:
                ma_sp = row[0]
                ten_sp = row[1]
                
                new_desc = generate_description(ten_sp)
                
                conn.execute(update_query, {"mo_ta": new_desc, "ma_sp": ma_sp})
                logger.info(f"Đã cập nhật: [{ten_sp}] -> {new_desc}")
                updated_count += 1
                
            conn.commit()
            logger.info(f"Đã cập nhật thành công {updated_count} sản phẩm!")
            
    except Exception as e:
        logger.error(f"Lỗi khi cập nhật mô tả: {e}")

if __name__ == "__main__":
    fill_missing_descriptions()
