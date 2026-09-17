import sys
import os

sys.path.insert(0, os.path.abspath('avengers-coffee-system/services/ai-service'))

from src.function_calling.agent_tools import ALL_TOOL_SCHEMAS as OLD_SCHEMAS, TOOL_EXECUTORS as OLD_EXECUTORS
from src.function_calling.tools import ALL_TOOL_SCHEMAS as NEW_SCHEMAS, TOOL_EXECUTORS as NEW_EXECUTORS

old_schema_names = [s["function"]["name"] for s in OLD_SCHEMAS]
new_schema_names = [s["function"]["name"] for s in NEW_SCHEMAS]
old_exec_keys = list(OLD_EXECUTORS.keys())
new_exec_keys = list(NEW_EXECUTORS.keys())

print("=== SCHEMAS ===")
print("Match?", old_schema_names == new_schema_names)
if old_schema_names != new_schema_names:
    print("Old:", old_schema_names)
    print("New:", new_schema_names)

print("\n=== EXECUTORS ===")
print("Match?", old_exec_keys == new_exec_keys)
if old_exec_keys != new_exec_keys:
    print("Old:", old_exec_keys)
    print("New:", new_exec_keys)

if old_schema_names == new_schema_names and old_exec_keys == new_exec_keys:
    print("\nSUCCESS: All tools match exactly in name, number, and order!")
else:
    print("\nFAIL: Tools do not match.")
