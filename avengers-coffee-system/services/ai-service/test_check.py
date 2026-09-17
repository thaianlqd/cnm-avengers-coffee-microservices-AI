import sys
sys.path.append('c:\\Users\\ad\\Documents\\Nam4_Hocki2\\cnm-avengers-coffee-microservices-AI\\avengers-coffee-system\\services\\ai-service')
from src.function_calling.tools.product_tools import execute_check_price_and_stock
import json

res = execute_check_price_and_stock("Butter Croissant", "HC_HCM_D9_TAN_PHU_704", "M")
print(json.dumps(res, indent=2, ensure_ascii=False))
