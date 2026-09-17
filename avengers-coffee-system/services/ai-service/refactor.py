import os
import shutil
import re

base_dir = r"c:\Users\ad\Documents\Nam4_Hocki2\cnm-avengers-coffee-microservices-AI\avengers-coffee-system\services\ai-service"

# Define the new structure mapping (source_file: destination_path)
file_map = {
    "agent_service.py": "src/agents/agent_service.py",
    "guardrails.py": "src/agents/guardrails.py",
    "agent_tools.py": "src/function_calling/agent_tools.py",
    "rag_service.py": "src/rag/rag_service.py",
    "cf_service.py": "src/ml/cf_service.py",
    "forecast_service.py": "src/ml/forecast_service.py",
    "cart_manager.py": "src/common/cart_manager.py",
    "ai_persistence.py": "src/common/ai_persistence.py",
    "groq_service.py": "src/common/groq_service.py",
    "db.py": "src/common/db.py",
    "knowledge_base.json": "src/rag/raw_data/knowledge_base.json"
}

# Define import replacements
import_replacements = {
    r"from groq_service": "from src.common.groq_service",
    r"import groq_service": "from src.common import groq_service",
    r"from agent_tools": "from src.function_calling.agent_tools",
    r"import agent_tools": "from src.function_calling import agent_tools",
    r"from ai_persistence": "from src.common.ai_persistence",
    r"import ai_persistence": "from src.common import ai_persistence",
    r"from cart_manager": "from src.common.cart_manager",
    r"import cart_manager": "from src.common import cart_manager",
    r"from guardrails": "from src.agents.guardrails",
    r"import guardrails": "from src.agents import guardrails",
    r"from db ": "from src.common.db ",
    r"from db\n": "from src.common.db\n",
    r"import db\n": "from src.common import db\n",
    r"from rag_service": "from src.rag.rag_service",
    r"import rag_service": "from src.rag import rag_service",
    r"from cf_service": "from src.ml.cf_service",
    r"import cf_service": "from src.ml import cf_service",
    r"from forecast_service": "from src.ml.forecast_service",
    r"import forecast_service": "from src.ml import forecast_service",
    r"from agent_service": "from src.agents.agent_service",
    r"import agent_service": "from src.agents import agent_service",
}

def main():
    # 1. Create directories
    dirs = ["src/agents", "src/function_calling", "src/rag/raw_data", "src/ml", "src/common"]
    for d in dirs:
        os.makedirs(os.path.join(base_dir, d), exist_ok=True)
        # Create __init__.py
        init_path = os.path.join(base_dir, d, "__init__.py")
        if not os.path.exists(init_path):
            with open(init_path, "w", encoding="utf-8") as f:
                f.write("")
    
    # Also create src/__init__.py
    src_init = os.path.join(base_dir, "src", "__init__.py")
    if not os.path.exists(src_init):
        with open(src_init, "w", encoding="utf-8") as f:
            f.write("")

    # 2. Move files and update imports
    for file, dest in file_map.items():
        src_path = os.path.join(base_dir, file)
        dest_path = os.path.join(base_dir, dest)
        
        if not os.path.exists(src_path):
            print(f"Skipping {file}, not found in root.")
            continue
            
        print(f"Moving {file} to {dest}...")
        
        # Read content if it's a python file to update imports
        if file.endswith(".py"):
            with open(src_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            for old, new in import_replacements.items():
                content = re.sub(old, new, content)
                
            with open(dest_path, "w", encoding="utf-8") as f:
                f.write(content)
            
            os.remove(src_path)
        else:
            # Just move JSON files
            shutil.move(src_path, dest_path)

    # 3. Update main.py imports
    main_py_path = os.path.join(base_dir, "main.py")
    if os.path.exists(main_py_path):
        with open(main_py_path, "r", encoding="utf-8") as f:
            content = f.read()
        for old, new in import_replacements.items():
            content = re.sub(old, new, content)
        with open(main_py_path, "w", encoding="utf-8") as f:
            f.write(content)
        print("Updated main.py imports.")

    print("Refactoring complete! Check your directories.")

if __name__ == "__main__":
    main()
