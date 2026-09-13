import os
import glob

count = 0
for pyfile in glob.glob("data-platform/streamlit-app/**/*.py", recursive=True):
    with open(pyfile, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if 'DATE(ngay_tao)' in content:
        content = content.replace('DATE(ngay_tao)', 'DATE(ngay_tao)')
        with open(pyfile, 'w', encoding='utf-8') as f:
            f.write(content)
        count += 1
        print(f"✅ Đã fix lỗi SQL ở file: {pyfile}")

print(f"\nHoàn tất! Đã sửa {count} file.")
