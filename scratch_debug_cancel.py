import requests
import json
import os
import urllib3
urllib3.disable_warnings()

# The anonymous session ID we saw in logs
customer_id = "83addedd-d7c9-4149-b241-be77ff9fcf0c"
order_id = "bb4414e8-fbf0-4a32-a0f8-bf8dbfe2ead5"

# We run this on the host machine, so use localhost instead of docker service name
url = f"http://localhost:3005/customers/{customer_id}/orders/{order_id}/cancel"

# Get the token from .env or fallback
token = "your_internal_service_token_here" 

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

payload = {
    "reason": "Khách hàng yêu cầu hủy qua AI (debug script)"
}

try:
    print(f"Sending PATCH request to {url}...")
    response = requests.patch(url, headers=headers, json=payload, timeout=10)
    print(f"Status Code: {response.status_code}")
    print(f"Response Body: {response.text}")
except Exception as e:
    print(f"Exception occurred: {e}")
