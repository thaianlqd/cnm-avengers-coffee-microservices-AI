"""Product export fixtures for native Word QA; no external I/O."""
import json,base64,hashlib
from tests.test_narrative_scope_20261021 import NarrativeScopeTests
from services.docx_service import generate_report_docx

t=NarrativeScopeTests();t.setUp();report=t.ranked_report()
preview=dict(title='Kiểm bảng trích khi phân trang',table_data=dict(columns=['city','revenue'],
 rows=[dict(city=f'Tỉnh thử nghiệm {i}',revenue=1000*i) for i in range(50)],total_rows=80))
result=[]
for name,data in [('cohort',report),('preview',preview)]:
    content=generate_report_docx(data).getvalue()
    result.append(dict(name=name,report=data,sha256=hashlib.sha256(content).hexdigest(),
        bytes=len(content),docx_base64=base64.b64encode(content).decode()))
print('WORD_FIXTURES '+json.dumps(result,ensure_ascii=False))
t.doCleanups()
