import os
import glob
import shutil

def run():
    base_dir = r"c:\Users\ad\Documents\Nam4_Hocki2\cnm-avengers-coffee-microservices-AI\data-platform\streamlit-app"
    pages_dir = os.path.join(base_dir, "pages")
    views_dir = os.path.join(base_dir, "views")
    
    if not os.path.exists(pages_dir):
        print("Pages dir not found, skipping refactor.")
        return

    os.makedirs(views_dir, exist_ok=True)
    
    for filepath in glob.glob(os.path.join(pages_dir, "*.py")):
        filename = os.path.basename(filepath)
        new_filename = filename.split("_", 1)[1].lower() if "_" in filename else filename.lower()
        new_filepath = os.path.join(views_dir, new_filename)
        
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()
            
        output = []
        in_func = False
        has_render = False
        
        for line in lines:
            if "st.set_page_config" in line or "inject_styles()" in line or "init_plotly_template()" in line or "render_sidebar()" in line:
                continue
                
            if line.startswith("import ") or line.startswith("from ") or line.startswith("try:") or line.startswith("except ") or "AI_ENGINE_OK =" in line:
                if not has_render:
                    output.append(line)
                    continue
                
            if line.startswith("@st.cache_data") or line.startswith("@st.cache_resource"):
                in_func = True
                if has_render:
                    output.append("    " + line)
                else:
                    output.append(line)
                continue
                
            if line.startswith("def ") and not has_render:
                output.append(line)
                in_func = True
                continue
                
            if in_func:
                if line.strip() == "" or line.startswith(" ") or line.startswith("\t"):
                    if has_render:
                        output.append("    " + line)
                    else:
                        output.append(line)
                    continue
                else:
                    in_func = False
                    
            if not has_render and line.strip() != "" and not line.startswith("#"):
                output.append("\ndef render():\n")
                has_render = True
            
            if has_render:
                output.append("    " + line if line.strip() else "\n")
            else:
                output.append(line)
                
        with open(new_filepath, "w", encoding="utf-8") as f:
            f.writelines(output)
    # 2. Rename original page files to .py.bak to disable Streamlit multipage
    for filepath in glob.glob(os.path.join(pages_dir, "*.py")):
        try:
            os.rename(filepath, filepath + ".bak")
        except Exception as e:
            pass

if __name__ == "__main__":
    run()
